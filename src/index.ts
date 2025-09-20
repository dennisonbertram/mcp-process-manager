import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import winston from 'winston';
import dotenv from 'dotenv';
import { z } from 'zod';
import { DatabaseManager } from './database/manager.js';
import { ConfigManager } from './config/manager.js';
import { ProcessManager } from './process/manager.js';
import { registerTools } from './tools/index.js';
import { getToolsList, callTool } from './tools/registry.js';
// import { registerResources } from './resources/index.js';
// import { registerPrompts } from './prompts/index.js';

dotenv.config();

const ToolsListRequest = z.object({
  method: z.literal('tools/list')
});

const ToolsCallRequest = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.any())
  })
});

// Initialize logger (stderr only for MCP compliance)
const logger = winston.createLogger({
  level: process.env.PM_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Stream({ stream: process.stderr })
  ]
});

// Initialize server
async function main() {
  try {
    // Load configuration
    const config = new ConfigManager();

    // Initialize database
    const dbPath = config.get('PM_DATABASE_PATH');
    const database = new DatabaseManager(dbPath, logger);

    // Initialize process manager
    const processManager = new ProcessManager(database, logger, config);

    // Placeholder for ProcessManager - to be implemented in Task 0002
    // const processManager = new ProcessManager(database, logger, config);

    // Create MCP server
    const server = new Server(
      {
        name: 'process-manager-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );

    registerTools(processManager, logger);

    // Set up tool handlers
    server.setRequestHandler(ToolsListRequest, async () => {
      return { tools: getToolsList() };
    });

    server.setRequestHandler(ToolsCallRequest, async (request) => {
      return await callTool(request.params.name, request.params.arguments);
    });

    // Placeholder for component registration - to be implemented in later tasks
    // registerResources(server, processManager, database, logger);
    // registerPrompts(server, processManager, logger);

    // Setup cleanup handlers
    const cleanup = () => {
      logger.info('Shutting down Process Manager MCP Server');
      processManager.shutdown();
      database.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('Process Manager MCP Server started successfully');

    // Start periodic cleanup
    setInterval(() => {
      const retentionDays = config.get('PM_LOG_RETENTION_DAYS');
      database.cleanupOldData(retentionDays);
    }, 24 * 60 * 60 * 1000); // Daily cleanup

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error);