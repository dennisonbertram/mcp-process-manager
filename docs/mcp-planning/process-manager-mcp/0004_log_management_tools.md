# Log Management Tools

## Overview
Implementation of comprehensive log management tools including log retrieval, real-time tailing, searching, and cleanup capabilities with efficient SQLite storage and streaming support.

## Log Manager Implementation

### Log Manager Service
```typescript
// src/logs/manager.ts
import { DatabaseManager } from '../database/manager.js';
import winston from 'winston';
import { LogEntry, LogType, LogLevel } from '../types/process.js';
import { EventEmitter } from 'events';
import Database from 'better-sqlite3';

export interface LogFilter {
  processId?: string;
  type?: LogType;
  level?: LogLevel;
  startTime?: number;
  endTime?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface LogTailOptions {
  processId?: string;
  lines?: number;
  follow?: boolean;
}

export class LogManager extends EventEmitter {
  private database: DatabaseManager;
  private logger: winston.Logger;
  private tailSubscriptions: Map<string, NodeJS.Timeout>;
  private logBuffer: Map<string, LogEntry[]>;
  private bufferFlushInterval?: NodeJS.Timeout;

  constructor(database: DatabaseManager, logger: winston.Logger) {
    super();
    this.database = database;
    this.logger = logger;
    this.tailSubscriptions = new Map();
    this.logBuffer = new Map();

    // Start buffer flush interval
    this.startBufferFlush();
  }

  private startBufferFlush(): void {
    // Flush log buffer every second for better performance
    this.bufferFlushInterval = setInterval(() => {
      this.flushBuffer();
    }, 1000);
  }

  private flushBuffer(): void {
    if (this.logBuffer.size === 0) return;

    this.database.transaction(() => {
      for (const [processId, entries] of this.logBuffer.entries()) {
        for (const entry of entries) {
          this.database.getStatement('insertLog').run({
            process_id: processId,
            type: entry.type,
            message: entry.message,
            timestamp: entry.timestamp,
            level: entry.level
          });
        }
      }
    });

    this.logBuffer.clear();
  }

  addLog(entry: LogEntry): void {
    // Add to buffer for batch insertion
    if (!this.logBuffer.has(entry.processId)) {
      this.logBuffer.set(entry.processId, []);
    }

    this.logBuffer.get(entry.processId)!.push(entry);

    // Emit for real-time tailing
    this.emit('newLog', entry);

    // Force flush if buffer is getting large
    const bufferSize = Array.from(this.logBuffer.values())
      .reduce((sum, entries) => sum + entries.length, 0);

    if (bufferSize > 100) {
      this.flushBuffer();
    }
  }

  async getLogs(filter: LogFilter): Promise<LogEntry[]> {
    // Flush buffer before querying
    this.flushBuffer();

    let query = 'SELECT * FROM logs WHERE 1=1';
    const params: any[] = [];

    if (filter.processId) {
      query += ' AND process_id = ?';
      params.push(filter.processId);
    }

    if (filter.type) {
      query += ' AND type = ?';
      params.push(filter.type);
    }

    if (filter.level) {
      query += ' AND level = ?';
      params.push(filter.level);
    }

    if (filter.startTime) {
      query += ' AND timestamp >= ?';
      params.push(filter.startTime);
    }

    if (filter.endTime) {
      query += ' AND timestamp <= ?';
      params.push(filter.endTime);
    }

    if (filter.search) {
      query += ' AND message LIKE ?';
      params.push(`%${filter.search}%`);
    }

    query += ' ORDER BY timestamp DESC';

    if (filter.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);

      if (filter.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.database.getDb().prepare(query);
    const results = stmt.all(...params);

    return results.map(row => ({
      id: row.id,
      processId: row.process_id,
      type: row.type as LogType,
      message: row.message,
      timestamp: row.timestamp,
      level: row.level as LogLevel
    }));
  }

  async tailLogs(options: LogTailOptions): Promise<LogEntry[]> {
    // Get initial logs
    const filter: LogFilter = {
      processId: options.processId,
      limit: options.lines || 100
    };

    const logs = await this.getLogs(filter);

    // Setup follow if requested
    if (options.follow) {
      const subscriptionId = `tail-${Date.now()}`;

      // Create listener for new logs
      const logListener = (entry: LogEntry) => {
        if (!options.processId || entry.processId === options.processId) {
          this.emit(`tail:${subscriptionId}`, entry);
        }
      };

      this.on('newLog', logListener);

      // Store subscription for cleanup
      const cleanup = setTimeout(() => {
        this.removeListener('newLog', logListener);
        this.tailSubscriptions.delete(subscriptionId);
      }, 300000); // 5 minute timeout

      this.tailSubscriptions.set(subscriptionId, cleanup);

      // Return subscription ID in metadata
      (logs as any).__subscriptionId = subscriptionId;
    }

    return logs.reverse(); // Return in chronological order for tail
  }

  async searchLogs(
    search: string,
    options: {
      processId?: string;
      limit?: number;
      caseSensitive?: boolean;
    } = {}
  ): Promise<LogEntry[]> {
    // Flush buffer before searching
    this.flushBuffer();

    let query: string;
    const params: any[] = [];

    if (options.caseSensitive) {
      query = `
        SELECT * FROM logs
        WHERE message GLOB ?
      `;
      params.push(`*${search}*`);
    } else {
      query = `
        SELECT * FROM logs
        WHERE message LIKE ?
      `;
      params.push(`%${search}%`);
    }

    if (options.processId) {
      query += ' AND process_id = ?';
      params.push(options.processId);
    }

    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.database.getDb().prepare(query);
    const results = stmt.all(...params);

    return results.map(row => ({
      id: row.id,
      processId: row.process_id,
      type: row.type as LogType,
      message: row.message,
      timestamp: row.timestamp,
      level: row.level as LogLevel
    }));
  }

  async clearLogs(processId: string, before?: number): Promise<number> {
    // Flush buffer first
    this.flushBuffer();

    let query = 'DELETE FROM logs WHERE process_id = ?';
    const params: any[] = [processId];

    if (before) {
      query += ' AND timestamp < ?';
      params.push(before);
    }

    const stmt = this.database.getDb().prepare(query);
    const result = stmt.run(...params);

    this.logger.info(`Cleared ${result.changes} logs for process ${processId}`);
    return result.changes;
  }

  async getLogStats(processId?: string): Promise<{
    totalLogs: number;
    byType: Record<LogType, number>;
    byLevel: Record<LogLevel, number>;
    oldestLog?: number;
    newestLog?: number;
    sizeBytes: number;
  }> {
    // Flush buffer before stats
    this.flushBuffer();

    const baseWhere = processId ? 'WHERE process_id = ?' : '';
    const params = processId ? [processId] : [];

    // Get total count
    const totalStmt = this.database.getDb().prepare(
      `SELECT COUNT(*) as count FROM logs ${baseWhere}`
    );
    const total = totalStmt.get(...params) as { count: number };

    // Get counts by type
    const typeStmt = this.database.getDb().prepare(`
      SELECT type, COUNT(*) as count
      FROM logs ${baseWhere}
      GROUP BY type
    `);
    const typeResults = typeStmt.all(...params) as Array<{ type: LogType; count: number }>;
    const byType = typeResults.reduce((acc, row) => {
      acc[row.type] = row.count;
      return acc;
    }, {} as Record<LogType, number>);

    // Get counts by level
    const levelStmt = this.database.getDb().prepare(`
      SELECT level, COUNT(*) as count
      FROM logs ${baseWhere}
      GROUP BY level
    `);
    const levelResults = levelStmt.all(...params) as Array<{ level: LogLevel; count: number }>;
    const byLevel = levelResults.reduce((acc, row) => {
      acc[row.level] = row.count;
      return acc;
    }, {} as Record<LogLevel, number>);

    // Get timestamp range
    const rangeStmt = this.database.getDb().prepare(`
      SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest
      FROM logs ${baseWhere}
    `);
    const range = rangeStmt.get(...params) as { oldest: number | null; newest: number | null };

    // Estimate storage size (rough calculation)
    const sizeStmt = this.database.getDb().prepare(`
      SELECT SUM(LENGTH(message) + 100) as size
      FROM logs ${baseWhere}
    `);
    const size = sizeStmt.get(...params) as { size: number | null };

    return {
      totalLogs: total.count,
      byType,
      byLevel,
      oldestLog: range.oldest || undefined,
      newestLog: range.newest || undefined,
      sizeBytes: size.size || 0
    };
  }

  stopTailing(subscriptionId: string): void {
    const timeout = this.tailSubscriptions.get(subscriptionId);
    if (timeout) {
      clearTimeout(timeout);
      this.tailSubscriptions.delete(subscriptionId);
      this.removeAllListeners(`tail:${subscriptionId}`);
    }
  }

  cleanup(): void {
    // Stop buffer flush
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    // Flush any remaining logs
    this.flushBuffer();

    // Clear all tail subscriptions
    for (const [id, timeout] of this.tailSubscriptions.entries()) {
      clearTimeout(timeout);
      this.removeAllListeners(`tail:${id}`);
    }
    this.tailSubscriptions.clear();
  }
}
```

