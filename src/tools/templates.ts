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
  },
  {
    name: 'fullstack-dev',
    title: 'Fullstack Dev (frontend + backend + infra)',
    description: 'Frontend dev server, backend worker, and optional docker-compose infra',
    categories: ['frontend','backend','infra']
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
      const name = args.name;
      let config: any;
      switch (name) {
        case 'node-service':
          config = {
            processes: {
              web: { command: 'node', args: ['server.js'], envFiles: ['.env'] },
              worker: { command: 'node', args: ['worker.js'], envFiles: ['.env'] }
            },
            groups: { dev: ['web', 'worker'] }
          };
          break;
        case 'python-service':
          config = {
            processes: {
              api: { command: 'uvicorn', args: ['app:app', '--reload'], envFiles: ['.env'] },
              worker: { command: 'python', args: ['worker.py'] }
            },
            groups: { dev: ['api', 'worker'] }
          };
          break;
        case 'fullstack-dev':
          config = {
            processes: {
              frontend: { command: 'pnpm', args: ['dev'], envFiles: ['.env.local', '.env'] },
              backend: { command: 'pnpm', args: ['worker:dev'], envFiles: ['.env.local', '.env'] },
              infra: { command: 'docker', args: ['compose', 'up'], cwd: 'pwd' }
            },
            groups: { dev: ['infra','backend','frontend'] }
          };
          break;
        default:
          config = { processes: {}, groups: {} };
      }
      return {
        content: [
          { type: 'text', text: `Applied template '${name}' (dry-run)` },
          { type: 'text', text: JSON.stringify({ config }, null, 2) }
        ]
      };
    }
  });
}
