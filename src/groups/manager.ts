import { DatabaseManager } from '../database/manager.js';
import { ProcessManager } from '../process/manager.js';
import winston from 'winston';
import { ProcessGroup, ProcessInfo, ProcessStatus, HealthStatus } from '../types/process.js';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';

export interface GroupConfig {
  name: string;
  description?: string;
  startupOrder?: string[]; // Process IDs in startup sequence
  startupDelay?: number;   // Milliseconds between starting each process
}

export interface GroupStatus {
  group: ProcessGroup;
  processes: ProcessInfo[];
  healthyCount: number;
  runningCount: number;
  stoppedCount: number;
  failedCount: number;
}

export class GroupManager extends EventEmitter {
  private database: DatabaseManager;
  private processManager: ProcessManager;
  private logger: winston.Logger;
  private groups: Map<string, ProcessGroup>;

  constructor(
    database: DatabaseManager,
    processManager: ProcessManager,
    logger: winston.Logger
  ) {
    super();
    this.database = database;
    this.processManager = processManager;
    this.logger = logger;
    this.groups = new Map();

    this.loadGroups();
  }

  private loadGroups(): void {
    try {
      const groups = this.database.getDb()
        .prepare('SELECT * FROM process_groups')
        .all() as Array<{
          id: string;
          name: string;
          description?: string;
          created_at: number;
          startup_order?: string;
        }>;

      for (const group of groups) {
        this.groups.set(group.id, {
          id: group.id,
          name: group.name,
          description: group.description,
          createdAt: group.created_at,
          startupOrder: group.startup_order ? JSON.parse(group.startup_order) : undefined
        });
      }

      this.logger.info(`Loaded ${groups.length} process groups`);
    } catch (error) {
      this.logger.error('Failed to load process groups:', error);
    }
  }

