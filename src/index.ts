import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import winston from 'winston';
import dotenv from 'dotenv';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseManager } from './database/manager.js';
import { ConfigManager } from './config/manager.js';
import { ProcessManager } from './process/manager.js';
import { StatsCollector } from './monitoring/collector.js';
import { HealthCheckService } from './monitoring/health.js';
import { LogManager } from './logs/manager.js';
import { ErrorManager } from './errors/manager.js';
import { GroupManager } from './groups/manager.js';
import { registerTools } from './tools/index.js';
import { getToolsList, callTool } from './tools/registry.js';
import { ResourceProvider } from './resources/provider.js';
import { PromptProvider } from './prompts/provider.js';

dotenv.config();

// Using official MCP schemas from SDK for handlers

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

    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      logger.info(`Created database directory: ${dbDir}`);
    }

    const database = new DatabaseManager(dbPath, logger);

    // Initialize log manager
    const logManager = new LogManager(database, logger);

    // Initialize error manager
    const errorManager = new ErrorManager(database, logger);

    // Initialize process manager
    const processManager = new ProcessManager(database, logger, config, logManager);

    // Initialize dashboard runtime (lazy start on first process)
    try {
      const { initDashboard } = await import('./dashboard/runtime.js');
      initDashboard(processManager, logManager, logger);
    } catch {}

    // Initialize group manager
    const groupManager = new GroupManager(database, processManager, logger);

    // Initialize monitoring services
    const statsCollector = new StatsCollector(database, processManager, logger);
    const healthCheckService = new HealthCheckService(processManager, database, logger, config.get('PM_ALLOWED_COMMANDS'));

    // Start stats collection
    statsCollector.startCollection();

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

    registerTools(processManager, statsCollector, healthCheckService, logManager, errorManager, groupManager, logger);

    // Initialize resources and prompts
    new ResourceProvider(
      server,
      processManager,
      logManager,
      errorManager,
      groupManager,
      statsCollector,
      healthCheckService,
      logger
    );

    new PromptProvider(server, logger);

    // Set up tool handlers (use official schemas)
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: getToolsList() };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await callTool(request.params.name, request.params.arguments);
    });

    // Placeholder for component registration - to be implemented in later tasks
    // registerResources(server, processManager, database, logger);
    // registerPrompts(server, processManager, logger);

    // Setup cleanup handlers
    const cleanup = () => {
      logger.info('Shutting down Process Manager MCP Server');
      statsCollector.stopCollection();
      healthCheckService.stopAllHealthChecks();
      logManager.cleanup();
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