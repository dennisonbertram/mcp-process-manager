import { z } from 'zod';
import type winston from 'winston';
import { registerTool } from './registry.js';
import { readProcessesConfig } from '../config/loader.js';

const ReadConfigSchema = z.object({ path: z.string().optional() });

export function registerConfigTools(_logger: winston.Logger) {
  registerTool({
    name: 'config/read',
    description: 'Read and validate processes.config.json from the current directory (or path)',
    schema: ReadConfigSchema,
    handler: async (args: any) => {
      const cwd = process.cwd();
      const { config, issues } = readProcessesConfig(cwd, args.path || 'processes.config.json');
      const ok = !!config && (!issues || issues.length === 0);
      return {
        content: [
          { type: 'text', text: ok ? 'Config loaded successfully' : `Config issues: ${(issues||[]).length}` },
          { type: 'text', text: JSON.stringify({ config, issues }, null, 2) }
        ],
        isError: !ok
      };
    }
  });
}
