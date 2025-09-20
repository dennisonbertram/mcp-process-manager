# Process Lifecycle Management Tools

## Overview
Implementation of core process lifecycle management tools including starting, stopping, restarting, and killing processes. These tools form the foundation of the process manager MCP server.

## Process Manager Core Implementation

### Process Manager Class
```typescript
// src/process/manager.ts
import { ChildProcess, spawn, exec } from 'child_process';
import { nanoid } from 'nanoid';
import winston from 'winston';
import { DatabaseManager } from '../database/manager.js';
import { ConfigManager } from '../config/manager.js';
import { ProcessConfig, ProcessInfo, ProcessStatus, HealthStatus, LogType, LogLevel } from '../types/process.js';
import { EventEmitter } from 'events';
import path from 'path';

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

    // Load existing processes from database
    this.loadExistingProcesses();
  }

  private loadExistingProcesses(): void {
    try {
      const dbProcesses = this.database.getDb()
        .prepare('SELECT * FROM processes WHERE status IN (?, ?)')
        .all(ProcessStatus.RUNNING, ProcessStatus.STARTING);

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

// Managed Process Class
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
      stdio: ['ignore', 'pipe', 'pipe'] as const
    };

    this.childProcess = spawn(this.info.command, this.info.args || [], spawnOptions);

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
    this.childProcess.stdout?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        this.logMessage(LogType.STDOUT, message, LogLevel.INFO);
      }
    });

    // Handle stderr
    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        this.logMessage(LogType.STDERR, message, LogLevel.ERROR);
      }
    });
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

    this.status = code === 0 ? ProcessStatus.STOPPED : ProcessStatus.CRASHED;
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
      code === 0 ? LogLevel.INFO : LogLevel.ERROR
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
```

## Tool Implementations

### Tool Registration
```typescript
// src/tools/lifecycle.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { ProcessManager } from '../process/manager.js';
import { ProcessStatus } from '../types/process.js';
import winston from 'winston';

// Schema definitions
const StartProcessSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  autoRestart: z.boolean().optional(),
  healthCheckCommand: z.string().optional(),
  healthCheckInterval: z.number().min(1000).optional(),
  groupId: z.string().optional()
});

const StopProcessSchema = z.object({
  processId: z.string().min(1),
  force: z.boolean().optional()
});

const RestartProcessSchema = z.object({
  processId: z.string().min(1),
  newConfig: z.object({
    name: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().optional(),
    autoRestart: z.boolean().optional(),
    healthCheckCommand: z.string().optional(),
    healthCheckInterval: z.number().optional()
  }).optional()
});

const KillProcessSchema = z.object({
  processId: z.string().min(1)
});

const ListProcessesSchema = z.object({
  status: z.nativeEnum(ProcessStatus).optional(),
  groupId: z.string().optional()
});

export function registerLifecycleTools(
  server: Server,
  processManager: ProcessManager,
  logger: winston.Logger
): void {
  // Tool: start_process
  server.setRequestHandler({
    method: 'tools/call',
    handler: async (request) => {
      if (request.params.name === 'start_process') {
        try {
          const args = StartProcessSchema.parse(request.params.arguments);
          const processInfo = await processManager.startProcess(args);

          return {
            content: [
              {
                type: 'text',
                text: `Started process ${processInfo.id} (${processInfo.name})`
              }
            ],
            data: processInfo
          };
        } catch (error) {
          logger.error('Failed to start process:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to start process: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }

      // Tool: stop_process
      if (request.params.name === 'stop_process') {
        try {
          const args = StopProcessSchema.parse(request.params.arguments);
          await processManager.stopProcess(args.processId, args.force);

          return {
            content: [
              {
                type: 'text',
                text: `Stopped process ${args.processId}`
              }
            ]
          };
        } catch (error) {
          logger.error('Failed to stop process:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to stop process: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }

      // Tool: restart_process
      if (request.params.name === 'restart_process') {
        try {
          const args = RestartProcessSchema.parse(request.params.arguments);
          const processInfo = await processManager.restartProcess(
            args.processId,
            args.newConfig
          );

          return {
            content: [
              {
                type: 'text',
                text: `Restarted process ${processInfo.id} (${processInfo.name})`
              }
            ],
            data: processInfo
          };
        } catch (error) {
          logger.error('Failed to restart process:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to restart process: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }

      // Tool: kill_process
      if (request.params.name === 'kill_process') {
        try {
          const args = KillProcessSchema.parse(request.params.arguments);
          await processManager.killProcess(args.processId);

          return {
            content: [
              {
                type: 'text',
                text: `Killed process ${args.processId}`
              }
            ]
          };
        } catch (error) {
          logger.error('Failed to kill process:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to kill process: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }

      // Tool: list_processes
      if (request.params.name === 'list_processes') {
        try {
          const args = ListProcessesSchema.parse(request.params.arguments || {});
          const processes = processManager.listProcesses(args);

          return {
            content: [
              {
                type: 'text',
                text: `Found ${processes.length} processes`
              }
            ],
            data: processes
          };
        } catch (error) {
          logger.error('Failed to list processes:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to list processes: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    }
  });

  // Register tool definitions
  server.setRequestHandler({
    method: 'tools/list',
    handler: async () => {
      return {
        tools: [
          {
            name: 'start_process',
            description: 'Start a new managed process',
            inputSchema: StartProcessSchema
          },
          {
            name: 'stop_process',
            description: 'Stop a running process',
            inputSchema: StopProcessSchema
          },
          {
            name: 'restart_process',
            description: 'Restart a process with optional new configuration',
            inputSchema: RestartProcessSchema
          },
          {
            name: 'kill_process',
            description: 'Force kill a process immediately',
            inputSchema: KillProcessSchema
          },
          {
            name: 'list_processes',
            description: 'List all managed processes with optional filtering',
            inputSchema: ListProcessesSchema
          }
        ]
      };
    }
  });
}
```

