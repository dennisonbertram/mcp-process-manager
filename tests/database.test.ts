import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/database/manager';
import winston from 'winston';

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  let logger: winston.Logger;

  beforeEach(() => {
    logger = winston.createLogger({ silent: true });
    db = new DatabaseManager(':memory:', logger);
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize database schema', () => {
    const tables = db.getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map((t: any) => t.name);

    expect(tableNames).toContain('processes');
    expect(tableNames).toContain('logs');
    expect(tableNames).toContain('errors');
    expect(tableNames).toContain('process_groups');
    expect(tableNames).toContain('metrics');
  });

  it('should prepare statements correctly', () => {
    expect(() => db.getStatement('insertProcess')).not.toThrow();
    expect(() => db.getStatement('insertLog')).not.toThrow();
    expect(() => db.getStatement('getRecentLogs')).not.toThrow();
    expect(() => db.getStatement('insertError')).not.toThrow();
    expect(() => db.getStatement('insertMetric')).not.toThrow();
  });

  it('should throw error for unknown statement', () => {
    expect(() => db.getStatement('unknownStatement')).toThrow('Prepared statement unknownStatement not found');
  });

  it('should support transactions', () => {
    const result = db.transaction(() => {
      return 'success';
    });
    expect(result).toBe('success');
  });

  it('should cleanup old data', () => {
    // First insert a process
    const insertProcess = db.getStatement('insertProcess');
    insertProcess.run({
      id: 'test-process',
      name: 'test',
      command: 'echo',
      args: null,
      env: null,
      cwd: null,
      status: 'stopped',
      created_at: Date.now()
    });

    // Insert some test log data
    const insertLog = db.getStatement('insertLog');
    const oldTimestamp = Date.now() - (40 * 24 * 60 * 60 * 1000); // 40 days ago

    insertLog.run({
      process_id: 'test-process',
      type: 'stdout',
      message: 'test message',
      timestamp: oldTimestamp,
      level: 'info'
    });

    // Verify data exists
    const logsBefore = db.getDb().prepare('SELECT COUNT(*) as count FROM logs').get() as any;
    expect(logsBefore.count).toBe(1);

    // Cleanup data older than 30 days
    db.cleanupOldData(30);

    // Verify old data was cleaned up
    const logsAfter = db.getDb().prepare('SELECT COUNT(*) as count FROM logs').get() as any;
    expect(logsAfter.count).toBe(0);
  });

  it('should provide direct database access', () => {
    const dbInstance = db.getDb();
    expect(dbInstance).toBeDefined();
    expect(typeof dbInstance.prepare).toBe('function');
  });
});