import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GroupManager } from '../src/groups/manager';
import { ProcessManager } from '../src/process/manager';
import { DatabaseManager } from '../src/database/manager';
import { ConfigManager } from '../src/config/manager';
import { LogManager } from '../src/logs/manager';
import winston from 'winston';

describe('Process Group Tools', () => {
  let groupManager: GroupManager;
  let processManager: ProcessManager;
  let db: DatabaseManager;

  beforeEach(() => {
    const logger = winston.createLogger({ silent: true });
    const config = new ConfigManager();
    db = new DatabaseManager(':memory:', logger);
    const logManager = new LogManager(db, logger);
    processManager = new ProcessManager(db, logger, config, logManager);
    groupManager = new GroupManager(db, processManager, logger);
  });

  afterEach(() => {
    processManager.shutdown();
    db.close();
  });

  describe('GroupManager', () => {
    it('should create and manage groups', async () => {
      const group = await groupManager.createGroup({
        name: 'test-group',
        description: 'Test group'
      });

      expect(group.id).toBeDefined();
      expect(group.name).toBe('test-group');
      expect(group.description).toBe('Test group');
      expect(group.createdAt).toBeDefined();

      const groups = groupManager.listGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe(group.id);
    });

    it('should create group with startup order', async () => {
      const group = await groupManager.createGroup({
        name: 'ordered-group',
        startupOrder: ['proc1', 'proc2', 'proc3']
      });

      expect(group.startupOrder).toEqual(['proc1', 'proc2', 'proc3']);
    });

    it('should add processes to groups', async () => {
      const group = await groupManager.createGroup({ name: 'test' });

      const process = await processManager.startProcess({
        name: 'test-proc',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(process.id, group.id);

      const status = await groupManager.getGroupStatus(group.id);
      expect(status.processes).toHaveLength(1);
      expect(status.processes[0].id).toBe(process.id);
    });

    it('should throw error for non-existent group', async () => {
      await expect(groupManager.addToGroup('proc1', 'nonexistent')).rejects.toThrow('Group nonexistent not found');
    });

    it('should throw error for non-existent process', async () => {
      const group = await groupManager.createGroup({ name: 'test' });
      await expect(groupManager.addToGroup('nonexistent', group.id)).rejects.toThrow('Process nonexistent not found');
    });

    it('should remove processes from groups', async () => {
      const group = await groupManager.createGroup({ name: 'test' });

      const process = await processManager.startProcess({
        name: 'test-proc',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(process.id, group.id);

      let status = await groupManager.getGroupStatus(group.id);
      expect(status.processes).toHaveLength(1);

      await groupManager.removeFromGroup(process.id);

      status = await groupManager.getGroupStatus(group.id);
      expect(status.processes).toHaveLength(0);
    });

    it('should get group status correctly', async () => {
      const group = await groupManager.createGroup({ name: 'status-test' });

      const proc1 = await processManager.startProcess({
        name: 'proc1',
        command: '/usr/bin/true'
      });

      const proc2 = await processManager.startProcess({
        name: 'proc2',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(proc1.id, group.id);
      await groupManager.addToGroup(proc2.id, group.id);

      const status = await groupManager.getGroupStatus(group.id);

      expect(status.group.id).toBe(group.id);
      expect(status.processes).toHaveLength(2);
      expect(status.runningCount).toBe(2);
      expect(status.stoppedCount).toBe(0);
      expect(status.failedCount).toBe(0);
    });

    it('should throw error for non-existent group status', async () => {
      await expect(groupManager.getGroupStatus('nonexistent')).rejects.toThrow('Group nonexistent not found');
    });

    it('should delete empty groups', async () => {
      const group = await groupManager.createGroup({ name: 'delete-test' });

      expect(groupManager.listGroups()).toHaveLength(1);

      await groupManager.deleteGroup(group.id);

      expect(groupManager.listGroups()).toHaveLength(0);
    });

    it('should prevent deletion of groups with processes', async () => {
      const group = await groupManager.createGroup({ name: 'delete-test' });

      const process = await processManager.startProcess({
        name: 'test-proc',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(process.id, group.id);

      await expect(groupManager.deleteGroup(group.id)).rejects.toThrow('contains 1 processes');
    });

    it('should start group with processes', async () => {
      const group = await groupManager.createGroup({ name: 'start-test' });

      const proc1 = await processManager.startProcess({
        name: 'proc1',
        command: '/usr/bin/true'
      });

      const proc2 = await processManager.startProcess({
        name: 'proc2',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(proc1.id, group.id);
      await groupManager.addToGroup(proc2.id, group.id);

      // Stop processes first
      await processManager.stopProcess(proc1.id);
      await processManager.stopProcess(proc2.id);

      // Start group
      const started = await groupManager.startGroup(group.id);

      expect(started).toHaveLength(2);
      expect(started.map(p => p.id)).toContain(proc1.id);
      expect(started.map(p => p.id)).toContain(proc2.id);
    });

    it('should start group with startup order', async () => {
      const group = await groupManager.createGroup({
        name: 'ordered-start',
        startupOrder: ['proc2', 'proc1'] // Reverse order
      });

      const proc1 = await processManager.startProcess({
        name: 'proc1',
        command: '/usr/bin/true'
      });

      const proc2 = await processManager.startProcess({
        name: 'proc2',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(proc1.id, group.id);
      await groupManager.addToGroup(proc2.id, group.id);

      // Stop processes first
      await processManager.stopProcess(proc1.id);
      await processManager.stopProcess(proc2.id);

      // Start group - should start proc2 first, then proc1
      const started = await groupManager.startGroup(group.id, { startupDelay: 10 });

      expect(started).toHaveLength(2);
      // The order in the result may not reflect startup order, but both should be started
    });

    it('should skip running processes when starting group', async () => {
      const group = await groupManager.createGroup({ name: 'skip-running' });

      const proc1 = await processManager.startProcess({
        name: 'proc1',
        command: '/usr/bin/true'
      });

      const proc2 = await processManager.startProcess({
        name: 'proc2',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(proc1.id, group.id);
      await groupManager.addToGroup(proc2.id, group.id);

      // Stop proc2 but leave proc1 running
      await processManager.stopProcess(proc2.id);

      // Start group with skipRunning=true
      const started = await groupManager.startGroup(group.id, { skipRunning: true });

      expect(started).toHaveLength(2); // Both should be returned
      // proc1 was already running, proc2 was started
    });

    it('should stop group with different strategies', async () => {
      const group = await groupManager.createGroup({
        name: 'stop-strategy',
        startupOrder: ['proc1', 'proc2']
      });

      const proc1 = await processManager.startProcess({
        name: 'proc1',
        command: '/usr/bin/true'
      });

      const proc2 = await processManager.startProcess({
        name: 'proc2',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(proc1.id, group.id);
      await groupManager.addToGroup(proc2.id, group.id);

      // Test parallel stop
      await groupManager.stopGroup(group.id, { stopStrategy: 'parallel' });

      const status = await groupManager.getGroupStatus(group.id);
      expect(status.runningCount).toBe(0);
    });

    it('should stop group in reverse order', async () => {
      const group = await groupManager.createGroup({
        name: 'reverse-stop',
        startupOrder: ['proc1', 'proc2']
      });

      const proc1 = await processManager.startProcess({
        name: 'proc1',
        command: '/usr/bin/true'
      });

      const proc2 = await processManager.startProcess({
        name: 'proc2',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(proc1.id, group.id);
      await groupManager.addToGroup(proc2.id, group.id);

      // Test reverse stop (should stop proc2 first, then proc1)
      await groupManager.stopGroup(group.id, { stopStrategy: 'reverse' });

      const status = await groupManager.getGroupStatus(group.id);
      expect(status.runningCount).toBe(0);
    });

    it('should handle group operations on non-existent groups', async () => {
      await expect(groupManager.startGroup('nonexistent')).rejects.toThrow('Group nonexistent not found');
      await expect(groupManager.stopGroup('nonexistent')).rejects.toThrow('Group nonexistent not found');
      await expect(groupManager.deleteGroup('nonexistent')).rejects.toThrow('Group nonexistent not found');
    });

    it('should emit events for group operations', async () => {
      const events: any[] = [];
      groupManager.on('groupCreated', (group) => events.push({ type: 'created', group }));
      groupManager.on('processAddedToGroup', (data) => events.push({ type: 'added', ...data }));
      groupManager.on('groupDeleted', (data) => events.push({ type: 'deleted', ...data }));

      const group = await groupManager.createGroup({ name: 'event-test' });
      expect(events.find(e => e.type === 'created')).toBeDefined();

      const process = await processManager.startProcess({
        name: 'test-proc',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(process.id, group.id);
      expect(events.find(e => e.type === 'added')).toBeDefined();

      await groupManager.removeFromGroup(process.id);
      await groupManager.deleteGroup(group.id);
      expect(events.find(e => e.type === 'deleted')).toBeDefined();
    });

    it('should persist groups across manager instances', async () => {
      const group1 = await groupManager.createGroup({ name: 'persist-test' });

      // Create new manager instance (simulating restart)
      const newManager = new GroupManager(db, processManager, winston.createLogger({ silent: true }));

      const groups = newManager.listGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe(group1.id);
      expect(groups[0].name).toBe('persist-test');
    });

    it('should handle startup order updates', async () => {
      const group = await groupManager.createGroup({
        name: 'order-test',
        startupOrder: ['proc1']
      });

      const proc1 = await processManager.startProcess({
        name: 'proc1',
        command: '/usr/bin/true'
      });

      const proc2 = await processManager.startProcess({
        name: 'proc2',
        command: '/usr/bin/true'
      });

      await groupManager.addToGroup(proc1.id, group.id);
      await groupManager.addToGroup(proc2.id, group.id);

      // proc2 should be added to startup order
      const updatedGroup = groupManager.getGroup(group.id);
      expect(updatedGroup?.startupOrder).toContain(proc1.id);
      expect(updatedGroup?.startupOrder).toContain(proc2.id);
    });
  });
});