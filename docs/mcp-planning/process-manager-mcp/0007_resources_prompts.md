# Resources and Prompts Implementation

## Overview
Implementation of dynamic MCP resources for real-time process state monitoring and interactive prompts for common process management workflows.

## Resource Implementations

### Resource Provider Service
```typescript
// src/resources/provider.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ProcessManager } from '../process/manager.js';
import { LogManager } from '../logs/manager.js';
import { ErrorManager } from '../errors/manager.js';
import { GroupManager } from '../groups/manager.js';
import { StatsCollector } from '../monitoring/collector.js';
import { HealthCheckService } from '../monitoring/health.js';
import winston from 'winston';

export class ResourceProvider {
  private server: Server;
  private processManager: ProcessManager;
  private logManager: LogManager;
  private errorManager: ErrorManager;
  private groupManager: GroupManager;
  private statsCollector: StatsCollector;
  private healthService: HealthCheckService;
  private logger: winston.Logger;

  constructor(
    server: Server,
    processManager: ProcessManager,
    logManager: LogManager,
    errorManager: ErrorManager,
    groupManager: GroupManager,
    statsCollector: StatsCollector,
    healthService: HealthCheckService,
    logger: winston.Logger
  ) {
    this.server = server;
    this.processManager = processManager;
    this.logManager = logManager;
    this.errorManager = errorManager;
    this.groupManager = groupManager;
    this.statsCollector = statsCollector;
    this.healthService = healthService;
    this.logger = logger;

    this.registerResources();
  }

  private registerResources(): void {
    // Resource list handler
    this.server.setRequestHandler({
      method: 'resources/list',
      handler: async () => {
        return {
          resources: [
            {
              uri: 'processes://list',
              name: 'Process List',
              description: 'Real-time list of all managed processes with current status',
              mimeType: 'application/json'
            },
            {
              uri: 'logs://recent',
              name: 'Recent Logs',
              description: 'Recent logs across all processes (last 100 entries)',
              mimeType: 'application/json'
            },
            {
              uri: 'errors://latest',
              name: 'Latest Errors',
              description: 'Latest unresolved errors from all processes',
              mimeType: 'application/json'
            },
            {
              uri: 'groups://list',
              name: 'Process Groups',
              description: 'Process groups and their member status',
              mimeType: 'application/json'
            },
            {
              uri: 'health://status',
              name: 'Health Status',
              description: 'Current health check status for all monitored processes',
              mimeType: 'application/json'
            },
            {
              uri: 'metrics://summary',
              name: 'Metrics Summary',
              description: 'System resource usage summary for last hour',
              mimeType: 'application/json'
            }
          ]
        };
      }
    });

    // Resource read handler
    this.server.setRequestHandler({
      method: 'resources/read',
      handler: async (request) => {
        const uri = request.params.uri;

        try {
          switch (uri) {
            case 'processes://list':
              return await this.getProcessListResource();

            case 'logs://recent':
              return await this.getRecentLogsResource();

            case 'errors://latest':
              return await this.getLatestErrorsResource();

            case 'groups://list':
              return await this.getGroupsResource();

            case 'health://status':
              return await this.getHealthStatusResource();

            case 'metrics://summary':
              return await this.getMetricsSummaryResource();

            default:
              throw new Error(`Unknown resource URI: ${uri}`);
          }
        } catch (error) {
          this.logger.error(`Failed to read resource ${uri}:`, error);
          return {
            contents: [
              {
                uri,
                mimeType: 'text/plain',
                text: `Error reading resource: ${error.message}`
              }
            ]
          };
        }
      }
    });
  }

  private async getProcessListResource() {
    const processes = this.processManager.listProcesses();

    // Enrich with latest metrics
    const enrichedProcesses = await Promise.all(
      processes.map(async (process) => {
        const metrics = await this.statsCollector.getProcessStats(process.id, 60000);
        const latestMetric = metrics[0];

        return {
          ...process,
          currentCpu: latestMetric?.cpuUsage || 0,
          currentMemory: latestMetric?.memoryUsage || 0,
          uptime: process.startedAt ? Date.now() - process.startedAt : 0,
          formattedStatus: this.formatProcessStatus(process)
        };
      })
    );

    const summary = {
      total: processes.length,
      running: processes.filter(p => p.status === 'running').length,
      stopped: processes.filter(p => p.status === 'stopped').length,
      failed: processes.filter(p => p.status === 'failed' || p.status === 'crashed').length
    };

    return {
      contents: [
        {
          uri: 'processes://list',
          mimeType: 'application/json',
          text: JSON.stringify({ summary, processes: enrichedProcesses }, null, 2)
        }
      ]
    };
  }

  private async getRecentLogsResource() {
    const logs = await this.logManager.getLogs({ limit: 100 });

    const logsByProcess: Record<string, number> = {};
    const logsByLevel: Record<string, number> = {};

    for (const log of logs) {
      logsByProcess[log.processId] = (logsByProcess[log.processId] || 0) + 1;
      logsByLevel[log.level] = (logsByLevel[log.level] || 0) + 1;
    }

    const summary = {
      totalLogs: logs.length,
      logsByProcess,
      logsByLevel,
      oldestTimestamp: logs[logs.length - 1]?.timestamp,
      newestTimestamp: logs[0]?.timestamp
    };

    return {
      contents: [
        {
          uri: 'logs://recent',
          mimeType: 'application/json',
          text: JSON.stringify({ summary, logs: logs.slice(0, 50) }, null, 2)
        }
      ]
    };
  }

  private async getLatestErrorsResource() {
    const errors = await this.errorManager.getLatestErrors(20, true);
    const summary = await this.errorManager.getErrorSummary();

    const criticalErrors = errors.filter(e =>
      ['OutOfMemory', 'DiskSpace', 'PermissionDenied'].includes(e.errorType)
    );

    return {
      contents: [
        {
          uri: 'errors://latest',
          mimeType: 'application/json',
          text: JSON.stringify({
            summary: {
              total: summary.totalErrors,
              unresolved: summary.unresolvedErrors,
              critical: criticalErrors.length,
              errorRate: summary.errorRate,
              byType: summary.errorsByType
            },
            errors: errors.slice(0, 10),
            criticalErrors
          }, null, 2)
        }
      ]
    };
  }

  private async getGroupsResource() {
    const groups = this.groupManager.listGroups();

    const groupStatuses = await Promise.all(
      groups.map(async (group) => {
        const status = await this.groupManager.getGroupStatus(group.id);
        return {
          group,
          status: {
            processCount: status.processes.length,
            running: status.runningCount,
            stopped: status.stoppedCount,
            failed: status.failedCount,
            healthy: status.healthyCount
          },
          processes: status.processes.map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            health: p.healthStatus
          }))
        };
      })
    );

    return {
      contents: [
        {
          uri: 'groups://list',
          mimeType: 'application/json',
          text: JSON.stringify({
            totalGroups: groups.length,
            groups: groupStatuses
          }, null, 2)
        }
      ]
    };
  }

  private async getHealthStatusResource() {
    const healthResults = await this.healthService.checkAllHealth();

    const summary = {
      total: healthResults.length,
      healthy: healthResults.filter(r => r.status === 'healthy').length,
      unhealthy: healthResults.filter(r => r.status === 'unhealthy').length,
      unknown: healthResults.filter(r => r.status === 'unknown').length
    };

    const criticalUnhealthy = healthResults.filter(r =>
      r.status === 'unhealthy' && this.processManager.listProcesses()
        .find(p => p.id === r.processId)?.autoRestart
    );

    return {
      contents: [
        {
          uri: 'health://status',
          mimeType: 'application/json',
          text: JSON.stringify({
            summary,
            criticalUnhealthy,
            healthChecks: healthResults
          }, null, 2)
        }
      ]
    };
  }

  private async getMetricsSummaryResource() {
    const systemStats = await this.statsCollector.getSystemStats();
    const processes = this.processManager.listProcesses({ status: 'running' });

    const processMetrics = await Promise.all(
      processes.map(async (process) => {
        const aggregated = await this.statsCollector.getAggregatedStats(
          process.id,
          3600000 // Last hour
        );

        return {
          processId: process.id,
          processName: process.name,
          avgCpu: aggregated.avgCpu,
          maxCpu: aggregated.maxCpu,
          avgMemory: aggregated.avgMemory,
          maxMemory: aggregated.maxMemory
        };
      })
    );

    // Sort by CPU usage
    processMetrics.sort((a, b) => b.avgCpu - a.avgCpu);

    return {
      contents: [
        {
          uri: 'metrics://summary',
          mimeType: 'application/json',
          text: JSON.stringify({
            system: {
              cpuUsage: systemStats.cpuUsage,
              memoryUsage: systemStats.memoryUsage,
              memoryFree: systemStats.memoryFree,
              memoryTotal: systemStats.memoryTotal,
              uptime: systemStats.uptime
            },
            topProcessesByCpu: processMetrics.slice(0, 5),
            topProcessesByMemory: [...processMetrics]
              .sort((a, b) => b.avgMemory - a.avgMemory)
              .slice(0, 5)
          }, null, 2)
        }
      ]
    };
  }

  private formatProcessStatus(process: any): string {
    const statusEmoji = {
      running: '🟢',
      stopped: '⚫',
      failed: '🔴',
      crashed: '💥',
      starting: '🟡'
    };

    const healthEmoji = {
      healthy: '✅',
      unhealthy: '❌',
      unknown: '❓'
    };

    return `${statusEmoji[process.status] || '❓'} ${process.status.toUpperCase()} ${process.healthCheckCommand ? healthEmoji[process.healthStatus] : ''}`;
  }
}
```

