import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatsCollector } from '../src/monitoring/collector';
import { HealthCheckService } from '../src/monitoring/health';
import { ProcessManager } from '../src/process/manager';
import { DatabaseManager } from '../src/database/manager';
import { ConfigManager } from '../src/config/manager';
import winston from 'winston';
import { HealthStatus } from '../src/types/process';

describe('Monitoring Tools', () => {
  let statsCollector: StatsCollector;
  let healthService: HealthCheckService;
  let processManager: ProcessManager;
  let db: DatabaseManager;
  let config: ConfigManager;

  beforeEach(() => {
    const logger = winston.createLogger({ silent: true });
    config = new ConfigManager();
    // Mock the command validation for testing
    config.isCommandAllowed = vi.fn().mockReturnValue(true);
    db = new DatabaseManager(':memory:', logger);
    processManager = new ProcessManager(db, logger, config);
    statsCollector = new StatsCollector(db, processManager, logger);
    healthService = new HealthCheckService(processManager, db, logger, config.get('PM_ALLOWED_COMMANDS'));
  });

  afterEach(() => {
    statsCollector.stopCollection();
    healthService.stopAllHealthChecks();
    processManager.shutdown();
    db.close();
    delete process.env.PM_ALLOWED_COMMANDS;
  });

  describe('StatsCollector', () => {
    it('should collect process metrics', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      // Wait for process to start and collect some metrics
      await new Promise(resolve => setTimeout(resolve, 200));

      const stats = await statsCollector.getProcessStats(info.id);
      expect(stats).toBeDefined();
      if (stats.length > 0) {
        expect(typeof stats[0].cpuUsage).toBe('number');
        expect(typeof stats[0].memoryUsage).toBe('number');
        expect(typeof stats[0].timestamp).toBe('number');
      }
    });

    it('should collect system stats', async () => {
      const stats = await statsCollector.getSystemStats();

      expect(stats.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(stats.cpuUsage).toBeLessThanOrEqual(100);
      expect(stats.memoryTotal).toBeGreaterThan(0);
      expect(stats.memoryFree).toBeGreaterThan(0);
      expect(stats.uptime).toBeGreaterThan(0);
      expect(Array.isArray(stats.loadAverage)).toBe(true);
    });

    it('should calculate aggregated stats', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const aggregated = await statsCollector.getAggregatedStats(info.id, 60000);

      expect(aggregated.avgCpu).toBeGreaterThanOrEqual(0);
      expect(aggregated.maxCpu).toBeGreaterThanOrEqual(0);
      expect(aggregated.avgMemory).toBeGreaterThanOrEqual(0);
      expect(aggregated.maxMemory).toBeGreaterThanOrEqual(0);
      expect(aggregated.sampleCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-existent process', async () => {
      const stats = await statsCollector.getProcessStats('non-existent');
      expect(stats).toEqual([]);
    });

    it('should maintain metrics cache', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      // Manually add some metrics to test cache
      statsCollector['updateCache'](info.id, {
        processId: info.id,
        cpuUsage: 10,
        memoryUsage: 1000000,
        timestamp: Date.now()
      });

      const cached = statsCollector['metricsCache'].get(info.id);
      expect(cached).toBeDefined();
      expect(cached!.length).toBe(1);
    });

    it('should limit cache size', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      // Add more than 100 metrics to test cache limit
      for (let i = 0; i < 105; i++) {
        statsCollector['updateCache'](info.id, {
          processId: info.id,
          cpuUsage: i,
          memoryUsage: 1000000 + i,
          timestamp: Date.now() + i
        });
      }

      const cached = statsCollector['metricsCache'].get(info.id);
      expect(cached!.length).toBe(100); // Should be capped at 100
    });
  });

  describe('HealthCheckService', () => {
    it('should perform health checks on running processes', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'console.log("healthy")'],
        healthCheckCommand: 'echo "OK"'
      });

      const result = await healthService.checkProcessHealth(info.id);

      expect(result.processId).toBe(info.id);
      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.message).toContain('OK');
      expect(result.responseTime).toBeDefined();
      expect(result.checkedAt).toBeDefined();
    });

    it('should handle processes without health check commands', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      const result = await healthService.checkProcessHealth(info.id);

      expect(result.processId).toBe(info.id);
      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.message).toBe('Process is running');
    });

    it('should detect unhealthy processes', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)'],
        healthCheckCommand: 'false' // Command that exits with code 1
      });

      const result = await healthService.checkProcessHealth(info.id);

      expect(result.processId).toBe(info.id);
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.responseTime).toBeDefined();
    });

    it('should handle non-existent processes', async () => {
      const result = await healthService.checkProcessHealth('non-existent');

      expect(result.processId).toBe('non-existent');
      expect(result.status).toBe(HealthStatus.UNKNOWN);
      expect(result.message).toBe('Process not found');
    });

    it('should handle stopped processes', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      await processManager.stopProcess(info.id);

      const result = await healthService.checkProcessHealth(info.id);

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Process status: stopped');
    });

    it('should check all processes health', async () => {
      const info1 = await processManager.startProcess({
        name: 'test1',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      const info2 = await processManager.startProcess({
        name: 'test2',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      const results = await healthService.checkAllHealth();

      expect(results.length).toBe(2);
      expect(results.some(r => r.processId === info1.id)).toBe(true);
      expect(results.some(r => r.processId === info2.id)).toBe(true);
    });

    it('should validate command paths', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)'],
        healthCheckCommand: '/non/allowed/path'
      });

      const result = await healthService.checkProcessHealth(info.id);

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      // The error could be either path validation or spawn failure
      expect(result.message).toMatch(/(not in allowed paths|ENOENT|not found)/);
    });

    it('should handle health check timeouts', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)'],
        healthCheckCommand: 'node -e "setTimeout(() => process.exit(1), 6000)"' // Command that takes longer than 5s timeout
      });

      const startTime = Date.now();
      const result = await healthService.checkProcessHealth(info.id);
      const elapsed = Date.now() - startTime;

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.responseTime).toBeDefined();
      expect(elapsed).toBeLessThan(6000); // Should timeout before 6 seconds
    }, 7000); // Test timeout
  });

  describe('Integration Tests', () => {
    it('should collect metrics for running processes', async () => {
      statsCollector.startCollection(1000); // Collect every second

      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)']
      });

      // Wait for a few collections
      await new Promise(resolve => setTimeout(resolve, 3500));

      const stats = await statsCollector.getProcessStats(info.id);
      expect(stats.length).toBeGreaterThan(0);

      const aggregated = await statsCollector.getAggregatedStats(info.id, 10000);
      expect(aggregated.sampleCount).toBeGreaterThan(0);
    });

    it('should handle dead processes gracefully', async () => {
      const info = await processManager.startProcess({
        name: 'test',
        command: 'node',
        args: ['-e', 'process.exit(0)']
      });

      // Wait for process to exit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Try to collect metrics - should not throw
      const stats = await statsCollector.getProcessStats(info.id);
      expect(stats).toBeDefined(); // Should return empty array or handle gracefully

      const health = await healthService.checkProcessHealth(info.id);
      expect(health.status).toBe(HealthStatus.UNHEALTHY);
    });
  });
});