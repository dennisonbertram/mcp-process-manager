import { z } from 'zod';
import type winston from 'winston';
import { registerTool } from './registry.js';
import { LogManager } from '../logs/manager.js';
import { HealthCheckService } from '../monitoring/health.js';

const AnalyzeLogsSchema = z.object({ processId: z.string().optional(), limit: z.number().min(10).max(5000).default(500) });
const CheckHealthSummarySchema = z.object({});

export function registerAnalysisTools(logs: LogManager, health: HealthCheckService, _logger: winston.Logger) {
  registerTool({
    name: 'analyze_logs',
    description: 'Summarize recent logs and highlight potential issues',
    schema: AnalyzeLogsSchema,
    handler: async (args: any) => {
      const entries = await logs.getLogs({ processId: args.processId, limit: args.limit });
      const errors = entries.filter(e => e.level === 'error');
      const warnings = entries.filter(e => e.level === 'warn');
      return {
        content: [
          { type: 'text', text: `Analyzed ${entries.length} logs: ${errors.length} errors, ${warnings.length} warnings.` },
          { type: 'text', text: JSON.stringify({ errors: errors.slice(0, 20), warnings: warnings.slice(0, 20) }, null, 2) }
        ]
      };
    }
  });

  registerTool({
    name: 'check_health_summary',
    description: 'Run health checks across running processes and summarize',
    schema: CheckHealthSummarySchema,
    handler: async () => {
      const results = await health.checkAllHealth();
      const healthy = results.filter(r => r.status === 'healthy').length;
      const unhealthy = results.length - healthy;
      return {
        content: [
          { type: 'text', text: `Health summary: ${healthy} healthy, ${unhealthy} unhealthy.` },
          { type: 'text', text: JSON.stringify({ results }, null, 2) }
        ]
      };
    }
  });
}
