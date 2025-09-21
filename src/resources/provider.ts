import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ProcessManager } from '../process/manager.js';
import { LogManager } from '../logs/manager.js';
import { ErrorManager } from '../errors/manager.js';
import { GroupManager } from '../groups/manager.js';
import { StatsCollector } from '../monitoring/collector.js';
import { HealthCheckService } from '../monitoring/health.js';
import winston from 'winston';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ProcessStatus, HealthStatus } from '../types/process.js';

// Using official SDK request schemas

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
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
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
    });

    // Resource read handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
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
              text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    });
  }

  private async getProcessListResource() {
    const processes = this.processManager.listProcesses();

    // Enrich with latest metrics
    const enrichedProcesses = await Promise.all(
      processes.map(async (process) => {
        try {
          const metrics = await this.statsCollector.getProcessStats(process.id, 60000);
          const latestMetric = metrics[0];

          return {
            ...process,
            currentCpu: latestMetric?.cpuUsage || 0,
            currentMemory: latestMetric?.memoryUsage || 0,
            uptime: process.startedAt ? Date.now() - process.startedAt : 0,
            formattedStatus: this.formatProcessStatus(process)
          };
        } catch (error) {
          // Return process without metrics if stats collection fails
          return {
            ...process,
            currentCpu: 0,
            currentMemory: 0,
            uptime: process.startedAt ? Date.now() - process.startedAt : 0,
            formattedStatus: this.formatProcessStatus(process)
          };
        }
      })
    );

    const summary = {
      total: processes.length,
      running: processes.filter(p => p.status === ProcessStatus.RUNNING).length,
      stopped: processes.filter(p => p.status === ProcessStatus.STOPPED).length,
      failed: processes.filter(p => p.status === ProcessStatus.FAILED || p.status === ProcessStatus.CRASHED).length
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
    try {
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
    } catch (error) {
      return {
        contents: [
          {
            uri: 'logs://recent',
            mimeType: 'application/json',
            text: JSON.stringify({ summary: { totalLogs: 0 }, logs: [] }, null, 2)
          }
        ]
      };
    }
  }

  private async getLatestErrorsResource() {
    try {
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
    } catch (error) {
      return {
        contents: [
          {
            uri: 'errors://latest',
            mimeType: 'application/json',
            text: JSON.stringify({ summary: { total: 0, unresolved: 0 }, errors: [], criticalErrors: [] }, null, 2)
          }
        ]
      };
    }
  }

  private async getGroupsResource() {
    const groups = this.groupManager.listGroups();

    const groupStatuses = await Promise.all(
      groups.map(async (group) => {
        try {
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
        } catch (error) {
          return {
            group,
            status: {
              processCount: 0,
              running: 0,
              stopped: 0,
              failed: 0,
              healthy: 0
            },
            processes: []
          };
        }
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
    try {
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
    } catch (error) {
      return {
        contents: [
          {
            uri: 'health://status',
            mimeType: 'application/json',
            text: JSON.stringify({ summary: { total: 0, healthy: 0, unhealthy: 0, unknown: 0 }, healthChecks: [] }, null, 2)
          }
        ]
      };
    }
  }

  private async getMetricsSummaryResource() {
    try {
      const systemStats = await this.statsCollector.getSystemStats();
      const processes = this.processManager.listProcesses({ status: ProcessStatus.RUNNING });

      const processMetrics = await Promise.all(
        processes.map(async (process) => {
          try {
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
          } catch (error) {
            return {
              processId: process.id,
              processName: process.name,
              avgCpu: 0,
              maxCpu: 0,
              avgMemory: 0,
              maxMemory: 0
            };
          }
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
    } catch (error) {
      return {
        contents: [
          {
            uri: 'metrics://summary',
            mimeType: 'application/json',
            text: JSON.stringify({ system: {}, topProcessesByCpu: [], topProcessesByMemory: [] }, null, 2)
          }
        ]
      };
    }
  }

  private formatProcessStatus(process: any): string {
    const statusEmoji: Record<string, string> = {
      [ProcessStatus.RUNNING]: '🟢',
      [ProcessStatus.STOPPED]: '⚫',
      [ProcessStatus.FAILED]: '🔴',
      [ProcessStatus.CRASHED]: '💥',
      [ProcessStatus.STARTING]: '🟡'
    };

    const healthEmoji: Record<string, string> = {
      [HealthStatus.HEALTHY]: '✅',
      [HealthStatus.UNHEALTHY]: '❌',
      [HealthStatus.UNKNOWN]: '❓'
    };

    return `${statusEmoji[process.status] || '❓'} ${process.status.toUpperCase()} ${process.healthCheckCommand ? healthEmoji[process.healthStatus] : ''}`;
  }
}