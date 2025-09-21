import pidusage from 'pidusage';
import osUtils from 'node-os-utils';
import winston from 'winston';
import { DatabaseManager } from '../database/manager.js';
import { ProcessManager } from '../process/manager.js';
import { ProcessMetrics, ProcessStatus } from '../types/process.js';
import { EventEmitter } from 'events';

export interface SystemStats {
  cpuUsage: number;      // Percentage 0-100
  memoryUsage: number;   // Percentage 0-100
  memoryFree: number;    // Bytes
  memoryTotal: number;   // Bytes
  loadAverage: number[]; // 1, 5, 15 minute averages
  uptime: number;        // Seconds
}

export class StatsCollector extends EventEmitter {
  private database: DatabaseManager;
  private processManager: ProcessManager;
  private logger: winston.Logger;
  private collectionInterval?: NodeJS.Timeout;
  private metricsCache: Map<string, ProcessMetrics[]>;
  private systemStatsCache?: SystemStats;

  constructor(
    database: DatabaseManager,
    processManager: ProcessManager,
    logger: winston.Logger
  ) {
    super();
    this.database = database;
    this.processManager = processManager;
    this.logger = logger;
    this.metricsCache = new Map();
  }

  startCollection(intervalMs: number = 10000): void {
    if (this.collectionInterval) {
      this.stopCollection();
    }

    this.collectionInterval = setInterval(async () => {
      try {
        await this.collectAllMetrics();
      } catch (error) {
        this.logger.error('Failed to collect metrics:', error);
      }
    }, intervalMs);

    // Collect immediately
    this.collectAllMetrics();
  }

  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  private async collectAllMetrics(): Promise<void> {
    // Collect system stats
    this.systemStatsCache = await this.collectSystemStats();

    // Collect process stats
    const processes = this.processManager.listProcesses({
      status: ProcessStatus.RUNNING
    });

    const metricsPromises = processes.map(async (process) => {
      if (process.pid) {
        try {
          const metrics = await this.collectProcessMetrics(process.id, process.pid);
          this.storeMetrics(metrics);
          this.updateCache(process.id, metrics);
          return metrics;
        } catch (error) {
          this.logger.debug(`Failed to collect metrics for process ${process.id}:`, error);
          return null;
        }
      }
      return null;
    });

    await Promise.all(metricsPromises);
    this.emit('metricsCollected', { system: this.systemStatsCache, processes: this.metricsCache });
  }

  private async collectProcessMetrics(processId: string, pid: number): Promise<ProcessMetrics> {
    const stats = await pidusage(pid);

    return {
      processId,
      cpuUsage: stats.cpu,         // CPU usage percentage
      memoryUsage: stats.memory,   // Memory usage in bytes
      timestamp: Date.now()
    };
  }

  private async collectSystemStats(): Promise<SystemStats> {
    const cpu = osUtils.cpu;
    const mem = osUtils.mem;
    const os = osUtils.os;

    const [cpuUsage, memInfo] = await Promise.all([
      cpu.usage(),
      mem.info()
    ]);

    return {
      cpuUsage,
      memoryUsage: 100 - memInfo.freeMemPercentage,
      memoryFree: memInfo.freeMemMb * 1024 * 1024,  // Convert to bytes
      memoryTotal: memInfo.totalMemMb * 1024 * 1024,
      loadAverage: [0, 0, 0], // TODO: Implement load average
      uptime: os.uptime()
    };
  }

  private storeMetrics(metrics: ProcessMetrics): void {
    this.database.getStatement('insertMetric').run({
      process_id: metrics.processId,
      cpu_usage: metrics.cpuUsage,
      memory_usage: metrics.memoryUsage,
      timestamp: metrics.timestamp
    });
  }

  private updateCache(processId: string, metrics: ProcessMetrics): void {
    if (!this.metricsCache.has(processId)) {
      this.metricsCache.set(processId, []);
    }

    const cache = this.metricsCache.get(processId)!;
    cache.push(metrics);

    // Keep only last 100 entries in cache
    if (cache.length > 100) {
      cache.shift();
    }
  }

  async getProcessStats(processId: string, duration?: number): Promise<ProcessMetrics[]> {
    const cutoff = duration ? Date.now() - duration : 0;

    // Try cache first
    if (this.metricsCache.has(processId)) {
      const cached = this.metricsCache.get(processId)!;
      return cached.filter(m => m.timestamp >= cutoff);
    }

    // Query database
    const query = duration
      ? this.database.getDb().prepare(`
          SELECT * FROM metrics
          WHERE process_id = ? AND timestamp >= ?
          ORDER BY timestamp DESC
          LIMIT 1000
        `)
      : this.database.getDb().prepare(`
          SELECT * FROM metrics
          WHERE process_id = ?
          ORDER BY timestamp DESC
          LIMIT 100
        `);

    const results = duration
      ? query.all(processId, cutoff)
      : query.all(processId);

    return results.map((row: any) => ({
      processId: row.process_id,
      cpuUsage: row.cpu_usage,
      memoryUsage: row.memory_usage,
      timestamp: row.timestamp
    }));
  }

  async getSystemStats(): Promise<SystemStats> {
    if (this.systemStatsCache) {
      return this.systemStatsCache;
    }

    return this.collectSystemStats();
  }

  async getAggregatedStats(processId: string, duration: number): Promise<{
    avgCpu: number;
    maxCpu: number;
    avgMemory: number;
    maxMemory: number;
    sampleCount: number;
  }> {
    const stats = await this.getProcessStats(processId, duration);

    if (stats.length === 0) {
      return {
        avgCpu: 0,
        maxCpu: 0,
        avgMemory: 0,
        maxMemory: 0,
        sampleCount: 0
      };
    }

    const cpuValues = stats.map(s => s.cpuUsage);
    const memValues = stats.map(s => s.memoryUsage);

    return {
      avgCpu: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length,
      maxCpu: Math.max(...cpuValues),
      avgMemory: memValues.reduce((a, b) => a + b, 0) / memValues.length,
      maxMemory: Math.max(...memValues),
      sampleCount: stats.length
    };
  }
}