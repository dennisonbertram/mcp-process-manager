# Server Setup and Configuration

## Overview
Foundation setup for the Process Manager MCP server including TypeScript configuration, SQLite database initialization, core server architecture, and essential middleware components.

## Core Dependencies

### Package Installation
```json
{
  "name": "@local/process-manager-mcp",
  "version": "1.0.0",
  "description": "MCP server for process management and monitoring",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest",
    "lint": "eslint src --ext .ts",
    "db:init": "tsx src/database/init.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.6.0",
    "better-sqlite3": "^11.5.0",
    "pidusage": "^3.0.2",
    "node-os-utils": "^1.3.7",
    "zod": "^3.23.8",
    "winston": "^3.15.0",
    "nanoid": "^5.0.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.9.0",
    "@types/pidusage": "^2.0.5",
    "typescript": "^5.6.3",
    "tsx": "^4.19.2",
    "vitest": "^2.1.5",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0"
  }
}
```

### TypeScript Configuration
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

## Database Module Implementation

### Database Manager
```typescript
// src/database/manager.ts
import Database from 'better-sqlite3';
import { z } from 'zod';
import winston from 'winston';
import path from 'path';
import { ProcessStatus, HealthStatus } from '../types/process.js';

export class DatabaseManager {
  private db: Database.Database;
  private logger: winston.Logger;
  private preparedStatements: Map<string, Database.Statement>;

  constructor(dbPath: string, logger: winston.Logger) {
    this.logger = logger;
    this.db = new Database(dbPath);
    this.preparedStatements = new Map();

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');

    this.initializeSchema();
    this.prepareStatements();
  }

  private initializeSchema(): void {
    const schema = `
      CREATE TABLE IF NOT EXISTS processes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        args TEXT,
        env TEXT,
        cwd TEXT,
        pid INTEGER,
        status TEXT CHECK(status IN ('starting', 'running', 'stopped', 'failed', 'crashed')),
        group_id TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        stopped_at INTEGER,
        restart_count INTEGER DEFAULT 0,
        auto_restart BOOLEAN DEFAULT FALSE,
        health_check_command TEXT,
        health_check_interval INTEGER,
        last_health_check INTEGER,
        health_status TEXT CHECK(health_status IN ('healthy', 'unhealthy', 'unknown'))
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id TEXT NOT NULL,
        type TEXT CHECK(type IN ('stdout', 'stderr', 'system')),
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        level TEXT CHECK(level IN ('debug', 'info', 'warn', 'error')),
        FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id TEXT NOT NULL,
        error_type TEXT NOT NULL,
        message TEXT NOT NULL,
        stack_trace TEXT,
        timestamp INTEGER NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS process_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        startup_order TEXT
      );

      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id TEXT NOT NULL,
        cpu_usage REAL,
        memory_usage INTEGER,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_logs_process_timestamp ON logs(process_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_errors_process_timestamp ON errors(process_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_metrics_process_timestamp ON metrics(process_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_processes_group ON processes(group_id);
      CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(status);
    `;

    this.db.exec(schema);
    this.logger.info('Database schema initialized');
  }

  private prepareStatements(): void {
    // Process management statements
    this.preparedStatements.set('insertProcess', this.db.prepare(`
      INSERT INTO processes (id, name, command, args, env, cwd, status, created_at)
      VALUES (@id, @name, @command, @args, @env, @cwd, @status, @created_at)
    `));

    this.preparedStatements.set('updateProcessStatus', this.db.prepare(`
      UPDATE processes
      SET status = @status, pid = @pid, started_at = @started_at
      WHERE id = @id
    `));

    // Log management statements
    this.preparedStatements.set('insertLog', this.db.prepare(`
      INSERT INTO logs (process_id, type, message, timestamp, level)
      VALUES (@process_id, @type, @message, @timestamp, @level)
    `));

    this.preparedStatements.set('getRecentLogs', this.db.prepare(`
      SELECT * FROM logs
      WHERE process_id = @process_id
      ORDER BY timestamp DESC
      LIMIT @limit
    `));

    // Error tracking statements
    this.preparedStatements.set('insertError', this.db.prepare(`
      INSERT INTO errors (process_id, error_type, message, stack_trace, timestamp)
      VALUES (@process_id, @error_type, @message, @stack_trace, @timestamp)
    `));

    // Metrics statements
    this.preparedStatements.set('insertMetric', this.db.prepare(`
      INSERT INTO metrics (process_id, cpu_usage, memory_usage, timestamp)
      VALUES (@process_id, @cpu_usage, @memory_usage, @timestamp)
    `));
  }

  // Transaction wrapper for atomic operations
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // Cleanup old data
  cleanupOldData(retentionDays: number): void {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    this.transaction(() => {
      this.db.prepare('DELETE FROM logs WHERE timestamp < ?').run(cutoffTime);
      this.db.prepare('DELETE FROM metrics WHERE timestamp < ?').run(cutoffTime);
      this.db.prepare('DELETE FROM errors WHERE timestamp < ? AND resolved = TRUE').run(cutoffTime);
    });
  }

  close(): void {
    this.db.close();
  }

  // Getter for prepared statements
  getStatement(name: string): Database.Statement {
    const stmt = this.preparedStatements.get(name);
    if (!stmt) throw new Error(`Prepared statement ${name} not found`);
    return stmt;
  }

  // Direct database access for complex queries
  getDb(): Database.Database {
    return this.db;
  }
}
```

## Core Server Implementation

### Main Server Entry Point
```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import winston from 'winston';
import dotenv from 'dotenv';
import { DatabaseManager } from './database/manager.js';
import { ProcessManager } from './process/manager.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';
import { ConfigManager } from './config/manager.js';

dotenv.config();

// Initialize logger
const logger = winston.createLogger({
  level: process.env.PM_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Initialize server
async function main() {
  try {
    // Load configuration
    const config = new ConfigManager();

    // Initialize database
    const dbPath = config.get('PM_DATABASE_PATH') || './process-manager.db';
    const database = new DatabaseManager(dbPath, logger);

    // Initialize process manager
    const processManager = new ProcessManager(database, logger, config);

    // Create MCP server
    const server = new Server(
      {
        name: 'process-manager-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );

    // Register all components
    registerTools(server, processManager, database, logger);
    registerResources(server, processManager, database, logger);
    registerPrompts(server, processManager, logger);

    // Setup cleanup handlers
    const cleanup = () => {
      logger.info('Shutting down Process Manager MCP Server');
      processManager.shutdown();
      database.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('Process Manager MCP Server started successfully');

    // Start periodic cleanup
    setInterval(() => {
      const retentionDays = config.get('PM_LOG_RETENTION_DAYS', 30);
      database.cleanupOldData(retentionDays);
    }, 24 * 60 * 60 * 1000); // Daily cleanup

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error);
```

## Configuration Manager

### Config Schema and Validation
```typescript
// src/config/manager.ts
import { z } from 'zod';
import path from 'path';

const ConfigSchema = z.object({
  PM_DATABASE_PATH: z.string().default('./data/process-manager.db'),
  PM_LOG_RETENTION_DAYS: z.number().min(1).max(365).default(30),
  PM_MAX_PROCESSES: z.number().min(1).max(1000).default(50),
  PM_HEALTH_CHECK_INTERVAL: z.number().min(1000).default(60000),
  PM_AUTO_RESTART_ENABLED: z.boolean().default(true),
  PM_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  PM_ALLOWED_COMMANDS: z.string().transform(val => val.split(',')).default('/usr/bin,/usr/local/bin'),
  PM_MAX_LOG_SIZE_MB: z.number().min(1).max(10000).default(100),
  PM_MAX_CPU_PERCENT: z.number().min(1).max(100).default(80),
  PM_MAX_MEMORY_MB: z.number().min(1).max(32000).default(1024),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
    this.validateCommandPaths();
  }

  private loadConfig(): Config {
    const envConfig: any = {};

    // Parse environment variables
    for (const key in ConfigSchema.shape) {
      const envValue = process.env[key];
      if (envValue !== undefined) {
        // Handle type conversions
        if (key.includes('DAYS') || key.includes('PROCESSES') || key.includes('INTERVAL') || key.includes('SIZE') || key.includes('CPU') || key.includes('MEMORY')) {
          envConfig[key] = parseInt(envValue, 10);
        } else if (key === 'PM_AUTO_RESTART_ENABLED') {
          envConfig[key] = envValue.toLowerCase() === 'true';
        } else {
          envConfig[key] = envValue;
        }
      }
    }

    return ConfigSchema.parse(envConfig);
  }

  private validateCommandPaths(): void {
    const allowedPaths = this.config.PM_ALLOWED_COMMANDS;
    for (const cmdPath of allowedPaths) {
      if (!path.isAbsolute(cmdPath)) {
        throw new Error(`Invalid command path: ${cmdPath} must be absolute`);
      }
    }
  }

  get<K extends keyof Config>(key: K, defaultValue?: Config[K]): Config[K] {
    return this.config[key] ?? defaultValue;
  }

  isCommandAllowed(command: string): boolean {
    const resolvedPath = path.resolve(command);
    return this.config.PM_ALLOWED_COMMANDS.some(allowedPath =>
      resolvedPath.startsWith(allowedPath)
    );
  }

  getAll(): Config {
    return { ...this.config };
  }
}
```

## Type Definitions

### Core Types
```typescript
// src/types/process.ts
export enum ProcessStatus {
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPED = 'stopped',
  FAILED = 'failed',
  CRASHED = 'crashed'
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

export enum LogType {
  STDOUT = 'stdout',
  STDERR = 'stderr',
  SYSTEM = 'system'
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface ProcessConfig {
  id?: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  autoRestart?: boolean;
  healthCheckCommand?: string;
  healthCheckInterval?: number;
  groupId?: string;
}

export interface ProcessInfo extends ProcessConfig {
  id: string;
  pid?: number;
  status: ProcessStatus;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  restartCount: number;
  healthStatus: HealthStatus;
  lastHealthCheck?: number;
}

export interface ProcessMetrics {
  processId: string;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: number;
}

export interface LogEntry {
  id?: number;
  processId: string;
  type: LogType;
  message: string;
  timestamp: number;
  level: LogLevel;
}

export interface ErrorEntry {
  id?: number;
  processId: string;
  errorType: string;
  message: string;
  stackTrace?: string;
  timestamp: number;
  resolved: boolean;
}

export interface ProcessGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  startupOrder?: string[]; // Process IDs in order
}
```

## Testing Strategy

### Phase 1: Component Testing
```bash
# Test database initialization
npm run db:init
sqlite3 data/process-manager.db ".tables"

# Test configuration loading
PM_MAX_PROCESSES=10 PM_LOG_LEVEL=debug node -e "
  const { ConfigManager } = require('./dist/config/manager.js');
  const config = new ConfigManager();
  console.log(config.getAll());
"
```

### Phase 2: Integration Testing
```typescript
// tests/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/database/manager';
import { ConfigManager } from '../src/config/manager';
import winston from 'winston';

describe('Server Setup', () => {
  let db: DatabaseManager;
  let config: ConfigManager;

  beforeEach(() => {
    const logger = winston.createLogger({ silent: true });
    config = new ConfigManager();
    db = new DatabaseManager(':memory:', logger);
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize database schema', () => {
    const tables = db.getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(tables).toContainEqual({ name: 'processes' });
    expect(tables).toContainEqual({ name: 'logs' });
    expect(tables).toContainEqual({ name: 'errors' });
  });

  it('should validate configuration', () => {
    expect(config.get('PM_MAX_PROCESSES')).toBeGreaterThan(0);
    expect(config.get('PM_LOG_LEVEL')).toBeDefined();
  });

  it('should prepare statements correctly', () => {
    expect(() => db.getStatement('insertProcess')).not.toThrow();
    expect(() => db.getStatement('insertLog')).not.toThrow();
  });
});
```

### Phase 3: MCP Protocol Testing
```bash
# Test server initialization
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' | node dist/index.js

# Expected response includes capabilities
# {"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{},"resources":{},"prompts":{}},"serverInfo":{"name":"process-manager-mcp","version":"1.0.0"}},"id":1}
```

## Success Criteria

### Implementation Checklist
- [ ] TypeScript project structure created
- [ ] All dependencies installed with exact versions
- [ ] Database schema initialized with all tables
- [ ] Configuration manager validates all settings
- [ ] Prepared statements optimize database queries
- [ ] Logger configured with appropriate levels
- [ ] Clean shutdown handlers implemented
- [ ] Periodic cleanup tasks scheduled
- [ ] All type definitions complete
- [ ] Unit tests pass for core components
- [ ] MCP server responds to initialization

### Performance Benchmarks
- [ ] Database initialization < 100ms
- [ ] Configuration loading < 10ms
- [ ] Statement preparation < 50ms
- [ ] Server startup < 500ms
- [ ] Cleanup operation < 1s for 100k old records

## Next Steps
After completing this setup:
1. Implement ProcessManager class (Task 0002)
2. Add tool registration system (Tasks 0002-0006)
3. Implement resource providers (Task 0007)
4. Add comprehensive testing (Task 0008)

## Dependencies
This task must be completed before any other implementation tasks can begin, as it provides the core infrastructure for the entire MCP server.
---
## Update Notes (2025-09-20)

This plan is updated for MCP compliance, security, TDD, and persistence:

- Stdio lifecycle and persistence
  - MCP stdio servers are often short‑lived. For persistent processes, run a long‑lived daemon (supervisor) and have the stdio server act as a thin shim that proxies to the daemon via local IPC. See 0000_overview.md “Persistence and Transport Model.”

- Logger: stderr‑only
  - MCP requires stdout to carry only JSON‑RPC messages. Configure winston to write all logs to stderr.
  - Example:
    ```ts
    const logger = winston.createLogger({
      level: process.env.PM_LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [new winston.transports.Stream({ stream: process.stderr })]
    });
    ```

- SQLite PRAGMAs
  - Add: `wal_autocheckpoint = 1000`, `journal_size_limit = 67108864`. Call `PRAGMA optimize;` on shutdown.

- JSON Schema for tools
  - Add dependency: `zod-to-json-schema` and convert Zod schemas to JSON Schema for `tools/list`.

- Single tool dispatcher
  - Implement a registry so only one handler responds to `tools/list` and `tools/call`, aggregating all tools.

- Config path validation (security)
  - Validate allowed command roots and executable paths using `fs.realpathSync` and boundary checks using `path.sep`; reject symlink escapes. Avoid naive `startsWith`.

- Example initialize first
  - All test sequences must send `initialize` before using tools/resources/prompts.

- Testing (TDD)
  - Add a test to assert stdout contains only valid JSON‑RPC and logs go to stderr.
  - Add AJV validation of generated JSON Schemas returned by `tools/list`.


### Revised Package Installation (2025-09-20)
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.6.0",
    "better-sqlite3": "^11.5.0",
    "pidusage": "^3.0.2",
    "node-os-utils": "^1.3.7",
    "zod": "^3.23.8",
    "winston": "^3.15.0",
    "nanoid": "^5.0.8",
    "dotenv": "^16.4.5",
    "zod-to-json-schema": "^3.23.5"
  }
}
```

### Revised Database Manager PRAGMAs (2025-09-20)
```typescript
// src/database/manager.ts (excerpt)
this.db.pragma('journal_mode = WAL');
this.db.pragma('busy_timeout = 5000');
this.db.pragma('synchronous = NORMAL');
this.db.pragma('wal_autocheckpoint = 1000');
this.db.pragma('journal_size_limit = 67108864'); // 64MB

// On shutdown
try { this.db.pragma('optimize'); } catch {}
this.db.close();
```

### Revised Logger (stderr only) and Manager Wiring (2025-09-20)
```typescript
// src/index.ts (excerpt)
import winston from 'winston';
import { LogManager } from './logs/manager.js';
import { ErrorManager } from './errors/manager.js';
import { GroupManager } from './groups/manager.js';
import { StatsCollector } from './monitoring/collector.js';
import { HealthCheckService } from './monitoring/health.js';

const logger = winston.createLogger({
  level: process.env.PM_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [new winston.transports.Stream({ stream: process.stderr })]
});

const logManager = new LogManager(database, logger);
const errorManager = new ErrorManager(database, logger);
const groupManager = new GroupManager(database, processManager, logger);
const statsCollector = new StatsCollector(database, processManager, logger);
const healthService = new HealthCheckService(processManager, database, logger);
statsCollector.startCollection(10000);

registerTools(server, processManager, database, logger);
registerResources(server, processManager, logManager, errorManager, groupManager, statsCollector, healthService, logger);
registerPrompts(server, logger);
```

### Revised Config Path Validation (2025-09-20)
```typescript
// src/config/manager.ts (excerpt)
import fs from 'node:fs';
import path from 'node:path';

isCommandAllowed(command: string): boolean {
  try {
    const realCmd = fs.realpathSync(command);
    return this.config.PM_ALLOWED_COMMANDS.some((root) => {
      const realRoot = fs.realpathSync(root);
      const withSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
      return realCmd === realRoot || realCmd.startsWith(withSep);
    });
  } catch {
    return false;
  }
}
```

### Stdio Shim with Daemon Auto-start (Example)
```typescript
// src/index.ts (stdio shim)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import winston from 'winston';
import { attachToolHandlers } from './tools/registry.js';
import { registerTools } from './tools/index.js';
import { createDaemonClient, ensureDaemon } from './ipc/daemon-client.js';

const logger = winston.createLogger({ transports: [new winston.transports.Stream({ stream: process.stderr })] });

async function main() {
  await ensureDaemon({ autoStart: process.env.PM_DAEMON_AUTO_START === 'true' });
  const daemon = await createDaemonClient({ token: process.env.PM_DAEMON_TOKEN! });

  // registerTools may wire internal proxies that call daemon methods under the hood
  const server = new Server({ name: 'process-manager-mcp', version: '1.0.0' }, { capabilities: { tools: {}, resources: {}, prompts: {} } });
  registerTools(server, daemon.pm, daemon.db, logger); // pm/db are daemon-backed facades
  attachToolHandlers(server, logger);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => { logger.error(e); process.exit(1); });
```

```typescript
// src/ipc/daemon-client.ts (outline)
import net from 'node:net';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

export async function ensureDaemon(opts: { autoStart?: boolean }) {
  // Try connect; if fails and autoStart, spawn daemon detached and wait for readiness
}

export async function createDaemonClient({ token }: { token: string }) {
  // Return facades that proxy tool/resource calls to the daemon over IPC with token
  return { pm: /* ProcessManagerFacade */, db: /* DatabaseFacade */ } as any;
}
```
```
