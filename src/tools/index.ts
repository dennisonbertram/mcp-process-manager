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
import { registerTemplateTools } from './templates.js';
import { registerAdvisorTools } from './advisor.js';
import { registerConfigTools } from './config.js';
import { registerDevStackTools } from './devstack.js';
import { registerAnalysisTools } from './analyze.js';
import { registerReloadTools } from './reload.js';
import { registerActionLogTools } from './actionlog.js';

export function registerTools(
  processManager: ProcessManager,
  statsCollector: StatsCollector,
  healthCheckService: HealthCheckService,
  logManager: LogManager,
  errorManager: ErrorManager,
  groupManager: GroupManager,
  logger: winston.Logger
): void {
  // Simple mode: core 5 tools + group orchestration
  registerLifecycleTools(processManager, logger); // start/stop/restart/list
  registerLogTools(logManager, logger);           // logs
  registerGroupTools(groupManager, logger);       // simple group orchestration

  // Advanced tools (keep registered but can be ignored for simple mode)
  registerMonitoringTools(processManager, statsCollector, healthCheckService, logger);
  registerErrorTools(errorManager, logger);
  registerTemplateTools(logger);
  registerAdvisorTools(logger);
  registerConfigTools(logger);
  registerDevStackTools(processManager, groupManager, logger);
  registerAnalysisTools(logManager, healthCheckService, logger);
  registerReloadTools(processManager, groupManager, logger);
  registerActionLogTools(logger);
}