## Testing Strategy

### Phase 1: Process Management Testing
```bash
# Test process spawning directly
node -e "
  const { spawn } = require('child_process');
  const ls = spawn('ls', ['-la']);
  ls.stdout.on('data', (data) => console.log('stdout:', data.toString()));
  ls.stderr.on('data', (data) => console.error('stderr:', data.toString()));
  ls.on('exit', (code) => console.log('Exit code:', code));
"

# Test process killing
node -e "
  const { spawn } = require('child_process');
  const sleep = spawn('sleep', ['10']);
  console.log('Started process:', sleep.pid);
  setTimeout(() => {
    sleep.kill('SIGTERM');
    console.log('Sent SIGTERM');
  }, 2000);
"
```

### Phase 2: MCP Tool Testing
```bash
# Initialize server
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' | node dist/index.js

# Start a process
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"start_process","arguments":{"name":"test-node","command":"node","args":["-e","setInterval(() => console.log(Date.now()), 1000)"]}},"id":2}' | node dist/index.js

# List processes
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_processes","arguments":{}},"id":3}' | node dist/index.js

# Stop a process
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"stop_process","arguments":{"processId":"PROCESS_ID_HERE"}},"id":4}' | node dist/index.js
```

### Phase 3: Integration Testing
```typescript
// tests/lifecycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/process/manager';
import { DatabaseManager } from '../src/database/manager';
import { ConfigManager } from '../src/config/manager';
import winston from 'winston';

describe('Process Lifecycle Tools', () => {
  let processManager: ProcessManager;
  let db: DatabaseManager;

  beforeEach(() => {
    const logger = winston.createLogger({ silent: true });
    const config = new ConfigManager();
    db = new DatabaseManager(':memory:', logger);
    processManager = new ProcessManager(db, logger, config);
  });

  afterEach(() => {
    processManager.shutdown();
    db.close();
  });

  it('should start a process', async () => {
    const info = await processManager.startProcess({
      name: 'test',
      command: 'node',
      args: ['-e', 'console.log("test")']
    });

    expect(info.id).toBeDefined();
    expect(info.status).toBe('running');
    expect(info.pid).toBeDefined();
  });

  it('should stop a process', async () => {
    const info = await processManager.startProcess({
      name: 'test',
      command: 'sleep',
      args: ['10']
    });

    await processManager.stopProcess(info.id);
    const processes = processManager.listProcesses();
    const stopped = processes.find(p => p.id === info.id);

    expect(stopped?.status).toBe('stopped');
  });

  it('should restart a process', async () => {
    const info = await processManager.startProcess({
      name: 'test',
      command: 'node',
      args: ['-e', 'console.log("v1")']
    });

    const restarted = await processManager.restartProcess(info.id, {
      args: ['-e', 'console.log("v2")']
    });

    expect(restarted.id).toBe(info.id);
    expect(restarted.restartCount).toBe(1);
  });
});
```

## Success Criteria

