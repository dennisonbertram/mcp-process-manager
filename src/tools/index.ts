import winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { StatsCollector } from '../monitoring/collector.js';
import { HealthCheckService } from '../monitoring/health.js';
import { LogManager } from '../logs/manager.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerMonitoringTools } from './monitoring.js';
import { registerLogTools } from './logs.js';

export function registerTools(
  processManager: ProcessManager,
  statsCollector: StatsCollector,
  healthCheckService: HealthCheckService,
  logManager: LogManager,
  logger: winston.Logger
): void {
  registerLifecycleTools(processManager, logger);
  registerMonitoringTools(processManager, statsCollector, healthCheckService, logger);
  registerLogTools(logManager, logger);
}