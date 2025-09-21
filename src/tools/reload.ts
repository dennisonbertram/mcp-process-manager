import { z } from 'zod';
import type winston from 'winston';
import { registerTool } from './registry.js';
import { readProcessesConfig } from '../config/loader.js';
import { ProcessManager } from '../process/manager.js';
import { GroupManager } from '../groups/manager.js';

const ReloadSchema = z.object({
  path: z.string().optional(),
  group: z.string().optional(),
  dryRun: z.boolean().default(true),
});

export function registerReloadTools(pm: ProcessManager, gm: GroupManager, logger: winston.Logger) {
  registerTool({
    name: 'config/reload',
    description: 'Apply desired state from processes.config.json (dry-run by default)',
    schema: ReloadSchema,
    handler: async (args: any) => {
      const { config, issues } = readProcessesConfig(process.cwd(), args.path || 'processes.config.json');
      if (!config) {
        const details = (issues||[]).join('; ');
        return { content: [
          { type: 'text', text: `Failed to load config: ${details}` },
          { type: 'text', text: JSON.stringify({ suggestions: [{ actionRequired: 'fix_config', hint: 'Ensure processes.config.json is valid JSON and matches schema.' }] }, null, 2) }
        ], isError: true };
      }

      const actions: any[] = [];

      // Ensure processes exist in DB and are started
      for (const [name, def] of Object.entries(config.processes)) {
        actions.push({ type: 'ensureProcess', name, def });
      }

      // Start a group if requested
      if (args.group && config.groups?.[args.group]) {
        actions.push({ type: 'startGroup', group: args.group, members: config.groups[args.group] });
      }

      if (!args.dryRun) {
        // Materialize processes
        for (const [name, def] of Object.entries(config.processes)) {
          try {
            await pm.startProcess({
              name,
              command: def.command,
              args: def.args,
              env: def.env,
              envFiles: def.envFiles,
              envProfile: def.envProfile,
              cwd: def.cwd,
              autoRestart: def.autoRestart,
              healthCheckCommand: def.healthCheckCommand,
              healthCheckInterval: def.healthCheckInterval,
            });
          } catch (e) {
            logger.warn(`Process '${name}' start failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (args.group && config.groups?.[args.group]) {
          const groups = gm.listGroups();
          const target = groups.find(g => g.name === args.group);
          if (target) await gm.startGroup(target.id, { skipRunning: true });
        }
      }

      return {
        content: [
          { type: 'text', text: `${args.dryRun ? 'Planned' : 'Applied'} ${actions.length} actions` },
          { type: 'text', text: JSON.stringify({ dryRun: args.dryRun, actions }, null, 2) }
        ]
      };
    }
  });
}