## Prompt Implementations

### Prompt Provider Service
```typescript
// src/prompts/provider.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import winston from 'winston';

export class PromptProvider {
  private server: Server;
  private logger: winston.Logger;

  constructor(server: Server, logger: winston.Logger) {
    this.server = server;
    this.logger = logger;

    this.registerPrompts();
  }

  private registerPrompts(): void {
    // Prompt list handler
    this.server.setRequestHandler({
      method: 'prompts/list',
      handler: async () => {
        return {
          prompts: [
            {
              name: 'debug_process',
              description: 'Interactive debugging assistant for failing processes',
              arguments: [
                {
                  name: 'processId',
                  description: 'ID of the process to debug',
                  required: true
                }
              ]
            },
            {
              name: 'optimize_performance',
              description: 'Analyze process metrics and suggest optimizations',
              arguments: [
                {
                  name: 'processId',
                  description: 'ID of the process to optimize (optional, analyzes all if not provided)',
                  required: false
                }
              ]
            },
            {
              name: 'setup_monitoring',
              description: 'Configure comprehensive monitoring for a new process',
              arguments: [
                {
                  name: 'processName',
                  description: 'Name for the new process',
                  required: true
                },
                {
                  name: 'command',
                  description: 'Command to execute',
                  required: true
                }
              ]
            },
            {
              name: 'troubleshoot_group',
              description: 'Diagnose issues with process group coordination',
              arguments: [
                {
                  name: 'groupId',
                  description: 'ID of the group to troubleshoot',
                  required: true
                }
              ]
            }
          ]
        };
      }
    });

    // Prompt get handler
    this.server.setRequestHandler({
      method: 'prompts/get',
      handler: async (request) => {
        const name = request.params.name;
        const args = request.params.arguments || {};

        try {
          switch (name) {
            case 'debug_process':
              return this.getDebugProcessPrompt(args.processId);

            case 'optimize_performance':
              return this.getOptimizePerformancePrompt(args.processId);

            case 'setup_monitoring':
              return this.getSetupMonitoringPrompt(args.processName, args.command);

            case 'troubleshoot_group':
              return this.getTroubleshootGroupPrompt(args.groupId);

            default:
              throw new Error(`Unknown prompt: ${name}`);
          }
        } catch (error) {
          this.logger.error(`Failed to get prompt ${name}:`, error);
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Error getting prompt: ${error.message}`
                }
              }
            ]
          };
        }
      }
    });
  }

  private getDebugProcessPrompt(processId: string) {
    const prompt = `I need help debugging process ${processId}. Please:

1. First, check the process status and info using get_process_info
2. Review recent logs using get_logs with processId filter
3. Check for recent errors using get_errors
4. Analyze CPU and memory usage with get_process_stats
5. Run a health check if configured using check_process_health
6. Look for similar historical errors to identify patterns

Based on your analysis, please:
- Identify the root cause of any issues
- Suggest specific fixes or configuration changes
- Recommend monitoring improvements to prevent future issues
- Provide commands to implement the fixes

Let's start the debugging process step by step.`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ]
    };
  }

  private getOptimizePerformancePrompt(processId?: string) {
    const prompt = processId
      ? `Please analyze and optimize the performance of process ${processId}:`
      : `Please analyze and optimize the performance of all running processes:`;

    const fullPrompt = `${prompt}

1. Collect performance metrics:
   - Use get_process_stats to analyze CPU and memory usage patterns
   - Use get_system_stats to understand overall system load
   - Review the metrics://summary resource for aggregated data

2. Identify performance issues:
   - Look for memory leaks (steadily increasing memory usage)
   - Identify CPU spikes or sustained high usage
   - Find processes that are consuming disproportionate resources
   - Check for processes that frequently crash and restart

3. Analyze patterns:
   - Are there specific times when performance degrades?
   - Are certain processes affecting others in the same group?
   - Is the system reaching resource limits?

4. Provide optimization recommendations:
   - Process configuration changes (memory limits, CPU affinity)
   - Startup order optimizations for process groups
   - Resource allocation improvements
   - Health check configurations to prevent cascading failures

5. Suggest monitoring enhancements:
   - Additional metrics to track
   - Alert thresholds to set
   - Health check commands to add

Please provide specific, actionable recommendations with example commands.`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: fullPrompt
          }
        }
      ]
    };
  }

  private getSetupMonitoringPrompt(processName: string, command: string) {
    const prompt = `Help me set up comprehensive monitoring for a new process:

Process Details:
- Name: ${processName}
- Command: ${command}

Please help me:

1. Start the process with proper configuration:
   - Determine appropriate resource limits based on the command type
   - Set up automatic restart if it's a critical service
   - Configure a suitable working directory and environment

2. Set up health monitoring:
   - Suggest an appropriate health check command
   - Recommend health check interval based on process type
   - Configure auto-restart on health check failure if needed

3. Configure log management:
   - Set up log rotation policies
   - Configure error alerting thresholds
   - Implement log search patterns for common issues

4. Create a process group if related processes exist:
   - Identify related processes that should be grouped
   - Define startup order and dependencies
   - Configure group stop strategy

5. Set up performance monitoring:
   - Define CPU and memory usage thresholds
   - Configure metrics collection frequency
   - Set up alerts for resource exhaustion

Please provide the complete setup commands and explain each configuration choice.`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ]
    };
  }

  private getTroubleshootGroupPrompt(groupId: string) {
    const prompt = `Please help me troubleshoot issues with process group ${groupId}:

1. Analyze group configuration:
   - Use the groups://list resource to review group status
   - Check startup order and dependencies
   - Verify all processes are correctly associated

2. Check individual process health:
   - Review status of each process in the group
   - Identify any failed or crashed processes
   - Check health status for monitored processes

3. Analyze inter-process issues:
   - Look for timing problems in startup sequence
   - Check if processes are competing for resources
   - Identify dependency failures

4. Review recent errors and logs:
   - Get errors for all processes in the group
   - Look for patterns in failure timing
   - Check for cascading failures

5. Performance analysis:
   - Compare resource usage across group members
   - Identify bottlenecks or resource constraints
   - Check if group startup/stop strategies are optimal

6. Provide remediation steps:
   - Suggest configuration changes
   - Recommend startup order modifications
   - Propose group restructuring if needed
   - Provide commands to implement fixes

Let's systematically troubleshoot this group.`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ]
    };
  }
}
```

## Integration Module

### Main Registration Function
```typescript
// src/tools/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ProcessManager } from '../process/manager.js';
import { DatabaseManager } from '../database/manager.js';
import { LogManager } from '../logs/manager.js';
import { ErrorManager } from '../errors/manager.js';
import { GroupManager } from '../groups/manager.js';
import { StatsCollector } from '../monitoring/collector.js';
import { HealthCheckService } from '../monitoring/health.js';
import winston from 'winston';

