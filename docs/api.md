# API Reference

Complete reference for all MCP tools available in the Process Manager.

## Process Management

### start_process
Starts a new managed process.

**Parameters:**
- `name` (string, required): Process identifier
- `command` (string, required): Command to execute
- `args` (array): Command arguments
- `env` (object): Environment variables
- `envFiles` (array): .env files to load
- `envProfile` (string): Environment profile name
- `cwd` (string): Working directory (use "pwd" for current)
- `autoRestart` (boolean): Auto-restart on failure
- `healthCheckCommand` (string): Health check command
- `healthCheckInterval` (number): Health check interval in ms

**Example:**
```javascript
await mcp.callTool('start_process', {
  name: 'web-server',
  command: 'npm',
  args: ['run', 'dev'],
  cwd: 'pwd',
  envFiles: ['.env.local'],
  autoRestart: true
})
```

### stop_process
Stops a running process gracefully.

**Parameters:**
- `processId` (string, required): Process ID
- `force` (boolean): Force stop if graceful fails

### restart_process
Restarts a process with optional new configuration.

**Parameters:**
- `processId` (string, required): Process ID
- `newConfig` (object): New configuration to apply

### kill_process
Force kills a process immediately.

**Parameters:**
- `processId` (string, required): Process ID

### list_processes
Lists all managed processes.

**Parameters:**
- `status` (string): Filter by status (running/stopped/failed)
- `groupId` (string): Filter by group

## Monitoring

### get_process_info
Gets detailed information about a specific process.

**Parameters:**
- `processId` (string, required): Process ID

### get_process_stats
Gets performance metrics for a process over time.

**Parameters:**
- `processId` (string, required): Process ID
- `duration` (number): Time window in milliseconds

### check_process_health
Runs health check for a process.

**Parameters:**
- `processId` (string, required): Process ID

### check_health_summary
Gets health summary for all processes.

**Parameters:** None

### get_system_stats
Gets current system resource statistics.

**Parameters:** None

## Logs

### get_logs
Retrieves process logs.

**Parameters:**
- `processId` (string): Filter by process
- `type` (string): Log type (stdout/stderr)
- `level` (string): Log level filter
- `startTime` (number): Start timestamp
- `endTime` (number): End timestamp
- `limit` (number): Maximum results

### tail_logs
Gets most recent log entries.

**Parameters:**
- `processId` (string): Filter by process
- `lines` (number): Number of lines (default: 50)
- `follow` (boolean): Follow log output

### search_logs
Searches logs with text query.

**Parameters:**
- `query` (string, required): Search query
- `processId` (string): Filter by process
- `limit` (number): Maximum results
- `caseSensitive` (boolean): Case-sensitive search

### analyze_logs
Analyzes logs for errors and warnings.

**Parameters:**
- `limit` (number): Number of logs to analyze

### clear_logs
Deletes old log entries.

**Parameters:**
- `processId` (string, required): Process ID
- `beforeTimestamp` (number): Delete logs before this timestamp

## Process Groups

### create_group
Creates a new process group.

**Parameters:**
- `name` (string, required): Group name
- `description` (string): Group description
- `startupOrder` (array): Process startup sequence

### add_to_group
Adds process to a group.

**Parameters:**
- `processId` (string, required): Process ID
- `groupId` (string, required): Group ID

### remove_from_group
Removes process from its group.

**Parameters:**
- `processId` (string, required): Process ID

### start_group
Starts all processes in a group.

**Parameters:**
- `groupId` (string, required): Group ID
- `startupDelay` (number): Delay between process starts
- `skipRunning` (boolean): Skip already running processes

### stop_group
Stops all processes in a group.

**Parameters:**
- `groupId` (string, required): Group ID
- `stopStrategy` (string): Stop strategy (parallel/sequential/reverse)

### get_group_status
Gets status of a process group.

**Parameters:**
- `groupId` (string, required): Group ID

## Templates & Configuration

### templates/list
Lists available process templates.

**Parameters:**
- `category` (string): Filter by category

### templates/apply
Applies a template to generate configuration.

**Parameters:**
- `name` (string, required): Template name

**Returns:** ProcessesConfig JSON

### advisor/analyze_project
Analyzes project and suggests process configuration.

**Parameters:**
- `path` (string): Project path (default: current directory)

### config/read
Loads and validates a configuration file.

**Parameters:**
- `path` (string): Config file path (default: processes.config.json)

### config/reload
Applies configuration to materialize desired state.

**Parameters:**
- `dryRun` (boolean): Preview changes without applying
- `group` (string): Only apply specific group

### start_dev_stack
Starts the development group from configuration.

**Parameters:**
- `group` (string): Group name (default: 'dev')

## Error Management

### get_errors
Gets process errors.

**Parameters:**
- `processId` (string): Filter by process
- `errorType` (string): Filter by error type
- `resolved` (boolean): Filter by resolution status
- `limit` (number): Maximum results

### get_latest_errors
Gets most recent unresolved errors.

**Parameters:**
- `limit` (number): Maximum results

### get_error_summary
Gets error statistics.

**Parameters:**
- `processId` (string): Filter by process
- `timeWindow` (number): Time window in milliseconds

### mark_error_resolved
Marks an error as resolved.

**Parameters:**
- `errorId` (string, required): Error ID
- `resolution` (string): Resolution description

### get_similar_errors
Finds errors similar to a given error.

**Parameters:**
- `errorId` (string, required): Reference error ID
- `limit` (number): Maximum results

## Resources (Dynamic)

The server provides dynamic MCP resources:

### process://list
Lists all processes with current status.

### process://[id]
Detailed information for a specific process.

### system://stats
Current system resource statistics.

### logs://recent
Recent log entries across all processes.

### errors://unresolved
All unresolved errors.

### groups://list
All process groups with their members.

## Prompts (Interactive)

Available prompts for guided workflows:

### start-process
Interactive process startup wizard.

### create-group
Step-by-step group creation.

### diagnose-process
Troubleshooting guide for failed processes.

### setup-monitoring
Configure monitoring and alerts.

### cleanup-logs
Log cleanup and rotation setup.

### import-config
Import configuration from file.

### export-config
Export current configuration.

### quick-status
Quick system status overview.