import winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { StatsCollector } from '../monitoring/collector.js';
import { HealthCheckService } from '../monitoring/health.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerMonitoringTools } from './monitoring.js';

export function registerTools(
  processManager: ProcessManager,
  statsCollector: StatsCollector,
  healthCheckService: HealthCheckService,
  logger: winston.Logger
): void {
  registerLifecycleTools(processManager, logger);
  registerMonitoringTools(processManager, statsCollector, healthCheckService, logger);
}