import { registerLifecycleTools } from './lifecycle.js';
import { registerMonitoringTools } from './monitoring.js';
import { registerLogTools } from './logs.js';
import { registerErrorTools } from './errors.js';
import { registerGroupTools } from './groups.js';

export function registerTools(
  server: Server,
  processManager: ProcessManager,
  database: DatabaseManager,
  logger: winston.Logger
): {
  logManager: LogManager;
  errorManager: ErrorManager;
  groupManager: GroupManager;
  statsCollector: StatsCollector;
  healthService: HealthCheckService;
} {
  // Initialize managers
  const logManager = new LogManager(database, logger);
  const errorManager = new ErrorManager(database, logger);
  const groupManager = new GroupManager(database, processManager, logger);
  const statsCollector = new StatsCollector(database, processManager, logger);
  const healthService = new HealthCheckService(processManager, database, logger);

  // Start stats collection
  statsCollector.startCollection(10000); // Collect every 10 seconds

  // Register all tool categories
  registerLifecycleTools(server, processManager, logger);
  registerMonitoringTools(server, processManager, statsCollector, healthService, logger);
  registerLogTools(server, logManager, logger);
  registerErrorTools(server, errorManager, logger);
  registerGroupTools(server, groupManager, logger);

  return {
    logManager,
    errorManager,
    groupManager,
    statsCollector,
    healthService
  };
}

