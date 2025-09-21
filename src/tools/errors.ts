import { z } from 'zod';
import type winston from 'winston';
import { ErrorManager } from '../errors/manager.js';
import { registerTool } from './registry.js';

const GetErrorsSchema = z.object({
  processId: z.string().optional(),
  errorType: z.string().optional(),
  resolved: z.boolean().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0)
});

const GetLatestErrorsSchema = z.object({
  limit: z.number().min(1).max(100).default(10),
  unresolvedOnly: z.boolean().default(true)
});

const MarkErrorResolvedSchema = z.object({
  errorId: z.number().min(1),
  resolution: z.string().optional()
});

export function registerErrorTools(
  errorManager: ErrorManager,
  logger: winston.Logger
): void {
  registerTool({
    name: 'get_errors',
    description: 'Retrieve error history with flexible filtering options',
    schema: GetErrorsSchema,
    handler: async (args: any) => {
      try {
        const errors = await errorManager.getErrors(args);

        const summary = await errorManager.getErrorSummary(
          args.processId,
          args.startTime ? Date.now() - args.startTime : undefined
        );

        const formatted = errors.slice(0, 5).map(err =>
          `[${new Date(err.timestamp).toISOString()}] ${err.errorType}: ${err.message}${err.resolved ? ' (resolved)' : ''}`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${errors.length} errors (${summary.unresolvedErrors} unresolved)\n\nRecent errors:\n${formatted}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}\n\nError rate: ${summary.errorRate.toFixed(2)} errors/hour`
            },
            {
              type: 'text',
              text: JSON.stringify({ errors, summary }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to get errors:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to get errors: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'get_latest_errors',
    description: 'Get recent errors across all processes',
    schema: GetLatestErrorsSchema,
    handler: async (args: any) => {
      try {
        const errors = await errorManager.getLatestErrors(args.limit, args.unresolvedOnly);

        const formatted = errors.map(err =>
          `[${new Date(err.timestamp).toISOString()}] ${err.processId} - ${err.errorType}: ${err.message}`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Latest ${args.unresolvedOnly ? 'unresolved ' : ''}errors (${errors.length}):\n\n${formatted || 'No errors found'}`
            },
            {
              type: 'text',
              text: JSON.stringify({ errors }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to get latest errors:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to get latest errors: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'mark_error_resolved',
    description: 'Mark an error as resolved with optional resolution notes',
    schema: MarkErrorResolvedSchema,
    handler: async (args: any) => {
      try {
        await errorManager.markErrorResolved(args.errorId, args.resolution);

        return {
          content: [
            {
              type: 'text',
              text: `Marked error ${args.errorId} as resolved${args.resolution ? `: ${args.resolution}` : ''}`
            },
            {
              type: 'text',
              text: JSON.stringify({ errorId: args.errorId, resolution: args.resolution || null }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to mark error resolved:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to mark error resolved: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });
}