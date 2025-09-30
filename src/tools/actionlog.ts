import { z } from 'zod';
import type winston from 'winston';
import { registerTool } from './registry.js';
import { resolveActionLogPath } from '../utils/actionLogger.js';
import { readEntries, searchEntries } from '../utils/actionLogReader.js';

const ListSchema = z.object({
  limit: z.number().min(1).max(200).default(10).describe('Number of entries to return (recent first)'),
  tool: z.string().optional().describe('Filter by exact tool name'),
  outcome: z.enum(['SUCCESS','ERROR']).optional().describe('Filter by outcome'),
  since: z.number().optional().describe('Filter by earliest timestamp (epoch ms)'),
  until: z.number().optional().describe('Filter by latest timestamp (epoch ms)')
});

const SearchSchema = z.object({
  query: z.string().min(1).describe('Fulltext search pattern'),
  limit: z.number().min(1).max(200).default(20).describe('Maximum results to return'),
  includeAttachments: z.boolean().default(false).describe('Also search attachment files for long outputs/errors'),
  caseSensitive: z.boolean().default(false).describe('Case sensitive search'),
  tool: z.string().optional().describe('Filter entries by exact tool name (entries only, not attachments)'),
  outcome: z.enum(['SUCCESS','ERROR']).optional().describe('Filter entries by outcome (entries only, not attachments)'),
  since: z.number().optional().describe('Filter entries since this timestamp (epoch ms)'),
  until: z.number().optional().describe('Filter entries until this timestamp (epoch ms)')
});

export function registerActionLogTools(_logger: winston.Logger) {
  registerTool({
    name: 'action_log/list',
    description: 'List recent action log entries. Filters: tool, outcome, time window.',
    schema: ListSchema,
    handler: async (args: any) => {
      const file = resolveActionLogPath();
      if (!file) {
        return { content: [{ type: 'text', text: 'Action logging is disabled (MCP_PM_ACTION_LOG_FILE=off).' }] };
      }
      const entries = readEntries(file, { tool: args.tool, outcome: args.outcome, since: args.since, until: args.until }).slice(-args.limit).reverse();
      const lines = entries.map(e => `- [${e.timestamp}] ${e.tool} — ${e.outcome}`).join('\n');
      return { content: [{ type: 'text', text: lines || 'No action log entries yet.' }] };
    }
  });

  registerTool({
    name: 'action_log/search',
    description: 'Search action logs with filters (tool/outcome/time). Attachments optional.',
    schema: SearchSchema,
    handler: async (args: any) => {
      const file = resolveActionLogPath();
      if (!file) {
        return { content: [{ type: 'text', text: 'Action logging is disabled (MCP_PM_ACTION_LOG_FILE=off).' }] };
      }
      const matches = searchEntries(
        args.query,
        { includeAttachments: args.includeAttachments, limit: args.limit, caseSensitive: args.caseSensitive },
        file,
        { tool: args.tool, outcome: args.outcome, since: args.since, until: args.until }
      );
      if (matches.length === 0) return { content: [{ type: 'text', text: 'No matches found.' }] };
      const formatted = matches.map(m => {
        if ('entry' in m) return `Entry: [${m.entry.timestamp}] ${m.entry.tool} — ${m.entry.outcome}\n…${m.match}…`;
        return `Attachment: ${m.attachment}\n…${m.match}…`;
      }).join('\n\n');
      return { content: [{ type: 'text', text: formatted }] };
    }
  });
}