// src/resources/index.ts
export function registerResources(
  server: Server,
  processManager: ProcessManager,
  logManager: LogManager,
  errorManager: ErrorManager,
  groupManager: GroupManager,
  statsCollector: StatsCollector,
  healthService: HealthCheckService,
  logger: winston.Logger
): void {
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
}

// src/prompts/index.ts
export function registerPrompts(
  server: Server,
  logger: winston.Logger
): void {
  new PromptProvider(server, logger);
}
```

## Testing Strategy

### Phase 1: Resource Testing
```bash
# List all resources
echo '{"jsonrpc":"2.0","method":"resources/list","params":{},"id":1}' | node dist/index.js

# Read process list resource
echo '{"jsonrpc":"2.0","method":"resources/read","params":{"uri":"processes://list"},"id":2}' | node dist/index.js

# Read recent logs resource
echo '{"jsonrpc":"2.0","method":"resources/read","params":{"uri":"logs://recent"},"id":3}' | node dist/index.js

# Read metrics summary
echo '{"jsonrpc":"2.0","method":"resources/read","params":{"uri":"metrics://summary"},"id":4}' | node dist/index.js
```

### Phase 2: Prompt Testing
```bash
# List all prompts
echo '{"jsonrpc":"2.0","method":"prompts/list","params":{},"id":1}' | node dist/index.js