  async createGroup(config: GroupConfig): Promise<ProcessGroup> {
    const groupId = nanoid();

    const group: ProcessGroup = {
      id: groupId,
      name: config.name,
      description: config.description,
      createdAt: Date.now(),
      startupOrder: config.startupOrder
    };

    // Store in database
    this.database.getDb().prepare(`
      INSERT INTO process_groups (id, name, description, created_at, startup_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      group.id,
      group.name,
      group.description || null,
      group.createdAt,
      group.startupOrder ? JSON.stringify(group.startupOrder) : null
    );

    this.groups.set(groupId, group);
    this.emit('groupCreated', group);

    return group;
  }

  async addToGroup(processId: string, groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const processes = this.processManager.listProcesses();
    const process = processes.find(p => p.id === processId);

    if (!process) {
      throw new Error(`Process ${processId} not found`);
    }

    // Update process group association
    this.database.getDb().prepare(`
      UPDATE processes SET group_id = ? WHERE id = ?
    `).run(groupId, processId);

    // Update in-memory process info
    this.processManager.updateProcessGroupId(processId, groupId);

    // Update startup order if needed
    if (!group.startupOrder) {
      group.startupOrder = [];
    }

    if (!group.startupOrder.includes(processId)) {
      group.startupOrder.push(processId);

      this.database.getDb().prepare(`
        UPDATE process_groups SET startup_order = ? WHERE id = ?
      `).run(JSON.stringify(group.startupOrder), groupId);
    }

    this.emit('processAddedToGroup', { processId, groupId });
  }

  async removeFromGroup(processId: string): Promise<void> {
    // Clear group association
    this.database.getDb().prepare(`
      UPDATE processes SET group_id = NULL WHERE id = ?
    `).run(processId);

    // Update in-memory process info
    this.processManager.updateProcessGroupId(processId, null);

    // Remove from startup orders
    for (const group of this.groups.values()) {
      if (group.startupOrder?.includes(processId)) {
        group.startupOrder = group.startupOrder.filter(id => id !== processId);

        this.database.getDb().prepare(`
          UPDATE process_groups SET startup_order = ? WHERE id = ?
        `).run(
          group.startupOrder.length > 0 ? JSON.stringify(group.startupOrder) : null,
          group.id
        );
      }
    }

    this.emit('processRemovedFromGroup', { processId });
  }

  async startGroup(
    groupId: string,
    options: {
      startupDelay?: number;
      skipRunning?: boolean;
    } = {}
  ): Promise<ProcessInfo[]> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const startupDelay = options.startupDelay || 1000;
    const skipRunning = options.skipRunning ?? true;

    // Get all processes in group
    const allProcesses = this.processManager.listProcesses();
    const groupProcesses = allProcesses.filter(p => p.groupId === groupId);

    // Determine startup order
    let startupSequence: ProcessInfo[];

    if (group.startupOrder && group.startupOrder.length > 0) {
      // Use defined startup order
      startupSequence = [];
      for (const processId of group.startupOrder) {
        const process = groupProcesses.find(p => p.id === processId);
        if (process) {
          startupSequence.push(process);
        }
      }

      // Add any processes not in startup order at the end
      const unorderedProcesses = groupProcesses.filter(
        p => !group.startupOrder!.includes(p.id)
      );
      startupSequence.push(...unorderedProcesses);
    } else {
      // Start all processes in parallel (no specific order)
      startupSequence = groupProcesses;
    }

    const startedProcesses: ProcessInfo[] = [];
    const errors: Array<{ processId: string; error: string }> = [];

    for (const process of startupSequence) {
      // Skip if already running and skipRunning is true
      if (skipRunning && process.status === ProcessStatus.RUNNING) {
        this.logger.info(`Skipping already running process ${process.id}`);
        startedProcesses.push(process);
        continue;
      }

      try {
        this.logger.info(`Starting process ${process.id} in group ${groupId}`);

        const startedProcess = await this.processManager.startProcess({
          id: process.id,
          name: process.name,
          command: process.command,
          args: process.args,
          env: process.env,
          cwd: process.cwd,
          autoRestart: process.autoRestart,
          healthCheckCommand: process.healthCheckCommand,
          healthCheckInterval: process.healthCheckInterval,
          groupId: process.groupId
        });

        startedProcesses.push(startedProcess);

        // Wait before starting next process (if configured)
        if (startupDelay > 0 && startupSequence.indexOf(process) < startupSequence.length - 1) {
          await new Promise(resolve => setTimeout(resolve, startupDelay));
        }
      } catch (error) {
        this.logger.error(`Failed to start process ${process.id} in group ${groupId}:`, error);
        errors.push({ processId: process.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (errors.length > 0) {
      this.emit('groupStartErrors', { groupId, errors });
    }

    this.emit('groupStarted', { groupId, processes: startedProcesses });

    return startedProcesses;
  }

  async stopGroup(
    groupId: string,
    options: {
      stopStrategy?: 'parallel' | 'reverse' | 'sequential';
      force?: boolean;
    } = {}
  ): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const stopStrategy = options.stopStrategy || 'reverse';
    const force = options.force || false;

    // Get all running processes in group
    const allProcesses = this.processManager.listProcesses();
    const groupProcesses = allProcesses.filter(
      p => p.groupId === groupId && p.status === ProcessStatus.RUNNING
    );

    // Determine stop order based on strategy
    let stopSequence: ProcessInfo[];

    switch (stopStrategy) {
      case 'reverse':
        // Stop in reverse startup order
        if (group.startupOrder) {
          stopSequence = [...groupProcesses].sort((a, b) => {
            const aIndex = group.startupOrder!.indexOf(a.id);
            const bIndex = group.startupOrder!.indexOf(b.id);
            return bIndex - aIndex; // Reverse order
          });
        } else {
          stopSequence = [...groupProcesses].reverse();
        }
        break;

      case 'sequential':
        // Stop in startup order
        if (group.startupOrder) {
          stopSequence = [...groupProcesses].sort((a, b) => {
            const aIndex = group.startupOrder!.indexOf(a.id);
            const bIndex = group.startupOrder!.indexOf(b.id);
            return aIndex - bIndex;
          });
        } else {
          stopSequence = groupProcesses;
        }
        break;

      case 'parallel':
      default:
        // Stop all at once
        stopSequence = groupProcesses;
        break;
    }

    // Stop processes
    if (stopStrategy === 'parallel') {
      // Stop all processes in parallel
      const stopPromises = stopSequence.map(process =>
        this.processManager.stopProcess(process.id, force)
          .catch(error => {
            this.logger.error(`Failed to stop process ${process.id}:`, error);
          })
      );

      await Promise.all(stopPromises);
    } else {
      // Stop processes sequentially
      for (const process of stopSequence) {
        try {
          await this.processManager.stopProcess(process.id, force);
        } catch (error) {
          this.logger.error(`Failed to stop process ${process.id}:`, error);
        }
      }
    }

    this.emit('groupStopped', { groupId });
  }

  async getGroupStatus(groupId: string): Promise<GroupStatus> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    // Get processes from database that belong to this group
    const dbProcesses = this.database.getDb()
      .prepare('SELECT * FROM processes WHERE group_id = ?')
      .all(groupId) as Array<{
        id: string;
        name: string;
        command: string;
        args?: string;
        env?: string;
        cwd?: string;
        pid?: number;
        status: string;
        group_id?: string;
        created_at: number;
        started_at?: number;
        stopped_at?: number;
        restart_count: number;
        auto_restart: number;
        health_check_command?: string;
        health_check_interval?: number;
        last_health_check?: number;
        health_status?: string;
      }>;

    const groupProcesses: ProcessInfo[] = dbProcesses.map(proc => ({
      id: proc.id,
      name: proc.name,
      command: proc.command,
      args: proc.args ? JSON.parse(proc.args) : [],
      env: proc.env ? JSON.parse(proc.env) : {},
      cwd: proc.cwd || process.cwd(),
      pid: proc.pid || undefined,
      status: proc.status as ProcessStatus,
      groupId: proc.group_id || undefined,
      createdAt: proc.created_at,
      startedAt: proc.started_at || undefined,
      stoppedAt: proc.stopped_at || undefined,
      restartCount: proc.restart_count,
      autoRestart: Boolean(proc.auto_restart),
      healthCheckCommand: proc.health_check_command || undefined,
      healthCheckInterval: proc.health_check_interval || undefined,
      lastHealthCheck: proc.last_health_check || undefined,
       healthStatus: proc.health_status === 'healthy' ? HealthStatus.HEALTHY :
                    proc.health_status === 'unhealthy' ? HealthStatus.UNHEALTHY :
                    HealthStatus.UNKNOWN
    }));

    const status: GroupStatus = {
      group,
      processes: groupProcesses,
      healthyCount: 0,
      runningCount: 0,
      stoppedCount: 0,
      failedCount: 0
    };

    for (const process of groupProcesses) {
      if (process.healthStatus === 'healthy') status.healthyCount++;

      switch (process.status) {
        case ProcessStatus.RUNNING:
          status.runningCount++;
          break;
        case ProcessStatus.STOPPED:
          status.stoppedCount++;
          break;
        case ProcessStatus.FAILED:
        case ProcessStatus.CRASHED:
          status.failedCount++;
          break;
      }
    }

    return status;
  }

  async deleteGroup(groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    // Check if group has processes
    const allProcesses = this.processManager.listProcesses();
    const groupProcesses = allProcesses.filter(p => p.groupId === groupId);

    if (groupProcesses.length > 0) {
      throw new Error(`Cannot delete group ${groupId}: contains ${groupProcesses.length} processes`);
    }

    // Delete from database
    this.database.getDb().prepare('DELETE FROM process_groups WHERE id = ?').run(groupId);

    // Remove from cache
    this.groups.delete(groupId);

    this.emit('groupDeleted', { groupId });
  }

  listGroups(): ProcessGroup[] {
    return Array.from(this.groups.values());
  }

  getGroup(groupId: string): ProcessGroup | undefined {
    return this.groups.get(groupId);
  }
}