# MCP Process Manager API Reference

This document provides comprehensive API documentation for the MCP Process Manager server.

## Table of Contents

- [Tools](#tools)
  - [Process Management](#process-management)
  - [Monitoring](#monitoring)
  - [Groups](#groups)
  - [Logs](#logs)
  - [Errors](#errors)
- [Resources](#resources)
- [Prompts](#prompts)
- [Configuration](#configuration)
- [Error Codes](#error-codes)

## Tools

### Process Management

#### `start_process`

Starts a new managed process with the specified configuration.

**Parameters:**
```typescript
{
  name: string;                    // Process name (required)
  command: string;                 // Command to execute (required)
  args?: string[];                 // Command arguments
  env?: Record<string, string>;    // Environment variables
  cwd?: string;                    // Working directory
  autoRestart?: boolean;           // Enable auto-restart on failure
  healthCheckCommand?: string;     // Health check command
  healthCheckInterval?: number;    // Health check interval (ms)
  groupId?: string;                // Process group ID
}
```

**Returns:**
```typescript
{
  id: string;        // Process ID
  status: string;    // Initial status ('running' | 'starting')
  pid?: number;      // Process ID (if available)
  createdAt: number; // Creation timestamp
}
```

**Example:**
```javascript
await mcp.callTool('start_process', {
  name: 'web-server',
  command: '/usr/bin/node',
  args: ['server.js', '--port', '3000'],
  env: { NODE_ENV: 'production' },
  autoRestart: true,
  healthCheckCommand: 'curl -f http://localhost:3000/health'
});
```

#### `stop_process`

Stops a running process.

**Parameters:**
```typescript
{
  processId: string;  // Process ID (required)
  force?: boolean;    // Force kill if true, graceful shutdown if false
}
```

**Returns:**
```typescript
{
  success: boolean;   // Operation success
  message?: string;   // Status message
}
```

#### `restart_process`

Restarts a process with optional new configuration.

**Parameters:**
```typescript
{
  processId: string;  // Process ID (required)
  newConfig?: {       // Optional new configuration
    name?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    autoRestart?: boolean;
    healthCheckCommand?: string;
    healthCheckInterval?: number;
  }
}
```

**Returns:**
```typescript
{
  id: string;        // Process ID
  status: string;    // New status
  pid?: number;      // New process ID
  restartedAt: number; // Restart timestamp
}
```

#### `kill_process`

Force kills a process (SIGKILL).

**Parameters:**
```typescript
{
  processId: string;  // Process ID (required)
}
```

**Returns:**
```typescript
{
  success: boolean;   // Operation success
  message?: string;   // Status message
}
```

#### `list_processes`

Lists all managed processes with optional filtering.

**Parameters:**
```typescript
{
  status?: 'running' | 'stopped' | 'failed' | 'crashed';  // Filter by status
  groupId?: string;     // Filter by group ID
  limit?: number;       // Maximum results (default: 100)
  offset?: number;      // Results offset (default: 0)
}
```

**Returns:**
```typescript
{
  processes: Array<{
    id: string;
    name: string;
    status: string;
    pid?: number;
    command: string;
    args?: string[];
    createdAt: number;
    startedAt?: number;
    stoppedAt?: number;
    groupId?: string;
  }>;
  total: number;        // Total process count
  filtered: number;     // Filtered result count
}
```

### Monitoring

#### `get_system_stats`

Retrieves current system resource statistics.

**Parameters:** None

**Returns:**
```typescript
{
  cpuUsage: number;        // CPU usage percentage (0-100)
  memoryTotal: number;     // Total memory in bytes
  memoryFree: number;      // Free memory in bytes
  memoryUsed: number;      // Used memory in bytes
  uptime: number;          // System uptime in seconds
  loadAverage: number[];   // Load average [1min, 5min, 15min]
  timestamp: number;       // Measurement timestamp
}
```

#### `get_process_info`

Gets detailed information about a specific process.

**Parameters:**
```typescript
{
  processId: string;  // Process ID (required)
}
```

**Returns:**
```typescript
{
  id: string;
  name: string;
  status: string;
  pid?: number;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  cpuUsage: number;        // Current CPU usage (%)
  memoryUsage: number;     // Current memory usage (bytes)
  uptime?: number;         // Process uptime in minutes
  restartCount: number;    // Number of restarts
  healthStatus?: string;   // Health status
  groupId?: string;        // Group ID if assigned
}
```

#### `get_process_stats`

Gets performance statistics for a process over time.

**Parameters:**
```typescript
{
  processId: string;       // Process ID (required)
  duration?: number;       // Time window in ms (default: 1 hour)
  interval?: number;       // Sampling interval in ms (default: 60000)
}
```

**Returns:**
```typescript
{
  processId: string;
  stats: Array<{
    timestamp: number;
    cpuUsage: number;
    memoryUsage: number;
  }>;
  aggregated: {
    avgCpu: number;        // Average CPU usage (%)
    maxCpu: number;        // Maximum CPU usage (%)
    avgMemory: number;     // Average memory usage (bytes)
    maxMemory: number;     // Maximum memory usage (bytes)
    sampleCount: number;   // Number of samples
    timeRange: {           // Time range covered
      start: number;
      end: number;
    };
  };
}
```

#### `check_process_health`

Performs a health check on a specific process.

**Parameters:**
```typescript
{
  processId: string;  // Process ID (required)
}
```

**Returns:**
```typescript
{
  processId: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  message: string;         // Health check result message
  responseTime: number;    // Health check response time (ms)
  checkedAt: number;       // Check timestamp
  command?: string;        // Health check command used
}
```

### Groups

#### `create_group`

Creates a new process group.

**Parameters:**
```typescript
{
  name: string;                    // Group name (required)
  description?: string;            // Group description
  startupOrder?: string[];         // Process startup order
  startupDelay?: number;           // Delay between process starts (ms)
}
```

**Returns:**
```typescript
{
  id: string;           // Group ID
  name: string;         // Group name
  description?: string; // Group description
  startupOrder?: string[]; // Startup order
  createdAt: number;    // Creation timestamp
  processCount: number; // Initial process count (0)
}
```

#### `add_to_group`

Adds a process to an existing group.

**Parameters:**
```typescript
{
  processId: string;   // Process ID (required)
  groupId: string;     // Group ID (required)
}
```

**Returns:**
```typescript
{
  success: boolean;    // Operation success
  message?: string;    // Status message
  groupId: string;     // Group ID
  processId: string;   // Process ID
}
```

#### `remove_from_group`

Removes a process from its group.

**Parameters:**
```typescript
{
  processId: string;   // Process ID (required)
}
```

**Returns:**
```typescript
{
  success: boolean;    // Operation success
  message?: string;    // Status message
  processId: string;   // Process ID
  oldGroupId?: string; // Previous group ID
}
```

#### `start_group`

Starts all processes in a group according to the startup order.

**Parameters:**
```typescript
{
  groupId: string;          // Group ID (required)
  startupDelay?: number;    // Delay between process starts (ms)
  skipRunning?: boolean;    // Skip already running processes
}
```

**Returns:**
```typescript
{
  success: boolean;         // Operation success
  started: string[];        // IDs of processes that were started
  skipped: string[];        // IDs of processes that were skipped
  failed: string[];         // IDs of processes that failed to start
  message?: string;         // Status message
}
```

#### `stop_group`

Stops all processes in a group.

**Parameters:**
```typescript
{
  groupId: string;                     // Group ID (required)
  stopStrategy?: 'parallel' | 'reverse' | 'sequential';  // Stop strategy
  force?: boolean;                     // Force kill processes
}
```

**Returns:**
```typescript
{
  success: boolean;         // Operation success
  stopped: string[];        // IDs of processes that were stopped
  failed: string[];         // IDs of processes that failed to stop
  message?: string;         // Status message
}
```

#### `get_group_status`

Gets the current status of a process group.

**Parameters:**
```typescript
{
  groupId: string;  // Group ID (required)
}
```

**Returns:**
```typescript
{
  group: {
    id: string;
    name: string;
    description?: string;
    startupOrder?: string[];
    createdAt: number;
  };
  processes: Array<{
    id: string;
    name: string;
    status: string;
    pid?: number;
  }>;
  summary: {
    total: number;      // Total processes in group
    running: number;    // Running processes
    stopped: number;    // Stopped processes
    failed: number;     // Failed processes
  };
}
```

### Logs

#### `get_logs`

Retrieves logs for processes with optional filtering.

**Parameters:**
```typescript
{
  processId?: string;       // Filter by process ID
  type?: 'stdout' | 'stderr' | 'system';  // Filter by log type
  level?: 'debug' | 'info' | 'warn' | 'error';  // Filter by log level
  startTime?: number;       // Start timestamp (ms since epoch)
  endTime?: number;         // End timestamp (ms since epoch)
  search?: string;          // Search query in log messages
  limit?: number;           // Maximum results (default: 100)
  offset?: number;          // Results offset (default: 0)
}
```

**Returns:**
```typescript
{
  logs: Array<{
    id: number;
    processId: string;
    type: string;
    message: string;
    level: string;
    timestamp: number;
  }>;
  total: number;           // Total log entries
  filtered: number;        // Filtered result count
  searchQuery?: string;    // Applied search query
}
```

#### `search_logs`

Searches logs using a query string.

**Parameters:**
```typescript
{
  query: string;           // Search query (required)
  processId?: string;      // Filter by process ID
  caseSensitive?: boolean; // Case sensitive search (default: false)
  limit?: number;          // Maximum results (default: 100)
}
```

**Returns:**
```typescript
{
  results: Array<{
    id: number;
    processId: string;
    type: string;
    message: string;
    level: string;
    timestamp: number;
  }>;
  query: string;           // Search query used
  totalMatches: number;    // Total matching entries
  caseSensitive: boolean;  // Case sensitivity used
}
```

#### `tail_logs`

Gets the most recent logs (tail functionality).

**Parameters:**
```typescript
{
  processId?: string;      // Filter by process ID
  lines?: number;          // Number of lines to retrieve (default: 100)
  follow?: boolean;        // Continuous following (default: false)
}
```

**Returns:**
```typescript
{
  logs: Array<{
    id: number;
    processId: string;
    type: string;
    message: string;
    level: string;
    timestamp: number;
  }>;
  lines: number;           // Number of lines requested
  hasMore: boolean;        // Whether more logs are available
}
```

#### `clear_logs`

Clears logs for a specific process or time range.

**Parameters:**
```typescript
{
  processId: string;       // Process ID (required)
  beforeTimestamp?: number; // Clear logs before this timestamp
}
```

**Returns:**
```typescript
{
  success: boolean;        // Operation success
  deletedCount: number;    // Number of log entries deleted
  processId: string;       // Process ID
  beforeTimestamp?: number; // Timestamp filter used
}
```

### Errors

#### `get_errors`

Retrieves errors with optional filtering.

**Parameters:**
```typescript
{
  processId?: string;      // Filter by process ID
  errorType?: string;      // Filter by error type
  resolved?: boolean;      // Filter by resolution status
  startTime?: number;      // Start timestamp
  endTime?: number;        // End timestamp
  limit?: number;          // Maximum results (default: 100)
  offset?: number;         // Results offset (default: 0)
}
```

**Returns:**
```typescript
{
  errors: Array<{
    id: string;
    processId: string;
    errorType: string;
    message: string;
    stackTrace?: string;
    timestamp: number;
    resolved: boolean;
    resolution?: string;
    resolvedAt?: number;
  }>;
  total: number;           // Total error count
  filtered: number;        // Filtered result count
}
```

#### `get_error_summary`

Gets error statistics and summary information.

**Parameters:**
```typescript
{
  processId?: string;      // Filter by process ID
  timeWindow?: number;     // Time window in ms (default: 24 hours)
}
```

**Returns:**
```typescript
{
  totalErrors: number;      // Total error count
  unresolvedErrors: number; // Unresolved error count
  resolvedErrors: number;   // Resolved error count
  errorsByType: Record<string, number>;     // Errors grouped by type
  errorsByProcess: Record<string, number>;  // Errors grouped by process
  mostRecentError?: {
    id: string;
    message: string;
    timestamp: number;
  };
  errorRate: number;        // Errors per hour
  timeWindow: number;       // Time window used
}
```

#### `resolve_error`

Marks an error as resolved.

**Parameters:**
```typescript
{
  errorId: string;         // Error ID (required)
  resolution?: string;     // Resolution description
}
```

**Returns:**
```typescript
{
  success: boolean;        // Operation success
  errorId: string;         // Error ID
  resolution?: string;     // Resolution applied
  resolvedAt: number;      // Resolution timestamp
}
```

#### `get_similar_errors`

Finds errors similar to a given error.

**Parameters:**
```typescript
{
  errorId: string;         // Reference error ID (required)
  limit?: number;          // Maximum results (default: 10)
}
```

**Returns:**
```typescript
{
  similar: Array<{
    id: string;
    processId: string;
    errorType: string;
    message: string;
    timestamp: number;
    similarity: number;     // Similarity score (0-1)
  }>;
  referenceError: {
    id: string;
    errorType: string;
    message: string;
  };
  limit: number;           // Limit used
}
```

## Resources

The MCP Process Manager provides dynamic resources that expose real-time information about processes and system state.

### `processes://list`

Lists all managed processes in JSON format.

**URI:** `processes://list`

**MIME Type:** `application/json`

**Content:**
```json
{
  "processes": [
    {
      "id": "process-1",
      "name": "web-server",
      "status": "running",
      "pid": 12345,
      "command": "/usr/bin/node",
      "createdAt": 1640995200000
    }
  ],
  "total": 1,
  "timestamp": 1640995260000
}
```

### `processes://{id}/info`

Detailed information about a specific process.

**URI:** `processes://{id}/info`

**MIME Type:** `application/json`

**Content:**
```json
{
  "process": {
    "id": "process-1",
    "name": "web-server",
    "status": "running",
    "pid": 12345,
    "cpuUsage": 15.2,
    "memoryUsage": 104857600,
    "uptime": 45,
    "restartCount": 0
  },
  "timestamp": 1640995260000
}
```

### `system://stats`

Current system resource statistics.

**URI:** `system://stats`

**MIME Type:** `application/json`

**Content:**
```json
{
  "cpuUsage": 25.3,
  "memoryTotal": 8589934592,
  "memoryFree": 2147483648,
  "memoryUsed": 6442450944,
  "uptime": 86400,
  "loadAverage": [1.5, 1.2, 1.0],
  "timestamp": 1640995260000
}
```

### `groups://list`

Lists all process groups.

**URI:** `groups://list`

**MIME Type:** `application/json`

**Content:**
```json
{
  "groups": [
    {
      "id": "group-1",
      "name": "web-services",
      "description": "Web application services",
      "processCount": 3,
      "runningCount": 3,
      "createdAt": 1640995200000
    }
  ],
  "total": 1,
  "timestamp": 1640995260000
}
```

## Prompts

### `process-troubleshooting`

Interactive prompt for diagnosing process issues.

**Arguments:**
```typescript
{
  processId?: string;      // Specific process to troubleshoot
  includeLogs?: boolean;   // Include recent logs (default: true)
  includeErrors?: boolean; // Include recent errors (default: true)
  timeWindow?: number;     // Analysis time window in hours (default: 1)
}
```

### `system-health-check`

Comprehensive system health assessment prompt.

**Arguments:**
```typescript
{
  includeProcesses?: boolean;   // Include process health (default: true)
  includeResources?: boolean;   // Include resource usage (default: true)
  threshold?: number;          // Alert threshold percentage (default: 80)
}
```

### `performance-analysis`

Performance analysis and optimization recommendations.

**Arguments:**
```typescript
{
  processId?: string;      // Specific process to analyze
  timeWindow?: number;     // Analysis time window in hours (default: 24)
  includeRecommendations?: boolean; // Include optimization suggestions (default: true)
}
```

## Configuration

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PM_DATABASE_PATH` | string | `./data/process-manager.db` | SQLite database file path |
| `PM_LOG_LEVEL` | string | `info` | Logging level (error, warn, info, debug) |
| `PM_MAX_PROCESSES` | number | `50` | Maximum concurrent processes |
| `PM_ALLOWED_COMMANDS` | string | `/usr/bin,/usr/local/bin` | Comma-separated allowed command paths |
| `PM_AUTO_RESTART_ENABLED` | boolean | `true` | Enable automatic restart |
| `PM_LOG_RETENTION_DAYS` | number | `30` | Log retention period |
| `PM_MAX_LOG_SIZE_MB` | number | `100` | Maximum log file size |
| `PM_MAX_CPU_PERCENT` | number | `80` | CPU usage alert threshold |
| `PM_MAX_MEMORY_MB` | number | `1024` | Memory usage alert threshold |
| `PM_HEALTH_CHECK_INTERVAL` | number | `60000` | Health check interval (ms) |

### Command Path Validation

Commands are validated against the `PM_ALLOWED_COMMANDS` list for security:

```bash
# Example: Allow Node.js and system commands
export PM_ALLOWED_COMMANDS="/usr/bin,/bin,/usr/local/bin,/Users/username/.nvm/versions/node/v20.18.1/bin"
```

## Error Codes

### Process Management Errors

| Code | Description |
|------|-------------|
| `PROCESS_NOT_FOUND` | Specified process ID does not exist |
| `PROCESS_ALREADY_RUNNING` | Attempted to start an already running process |
| `COMMAND_NOT_ALLOWED` | Command path not in allowed list |
| `MAX_PROCESSES_REACHED` | Maximum process limit exceeded |
| `INVALID_COMMAND` | Command validation failed |

### Group Management Errors

| Code | Description |
|------|-------------|
| `GROUP_NOT_FOUND` | Specified group ID does not exist |
| `GROUP_NOT_EMPTY` | Attempted to delete group with processes |
| `INVALID_STARTUP_ORDER` | Invalid process startup order specified |

### Monitoring Errors

| Code | Description |
|------|-------------|
| `METRICS_UNAVAILABLE` | Process metrics not available |
| `HEALTH_CHECK_FAILED` | Health check command failed |
| `SYSTEM_STATS_UNAVAILABLE` | System statistics unavailable |

### Database Errors

| Code | Description |
|------|-------------|
| `DATABASE_CONNECTION_ERROR` | Database connection failed |
| `DATABASE_LOCKED` | Database locked by another process |
| `DATABASE_CORRUPTION` | Database file corrupted |

### Validation Errors

| Code | Description |
|------|-------------|
| `INVALID_PARAMETERS` | Invalid tool parameters |
| `MISSING_REQUIRED_FIELD` | Required field missing |
| `INVALID_FORMAT` | Invalid data format |
| `OUT_OF_RANGE` | Value out of acceptable range |

## Rate Limiting

The server implements rate limiting to prevent abuse:

- **Process Operations**: 10 operations per second per client
- **Monitoring Requests**: 30 requests per minute per client
- **Log Queries**: 60 requests per minute per client
- **Error Queries**: 60 requests per minute per client

Rate limits reset every minute and are tracked per client session.