## Tool Implementations

### Log Tools Registration
```typescript
// src/tools/logs.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { LogManager } from '../logs/manager.js';
import { LogType, LogLevel } from '../types/process.js';
import winston from 'winston';

// Schema definitions
const GetLogsSchema = z.object({
  processId: z.string().optional(),
  type: z.nativeEnum(LogType).optional(),
  level: z.nativeEnum(LogLevel).optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(10000).default(100),
  offset: z.number().min(0).default(0)
});

const TailLogsSchema = z.object({
  processId: z.string().optional(),
  lines: z.number().min(1).max(1000).default(100),
  follow: z.boolean().default(false)
});

const SearchLogsSchema = z.object({
  query: z.string().min(1),
  processId: z.string().optional(),
  limit: z.number().min(1).max(1000).default(100),
  caseSensitive: z.boolean().default(false)
});

const ClearLogsSchema = z.object({
  processId: z.string().min(1),
  before: z.number().optional() // Clear logs before this timestamp
});

export function registerLogTools(
  server: Server,
  logManager: LogManager,
  logger: winston.Logger
): void {
  // Tool: get_logs
  server.setRequestHandler({
    method: 'tools/call',
    handler: async (request) => {
      if (request.params.name === 'get_logs') {
        try {
          const args = GetLogsSchema.parse(request.params.arguments || {});
          const logs = await logManager.getLogs(args);

          const summary = logs.length > 0
            ? `Found ${logs.length} log entries${args.processId ? ` for process ${args.processId}` : ''}`
            : 'No logs found matching criteria';

          // Format logs for display
          const formatted = logs.slice(0, 10).map(log =>
            `[${new Date(log.timestamp).toISOString()}] [${log.level}] ${log.message}`
          ).join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `${summary}\n\nRecent logs:\n${formatted}${logs.length > 10 ? `\n... and ${logs.length - 10} more` : ''}`
              }
            ],
            data: logs
          };
        } catch (error) {
          logger.error('Failed to get logs:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to get logs: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }

      // Tool: tail_logs
      if (request.params.name === 'tail_logs') {
        try {
          const args = TailLogsSchema.parse(request.params.arguments || {});
          const logs = await logManager.tailLogs(args);

          const formatted = logs.map(log =>
            `[${new Date(log.timestamp).toISOString()}] [${log.level}] ${log.message}`
          ).join('\n');

          const subscriptionId = (logs as any).__subscriptionId;

          return {
            content: [
              {
                type: 'text',
                text: `Showing last ${logs.length} log entries${args.processId ? ` for process ${args.processId}` : ''}${args.follow ? ' (following for new logs)' : ''}\n\n${formatted}`
              }
            ],
            data: {
              logs,
              subscriptionId,
              following: args.follow
            }
          };
        } catch (error) {
          logger.error('Failed to tail logs:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to tail logs: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }

      // Tool: search_logs
      if (request.params.name === 'search_logs') {
        try {
          const args = SearchLogsSchema.parse(request.params.arguments);
          const logs = await logManager.searchLogs(args.query, {
            processId: args.processId,
            limit: args.limit,
            caseSensitive: args.caseSensitive
          });

          const summary = logs.length > 0
            ? `Found ${logs.length} log entries matching "${args.query}"`
            : `No logs found matching "${args.query}"`;

          const formatted = logs.slice(0, 10).map(log => {
            // Highlight search term in output
            const highlighted = log.message.replace(
              new RegExp(args.query, args.caseSensitive ? 'g' : 'gi'),
              `**${args.query}**`
            );
            return `[${new Date(log.timestamp).toISOString()}] [${log.level}] ${highlighted}`;
          }).join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `${summary}\n\n${formatted}${logs.length > 10 ? `\n... and ${logs.length - 10} more matches` : ''}`
              }
            ],
            data: logs
          };
        } catch (error) {
          logger.error('Failed to search logs:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to search logs: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }

      // Tool: clear_logs
      if (request.params.name === 'clear_logs') {
        try {
          const args = ClearLogsSchema.parse(request.params.arguments);
          const deletedCount = await logManager.clearLogs(args.processId, args.before);

          const message = args.before
            ? `Cleared ${deletedCount} logs for process ${args.processId} before ${new Date(args.before).toISOString()}`
            : `Cleared ${deletedCount} logs for process ${args.processId}`;

          return {
            content: [
              {
                type: 'text',
                text: message
              }
            ],
            data: { deletedCount }
          };
        } catch (error) {
          logger.error('Failed to clear logs:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Failed to clear logs: ${error.message}`
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
            name: 'get_logs',
            description: 'Retrieve historical logs with flexible filtering options',
            inputSchema: GetLogsSchema
          },
          {
            name: 'tail_logs',
            description: 'Stream recent logs with optional real-time following',
            inputSchema: TailLogsSchema
          },
          {
            name: 'search_logs',
            description: 'Full-text search across log messages',
            inputSchema: SearchLogsSchema
          },
          {
            name: 'clear_logs',
            description: 'Remove old logs for a specific process',
            inputSchema: ClearLogsSchema
          }
        ]
      };
    }
  });
}
```

## Integration with Process Manager

### Log Stream Integration
```typescript
// Addition to src/process/manager.ts
import { LogManager } from '../logs/manager.js';