# Get debug process prompt
echo '{"jsonrpc":"2.0","method":"prompts/get","params":{"name":"debug_process","arguments":{"processId":"test-1"}},"id":2}' | node dist/index.js

# Get optimize performance prompt
echo '{"jsonrpc":"2.0","method":"prompts/get","params":{"name":"optimize_performance"},"id":3}' | node dist/index.js
```

### Phase 3: Integration Testing
```typescript
// tests/resources.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ResourceProvider } from '../src/resources/provider';
import { PromptProvider } from '../src/prompts/provider';
// ... other imports

describe('Resources and Prompts', () => {
  let server: Server;
  let resourceProvider: ResourceProvider;
  let promptProvider: PromptProvider;

  beforeEach(() => {
    // Setup server and providers
  });

  it('should provide process list resource', async () => {
    const handler = server.getRequestHandler('resources/read');
    const result = await handler({
      params: { uri: 'processes://list' }
    });

    expect(result.contents).toBeDefined();
    expect(result.contents[0].mimeType).toBe('application/json');
  });

  it('should provide debug prompt', async () => {
    const handler = server.getRequestHandler('prompts/get');
    const result = await handler({
      params: {
        name: 'debug_process',
        arguments: { processId: 'test-1' }
      }
    });

    expect(result.messages).toBeDefined();
    expect(result.messages[0].content.text).toContain('debugging process');
  });
});
```

## Success Criteria

### Implementation Checklist
- [ ] All 6 resources return valid JSON data
- [ ] Resources update in real-time
- [ ] Process list enriched with metrics
- [ ] Log summary includes statistics
- [ ] Error resource highlights critical issues
- [ ] Group resource shows member status
- [ ] Health resource identifies problems
- [ ] Metrics resource aggregates data
- [ ] All 4 prompts generate valid templates
- [ ] Prompts include step-by-step instructions

### Performance Metrics
- [ ] Resource generation < 100ms
- [ ] JSON serialization < 50ms
- [ ] Prompt generation < 10ms
- [ ] Resource caching prevents redundant queries
- [ ] Memory usage stable with resource polling

## Dependencies
- Requires all previous tasks (0001-0006) complete
- All managers must be initialized
- Stats collector must be running
- Database must contain sample data for testing

## Next Steps
After implementing resources and prompts:
1. Create comprehensive testing suite (Task 0008)
2. Write documentation and deployment guide (Task 0009)
3. Implement security hardening (Task 0010)
---
## Update Notes (2025-09-20)

- Prompts API
  - Include `description` in `prompts/get` responses and add `title` to `prompts/list` items for richer UX.
- MCP compliance
  - resources/read returns JSON in `contents[].text`; ensure generation stays < 100ms and avoid extra stdout logs.
- Daemon-backed mode
  - Resources should fetch via daemon API if enabled; stdio shim does not hold state; processes persist beyond client sessions.
- TDD additions
  - Tests: `resources/list/read` JSON correctness; prompt `description` and message content; resource timing budget; caching avoids redundant DB hits.

---
## Tools Registry (Revised Code Examples)

### src/tools/registry.ts
```typescript
// Central registry providing single tools/list and tools/call handlers
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type winston from 'winston';
import type { ZodTypeAny } from 'zod';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type ToolHandler = (args: unknown) => Promise<Array<{ type: 'text'; text: string }>>;