### Implementation Checklist
- [ ] ProcessManager class manages process lifecycle
- [ ] ManagedProcess handles child process operations
- [ ] Stdout/stderr streams captured to database
- [ ] Process status tracked accurately
- [ ] Health checks run at configured intervals
- [ ] Auto-restart works for unhealthy processes
- [ ] All 5 lifecycle tools implemented
- [ ] Command validation enforces security
- [ ] Process limits enforced
- [ ] Graceful vs force stop handled correctly

### Performance Metrics
- [ ] Process start < 100ms
- [ ] Process stop < 5s (graceful) or 1s (force)
- [ ] List processes < 10ms for 50 processes
- [ ] Health check execution < 500ms
- [ ] Log streaming latency < 10ms

## Dependencies
- Requires Task 0001 (Server Setup) to be complete
- Database schema must be initialized
- Configuration manager must be available

## Next Steps
After implementing lifecycle tools:
1. Add monitoring and health check tools (Task 0003)
2. Implement log management tools (Task 0004)
3. Add error tracking capabilities (Task 0005)
---
## Update Notes (2025-09-20)

- Tools registry and single dispatcher
  - Replace per-file `server.setRequestHandler('tools/*')` with a central registry (e.g., `src/tools/registry.ts`) that:
    - Registers tools with `{ name, description, schema: ZodSchema, handler }`.
    - Converts Zod → JSON Schema once for `tools/list` responses (using `zod-to-json-schema`).
    - Exposes one consolidated `tools/list` and one `tools/call` that dispatch by `params.name`.
- MCP response shape
  - Return only spec-compliant fields in `tools/call` (`content`, optionally `isError`). Do not include custom `data`; embed summaries or JSON as text.
- ProcessManager logging path
  - Ensure `ManagedProcess` writes stdout/stderr to LogManager buffer (not direct DB writes) to centralize buffering/backpressure.
- Security
  - `start_process` validates executable via realpath + allowlisted roots (boundary-checked) before spawn.
- TDD additions
  - Tests assert Zod validation errors become JSON‑RPC invalid params errors; assert consolidated `tools/list` includes all lifecycle tools; assert stdout-only MCP messages (logs to stderr).

### Revised Lifecycle Tools Example
```typescript
// src/tools/lifecycle.ts
import { z } from 'zod';
import type winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { registerTool } from './registry.js';

const StartProcessSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  autoRestart: z.boolean().optional(),
  healthCheckCommand: z.string().optional(),
  healthCheckInterval: z.number().min(1000).optional(),
  groupId: z.string().optional(),
});

const StopProcessSchema = z.object({ processId: z.string().min(1), force: z.boolean().optional() });
const RestartProcessSchema = z.object({ processId: z.string().min(1), newConfig: z.record(z.any()).optional() });
const KillProcessSchema = z.object({ processId: z.string().min(1) });
const ListProcessesSchema = z.object({ status: z.string().optional(), groupId: z.string().optional() });

export function registerLifecycleTools(pm: ProcessManager, logger: winston.Logger) {
  registerTool({
    name: 'start_process',
    description: 'Start a new managed process',
    schema: StartProcessSchema,
    handler: async (args) => {
      const p = await pm.startProcess(args as any);
      return [{ type: 'text', text: `Started process ${p.id} (${p.name})` }];
    },
  });

  registerTool({
    name: 'stop_process',
    description: 'Stop a running process',
    schema: StopProcessSchema,
    handler: async (args) => {
      const { processId, force } = args as any;
      await pm.stopProcess(processId, force);
      return [{ type: 'text', text: `Stopped process ${processId}` }];
    },
  });

  registerTool({
    name: 'restart_process',
    description: 'Restart a process with optional new configuration',
    schema: RestartProcessSchema,
    handler: async (args) => {
      const { processId, newConfig } = args as any;
      const p = await pm.restartProcess(processId, newConfig);
      return [{ type: 'text', text: `Restarted process ${p.id} (${p.name})` }];
    },
  });

  registerTool({
    name: 'kill_process',
    description: 'Force kill a process immediately',
    schema: KillProcessSchema,
    handler: async (args) => {
      const { processId } = args as any;
      await pm.killProcess(processId);
      return [{ type: 'text', text: `Killed process ${processId}` }];
    },
  });

  registerTool({
    name: 'list_processes',
    description: 'List all managed processes with optional filtering',
    schema: ListProcessesSchema,
    handler: async (args) => {
      const res = pm.listProcesses(args as any);
      return [{ type: 'text', text: `Found ${res.length} processes` }];
    },
  });
}
```
