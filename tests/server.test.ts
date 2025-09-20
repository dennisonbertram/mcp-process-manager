import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/config/manager';
import { DatabaseManager } from '../src/database/manager';
import winston from 'winston';

describe('Server Setup', () => {
  let db: DatabaseManager;
  let config: ConfigManager;
  let logger: winston.Logger;

  beforeEach(() => {
    logger = winston.createLogger({ silent: true });
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