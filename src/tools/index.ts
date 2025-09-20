import winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { registerLifecycleTools } from './lifecycle.js';

export function registerTools(processManager: ProcessManager, logger: winston.Logger): void {
  registerLifecycleTools(processManager, logger);
}