// Add to ProcessManager constructor
constructor(
  database: DatabaseManager,
  logger: winston.Logger,
  config: ConfigManager,
  logManager: LogManager  // Add this parameter
) {
  // ... existing code ...
  this.logManager = logManager;
}

// Modify setupOutputHandlers in ManagedProcess class
private setupOutputHandlers(): void {
  if (!this.childProcess) return;

  // Handle stdout
  this.childProcess.stdout?.on('data', (data: Buffer) => {
    const messages = data.toString().split('\n').filter(m => m.trim());
    for (const message of messages) {
      this.logManager.addLog({
        processId: this.info.id,
        type: LogType.STDOUT,
        message,
        timestamp: Date.now(),
        level: LogLevel.INFO
      });
    }
  });

  // Handle stderr
  this.childProcess.stderr?.on('data', (data: Buffer) => {
    const messages = data.toString().split('\n').filter(m => m.trim());
    for (const message of messages) {
      this.logManager.addLog({
        processId: this.info.id,
        type: LogType.STDERR,
        message,
        timestamp: Date.now(),
        level: LogLevel.ERROR
      });
    }
  });
}
```

## Testing Strategy

### Phase 1: Database Testing
```bash
# Test log insertion and retrieval
node -e "
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');

  db.exec(\`
    CREATE TABLE logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_id TEXT,
      type TEXT,
      message TEXT,
      timestamp INTEGER,
      level TEXT
    )
  \`);

  const insert = db.prepare('INSERT INTO logs (process_id, type, message, timestamp, level) VALUES (?, ?, ?, ?, ?)');
  insert.run('test-1', 'stdout', 'Test message', Date.now(), 'info');

  const select = db.prepare('SELECT * FROM logs WHERE process_id = ?');
  console.log(select.all('test-1'));
"

# Test full-text search
node -e "
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');

  db.exec('CREATE TABLE logs (message TEXT)');
  db.prepare('INSERT INTO logs VALUES (?)').run('Error: Connection timeout');
  db.prepare('INSERT INTO logs VALUES (?)').run('Success: Data saved');

  const search = db.prepare('SELECT * FROM logs WHERE message LIKE ?');
  console.log('Search for Error:', search.all('%Error%'));
"
```

### Phase 2: MCP Tool Testing
```bash
# Get logs
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_logs","arguments":{"limit":50}},"id":1}' | node dist/index.js

# Tail logs with follow
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"tail_logs","arguments":{"lines":20,"follow":true}},"id":2}' | node dist/index.js

# Search logs
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_logs","arguments":{"query":"error","limit":10}},"id":3}' | node dist/index.js

# Clear old logs
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"clear_logs","arguments":{"processId":"test-1","before":1234567890000}},"id":4}' | node dist/index.js
```

### Phase 3: Integration Testing
```typescript
// tests/logs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LogManager } from '../src/logs/manager';
import { DatabaseManager } from '../src/database/manager';
import { LogType, LogLevel } from '../src/types/process';
import winston from 'winston';

describe('Log Management Tools', () => {
  let logManager: LogManager;
  let db: DatabaseManager;

  beforeEach(() => {
    const logger = winston.createLogger({ silent: true });
    db = new DatabaseManager(':memory:', logger);
    logManager = new LogManager(db, logger);
  });

  afterEach(() => {
    logManager.cleanup();
    db.close();
  });

  it('should store and retrieve logs', async () => {
    logManager.addLog({
      processId: 'test-1',
      type: LogType.STDOUT,
      message: 'Test log entry',
      timestamp: Date.now(),
      level: LogLevel.INFO
    });

    await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for flush

    const logs = await logManager.getLogs({ processId: 'test-1' });
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('Test log entry');
  });

  it('should search logs', async () => {
    const testLogs = [
      { message: 'Error: Connection failed', level: LogLevel.ERROR },
      { message: 'Info: Connected successfully', level: LogLevel.INFO },
      { message: 'Error: Timeout occurred', level: LogLevel.ERROR }
    ];

    for (const log of testLogs) {
      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: log.message,
        timestamp: Date.now(),
        level: log.level
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1100));

    const results = await logManager.searchLogs('Error');
    expect(results).toHaveLength(2);
    expect(results.every(r => r.message.includes('Error'))).toBe(true);
  });

  it('should tail logs with follow', async () => {
    const logs = await logManager.tailLogs({ lines: 5, follow: true });
    const subscriptionId = (logs as any).__subscriptionId;

    expect(subscriptionId).toBeDefined();

    // Add new log
    logManager.addLog({
      processId: 'test-1',
      type: LogType.STDOUT,
      message: 'New log entry',
      timestamp: Date.now(),
      level: LogLevel.INFO
    });

    // Stop tailing
    logManager.stopTailing(subscriptionId);
  });

  it('should clear logs', async () => {
    for (let i = 0; i < 10; i++) {
      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: `Log ${i}`,
        timestamp: Date.now() - (10 - i) * 1000,
        level: LogLevel.INFO
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1100));

    const deleted = await logManager.clearLogs('test-1', Date.now() - 5000);
    expect(deleted).toBeGreaterThan(0);

    const remaining = await logManager.getLogs({ processId: 'test-1' });
    expect(remaining.length).toBeLessThan(10);
  });
});
```

## Success Criteria

### Implementation Checklist
- [ ] LogManager handles buffered writes
- [ ] Batch insertion optimizes performance
- [ ] Real-time log streaming works
- [ ] Full-text search supports wildcards
- [ ] Case-sensitive search option works
- [ ] Log tailing with follow mode
- [ ] Subscription cleanup prevents memory leaks
- [ ] All 4 log tools implemented
- [ ] Log statistics calculated correctly
- [ ] Old log cleanup works with timestamp filter

### Performance Metrics
- [ ] Log write < 1ms (buffered)
- [ ] Batch flush < 50ms for 100 logs
- [ ] Search < 100ms for 100k logs
- [ ] Tail response < 10ms
- [ ] Memory usage < 50MB for 1M logs

## Dependencies
- Requires Task 0001 (Server Setup) complete
- Requires Task 0002 (Process Lifecycle) complete
- Database must have logs table
- Process manager must emit log events

## Next Steps
After implementing log tools:
1. Add error tracking tools (Task 0005)
2. Implement process groups (Task 0006)
3. Create resources and prompts (Task 0007)
---
## Update Notes (2025-09-20)

- Buffered writes and backpressure
  - Cap per‑process buffer size; force early flush when global buffer > threshold; flush on shutdown to avoid loss.
- Search performance
  - Clarify performance targets: LIKE scans on ~1M rows may exceed 100ms; recommend optional FTS5 virtual table for sub‑100ms queries; otherwise set target to < 350ms with proper indexes.
- Tools registry and MCP shape
  - Register log tools via the central registry; return spec‑compliant `content` without custom `data`.
- TDD additions
  - Tests: search case‑sensitive/insensitive; tail follow lifecycle and subscription cleanup; log stats correctness; buffer backpressure and batch flush timing.

### Revised Log Tools Example
```typescript
// src/tools/logs.ts
import { z } from 'zod';
import type winston from 'winston';
import { LogManager } from '../logs/manager.js';
import { registerTool } from './registry.js';

const GetLogsSchema = z.object({ processId: z.string().optional(), limit: z.number().min(1).max(500).default(100) });
const TailLogsSchema = z.object({ processId: z.string().min(1), lines: z.number().min(1).max(500).default(50), follow: z.boolean().default(false) });
const SearchLogsSchema = z.object({ query: z.string().min(1), processId: z.string().optional(), limit: z.number().min(1).max(500).default(100) });
const ClearLogsSchema = z.object({ processId: z.string().optional(), before: z.number().optional() });

export function registerLogTools(logs: LogManager, logger: winston.Logger) {
  registerTool({
    name: 'get_logs', description: 'Retrieve historical logs', schema: GetLogsSchema,
    handler: async (args) => {
      const { processId, limit } = args as any;
      const data = await logs.getLogs({ processId, limit });
      return [{ type: 'text', text: `Logs: ${data.length} entries` }];
    },
  });

  registerTool({
    name: 'tail_logs', description: 'Stream recent logs', schema: TailLogsSchema,
    handler: async (args) => {
      const { processId, lines } = args as any;
      const data = await logs.getLogs({ processId, limit: lines });
      return [{ type: 'text', text: `Tail: ${data.length} entries` }];
    },
  });

  registerTool({
    name: 'search_logs', description: 'Full-text log search', schema: SearchLogsSchema,
    handler: async (args) => {
      const { query, processId, limit } = args as any;
      const data = await logs.searchLogs({ query, processId, limit });
      return [{ type: 'text', text: `Search matched: ${data.length}` }];
    },
  });

  registerTool({
    name: 'clear_logs', description: 'Remove old logs', schema: ClearLogsSchema,
    handler: async (args) => {
      const { processId, before } = args as any;
      await logs.clearLogs({ processId, before });
      return [{ type: 'text', text: 'Logs cleared' }];
    },
  });
}
```
