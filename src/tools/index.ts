import winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { StatsCollector } from '../monitoring/collector.js';
import { HealthCheckService } from '../monitoring/health.js';
import { LogManager } from '../logs/manager.js';
import { ErrorManager } from '../errors/manager.js';
import { GroupManager } from '../groups/manager.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerMonitoringTools } from './monitoring.js';
import { registerLogTools } from './logs.js';
import { registerErrorTools } from './errors.js';
import { registerGroupTools } from './groups.js';

export function registerTools(
  processManager: ProcessManager,
  statsCollector: StatsCollector,
  healthCheckService: HealthCheckService,
  logManager: LogManager,
  errorManager: ErrorManager,
  groupManager: GroupManager,
  logger: winston.Logger
): void {
  registerLifecycleTools(processManager, logger);
  registerMonitoringTools(processManager, statsCollector, healthCheckService, logger);
  registerLogTools(logManager, logger);
  registerErrorTools(errorManager, logger);
  registerGroupTools(groupManager, logger);
}