import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/config/manager';

describe('ConfigManager', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should initialize with default values', () => {
    const config = new ConfigManager();
    expect(config.get('PM_MAX_PROCESSES')).toBe(50);
    expect(config.get('PM_LOG_LEVEL')).toBe('info');
    expect(config.get('PM_DATABASE_PATH')).toBe('./data/process-manager.db');
  });

  it('should load environment variables', () => {
    process.env.PM_MAX_PROCESSES = '25';
    process.env.PM_LOG_LEVEL = 'debug';
    process.env.PM_AUTO_RESTART_ENABLED = 'false';

    const config = new ConfigManager();
    expect(config.get('PM_MAX_PROCESSES')).toBe(25);
    expect(config.get('PM_LOG_LEVEL')).toBe('debug');
    expect(config.get('PM_AUTO_RESTART_ENABLED')).toBe(false);
  });

  it('should validate command paths are absolute', () => {
    process.env.PM_ALLOWED_COMMANDS = 'relative/path,/absolute/path';

    expect(() => new ConfigManager()).toThrow('Invalid command path: relative/path must be absolute');
  });

  it('should validate command paths correctly', () => {
    process.env.PM_ALLOWED_COMMANDS = '/usr/bin,/tmp';
    const config = new ConfigManager();

    // Test with paths that should exist
    expect(config.isCommandAllowed('/usr/bin')).toBe(true);
    expect(config.isCommandAllowed('/tmp')).toBe(true);
    expect(config.isCommandAllowed('/invalid/path')).toBe(false);
  });

  it('should return all configuration', () => {
    const config = new ConfigManager();
    const all = config.getAll();
    expect(typeof all).toBe('object');
    expect(all.PM_MAX_PROCESSES).toBeDefined();
    expect(all.PM_LOG_LEVEL).toBeDefined();
  });
});