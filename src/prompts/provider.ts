import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import winston from 'winston';
import { ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Using official SDK schemas for prompts/list and prompts/get

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
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
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
    });

    // Prompt get handler
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
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
                text: `Error getting prompt: ${error instanceof Error ? error.message : String(error)}`
              }
            }
          ]
        };
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
      description: `Debugging assistant for process ${processId}`,
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
      description: processId ? `Performance optimization for process ${processId}` : 'Performance optimization for all processes',
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
      description: `Monitoring setup for process ${processName}`,
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
      description: `Troubleshooting assistant for group ${groupId}`,
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