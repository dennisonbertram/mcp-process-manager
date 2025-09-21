import { z } from 'zod';
import type winston from 'winston';
import { registerTool } from './registry.js';

const ListTemplatesSchema = z.object({ category: z.string().optional() });
const ApplyTemplateSchema = z.object({
  name: z.string().min(1),
  variables: z.record(z.union([z.string(), z.number()])).optional(),
  start: z.boolean().optional(),
  group: z.string().optional()
});

// Minimal in-memory catalog for now
const TEMPLATES = [
  {
    name: 'node-service',
    title: 'Node Service (web + worker)',
    description: 'Two processes: web (node) and worker',
    categories: ['backend'],
  },
  {
    name: 'python-service',
    title: 'Python Service (uvicorn + worker)',
    description: 'API with uvicorn and background worker',
    categories: ['backend']
  }
];

export function registerTemplateTools(logger: winston.Logger) {
  registerTool({
    name: 'templates/list',
    description: 'List available process templates',
    schema: ListTemplatesSchema,
    handler: async (args: any) => {
      const list = args.category ? TEMPLATES.filter(t => t.categories.includes(args.category!)) : TEMPLATES;
      return {
        content: [
          { type: 'text', text: `Found ${list.length} templates${args.category ? ' in category ' + args.category : ''}` },
          { type: 'text', text: JSON.stringify({ templates: list }, null, 2) }
        ]
      };
    }
  });

  registerTool({
    name: 'templates/apply',
    description: 'Apply a template to produce a processes config (dry-run)',
    schema: ApplyTemplateSchema,
    handler: async (args: any) => {
      // For now, return a minimal example config; no execution
      const config = {
        processes: {
          web: { command: 'node', args: ['server.js'], envFiles: ['.env'] },
          worker: { command: 'node', args: ['worker.js'], envFiles: ['.env'] }
        },
        groups: { dev: ['web', 'worker'] }
      };
      return {
        content: [
          { type: 'text', text: `Applied template '${args.name}' (dry-run)` },
          { type: 'text', text: JSON.stringify({ config }, null, 2) }
        ]
      };
    }
  });
}
