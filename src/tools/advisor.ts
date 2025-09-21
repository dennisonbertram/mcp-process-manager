import { z } from 'zod';
import type winston from 'winston';
import fs from 'node:fs';
import path from 'node:path';
import { registerTool } from './registry.js';

const AnalyzeProjectSchema = z.object({ path: z.string().optional() });

export function registerAdvisorTools(logger: winston.Logger) {
  registerTool({
    name: 'advisor/analyze_project',
    description: 'Analyze the repository to suggest processes and groups (dry-run)',
    schema: AnalyzeProjectSchema,
    handler: async (args: any) => {
      const cwd = args.path && path.isAbsolute(args.path) ? args.path : process.cwd();
      const suggestions: any = { processes: {}, groups: {}, warnings: [] };

      try {
        const pkgPath = path.join(cwd, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          const scripts = pkg.scripts || {};
          if (scripts.dev) suggestions.processes.web = { command: 'pnpm', args: ['dev'], envFiles: ['.env'] };
          if (scripts.start) suggestions.processes.app = { command: 'pnpm', args: ['start'], envFiles: ['.env'] };
        }
        if (fs.existsSync(path.join(cwd, 'docker-compose.yml'))) {
          suggestions.processes.infra = { command: 'docker', args: ['compose', 'up'], cwd: 'pwd' };
        }
        if (Object.keys(suggestions.processes).length >= 2) {
          suggestions.groups.dev = Object.keys(suggestions.processes);
        }
      } catch (e) {
        suggestions.warnings.push('Failed to analyze project: ' + (e instanceof Error ? e.message : String(e)));
      }

      return {
        content: [
          { type: 'text', text: `Analysis complete. Suggested ${Object.keys(suggestions.processes).length} processes.` },
          { type: 'text', text: JSON.stringify({ suggestions }, null, 2) }
        ]
      };
    }
  });
}
