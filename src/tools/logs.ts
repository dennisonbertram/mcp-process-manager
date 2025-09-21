import { z } from 'zod';
import type winston from 'winston';
import { LogManager } from '../logs/manager.js';
import { LogType, LogLevel } from '../types/process.js';
import { registerTool } from './registry.js';

const GetLogsSchema = z.object({
  processId: z.string().optional(),
  type: z.nativeEnum(LogType).optional(),
  level: z.nativeEnum(LogLevel).optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(10000).default(100),
  offset: z.number().min(0).default(0)
});

const TailLogsSchema = z.object({
  processId: z.string().optional(),
  lines: z.number().min(1).max(1000).default(100),
  follow: z.boolean().default(false)
});

const SearchLogsSchema = z.object({
  query: z.string().min(1),
  processId: z.string().optional(),
  limit: z.number().min(1).max(1000).default(100),
  caseSensitive: z.boolean().default(false)
});

const ClearLogsSchema = z.object({
  processId: z.string().min(1),
  before: z.number().optional() // Clear logs before this timestamp
});

export function registerLogTools(
  logManager: LogManager,
  logger: winston.Logger
): void {
  registerTool({
    name: 'get_logs',
    description: 'Retrieve historical logs with flexible filtering options',
    schema: GetLogsSchema,
    handler: async (args: any) => {
      try {
        const logs = await logManager.getLogs(args);

        const summary = logs.length > 0
          ? `Found ${logs.length} log entries${args.processId ? ` for process ${args.processId}` : ''}`
          : 'No logs found matching criteria';

        // Format logs for display
        const formatted = logs.slice(0, 10).map(log =>
          `[${new Date(log.timestamp).toISOString()}] [${log.level}] ${log.message}`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `${summary}\n\nRecent logs:\n${formatted}${logs.length > 10 ? `\n... and ${logs.length - 10} more` : ''}`
            },
            {
              type: 'text',
              text: JSON.stringify({ logs }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to get logs:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to get logs: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'tail_logs',
    description: 'Stream recent logs with optional real-time following',
    schema: TailLogsSchema,
    handler: async (args: any) => {
      try {
        const logs = await logManager.tailLogs(args);

        const formatted = logs.map(log =>
          `[${new Date(log.timestamp).toISOString()}] [${log.level}] ${log.message}`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Showing last ${logs.length} log entries${args.processId ? ` for process ${args.processId}` : ''}${args.follow ? ' (following for new logs)' : ''}\n\n${formatted}`
            },
            {
              type: 'text',
              text: JSON.stringify({ logs, subscriptionId: (logs as any).__subscriptionId || null }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to tail logs:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to tail logs: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'search_logs',
    description: 'Full-text search across log messages',
    schema: SearchLogsSchema,
    handler: async (args: any) => {
      try {
        const logs = await logManager.searchLogs(args.query, {
          processId: args.processId,
          limit: args.limit,
          caseSensitive: args.caseSensitive
        });

        const summary = logs.length > 0
          ? `Found ${logs.length} log entries matching "${args.query}"`
          : `No logs found matching "${args.query}"`;

        const formatted = logs.slice(0, 10).map(log => {
          // Highlight search term in output
          const highlighted = log.message.replace(
            new RegExp(args.query, args.caseSensitive ? 'g' : 'gi'),
            `**${args.query}**`
          );
          return `[${new Date(log.timestamp).toISOString()}] [${log.level}] ${highlighted}`;
        }).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `${summary}\n\n${formatted}${logs.length > 10 ? `\n... and ${logs.length - 10} more matches` : ''}`
            },
            {
              type: 'text',
              text: JSON.stringify({ query: args.query, logs }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to search logs:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to search logs: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'clear_logs',
    description: 'Remove old logs for a specific process',
    schema: ClearLogsSchema,
    handler: async (args: any) => {
      try {
        const deletedCount = await logManager.clearLogs(args.processId, args.before);

        const message = args.before
          ? `Cleared ${deletedCount} logs for process ${args.processId} before ${new Date(args.before).toISOString()}`
          : `Cleared ${deletedCount} logs for process ${args.processId}`;

        return {
          content: [
            {
              type: 'text',
              text: message
            },
            {
              type: 'text',
              text: JSON.stringify({ processId: args.processId, deletedCount, before: args.before || null }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to clear logs:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to clear logs: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });
}