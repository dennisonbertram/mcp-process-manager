import { ChildProcess, spawn, exec } from 'child_process';
import { nanoid } from 'nanoid';
import winston from 'winston';
import { DatabaseManager } from '../database/manager.js';
import { ConfigManager } from '../config/manager.js';
import { ProcessConfig, ProcessInfo, ProcessStatus, HealthStatus, LogType, LogLevel } from '../types/process.js';
import { EventEmitter } from 'events';

export class ProcessManager extends EventEmitter {
  private processes: Map<string, ManagedProcess>;
  private database: DatabaseManager;
  private logger: winston.Logger;
  private config: ConfigManager;
  private healthCheckIntervals: Map<string, NodeJS.Timeout>;

  constructor(database: DatabaseManager, logger: winston.Logger, config: ConfigManager) {
    super();
    this.processes = new Map();
    this.database = database;
    this.logger = logger;
    this.config = config;
    this.healthCheckIntervals = new Map();

    this.loadExistingProcesses();
  }

  private loadExistingProcesses(): void {
    try {
      const dbProcesses = this.database.getDb()
        .prepare('SELECT * FROM processes WHERE status IN (?, ?)')
        .all(ProcessStatus.RUNNING, ProcessStatus.STARTING) as any[];

      for (const proc of dbProcesses) {
        // Mark as stopped since we're starting fresh
        this.database.getStatement('updateProcessStatus').run({
          id: proc.id,
          status: ProcessStatus.STOPPED,
          pid: null,
          started_at: null
        });
      }
    } catch (error) {
      this.logger.error('Failed to load existing processes:', error);
    }
  }

  async startProcess(config: ProcessConfig): Promise<ProcessInfo> {
    // Validate command path
    if (!this.config.isCommandAllowed(config.command)) {
      throw new Error(`Command not allowed: ${config.command}`);
    }

    // Check max processes limit
    if (this.processes.size >= this.config.get('PM_MAX_PROCESSES')) {
      throw new Error(`Maximum process limit reached: ${this.config.get('PM_MAX_PROCESSES')}`);
    }

    const processId = config.id || nanoid();

    // Check if process already exists
    if (this.processes.has(processId)) {
      const existing = this.processes.get(processId)!;
      if (existing.status === ProcessStatus.RUNNING) {
        throw new Error(`Process ${processId} is already running`);
      }
    }

    // Create process info
    const processInfo: ProcessInfo = {
      id: processId,
      name: config.name,
      command: config.command,
      args: config.args || [],
      env: config.env || {},
      cwd: config.cwd || process.cwd(),
      autoRestart: config.autoRestart || false,
      healthCheckCommand: config.healthCheckCommand,
      healthCheckInterval: config.healthCheckInterval,
      groupId: config.groupId,
      status: ProcessStatus.STARTING,
      createdAt: Date.now(),
      restartCount: 0,
      healthStatus: HealthStatus.UNKNOWN
    };

    // Store in database
    this.database.transaction(() => {
      this.database.getStatement('insertProcess').run({
        id: processInfo.id,
        name: processInfo.name,
        command: processInfo.command,
        args: JSON.stringify(processInfo.args),
        env: JSON.stringify(processInfo.env),
        cwd: processInfo.cwd,
        status: processInfo.status,
        created_at: processInfo.createdAt
      });
    });

    // Create managed process
    const managedProcess = new ManagedProcess(processInfo, this.database, this.logger);
    this.processes.set(processId, managedProcess);

    // Start the actual process
    try {
      await managedProcess.start();

      // Setup health checks if configured
      if (config.healthCheckCommand && config.healthCheckInterval) {
        this.setupHealthCheck(processId);
      }

      this.emit('processStarted', processInfo);
      return managedProcess.getInfo();
    } catch (error) {
      managedProcess.status = ProcessStatus.FAILED;
      this.database.getStatement('updateProcessStatus').run({
        id: processId,
        status: ProcessStatus.FAILED,
        pid: null,
        started_at: null
      });
      throw error;
    }
  }

  async stopProcess(processId: string, force: boolean = false): Promise<void> {
    const managedProcess = this.processes.get(processId);
    if (!managedProcess) {
      throw new Error(`Process ${processId} not found`);
    }

    // Clear health check interval
    const healthInterval = this.healthCheckIntervals.get(processId);
    if (healthInterval) {
      clearInterval(healthInterval);
      this.healthCheckIntervals.delete(processId);
    }

    await managedProcess.stop(force);
    this.emit('processStopped', processId);
  }

