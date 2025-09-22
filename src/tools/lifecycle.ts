import { z } from 'zod';
import winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { ProcessStatus } from '../types/process.js';
import { registerTool } from './registry.js';

const StartProcessSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  envFiles: z.array(z.string()).optional(),
  envProfile: z.string().optional(),
  cwd: z.string().optional(),
  autoRestart: z.boolean().optional(),
  healthCheckCommand: z.string().optional(),
  healthCheckInterval: z.number().min(1000).optional(),
  groupId: z.string().optional()
});

const StopProcessSchema = z.object({
  processId: z.string().min(1),
  force: z.boolean().optional()
});

const RestartProcessSchema = z.object({
  processId: z.string().min(1),
  newConfig: z.object({
    name: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().optional(),
    autoRestart: z.boolean().optional(),
    healthCheckCommand: z.string().optional(),
    healthCheckInterval: z.number().optional()
  }).optional()
});

const KillProcessSchema = z.object({
  processId: z.string().min(1)
});

const ListProcessesSchema = z.object({
  status: z.nativeEnum(ProcessStatus).optional(),
  groupId: z.string().optional()
});

export function registerLifecycleTools(pm: ProcessManager, logger: winston.Logger) {
  registerTool({
    name: 'start_process',
    description: 'Start a new managed process',
    schema: StartProcessSchema,
    handler: async (args) => {
      try {
        const p = await pm.startProcess(args);
        let dashUrl: string | null = null;
        try {
          const { ensureDashboardUrl } = await import('../dashboard/runtime.js');
          dashUrl = await ensureDashboardUrl();
        } catch {}
        return { content: [
          { type: 'text', text: `Started process ${p.id} (${p.name})${dashUrl ? ` — Monitor: ${dashUrl}` : ''}` },
          { type: 'text', text: JSON.stringify({ process: p, dashboard: dashUrl }, null, 2) }
        ] };
      } catch (error) {
        logger.error('Failed to start process:', error);
        const msg = error instanceof Error ? error.message : String(error);
        const suggestions: any = [];
        if (/Command not allowed/i.test(msg)) {
          suggestions.push({
            actionRequired: 'grant_permission',
            envVars: {
              PM_ALLOWED_COMMANDS: 'pwd,/usr/bin,/usr/local/bin',
              PM_ALLOWED_TOOL_NAMES: 'pnpm,npm,yarn,node,tsx,next,vite'
            },
            how: 'Add these to server env and restart, or wrap the command in a repo script under PWD.'
          });
        } else if (/Maximum process limit reached/i.test(msg)) {
          suggestions.push({
            actionRequired: 'increase_limit',
            envVars: { PM_MAX_PROCESSES: '100' }
          });
        }
        return {
          content: [
            { type: 'text', text: `Failed to start process: ${msg}` },
            { type: 'text', text: JSON.stringify({ suggestions }, null, 2) }
          ],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'stop_process',
    description: 'Stop a running process',
    schema: StopProcessSchema,
    handler: async (args) => {
      try {
        await pm.stopProcess(args.processId, args.force);
        return { content: [
          { type: 'text', text: `Stopped process ${args.processId}` },
          { type: 'text', text: JSON.stringify({ processId: args.processId, action: 'stopped' }) }
        ] };
      } catch (error) {
        logger.error('Failed to stop process:', error);
        return { content: [{ type: 'text', text: `Failed to stop process: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    },
  });

  registerTool({
    name: 'restart_process',
    description: 'Restart a process with optional new configuration',
    schema: RestartProcessSchema,
    handler: async (args) => {
      try {
        const p = await pm.restartProcess(args.processId, args.newConfig);
        return { content: [
          { type: 'text', text: `Restarted process ${p.id} (${p.name})` },
          { type: 'text', text: JSON.stringify({ process: p }, null, 2) }
        ] };
      } catch (error) {
        logger.error('Failed to restart process:', error);
        return { content: [{ type: 'text', text: `Failed to restart process: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    },
  });

  registerTool({
    name: 'kill_process',
    description: 'Force kill a process immediately',
    schema: KillProcessSchema,
    handler: async (args) => {
      try {
        await pm.killProcess(args.processId);
        return { content: [
          { type: 'text', text: `Killed process ${args.processId}` },
          { type: 'text', text: JSON.stringify({ processId: args.processId, action: 'killed' }) }
        ] };
      } catch (error) {
        logger.error('Failed to kill process:', error);
        return { content: [{ type: 'text', text: `Failed to kill process: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    },
  });

  registerTool({
    name: 'list_processes',
    description: 'List all managed processes with optional filtering',
    schema: ListProcessesSchema,
    handler: async (args) => {
      try {
        const res = pm.listProcesses(args);
        return { content: [
          { type: 'text', text: `Found ${res.length} processes` },
          { type: 'text', text: JSON.stringify({ processes: res }, null, 2) }
        ] };
      } catch (error) {
        logger.error('Failed to list processes:', error);
        return { content: [{ type: 'text', text: `Failed to list processes: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    },
  });
}