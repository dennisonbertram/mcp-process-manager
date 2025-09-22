import type winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { LogManager } from '../logs/manager.js';
import { DashboardServer } from './server.js';

let serverInstance: DashboardServer | null = null;

export function initDashboard(pm: ProcessManager, logs: LogManager, logger: winston.Logger) {
  if (!serverInstance) {
    serverInstance = new DashboardServer(pm, logs, logger);
  }
  return serverInstance;
}

export async function ensureDashboardUrl(): Promise<string | null> {
  if (!serverInstance) return null;
  const { url } = await serverInstance.ensureStarted();
  return url;
}
