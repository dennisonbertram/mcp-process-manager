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

    // Create test processes in database
    db.getStatement('insertProcess').run({
      id: 'test-1',
      name: 'Test Process 1',
      command: 'echo',
      args: '[]',
      env: '{}',
      cwd: '/tmp',
      status: 'stopped',
      created_at: Date.now()
    });

    db.getStatement('insertProcess').run({
      id: 'test-2',
      name: 'Test Process 2',
      command: 'echo',
      args: '[]',
      env: '{}',
      cwd: '/tmp',
      status: 'stopped',
      created_at: Date.now()
    });
  });

  afterEach(() => {
    logManager.cleanup();
    db.close();
  });

  describe('LogManager', () => {
    it('should store and retrieve logs', async () => {
      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Test log entry',
        timestamp: Date.now(),
        level: LogLevel.INFO
      });

      // Wait for buffer flush
      await new Promise(resolve => setTimeout(resolve, 1100));

      const logs = await logManager.getLogs({ processId: 'test-1' });
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test log entry');
      expect(logs[0].type).toBe(LogType.STDOUT);
      expect(logs[0].level).toBe(LogLevel.INFO);
    });

    it('should filter logs by type', async () => {
      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Stdout message',
        timestamp: Date.now(),
        level: LogLevel.INFO
      });

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDERR,
        message: 'Stderr message',
        timestamp: Date.now(),
        level: LogLevel.ERROR
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const stdoutLogs = await logManager.getLogs({ processId: 'test-1', type: LogType.STDOUT });
      const stderrLogs = await logManager.getLogs({ processId: 'test-1', type: LogType.STDERR });

      expect(stdoutLogs).toHaveLength(1);
      expect(stdoutLogs[0].type).toBe(LogType.STDOUT);
      expect(stderrLogs).toHaveLength(1);
      expect(stderrLogs[0].type).toBe(LogType.STDERR);
    });

    it('should filter logs by level', async () => {
      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Info message',
        timestamp: Date.now(),
        level: LogLevel.INFO
      });

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Error message',
        timestamp: Date.now(),
        level: LogLevel.ERROR
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const infoLogs = await logManager.getLogs({ processId: 'test-1', level: LogLevel.INFO });
      const errorLogs = await logManager.getLogs({ processId: 'test-1', level: LogLevel.ERROR });

      expect(infoLogs).toHaveLength(1);
      expect(infoLogs[0].level).toBe(LogLevel.INFO);
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe(LogLevel.ERROR);
    });

    it('should filter logs by time range', async () => {
      const now = Date.now();
      const past = now - 10000;
      const future = now + 10000;

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Old message',
        timestamp: past,
        level: LogLevel.INFO
      });

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'New message',
        timestamp: now,
        level: LogLevel.INFO
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const recentLogs = await logManager.getLogs({
        processId: 'test-1',
        startTime: now - 5000
      });

      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0].message).toBe('New message');
    });

    it('should search logs with case insensitive matching', async () => {
      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Error: Connection failed',
        timestamp: Date.now(),
        level: LogLevel.ERROR
      });

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Success: Data saved',
        timestamp: Date.now(),
        level: LogLevel.INFO
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const results = await logManager.searchLogs('error');
      expect(results).toHaveLength(1);
      expect(results[0].message).toContain('Error');
    });

    it('should search logs with case sensitive matching', async () => {
      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Error: Connection failed',
        timestamp: Date.now(),
        level: LogLevel.ERROR
      });

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'error: lowercase',
        timestamp: Date.now(),
        level: LogLevel.ERROR
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const caseSensitiveResults = await logManager.searchLogs('Error', {
        caseSensitive: true
      });

      const caseInsensitiveResults = await logManager.searchLogs('error', {
        caseSensitive: false
      });

      expect(caseSensitiveResults).toHaveLength(1);
      expect(caseInsensitiveResults).toHaveLength(2);
    });

    it('should limit search results', async () => {
      for (let i = 0; i < 10; i++) {
        logManager.addLog({
          processId: 'test-1',
          type: LogType.STDOUT,
          message: `Message with error ${i}`,
          timestamp: Date.now(),
          level: LogLevel.ERROR
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1100));

      const results = await logManager.searchLogs('error', { limit: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should tail logs with chronological ordering', async () => {
      const logs = await logManager.tailLogs({ lines: 5 });
      expect(logs).toBeInstanceOf(Array);
      // Should be in chronological order (oldest first for tail)
      if (logs.length > 1) {
        for (let i = 1; i < logs.length; i++) {
          expect(logs[i].timestamp).toBeGreaterThanOrEqual(logs[i - 1].timestamp);
        }
      }
    });

    it('should clear logs for a specific process', async () => {
      for (let i = 0; i < 5; i++) {
        logManager.addLog({
          processId: 'test-1',
          type: LogType.STDOUT,
          message: `Log ${i}`,
          timestamp: Date.now(),
          level: LogLevel.INFO
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1100));

      const deleted = await logManager.clearLogs('test-1');
      expect(deleted).toBe(5);

      const remaining = await logManager.getLogs({ processId: 'test-1' });
      expect(remaining).toHaveLength(0);
    });

    it('should clear logs before a specific timestamp', async () => {
      const cutoffTime = Date.now();

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Old log',
        timestamp: cutoffTime - 1000,
        level: LogLevel.INFO
      });

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'New log',
        timestamp: cutoffTime + 1000,
        level: LogLevel.INFO
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const deleted = await logManager.clearLogs('test-1', cutoffTime);
      expect(deleted).toBe(1);

      const remaining = await logManager.getLogs({ processId: 'test-1' });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].message).toBe('New log');
    });

    it('should calculate log statistics', async () => {
      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDOUT,
        message: 'Info message',
        timestamp: Date.now(),
        level: LogLevel.INFO
      });

      logManager.addLog({
        processId: 'test-1',
        type: LogType.STDERR,
        message: 'Error message',
        timestamp: Date.now(),
        level: LogLevel.ERROR
      });

      logManager.addLog({
        processId: 'test-2',
        type: LogType.STDOUT,
        message: 'Other process',
        timestamp: Date.now(),
        level: LogLevel.INFO
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const stats = await logManager.getLogStats('test-1');

      expect(stats.totalLogs).toBe(2);
      expect(stats.byType[LogType.STDOUT]).toBe(1);
      expect(stats.byType[LogType.STDERR]).toBe(1);
      expect(stats.byLevel[LogLevel.INFO]).toBe(1);
      expect(stats.byLevel[LogLevel.ERROR]).toBe(1);
      expect(stats.oldestLog).toBeDefined();
      expect(stats.newestLog).toBeDefined();
      expect(stats.sizeBytes).toBeGreaterThan(0);
    });

    it('should handle buffer backpressure', async () => {
      // Add many logs quickly to test buffer management
      for (let i = 0; i < 150; i++) {
        logManager.addLog({
          processId: 'test-1',
          type: LogType.STDOUT,
          message: `Log message ${i}`,
          timestamp: Date.now(),
          level: LogLevel.INFO
        });
      }

      // Wait for buffer flush
      await new Promise(resolve => setTimeout(resolve, 1200));

      const logs = await logManager.getLogs({ processId: 'test-1' });
      expect(logs.length).toBeGreaterThan(100); // Should have flushed most logs
    });

    it('should handle empty search results', async () => {
      const results = await logManager.searchLogs('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should handle pagination', async () => {
      for (let i = 0; i < 10; i++) {
        logManager.addLog({
          processId: 'test-1',
          type: LogType.STDOUT,
          message: `Log ${i}`,
          timestamp: Date.now() + i,
          level: LogLevel.INFO
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1100));

      const firstPage = await logManager.getLogs({
        processId: 'test-1',
        limit: 5,
        offset: 0
      });

      const secondPage = await logManager.getLogs({
        processId: 'test-1',
        limit: 5,
        offset: 5
      });

      expect(firstPage).toHaveLength(5);
      expect(secondPage).toHaveLength(5);
      expect(firstPage[0].message).not.toBe(secondPage[0].message);
    });
  });

  describe('Integration Tests', () => {
    it('should handle concurrent log writes', async () => {
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            logManager.addLog({
              processId: 'test-1',
              type: LogType.STDOUT,
              message: `Concurrent log ${i}`,
              timestamp: Date.now(),
              level: LogLevel.INFO
            });
            setTimeout(resolve, 10); // Small delay to simulate async operation
          })
        );
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 1100));

      const logs = await logManager.getLogs({ processId: 'test-1' });
      expect(logs.length).toBe(20);
    });

    it('should maintain log order', async () => {
      const timestamps = [];
      for (let i = 0; i < 5; i++) {
        const timestamp = Date.now() + (i * 100);
        timestamps.push(timestamp);
        logManager.addLog({
          processId: 'test-1',
          type: LogType.STDOUT,
          message: `Ordered log ${i}`,
          timestamp,
          level: LogLevel.INFO
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1100));

      const logs = await logManager.getLogs({ processId: 'test-1' });
      expect(logs).toHaveLength(5);

      // Check that logs are returned in descending timestamp order (newest first)
      for (let i = 0; i < logs.length - 1; i++) {
        expect(logs[i].timestamp).toBeGreaterThanOrEqual(logs[i + 1].timestamp);
      }
    });
  });
});