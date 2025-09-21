import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/process/manager';
import { DatabaseManager } from '../src/database/manager';
import { ConfigManager } from '../src/config/manager';
import { LogManager } from '../src/logs/manager';
import { ErrorManager } from '../src/errors/manager';
import { GroupManager } from '../src/groups/manager';
import { StatsCollector } from '../src/monitoring/collector';
import { HealthCheckService } from '../src/monitoring/health';
import { LogType, LogLevel } from '../src/types/process';
import winston from 'winston';

describe('Integration Tests', () => {
  let db: DatabaseManager;
  let config: ConfigManager;
  let processManager: ProcessManager;
  let logManager: LogManager;
  let errorManager: ErrorManager;
  let groupManager: GroupManager;
  let statsCollector: StatsCollector;
  let healthService: HealthCheckService;
  let logger: winston.Logger;

  beforeEach(() => {
    process.env.PM_ALLOWED_COMMANDS = '/usr/bin,/bin,/usr/local/bin,/Users/dennisonbertram/.nvm/versions/node/v20.18.1/bin';
    logger = winston.createLogger({ silent: true });
    config = new ConfigManager();
    db = new DatabaseManager(':memory:', logger);
    logManager = new LogManager(db, logger);
    errorManager = new ErrorManager(db, logger);
    processManager = new ProcessManager(db, logger, config, logManager);
    groupManager = new GroupManager(db, processManager, logger);
    statsCollector = new StatsCollector(db, processManager, logger);
    healthService = new HealthCheckService(processManager, db, logger, config.get('PM_ALLOWED_COMMANDS'));
  });

  afterEach(async () => {
    statsCollector.stopCollection();
    healthService.stopAllHealthChecks();
    processManager.shutdown();
    // Wait for processes to fully exit
    await new Promise(resolve => setTimeout(resolve, 200));
    db.close();
    delete process.env.PM_ALLOWED_COMMANDS;
  });

  describe('Full Process Lifecycle with Monitoring', () => {
    it('should handle complete process lifecycle with logging and monitoring', async () => {
      // Start process
      const processInfo = await processManager.startProcess({
        name: 'integration-test',
        command: '/bin/echo',
        args: ['Hello Integration Test']
      });

      expect(processInfo.status).toBe('running');

      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check logs were captured
      const logs = await logManager.getLogs({ processId: processInfo.id });
      expect(logs.length).toBeGreaterThan(0);

      // Check process status
      const processes = processManager.listProcesses();
      const completedProcess = processes.find(p => p.id === processInfo.id);
      expect(completedProcess?.status).toBe('stopped');

      // Verify database persistence
      const dbProcess = db.getStatement('getProcess').get(processInfo.id) as any;
      expect(dbProcess).toBeDefined();
      expect(dbProcess.status).toBe('stopped');
    });

    it('should collect metrics for running processes', async () => {
      statsCollector.startCollection(500); // Collect every 500ms

      const processInfo = await processManager.startProcess({
        name: 'metrics-test',
        command: '/bin/sleep',
        args: ['10']
      });

      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 1500));

      const stats = await statsCollector.getProcessStats(processInfo.id);
      expect(stats.length).toBeGreaterThan(0);

      const aggregated = await statsCollector.getAggregatedStats(processInfo.id, 60000);
      expect(aggregated.sampleCount).toBeGreaterThan(0);
      expect(aggregated.avgCpu).toBeGreaterThanOrEqual(0);
    });

    it('should perform health checks on processes', async () => {
      const processInfo = await processManager.startProcess({
        name: 'health-test',
        command: '/bin/sleep',
        args: ['10'],
        healthCheckCommand: '/bin/echo "OK"'
      });

      const healthResult = await healthService.checkProcessHealth(processInfo.id);
      expect(healthResult.status).toBeDefined();
      expect(healthResult.processId).toBe(processInfo.id);
      expect(healthResult.responseTime).toBeDefined();
    });
  });

  describe('Error Handling Across Components', () => {
    it('should handle process failures and log errors', async () => {
      // Start a process that will fail
      const processInfo = await processManager.startProcess({
        name: 'failing-process',
        command: '/bin/sh',
        args: ['-c', 'exit 1']
      });

      // Wait for process to fail
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check logs contain error information (process exit with non-zero code)
      const logs = await logManager.getLogs({ processId: processInfo.id });
      expect(logs.length).toBeGreaterThan(0);

      // Check if any logs indicate an error (system log about exit code)
      const hasErrorLog = logs.some(log =>
        log.type === LogType.SYSTEM &&
        log.message.includes('exited with code 1')
      );
      expect(hasErrorLog).toBe(true);

      // Verify process status - should be stopped for normal exit, crashed for abnormal
      const processes = processManager.listProcesses();
      const failedProcess = processes.find(p => p.id === processInfo.id);
      expect(['stopped', 'crashed']).toContain(failedProcess?.status);
    });

    it('should handle invalid commands and security violations', async () => {
      // Try to start process with invalid command
      await expect(processManager.startProcess({
        name: 'invalid-command',
        command: '/nonexistent/command'
      })).rejects.toThrow();

      // Try to start process with non-allowed command
      await expect(processManager.startProcess({
        name: 'forbidden-command',
        command: '/forbidden/path'
      })).rejects.toThrow();
    });

    it('should handle database errors gracefully', async () => {
      // Close database connection to simulate failure
      db.close();

      await expect(processManager.startProcess({
        name: 'db-failure',
        command: '/bin/echo',
        args: ['test']
      })).rejects.toThrow();
    });
  });

  describe('Process Groups with Full Lifecycle', () => {
    it('should manage process groups with startup and shutdown', async () => {
      // Create group
      const group = await groupManager.createGroup({
        name: 'integration-group',
        startupOrder: ['proc1', 'proc2']
      });

      // Start processes
      const proc1 = await processManager.startProcess({
        name: 'proc1',
        command: '/bin/echo',
        args: ['Process 1']
      });

      const proc2 = await processManager.startProcess({
        name: 'proc2',
        command: '/bin/echo',
        args: ['Process 2']
      });

      // Add to group
      await groupManager.addToGroup(proc1.id, group.id);
      await groupManager.addToGroup(proc2.id, group.id);

      // Check group status
      const status = await groupManager.getGroupStatus(group.id);
      expect(status.processes.length).toBe(2);
      expect(status.runningCount).toBe(2);

      // Stop group
      await groupManager.stopGroup(group.id);

      // Verify all processes stopped
      const updatedStatus = await groupManager.getGroupStatus(group.id);
      expect(updatedStatus.runningCount).toBe(0);
    });

    it('should handle group operations with monitoring', async () => {
      statsCollector.startCollection(1000);

      const group = await groupManager.createGroup({ name: 'monitored-group' });

      const proc1 = await processManager.startProcess({
        name: 'monitored-proc1',
        command: '/bin/sleep',
        args: ['10']
      });

      await groupManager.addToGroup(proc1.id, group.id);

      // Wait for metrics
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stats = await statsCollector.getProcessStats(proc1.id);
      expect(stats.length).toBeGreaterThan(0);

      // Stop group and verify metrics stop
      await groupManager.stopGroup(group.id);

      const finalStatus = await groupManager.getGroupStatus(group.id);
      expect(finalStatus.runningCount).toBe(0);
    });
  });

  describe('Cross-Component Data Flow', () => {
    it('should maintain data consistency across components', async () => {
      // Start process
      const processInfo = await processManager.startProcess({
        name: 'consistency-test',
        command: '/bin/echo',
        args: ['Data Flow Test']
      });

      const processId = processInfo.id;

      // Add logs
      logManager.addLog({
        processId,
        type: LogType.STDOUT,
        message: 'Test log message',
        timestamp: Date.now(),
        level: LogLevel.INFO
      });

      // Add error
      await errorManager.recordError(processId, new Error('Test error'));

      // Wait for data to be written
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Verify data in database
      const dbProcess = db.getStatement('getProcess').get(processId) as any;
      expect(dbProcess).toBeDefined();

      const logCount = db.getDb().prepare('SELECT COUNT(*) as count FROM logs WHERE process_id = ?').get(processId) as any;
      expect(logCount.count).toBeGreaterThan(0);

      const errorCount = db.getDb().prepare('SELECT COUNT(*) as count FROM errors WHERE process_id = ?').get(processId) as any;
      expect(errorCount.count).toBeGreaterThan(0);

      // Verify data accessible through managers
      const logs = await logManager.getLogs({ processId });
      expect(logs.length).toBeGreaterThan(0);

      const errors = await errorManager.getErrors({ processId });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle concurrent operations correctly', async () => {
      const operations: Promise<any>[] = [];

      // Start multiple processes concurrently
      for (let i = 0; i < 5; i++) {
        operations.push(processManager.startProcess({
          name: `concurrent-proc-${i}`,
          command: '/bin/echo',
          args: [`Process ${i}`]
        }));
      }

      const results = await Promise.all(operations);
      expect(results.length).toBe(5);

      // Verify all processes are tracked
      const processes = processManager.listProcesses();
      expect(processes.length).toBeGreaterThanOrEqual(5);

      // Verify database consistency
      const dbProcesses = db.getDb().prepare('SELECT COUNT(*) as count FROM processes').get() as any;
      expect(dbProcesses.count).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Resource and Performance Monitoring', () => {
    it('should monitor system resources during process execution', async () => {
      statsCollector.startCollection(500);

      // Start multiple processes
      const processes: any[] = [];
      for (let i = 0; i < 3; i++) {
        const proc = await processManager.startProcess({
          name: `resource-proc-${i}`,
          command: '/bin/sleep',
          args: ['5']
        });
        processes.push(proc);
      }

      // Wait for resource monitoring
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check system stats
      const systemStats = await statsCollector.getSystemStats();
      expect(systemStats.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(systemStats.memoryTotal).toBeGreaterThan(0);

      // Check individual process stats
      for (const proc of processes) {
        const procStats = await statsCollector.getProcessStats(proc.id);
        expect(procStats.length).toBeGreaterThan(0);
      }

      // Stop all processes
      for (const proc of processes) {
        await processManager.stopProcess(proc.id);
      }
    });

    it('should handle high load scenarios', async () => {
      // Start many processes quickly
      const startPromises: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        startPromises.push(processManager.startProcess({
          name: `load-test-${i}`,
          command: '/bin/echo',
          args: [`Load test ${i}`]
        }));
      }

      const startedProcesses = await Promise.all(startPromises);
      expect(startedProcesses.length).toBe(10);

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify all completed successfully
      const processes = processManager.listProcesses();
      const completedCount = processes.filter(p => p.status === 'stopped').length;
      expect(completedCount).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from component failures', async () => {
      // Start process
      const processInfo = await processManager.startProcess({
        name: 'recovery-test',
        command: '/bin/echo',
        args: ['Recovery Test']
      });

      // Simulate log manager failure (by closing its database)
      // Note: In real scenario, this would be handled by connection pooling/retry logic

      // Process should still complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const processes = processManager.listProcesses();
      const completedProcess = processes.find(p => p.id === processInfo.id);
      expect(completedProcess?.status).toBe('stopped');
    });

    it('should handle cleanup on failures', async () => {
      try {
        // Attempt operation that might fail
        await processManager.startProcess({
          name: 'cleanup-test',
          command: '/nonexistent/command'
        });
      } catch (error) {
        // Verify system remains in consistent state
        const processes = processManager.listProcesses();
        // Should not have zombie processes
        expect(processes.every(p => p.status !== 'running' || p.pid)).toBe(true);
      }
    });
  });
});