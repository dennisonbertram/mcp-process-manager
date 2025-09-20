import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/process/manager';
import { LogManager } from '../src/logs/manager';
import { DatabaseManager } from '../src/database/manager';
import { ConfigManager } from '../src/config/manager';
import winston from 'winston';

describe('Process Lifecycle Tools', () => {
  let processManager: ProcessManager;
  let db: DatabaseManager;

  beforeEach(() => {
    process.env.PM_ALLOWED_COMMANDS = '/usr/bin,/bin,/usr/local/bin';
    const logger = winston.createLogger({ silent: true });
    const config = new ConfigManager();
    db = new DatabaseManager(':memory:', logger);
    const logManager = new LogManager(db, logger);
    processManager = new ProcessManager(db, logger, config, logManager);
  });

  afterEach(async () => {
    processManager.shutdown();
    // Wait for processes to fully exit
    await new Promise(resolve => setTimeout(resolve, 200));
    db.close();
  });

  it('should start a process', async () => {
    const info = await processManager.startProcess({
      name: 'test',
      command: '/bin/echo',
      args: ['test']
    });

    expect(info.id).toBeDefined();
    expect(info.status).toBe('running');
    expect(info.pid).toBeDefined();
  });

  it('should stop a process', async () => {
    const info = await processManager.startProcess({
      name: 'test',
      command: '/bin/sleep',
      args: ['10']
    });

    await processManager.stopProcess(info.id);

    // Wait a bit for the process to actually exit
    await new Promise(resolve => setTimeout(resolve, 100));

    const processes = processManager.listProcesses();
    const stopped = processes.find(p => p.id === info.id);

    expect(stopped?.status).toBe('stopped');
  });

  it('should list processes', () => {
    const processes = processManager.listProcesses();
    expect(Array.isArray(processes)).toBe(true);
  });
});