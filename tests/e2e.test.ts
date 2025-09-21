import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/process/manager';
import { DatabaseManager } from '../src/database/manager';
import { ConfigManager } from '../src/config/manager';
import { LogManager } from '../src/logs/manager';
import { ErrorManager } from '../src/errors/manager';
import { GroupManager } from '../src/groups/manager';
import { StatsCollector } from '../src/monitoring/collector';
import { HealthCheckService } from '../src/monitoring/health';
import { registerTools } from '../src/tools/index';
import { getToolsList, callTool } from '../src/tools/registry';
import winston from 'winston';

describe('End-to-End Tool Integration Tests', () => {
  let db: DatabaseManager;
  let processManager: ProcessManager;
  let logManager: LogManager;
  let errorManager: ErrorManager;
  let groupManager: GroupManager;
  let statsCollector: StatsCollector;
  let healthService: HealthCheckService;
  let logger: winston.Logger;

  beforeEach(() => {
    process.env.PM_ALLOWED_COMMANDS = '/usr/bin,/bin,/usr/local/bin,/Users/dennisonbertram/.nvm/versions/node/v20.18.1/bin';
    logger = winston.createLogger({ silent: true });
    const config = new ConfigManager();
    db = new DatabaseManager(':memory:', logger);
    logManager = new LogManager(db, logger);
    errorManager = new ErrorManager(db, logger);
    processManager = new ProcessManager(db, logger, config, logManager);
    groupManager = new GroupManager(db, processManager, logger);
    statsCollector = new StatsCollector(db, processManager, logger);
    healthService = new HealthCheckService(processManager, db, logger, config.get('PM_ALLOWED_COMMANDS'));

    // Register all tools
    registerTools(processManager, statsCollector, healthService, logManager, errorManager, groupManager, logger);
  });

  afterEach(async () => {
    // Wait for any pending operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    statsCollector.stopCollection();
    healthService.stopAllHealthChecks();

    // Wait for shutdown to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Only close database if it's still open
    // try {
    //   db.close();
    // } catch (error) {
    //   // Database might already be closed
    // }

    delete process.env.PM_ALLOWED_COMMANDS;
  });

  describe('Tool Registry Integration', () => {
    it('should register all tools successfully', () => {
      const tools = getToolsList();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      // Check that expected tools are present
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('start_process');
      expect(toolNames).toContain('stop_process');
      expect(toolNames).toContain('list_processes');
      expect(toolNames).toContain('get_system_stats');
      expect(toolNames).toContain('get_logs');
      expect(toolNames).toContain('create_group');
    });

    it('should have proper tool schemas', () => {
      const tools = getToolsList();
      tools.forEach((tool: any) => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe('Process Management Workflow', () => {
    it('should execute complete process management workflow', async () => {
      // Start a process
      const startResponse = await callTool('start_process', {
        name: 'workflow-test',
        command: '/bin/echo',
        args: ['Hello Workflow']
      });

      expect(startResponse.content[0].text).toContain('Started process');
      expect(startResponse.isError).toBeFalsy();

      // Extract process ID from response (this is a simplified approach)
      const processIdMatch = startResponse.content[0].text.match(/Started process ([^\s]+)/);
      expect(processIdMatch).toBeTruthy();
      const processId = processIdMatch![1];

      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // List processes
      const listResponse = await callTool('list_processes', {});
      expect(listResponse.content[0].text).toContain('processes');
      expect(listResponse.isError).toBeFalsy();

      // Get logs
      const logsResponse = await callTool('get_logs', { processId });
      expect(logsResponse.content[0].text).toContain('logs');
      expect(logsResponse.isError).toBeFalsy();

      // Stop the process
      const stopResponse = await callTool('stop_process', { processId });
      expect(stopResponse.content[0].text).toContain('Stopped process');
      expect(stopResponse.isError).toBeFalsy();
    });

    it('should handle process monitoring workflow', async () => {
      statsCollector.startCollection(1000); // Collect every second

      // Start a process
      const startResponse = await callTool('start_process', {
        name: 'monitoring-test',
        command: '/bin/sleep',
        args: ['3']
      });

      expect(startResponse.content[0].text).toContain('Started process');
      const processIdMatch = startResponse.content[0].text.match(/Started process ([^\s]+)/);
      expect(processIdMatch).toBeTruthy();
      const processId = processIdMatch![1];

      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get system stats
      const systemStatsResponse = await callTool('get_system_stats', {});
      expect(systemStatsResponse.content[0].text).toContain('CPU');
      expect(systemStatsResponse.content[0].text).toContain('Memory');
      expect(systemStatsResponse.isError).toBeFalsy();

      // Get process stats
      const processStatsResponse = await callTool('get_process_stats', { processId });
      expect(processStatsResponse.content[0].text).toContain('stats');
      expect(processStatsResponse.isError).toBeFalsy();

      // Perform health check
      const healthResponse = await callTool('check_process_health', { processId });
      expect(healthResponse.content[0].text).toContain('health');
      expect(healthResponse.isError).toBeFalsy();
    });
  });

  describe('Group Management Workflow', () => {
    it('should execute complete group management workflow', async () => {
      // Create a group
      const createResponse = await callTool('create_group', {
        name: 'workflow-group',
        description: 'Test group for workflow'
      });

      expect(createResponse.content[0].text).toContain('Created process group');
      const groupIdMatch = createResponse.content[0].text.match(/Created process group "[^"]+" with ID: ([^\s]+)/);
      expect(groupIdMatch).toBeTruthy();
      const groupId = groupIdMatch![1];

      // Start processes
      const proc1Response = await callTool('start_process', {
        name: 'group-proc-1',
        command: '/bin/sleep',
        args: ['2']
      });

      expect(proc1Response.content[0].text).toContain('Started process');
      const proc1IdMatch = proc1Response.content[0].text.match(/Started process ([^\s]+)/);
      expect(proc1IdMatch).toBeTruthy();
      const proc1Id = proc1IdMatch![1];

      const proc2Response = await callTool('start_process', {
        name: 'group-proc-2',
        command: '/bin/sleep',
        args: ['2']
      });

      expect(proc2Response.content[0].text).toContain('Started process');
      const proc2IdMatch = proc2Response.content[0].text.match(/Started process ([^\s]+)/);
      expect(proc2IdMatch).toBeTruthy();
      const proc2Id = proc2IdMatch![1];

      // Add processes to group
      const add1Response = await callTool('add_to_group', {
        groupId,
        processId: proc1Id
      });
      expect(add1Response.content[0].text).toContain('Added process');

      const add2Response = await callTool('add_to_group', {
        groupId,
        processId: proc2Id
      });
      expect(add2Response.content[0].text).toContain('Added process');

      // Get group status
      const statusResponse = await callTool('get_group_status', { groupId });
      expect(statusResponse.content[0].text).toContain('processes');
      expect(statusResponse.isError).toBeFalsy();

      // Stop group
      const stopResponse = await callTool('stop_group', { groupId });
      expect(stopResponse.content[0].text).toContain('Stopped all processes');
      expect(stopResponse.isError).toBeFalsy();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid tool calls gracefully', async () => {
      const response = await callTool('nonexistent_tool', {});
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('should handle invalid process operations', async () => {
      const response = await callTool('process_stop', { id: 'nonexistent' });
      expect(response.isError).toBe(true);
    });

    it('should handle invalid group operations', async () => {
      const response = await callTool('group_status', { id: 'nonexistent' });
      expect(response.isError).toBe(true);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent tool calls', async () => {
      const operations: Promise<any>[] = [];

      // Create multiple process start operations
      for (let i = 0; i < 5; i++) {
        operations.push(callTool('start_process', {
          name: `concurrent-proc-${i}`,
          command: '/bin/echo',
          args: [`Message ${i}`]
        }));
      }

      const responses = await Promise.all(operations);
      expect(responses.length).toBe(5);

      responses.forEach((response: any) => {
        expect(response.isError).toBeFalsy();
        expect(response.content[0].text).toContain('Started process');
      });

      // List all processes
      const listResponse = await callTool('list_processes', {});
      expect(listResponse.content[0].text).toContain('processes');
      expect(listResponse.isError).toBeFalsy();
    });
  });

  describe('Log Management Workflow', () => {
    it('should handle log operations end-to-end', async () => {
      // Start a process to generate logs
      const startResponse = await callTool('start_process', {
        name: 'log-test-process',
        command: '/bin/echo',
        args: ['Test log message']
      });

      expect(startResponse.content[0].text).toContain('Started process');
      const processIdMatch = startResponse.content[0].text.match(/Started process ([^\s]+)/);
      expect(processIdMatch).toBeTruthy();
      const processId = processIdMatch![1];

      // Wait for logs to be written
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get logs
      const logsResponse = await callTool('get_logs', {
        processId
      });

      expect(logsResponse.content[0].text).toContain('logs');
      expect(logsResponse.isError).toBeFalsy();

      // Search logs
      const searchResponse = await callTool('search_logs', {
        query: 'Test'
      });

      expect(searchResponse.content[0].text).toContain('Found');
      expect(searchResponse.isError).toBeFalsy();
    });
  });
});