  async restartProcess(processId: string, newConfig?: Partial<ProcessConfig>): Promise<ProcessInfo> {
    const managedProcess = this.processes.get(processId);
    if (!managedProcess) {
      throw new Error(`Process ${processId} not found`);
    }

    const currentInfo = managedProcess.getInfo();

    // Stop the process
    await this.stopProcess(processId);

    // Merge configurations
    const restartConfig: ProcessConfig = {
      id: processId,
      name: newConfig?.name || currentInfo.name,
      command: newConfig?.command || currentInfo.command,
      args: newConfig?.args || currentInfo.args,
      env: newConfig?.env || currentInfo.env,
      cwd: newConfig?.cwd || currentInfo.cwd,
      autoRestart: newConfig?.autoRestart ?? currentInfo.autoRestart,
      healthCheckCommand: newConfig?.healthCheckCommand || currentInfo.healthCheckCommand,
      healthCheckInterval: newConfig?.healthCheckInterval || currentInfo.healthCheckInterval,
      groupId: newConfig?.groupId || currentInfo.groupId
    };

    // Increment restart count
    managedProcess.restartCount++;

    // Start with new config
    return this.startProcess(restartConfig);
  }

  async killProcess(processId: string): Promise<void> {
    await this.stopProcess(processId, true);
  }

  listProcesses(filter?: { status?: ProcessStatus; groupId?: string }): ProcessInfo[] {
    const processes: ProcessInfo[] = [];

    for (const managedProcess of this.processes.values()) {
      const info = managedProcess.getInfo();

      if (filter) {
        if (filter.status && info.status !== filter.status) continue;
        if (filter.groupId && info.groupId !== filter.groupId) continue;
      }

      processes.push(info);
    }

    return processes;
  }

  private setupHealthCheck(processId: string): void {
    const managedProcess = this.processes.get(processId);
    if (!managedProcess) return;

    const info = managedProcess.getInfo();
    if (!info.healthCheckCommand || !info.healthCheckInterval) return;

    const interval = setInterval(async () => {
      try {
        await this.performHealthCheck(processId);
      } catch (error) {
        this.logger.error(`Health check failed for process ${processId}:`, error);
      }
    }, info.healthCheckInterval);

    this.healthCheckIntervals.set(processId, interval);
  }

