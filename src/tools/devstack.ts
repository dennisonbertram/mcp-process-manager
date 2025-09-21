import { z } from 'zod';
import type winston from 'winston';
import { registerTool } from './registry.js';
import { ProcessManager } from '../process/manager.js';
import { GroupManager } from '../groups/manager.js';

const StartDevStackSchema = z.object({
  group: z.string().default('dev')
});

export function registerDevStackTools(pm: ProcessManager, gm: GroupManager, logger: winston.Logger) {
  registerTool({
    name: 'start_dev_stack',
    description: 'Start the development stack defined in the config (group name default: dev)',
    schema: StartDevStackSchema,
    handler: async (args: any) => {
      // Find a group by name
      const groups = gm.listGroups();
      const group = groups.find(g => g.name === args.group);
      if (!group) {
        return {
          content: [{ type: 'text', text: `Group '${args.group}' not found. Use templates/apply + config/read to create.` }],
          isError: true
        };
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
