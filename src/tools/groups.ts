import { z } from 'zod';
import type winston from 'winston';
import { GroupManager } from '../groups/manager.js';
import { registerTool } from './registry.js';

const CreateGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startupOrder: z.array(z.string()).optional(),
  startupDelay: z.number().min(0).optional()
});

const AddToGroupSchema = z.object({
  processId: z.string().min(1),
  groupId: z.string().min(1)
});

const StartGroupSchema = z.object({
  groupId: z.string().min(1),
  startupDelay: z.number().min(0).optional(),
  skipRunning: z.boolean().optional()
});

const StopGroupSchema = z.object({
  groupId: z.string().min(1),
  stopStrategy: z.enum(['parallel', 'reverse', 'sequential']).optional(),
  force: z.boolean().optional()
});

const GetGroupStatusSchema = z.object({
  groupId: z.string().min(1)
});

export function registerGroupTools(
  groupManager: GroupManager,
  logger: winston.Logger
): void {
  registerTool({
    name: 'create_group',
    description: 'Create a new process group for managing related processes',
    schema: CreateGroupSchema,
    handler: async (args: any) => {
      try {
        const group = await groupManager.createGroup(args);

        return {
          content: [{
            type: 'text',
            text: `Created process group "${group.name}" with ID: ${group.id}`
          }]
        };
      } catch (error) {
        logger.error('Failed to create group:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to create group: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'add_to_group',
    description: 'Add a process to an existing group',
    schema: AddToGroupSchema,
    handler: async (args: any) => {
      try {
        await groupManager.addToGroup(args.processId, args.groupId);

        return {
          content: [{
            type: 'text',
            text: `Added process ${args.processId} to group ${args.groupId}`
          }]
        };
      } catch (error) {
        logger.error('Failed to add to group:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to add to group: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'start_group',
    description: 'Start all processes in a group with optional startup order',
    schema: StartGroupSchema,
    handler: async (args: any) => {
      try {
        const processes = await groupManager.startGroup(args.groupId, {
          startupDelay: args.startupDelay,
          skipRunning: args.skipRunning
        });

        const status = await groupManager.getGroupStatus(args.groupId);

        return {
          content: [{
            type: 'text',
            text: `Started group ${args.groupId}: ${processes.length} processes\nRunning: ${status.runningCount}, Failed: ${status.failedCount}`
          }]
        };
      } catch (error) {
        logger.error('Failed to start group:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to start group: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'stop_group',
    description: 'Stop all processes in a group with configurable strategy',
    schema: StopGroupSchema,
    handler: async (args: any) => {
      try {
        await groupManager.stopGroup(args.groupId, {
          stopStrategy: args.stopStrategy,
          force: args.force
        });

        return {
          content: [{
            type: 'text',
            text: `Stopped all processes in group ${args.groupId}`
          }]
        };
      } catch (error) {
        logger.error('Failed to stop group:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to stop group: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });

  registerTool({
    name: 'get_group_status',
    description: 'Get the current status of a process group',
    schema: GetGroupStatusSchema,
    handler: async (args: any) => {
      try {
        const status = await groupManager.getGroupStatus(args.groupId);

        return {
          content: [{
            type: 'text',
            text: `Group ${args.groupId} status:\n${status.processes.length} processes\n${status.runningCount} running\n${status.stoppedCount} stopped\n${status.failedCount} failed`
          }]
        };
      } catch (error) {
        logger.error('Failed to get group status:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to get group status: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  });
}