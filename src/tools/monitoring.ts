import { z } from 'zod';
import type winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { StatsCollector } from '../monitoring/collector.js';
import { HealthCheckService } from '../monitoring/health.js';
import { registerTool } from './registry.js';

const GetProcessInfoSchema = z.object({ processId: z.string().min(1) });
const GetProcessStatsSchema = z.object({ processId: z.string().min(1), duration: z.number().min(0).optional() });
const CheckProcessHealthSchema = z.object({ processId: z.string().min(1) });
const GetSystemStatsSchema = z.object({});

export function registerMonitoringTools(
  pm: ProcessManager,
  stats: StatsCollector,
  health: HealthCheckService,
  logger: winston.Logger
) {
  registerTool({
    name: 'get_process_info',
    description: 'Get detailed information about a specific process',
    schema: GetProcessInfoSchema,
    handler: async ({ processId }: any) => {
      try {
        const p = pm.listProcesses().find((x) => x.id === processId);
        if (!p) throw new Error(`Process ${processId} not found`);
        const m = (await stats.getProcessStats(processId, 60000))[0];
        return {
          content: [{ type: 'text', text: `Process ${p.name} (${p.id})\nStatus: ${p.status}\nPID: ${p.pid || 'N/A'}\nCPU: ${(m?.cpuUsage||0).toFixed(2)}%\nMemory: ${(((m?.memoryUsage||0)/1048576)).toFixed(2)} MB\nUptime: ${p.startedAt ? ((Date.now() - p.startedAt) / 1000 / 60).toFixed(1) + ' min' : 'N/A'}` }]
        };
      } catch (error) {
        logger.error('Failed to get process info:', error);
        return {
          content: [{ type: 'text', text: `Failed to get process info: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'get_process_stats',
    description: 'Get CPU and memory statistics for a process',
    schema: GetProcessStatsSchema,
    handler: async ({ processId, duration }: any) => {
      try {
        const aggregated = await stats.getAggregatedStats(processId, duration || 3600000);
        return {
          content: [{ type: 'text', text: `Process stats for ${processId}:\nAvg CPU: ${aggregated.avgCpu.toFixed(2)}%\nMax CPU: ${aggregated.maxCpu.toFixed(2)}%\nAvg Memory: ${(aggregated.avgMemory / 1024 / 1024).toFixed(2)} MB\nMax Memory: ${(aggregated.maxMemory / 1024 / 1024).toFixed(2)} MB\nSamples: ${aggregated.sampleCount}` }]
        };
      } catch (error) {
        logger.error('Failed to get process stats:', error);
        return {
          content: [{ type: 'text', text: `Failed to get process stats: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'check_process_health',
    description: 'Run health check for a process',
    schema: CheckProcessHealthSchema,
    handler: async ({ processId }: any) => {
      try {
        const r = await health.checkProcessHealth(processId);
        return {
          content: [{ type: 'text', text: `Health check for ${processId}: ${r.status}\n${r.message || ''}\nResponse time: ${r.responseTime || 'N/A'}ms` }]
        };
      } catch (error) {
        logger.error('Failed to check process health:', error);
        return {
          content: [{ type: 'text', text: `Failed to check process health: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'get_system_stats',
    description: 'Get overall system resource usage',
    schema: GetSystemStatsSchema,
    handler: async () => {
      try {
        const s = await stats.getSystemStats();
        return {
          content: [{ type: 'text', text: `System Stats:\nCPU: ${s.cpuUsage.toFixed(2)}%\nMemory: ${s.memoryUsage.toFixed(2)}%\nFree Memory: ${(s.memoryFree / 1024 / 1024 / 1024).toFixed(2)} GB\nTotal Memory: ${(s.memoryTotal / 1024 / 1024 / 1024).toFixed(2)} GB\nUptime: ${(s.uptime / 3600).toFixed(2)} hours` }]
        };
      } catch (error) {
        logger.error('Failed to get system stats:', error);
        return {
          content: [{ type: 'text', text: `Failed to get system stats: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    },
  });
}