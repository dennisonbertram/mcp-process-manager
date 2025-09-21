import { spawn } from 'child_process';
import { realpath } from 'fs/promises';
import winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { DatabaseManager } from '../database/manager.js';
import { HealthStatus, ProcessStatus } from '../types/process.js';

export interface HealthCheckResult {
  processId: string;
  status: HealthStatus;
  message?: string;
  responseTime?: number;
  checkedAt: number;
}

export class HealthCheckService {
  private processManager: ProcessManager;
  private database: DatabaseManager;
  private logger: winston.Logger;
  private activeChecks: Map<string, NodeJS.Timeout>;
  private allowedPaths: Set<string>;

  constructor(
    processManager: ProcessManager,
    database: DatabaseManager,
    logger: winston.Logger,
    allowedPaths: string[] = []
  ) {
    this.processManager = processManager;
    this.database = database;
    this.logger = logger;
    this.activeChecks = new Map();
    this.allowedPaths = new Set(allowedPaths);
  }

  async checkProcessHealth(processId: string): Promise<HealthCheckResult> {
    const processes = this.processManager.listProcesses();
    const process = processes.find(p => p.id === processId);

    if (!process) {
      return {
        processId,
        status: HealthStatus.UNKNOWN,
        message: 'Process not found',
        checkedAt: Date.now()
      };
    }

    // Check if process is running
    if (process.status !== ProcessStatus.RUNNING) {
      return {
        processId,
        status: HealthStatus.UNHEALTHY,
        message: `Process status: ${process.status}`,
        checkedAt: Date.now()
      };
    }

    // If no health check command, just check if PID exists
    if (!process.healthCheckCommand) {
      const isAlive = await this.isPidAlive(process.pid!);
      return {
        processId,
        status: isAlive ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        message: isAlive ? 'Process is running' : 'Process not found',
        checkedAt: Date.now()
      };
    }

    // Execute health check command
    const startTime = Date.now();
    try {
      const result = await this.executeHealthCheck(process.healthCheckCommand, process.env || {});
      const responseTime = Date.now() - startTime;

      // Update database
      this.database.getStatement('updateProcessHealth').run({
        health_status: HealthStatus.HEALTHY,
        last_health_check: Date.now(),
        id: processId
      });

      return {
        processId,
        status: HealthStatus.HEALTHY,
        message: result.stdout.trim() || 'Health check passed',
        responseTime,
        checkedAt: Date.now()
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      // Update database
      this.database.getStatement('updateProcessHealth').run({
        health_status: HealthStatus.UNHEALTHY,
        last_health_check: Date.now(),
        id: processId
      });

      return {
        processId,
        status: HealthStatus.UNHEALTHY,
        message: error.message,
        responseTime,
        checkedAt: Date.now()
      };
    }
  }

  async checkAllHealth(): Promise<HealthCheckResult[]> {
    const processes = this.processManager.listProcesses({
      status: ProcessStatus.RUNNING
    });

    const results = await Promise.all(
      processes.map(p => this.checkProcessHealth(p.id))
    );

    return results;
  }

  startAutoHealthChecks(processId: string, intervalMs: number): void {
    // Stop existing check if any
    this.stopAutoHealthChecks(processId);

    const interval = setInterval(async () => {
      try {
        const result = await this.checkProcessHealth(processId);

        if (result.status === HealthStatus.UNHEALTHY) {
          this.logger.warn(`Process ${processId} is unhealthy: ${result.message}`);

          // Check if auto-restart is enabled
          const processes = this.processManager.listProcesses();
          const process = processes.find(p => p.id === processId);

          if (process?.autoRestart) {
            this.logger.info(`Auto-restarting unhealthy process ${processId}`);
            await this.processManager.restartProcess(processId);
          }
        }
      } catch (error) {
        this.logger.error(`Health check failed for ${processId}:`, error);
      }
    }, intervalMs);

    this.activeChecks.set(processId, interval);
  }

  stopAutoHealthChecks(processId: string): void {
    const interval = this.activeChecks.get(processId);
    if (interval) {
      clearInterval(interval);
      this.activeChecks.delete(processId);
    }
  }

  stopAllHealthChecks(): void {
    for (const interval of this.activeChecks.values()) {
      clearInterval(interval);
    }
    this.activeChecks.clear();
  }

  private async executeHealthCheck(command: string, env: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // Parse command - assume simple command without shell interpretation
      const parts = command.split(/\s+/);
      let cmd = parts[0];
      const args = parts.slice(1);

      // Resolve bare tool name via PATH if allowed by PM_ALLOWED_TOOL_NAMES
      try {
        // @ts-ignore access to ConfigManager via process env is not available here; rely on allowedPaths only
      } catch {}

      // Validate command path
      if (!this.isPathAllowed(cmd)) {
        throw new Error(`Health check command not in allowed paths: ${cmd}`);
      }

      const child = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
        timeout: 5000
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > 1024 * 1024) { // 1MB limit
          child.kill();
          reject(new Error('Health check output too large'));
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 1024 * 1024) { // 1MB limit
          child.kill();
          reject(new Error('Health check error output too large'));
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Health check failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async isPathAllowed(cmd: string): Promise<boolean> {
    try {
      const resolvedCmd = await realpath(cmd);
      if (this.allowedPaths.size === 0) return true;
      for (const entry of this.allowedPaths) {
        try {
          const resolvedRoot = await realpath(entry);
          if (resolvedCmd === resolvedRoot) return true;
          const withSep = resolvedRoot.endsWith('/') ? resolvedRoot : resolvedRoot + '/';
          if (resolvedCmd.startsWith(withSep)) return true;
        } catch {
          // ignore bad roots
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private async isPidAlive(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}