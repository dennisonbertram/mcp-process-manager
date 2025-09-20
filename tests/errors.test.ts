import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ErrorManager } from '../src/errors/manager';
import { DatabaseManager } from '../src/database/manager';
import winston from 'winston';

describe('Error Tracking Tools', () => {
  let errorManager: ErrorManager;
  let db: DatabaseManager;

  beforeEach(() => {
    const logger = winston.createLogger({ silent: true });
    db = new DatabaseManager(':memory:', logger);
    errorManager = new ErrorManager(db, logger);

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
    db.close();
  });

  describe('ErrorManager', () => {
    it('should categorize errors correctly', async () => {
      await errorManager.recordError('test-1', new Error('ENOMEM: out of memory'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].errorType).toBe('OutOfMemory');
    });

    it('should categorize permission errors', async () => {
      await errorManager.recordError('test-1', new Error('EACCES: permission denied'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].errorType).toBe('PermissionDenied');
    });

    it('should categorize file not found errors', async () => {
      await errorManager.recordError('test-1', new Error('ENOENT: no such file'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].errorType).toBe('FileNotFound');
    });

    it('should categorize connection errors', async () => {
      await errorManager.recordError('test-1', new Error('ECONNREFUSED: connection refused'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].errorType).toBe('ConnectionError');
    });

    it('should categorize syntax errors', async () => {
      await errorManager.recordError('test-1', new SyntaxError('unexpected token'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].errorType).toBe('SyntaxError');
    });

    it('should categorize type errors', async () => {
      await errorManager.recordError('test-1', new TypeError('undefined is not a function'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].errorType).toBe('TypeError');
    });

    it('should default to UnknownError for uncategorized errors', async () => {
      await errorManager.recordError('test-1', new Error('Some random error'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].errorType).toBe('UnknownError');
    });

    it('should store error details correctly', async () => {
      const testError = new Error('Test error message');
      testError.stack = 'Error: Test error message\n    at testFunction';

      await errorManager.recordError('test-1', testError);
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].message).toBe('Test error message');
      expect(errors[0].stackTrace).toContain('at testFunction');
      expect(errors[0].resolved).toBe(false);
      expect(errors[0].timestamp).toBeDefined();
    });

    it('should filter errors by process ID', async () => {
      await errorManager.recordError('test-1', new Error('Error 1'));
      await errorManager.recordError('test-2', new Error('Error 2'));
      await errorManager.recordError('test-1', new Error('Error 3'));

      const errors1 = await errorManager.getErrors({ processId: 'test-1' });
      const errors2 = await errorManager.getErrors({ processId: 'test-2' });

      expect(errors1).toHaveLength(2);
      expect(errors2).toHaveLength(1);
    });

    it('should filter errors by type', async () => {
      await errorManager.recordError('test-1', new Error('ENOMEM: out of memory'));
      await errorManager.recordError('test-1', new Error('EACCES: permission denied'));
      await errorManager.recordError('test-1', new Error('Random error'));

      const oomErrors = await errorManager.getErrors({ errorType: 'OutOfMemory' });
      const permErrors = await errorManager.getErrors({ errorType: 'PermissionDenied' });
      const unknownErrors = await errorManager.getErrors({ errorType: 'UnknownError' });

      expect(oomErrors).toHaveLength(1);
      expect(permErrors).toHaveLength(1);
      expect(unknownErrors).toHaveLength(1);
    });

    it('should filter errors by resolution status', async () => {
      await errorManager.recordError('test-1', new Error('Error 1'));
      await errorManager.recordError('test-1', new Error('Error 2'));

      const errors = await errorManager.getErrors({ processId: 'test-1' });
      await errorManager.markErrorResolved(errors[0].id!);

      const unresolved = await errorManager.getErrors({ resolved: false });
      const resolved = await errorManager.getErrors({ resolved: true });

      expect(unresolved).toHaveLength(1);
      expect(resolved).toHaveLength(1);
    });

    it('should filter errors by time range', async () => {
      const now = Date.now();

      await errorManager.recordError('test-1', new Error('Old error'));
      await new Promise(resolve => setTimeout(resolve, 100)); // Longer delay
      const midTime = Date.now();
      await errorManager.recordError('test-1', new Error('New error'));

      const recentErrors = await errorManager.getErrors({
        processId: 'test-1',
        startTime: midTime
      });

      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0].message).toBe('New error');
    });

    it('should limit and offset results', async () => {
      for (let i = 0; i < 10; i++) {
        await errorManager.recordError('test-1', new Error(`Error ${i}`));
      }

      const firstPage = await errorManager.getErrors({
        processId: 'test-1',
        limit: 3,
        offset: 0
      });

      const secondPage = await errorManager.getErrors({
        processId: 'test-1',
        limit: 3,
        offset: 3
      });

      expect(firstPage).toHaveLength(3);
      expect(secondPage).toHaveLength(3);
      expect(firstPage[0].message).not.toBe(secondPage[0].message);
    });

    it('should get latest errors', async () => {
      await errorManager.recordError('test-1', new Error('Error 1'));
      await errorManager.recordError('test-2', new Error('Error 2'));
      await errorManager.recordError('test-1', new Error('Error 3'));

      const latest = await errorManager.getLatestErrors(2);
      expect(latest).toHaveLength(2);
      // Should be in descending timestamp order
      expect(latest[0].timestamp).toBeGreaterThanOrEqual(latest[1].timestamp);
    });

    it('should get latest errors with unresolved filter', async () => {
      await errorManager.recordError('test-1', new Error('Error 1'));
      await errorManager.recordError('test-1', new Error('Error 2'));

      const errors = await errorManager.getErrors({ processId: 'test-1' });
      await errorManager.markErrorResolved(errors[0].id!);

      const unresolved = await errorManager.getLatestErrors(10, true);
      const all = await errorManager.getLatestErrors(10, false);

      expect(unresolved).toHaveLength(1);
      expect(all).toHaveLength(2);
    });

    it('should mark errors as resolved', async () => {
      await errorManager.recordError('test-1', new Error('Test error'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });

      expect(errors[0].resolved).toBe(false);

      await errorManager.markErrorResolved(errors[0].id!, 'Fixed the issue');

      const updated = await errorManager.getErrors({ processId: 'test-1' });
      expect(updated[0].resolved).toBe(true);
    });

    it('should throw error for non-existent error ID', async () => {
      await expect(errorManager.markErrorResolved(999)).rejects.toThrow('Error 999 not found');
    });

    it('should calculate error summary correctly', async () => {
      await errorManager.recordError('test-1', new Error('ENOMEM: out of memory'));
      await errorManager.recordError('test-1', new Error('EACCES: permission denied'));
      await errorManager.recordError('test-2', new Error('Random error'));

      const summary = await errorManager.getErrorSummary();

      expect(summary.totalErrors).toBe(3);
      expect(summary.unresolvedErrors).toBe(3);
      expect(summary.errorsByType['OutOfMemory']).toBe(1);
      expect(summary.errorsByType['PermissionDenied']).toBe(1);
      expect(summary.errorsByType['UnknownError']).toBe(1);
      expect(summary.errorsByProcess['test-1']).toBe(2);
      expect(summary.errorsByProcess['test-2']).toBe(1);
      expect(summary.mostRecentError).toBeDefined();
      expect(summary.errorRate).toBeGreaterThan(0);
    });

    it('should calculate error summary for specific process', async () => {
      await errorManager.recordError('test-1', new Error('Error 1'));
      await errorManager.recordError('test-2', new Error('Error 2'));

      const summary = await errorManager.getErrorSummary('test-1');

      expect(summary.totalErrors).toBe(1);
      expect(summary.errorsByProcess['test-1']).toBe(1);
      expect(summary.errorsByProcess['test-2']).toBeUndefined();
    });

    it('should calculate error summary with time window', async () => {
      await errorManager.recordError('test-1', new Error('Old error'));
      await new Promise(resolve => setTimeout(resolve, 100));

      const midTime = Date.now();
      await errorManager.recordError('test-1', new Error('New error'));

      // Time window of 50ms should only include the new error
      const recentSummary = await errorManager.getErrorSummary('test-1', 50);

      expect(recentSummary.totalErrors).toBe(1);
      expect(recentSummary.mostRecentError?.message).toBe('New error');
    });

    it('should get error trends', async () => {
      const now = Date.now();
      // Add errors at different times
      await errorManager.recordError('test-1', new Error('Error 1'));
      await new Promise(resolve => setTimeout(resolve, 10));
      await errorManager.recordError('test-1', new Error('Error 2'));

      const trends = await errorManager.getErrorTrends('test-1', 60000, 2); // 1 minute buckets

      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0].count).toBeGreaterThan(0);
      // Trends should be sorted by timestamp descending
      if (trends.length > 1) {
        expect(trends[0].timestamp).toBeGreaterThanOrEqual(trends[1].timestamp);
      }
    });

    it('should get similar errors', async () => {
      await errorManager.recordError('test-1', new Error('ENOMEM: out of memory'));
      await errorManager.recordError('test-1', new Error('heap out of memory'));
      await errorManager.recordError('test-1', new Error('Different error'));

      const errors = await errorManager.getErrors({ processId: 'test-1' });
      const oomErrors = errors.filter(e => e.errorType === 'OutOfMemory');

      expect(oomErrors).toHaveLength(2); // Both should be categorized as OutOfMemory

      const similar = await errorManager.getSimilarErrors(oomErrors[0].id!, 10);

      expect(similar).toHaveLength(1); // Should find the other OOM error
      expect(similar[0].errorType).toBe('OutOfMemory');
    });

    it('should throw error for non-existent error ID in similar search', async () => {
      await expect(errorManager.getSimilarErrors(999)).rejects.toThrow('Error 999 not found');
    });

    it('should emit events for new errors', async () => {
      const events: any[] = [];
      errorManager.on('newError', (error) => events.push(error));

      await errorManager.recordError('test-1', new Error('Test error'));

      expect(events).toHaveLength(1);
      expect(events[0].errorType).toBe('UnknownError');
      expect(events[0].message).toBe('Test error');
    });

    it('should emit critical error events', async () => {
      const events: any[] = [];
      errorManager.on('criticalError', (error) => events.push(error));

      await errorManager.recordError('test-1', new Error('ENOMEM: out of memory'));

      expect(events).toHaveLength(1);
      expect(events[0].errorType).toBe('OutOfMemory');
    });

    it('should emit resolution events', async () => {
      const events: any[] = [];
      errorManager.on('errorResolved', (data) => events.push(data));

      await errorManager.recordError('test-1', new Error('Test error'));
      const errors = await errorManager.getErrors({ processId: 'test-1' });
      await errorManager.markErrorResolved(errors[0].id!, 'Fixed');

      expect(events).toHaveLength(1);
      expect(events[0].errorId).toBe(errors[0].id);
      expect(events[0].resolution).toBe('Fixed');
    });
  });
});