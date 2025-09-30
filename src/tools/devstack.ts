import { z } from 'zod';
import type winston from 'winston';
import { registerTool } from './registry.js';
import { ProcessManager } from '../process/manager.js';
import { GroupManager } from '../groups/manager.js';

const StartDevStackSchema = z.object({
  group: z.string().default('dev')
});

export function registerDevStackTools(pm: ProcessManager, gm: GroupManager, _logger: winston.Logger) {
  registerTool({
    name: 'start_dev_stack',
    description: 'Start the development stack defined in the config (group name default: dev)',
    schema: StartDevStackSchema,
    handler: async (args: any) => {
      // Find a group by name
      let groups = gm.listGroups();
      let group = groups.find(g => g.name === args.group);
      if (!group) {
        try {
          const { readProcessesConfig } = await import('../config/loader.js');
          const { config } = readProcessesConfig(process.cwd());
          if (config && config.groups && config.groups[args.group]) {
            for (const [name, def] of Object.entries(config.processes)) {
              try {
                await pm.startProcess({
                  name,
                  command: (def as any).command,
                  args: (def as any).args,
                  env: (def as any).env,
                  envFiles: (def as any).envFiles,
                  envProfile: (def as any).envProfile,
                  cwd: (def as any).cwd || 'pwd',
                  autoRestart: (def as any).autoRestart,
                  healthCheckCommand: (def as any).healthCheckCommand,
                  healthCheckInterval: (def as any).healthCheckInterval,
                });
              } catch { /* ignore per-process start failures */ }
            }
            groups = gm.listGroups();
            group = groups.find(g => g.name === args.group);
          }
        } catch { /* ignore */ }
        if (!group) {
          return {
            content: [{ type: 'text', text: `Group '${args.group}' not found. Place a processes.config.json with a '${args.group}' group in the project root, or run templates/apply.` }],
            isError: true
          };
        }
      }
      const started = await gm.startGroup(group.id, { skipRunning: true });
      return {
        content: [
          { type: 'text', text: `Started group '${group.name}' (${started.length} processes)` },
          { type: 'text', text: JSON.stringify({ group, started }, null, 2) }
        ]
      };
    }
  });
}