interface ToolDef {
  name: string;
  description: string;
  schema: ZodTypeAny;
  handler: ToolHandler;
}

const tools: ToolDef[] = [];

export function registerTool(def: ToolDef) {
  tools.push(def);
}

export function attachToolHandlers(server: Server, logger: winston.Logger) {
  // Single tools/list
  server.setRequestHandler({
    method: 'tools/list',
    handler: async () => ({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.schema, t.name),
      })),
    }),
  });

  // Single tools/call
  server.setRequestHandler({
    method: 'tools/call',
    handler: async (request) => {
      const name = request.params.name as string;
      const def = tools.find((t) => t.name === name);
      if (!def) {
        throw new Error(`Unknown tool: ${name}`); // SDK will map to JSON-RPC error
      }
      // Validate args using Zod; let ZodError bubble to invalid params
      const parsed = def.schema.parse(request.params.arguments ?? {});
      try {
        const content = await def.handler(parsed);
        return { content };
      } catch (err: any) {
        logger.error(`Tool ${name} failed:`, err);
        return { content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }], isError: true };
      }
    },
  });
}
```

### src/tools/index.ts (revised)
```typescript
import type winston from 'winston';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ProcessManager } from '../process/manager.js';
import { DatabaseManager } from '../database/manager.js';
import { LogManager } from '../logs/manager.js';
import { ErrorManager } from '../errors/manager.js';
import { GroupManager } from '../groups/manager.js';
import { StatsCollector } from '../monitoring/collector.js';
import { HealthCheckService } from '../monitoring/health.js';
import { attachToolHandlers } from './registry.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerMonitoringTools } from './monitoring.js';
import { registerLogTools } from './logs.js';
import { registerErrorTools } from './errors.js';
import { registerGroupTools } from './groups.js';

export function registerTools(
  server: Server,
  processManager: ProcessManager,
  database: DatabaseManager,
  logger: winston.Logger
) {
  const logManager = new LogManager(database, logger);
  const errorManager = new ErrorManager(database, logger);
  const groupManager = new GroupManager(database, processManager, logger);
  const statsCollector = new StatsCollector(database, processManager, logger);
  const healthService = new HealthCheckService(processManager, database, logger);
  statsCollector.startCollection(10000);

  // Register tool sets into registry
  registerLifecycleTools(processManager, logger);
  registerMonitoringTools(processManager, statsCollector, healthService, logger);
  registerLogTools(logManager, logger);
  registerErrorTools(errorManager, logger);
  registerGroupTools(groupManager, logger);

  // Attach single handlers to the server
  attachToolHandlers(server, logger);

  return { logManager, errorManager, groupManager, statsCollector, healthService };
}
```
