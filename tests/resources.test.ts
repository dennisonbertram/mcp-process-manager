import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ResourceProvider } from '../src/resources/provider.js';
import { PromptProvider } from '../src/prompts/provider.js';
import { ProcessManager } from '../src/process/manager.js';
import { DatabaseManager } from '../src/database/manager.js';
import { ConfigManager } from '../src/config/manager.js';
import { LogManager } from '../src/logs/manager.js';
import { ErrorManager } from '../src/errors/manager.js';
import { GroupManager } from '../src/groups/manager.js';
import { StatsCollector } from '../src/monitoring/collector.js';
import { HealthCheckService } from '../src/monitoring/health.js';
import winston from 'winston';

describe('Resources and Prompts', () => {
  let db: DatabaseManager;
  let processManager: ProcessManager;
  let logManager: LogManager;
  let errorManager: ErrorManager;
  let groupManager: GroupManager;
  let statsCollector: StatsCollector;
  let healthService: HealthCheckService;
  let logger: winston.Logger;

  beforeEach(() => {
    logger = winston.createLogger({ silent: true });
    const config = new ConfigManager();
    db = new DatabaseManager(':memory:', logger);
    logManager = new LogManager(db, logger);
    errorManager = new ErrorManager(db, logger);
    processManager = new ProcessManager(db, logger, config, logManager);
    groupManager = new GroupManager(db, processManager, logger);
    statsCollector = new StatsCollector(db, processManager, logger);
    healthService = new HealthCheckService(processManager, db, logger, config.get('PM_ALLOWED_COMMANDS'));
  });

  afterEach(() => {
    processManager.shutdown();
    db.close();
  });

  describe('ResourceProvider', () => {
    it('should instantiate without errors', () => {
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

      expect(() => {
        new ResourceProvider(
          server,
          processManager,
          logManager,
          errorManager,
          groupManager,
          statsCollector,
          healthService,
          logger
        );
      }).not.toThrow();
    });
  });

  describe('PromptProvider', () => {
    it('should instantiate without errors', () => {
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

      expect(() => {
        new PromptProvider(server, logger);
      }).not.toThrow();
    });
  });
});