  private async performHealthCheck(processId: string): Promise<void> {
    const managedProcess = this.processes.get(processId);
    if (!managedProcess) return;

    const info = managedProcess.getInfo();
    if (!info.healthCheckCommand) return;

    try {
      await new Promise<void>((resolve, reject) => {
        exec(info.healthCheckCommand!, { timeout: 5000 }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      managedProcess.healthStatus = HealthStatus.HEALTHY;
      managedProcess.lastHealthCheck = Date.now();
    } catch (error) {
      managedProcess.healthStatus = HealthStatus.UNHEALTHY;
      managedProcess.lastHealthCheck = Date.now();

      // Auto-restart if configured and not already restarting
      if (info.autoRestart && managedProcess.status === ProcessStatus.RUNNING) {
        this.logger.info(`Auto-restarting unhealthy process ${processId}`);
        await this.restartProcess(processId);
      }
    }
  }

  shutdown(): void {
    // Clear all health check intervals
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }

    // Stop all processes gracefully
    for (const managedProcess of this.processes.values()) {
      managedProcess.stop(false).catch(error => {
        this.logger.error('Error stopping process during shutdown:', error);
      });
    }
  }
}

class ManagedProcess {
  private info: ProcessInfo;
  private childProcess?: ChildProcess;
  private database: DatabaseManager;
  private logger: winston.Logger;

  constructor(info: ProcessInfo, database: DatabaseManager, logger: winston.Logger) {
    this.info = info;
    this.database = database;
    this.logger = logger;
  }

  async start(): Promise<void> {
    if (this.childProcess && this.status === ProcessStatus.RUNNING) {
      throw new Error('Process is already running');
    }

    // Spawn the process
    const spawnOptions = {
      cwd: this.info.cwd,
      env: { ...process.env, ...this.info.env },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe']
    };

    this.childProcess = spawn(this.info.command, this.info.args || [], spawnOptions);

    if (!this.childProcess) {
      throw new Error('Failed to spawn process');
    }

    // Update status
    this.status = ProcessStatus.RUNNING;
    this.info.pid = this.childProcess.pid;
    this.info.startedAt = Date.now();

    // Update database
    this.database.getStatement('updateProcessStatus').run({
      id: this.info.id,
      status: ProcessStatus.RUNNING,
      pid: this.info.pid,
      started_at: this.info.startedAt
    });

    // Setup output handlers
    this.setupOutputHandlers();

    // Setup exit handler
    this.childProcess.on('exit', (code, signal) => {
      this.handleExit(code, signal);
    });

    this.childProcess.on('error', (error) => {
      this.handleError(error);
    });
  }

  private setupOutputHandlers(): void {
    if (!this.childProcess) return;

    // Handle stdout
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          this.logMessage(LogType.STDOUT, message, LogLevel.INFO);
        }
      });
    }

    // Handle stderr
    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          this.logMessage(LogType.STDERR, message, LogLevel.ERROR);
        }
      });
    }
  }

  private logMessage(type: LogType, message: string, level: LogLevel): void {
    this.database.getStatement('insertLog').run({
      process_id: this.info.id,
      type,
      message,
      timestamp: Date.now(),
      level
    });
  }

  private handleExit(code: number | null, signal: string | null): void {
    this.logger.info(`Process ${this.info.id} exited with code ${code}, signal ${signal}`);

    // Determine status based on exit code and signal
    let exitStatus: ProcessStatus;
    let logLevel: LogLevel;

    if (signal) {
      // Process was killed by signal
      exitStatus = ProcessStatus.STOPPED;
      logLevel = LogLevel.INFO;
    } else if (code === 0) {
      // Normal exit
      exitStatus = ProcessStatus.STOPPED;
      logLevel = LogLevel.INFO;
    } else {
      // Abnormal exit
      exitStatus = ProcessStatus.CRASHED;
      logLevel = LogLevel.ERROR;
    }

    this.status = exitStatus;
    this.info.stoppedAt = Date.now();
    this.info.pid = undefined;

    // Update database
    this.database.getStatement('updateProcessStatus').run({
      id: this.info.id,
      status: this.status,
      pid: null,
      started_at: null
    });

    // Log system message
    this.logMessage(
      LogType.SYSTEM,
      `Process exited with code ${code}, signal ${signal}`,
      logLevel
    );

    this.childProcess = undefined;
  }

  private handleError(error: Error): void {
    this.logger.error(`Process ${this.info.id} error:`, error);

    this.database.getStatement('insertError').run({
      process_id: this.info.id,
      error_type: error.name,
      message: error.message,
      stack_trace: error.stack,
      timestamp: Date.now()
    });

    this.status = ProcessStatus.FAILED;
    this.info.pid = undefined;
  }

  async stop(force: boolean = false): Promise<void> {
    if (!this.childProcess || this.status !== ProcessStatus.RUNNING) {
      return;
    }

    const signal = force ? 'SIGKILL' : 'SIGTERM';
    this.childProcess.kill(signal);

    // Wait for process to exit (with timeout)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.childProcess) {
          this.childProcess.kill('SIGKILL');
        }
        resolve();
      }, force ? 1000 : 5000);

      const checkExit = setInterval(() => {
        if (!this.childProcess || this.status !== ProcessStatus.RUNNING) {
          clearInterval(checkExit);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }

  getInfo(): ProcessInfo {
    return { ...this.info };
  }

  // Property accessors for direct status updates
  get status(): ProcessStatus { return this.info.status; }
  set status(value: ProcessStatus) { this.info.status = value; }

  get healthStatus(): HealthStatus { return this.info.healthStatus; }
  set healthStatus(value: HealthStatus) { this.info.healthStatus = value; }

  get lastHealthCheck(): number | undefined { return this.info.lastHealthCheck; }
  set lastHealthCheck(value: number | undefined) { this.info.lastHealthCheck = value; }

  get restartCount(): number { return this.info.restartCount; }
  set restartCount(value: number) { this.info.restartCount = value; }
}