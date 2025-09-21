# Getting Started with MCP Process Manager

This guide will walk you through setting up and using the MCP Process Manager for the first time.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18.0.0 or higher** installed
- **npm** package manager
- Basic knowledge of command-line operations
- A text editor or IDE

## Installation

### Option 1: Install from npm (Recommended)

```bash
# Install globally
npm install -g @local/process-manager-mcp

# Verify installation
mcp-process-manager --version
```

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-process-manager.git
cd mcp-process-manager

# Install dependencies
npm install

# Build the project
npm run build

# Optional: Run tests to verify everything works
npm test
```

## Basic Configuration

### 1. Environment Setup

Create a `.env` file in your project directory:

```bash
# Basic configuration
PM_LOG_LEVEL=info
PM_MAX_PROCESSES=50
PM_DATABASE_PATH=./data/process-manager.db
PM_ALLOWED_COMMANDS=/usr/bin,/bin,/usr/local/bin

# Optional: Enable auto-restart
PM_AUTO_RESTART_ENABLED=true

# Optional: Set log retention
PM_LOG_RETENTION_DAYS=30
```

### 2. Command Path Security

The server validates all commands against an allowed list for security. Update the `PM_ALLOWED_COMMANDS` to include paths to your commonly used executables:

```bash
# Find your Node.js installation
which node
# Example output: /Users/username/.nvm/versions/node/v20.18.1/bin/node

# Update your .env file
PM_ALLOWED_COMMANDS=/usr/bin,/bin,/usr/local/bin,/Users/username/.nvm/versions/node/v20.18.1/bin
```

## MCP Client Configuration

### For Claude Desktop

Add the MCP Process Manager to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "process-manager": {
      "command": "node",
      "args": ["/path/to/mcp-process-manager/dist/index.js"],
      "env": {
        "PM_LOG_LEVEL": "info",
        "PM_MAX_PROCESSES": "50"
      }
    }
  }
}
```

### For Other MCP Clients

Configure your MCP client to connect to the Process Manager server:

```json
{
  "server": {
    "command": "node",
    "args": ["/path/to/mcp-process-manager/dist/index.js"],
    "env": {
      "PM_LOG_LEVEL": "info"
    }
  }
}
```

## Your First Process

### 1. Start the MCP Server

```bash
# If installed globally
mcp-process-manager

# If running from source
npm start
```

### 2. Start Your First Process

Use your MCP client to start a simple process:

```javascript
// Start a basic echo process
await mcp.callTool('start_process', {
  name: 'hello-world',
  command: '/bin/echo',
  args: ['Hello, MCP Process Manager!']
});
```

### 3. Check Process Status

```javascript
// List all processes
const processes = await mcp.callTool('list_processes', {});
console.log('Running processes:', processes.processes.length);

// Get system stats
const stats = await mcp.callTool('get_system_stats', {});
console.log('CPU Usage:', stats.cpuUsage + '%');
```

## Common Use Cases

### Web Development

```javascript
// Start a Node.js development server
await mcp.callTool('start_process', {
  name: 'dev-server',
  command: '/usr/local/bin/node',
  args: ['server.js', '--port', '3000'],
  env: { NODE_ENV: 'development' },
  autoRestart: true,
  healthCheckCommand: 'curl -f http://localhost:3000/health'
});

// Start a build process
await mcp.callTool('start_process', {
  name: 'build-watcher',
  command: '/usr/local/bin/npm',
  args: ['run', 'build:watch'],
  cwd: '/path/to/your/project'
});
```

### Database Management

```javascript
// Start PostgreSQL
await mcp.callTool('start_process', {
  name: 'postgres',
  command: '/usr/local/bin/postgres',
  args: ['-D', '/usr/local/var/postgres'],
  healthCheckCommand: 'pg_isready -h localhost'
});

// Start Redis
await mcp.callTool('start_process', {
  name: 'redis',
  command: '/usr/local/bin/redis-server',
  args: ['/usr/local/etc/redis.conf'],
  healthCheckCommand: 'redis-cli ping'
});
```

### Background Services

```javascript
// Start a queue worker
await mcp.callTool('start_process', {
  name: 'queue-worker',
  command: '/usr/local/bin/node',
  args: ['worker.js'],
  autoRestart: true
});

// Start a cron job
await mcp.callTool('start_process', {
  name: 'backup-cron',
  command: '/usr/bin/crontab',
  args: ['-l'],
  healthCheckCommand: 'echo "OK"'
});
```

## Process Groups

### Creating and Managing Groups

```javascript
// Create a web application group
const webGroup = await mcp.callTool('create_group', {
  name: 'web-app',
  description: 'Complete web application stack',
  startupOrder: ['database', 'cache', 'api', 'web']
});

// Start database
const dbProcess = await mcp.callTool('start_process', {
  name: 'database',
  command: '/usr/local/bin/postgres',
  args: ['-D', '/usr/local/var/postgres']
});

// Add to group
await mcp.callTool('add_to_group', {
  processId: dbProcess.id,
  groupId: webGroup.id
});

// Start entire group
await mcp.callTool('start_group', {
  groupId: webGroup.id,
  startupDelay: 2000  // 2 second delay between processes
});
```

## Monitoring and Troubleshooting

### Real-time Monitoring

```javascript
// Monitor system resources
setInterval(async () => {
  const stats = await mcp.callTool('get_system_stats', {});
  console.log(`CPU: ${stats.cpuUsage}%, Memory: ${stats.memoryFree}MB free`);
}, 5000);

// Monitor specific process
const processStats = await mcp.callTool('get_process_stats', {
  processId: 'web-server',
  duration: 3600000  // Last hour
});

console.log('Average CPU:', processStats.aggregated.avgCpu + '%');
```

### Health Checks

```javascript
// Check process health
const health = await mcp.callTool('check_process_health', {
  processId: 'web-server'
});

if (health.status === 'unhealthy') {
  console.log('Process unhealthy:', health.message);

  // Get recent logs for troubleshooting
  const logs = await mcp.callTool('get_logs', {
    processId: 'web-server',
    limit: 10
  });

  console.log('Recent logs:', logs.logs);
}
```

### Log Analysis

```javascript
// Search for errors
const errors = await mcp.callTool('search_logs', {
  query: 'ERROR',
  processId: 'web-server'
});

console.log(`Found ${errors.results.length} errors`);

// Get recent activity
const recentLogs = await mcp.callTool('tail_logs', {
  processId: 'web-server',
  lines: 20
});

recentLogs.logs.forEach(log => {
  console.log(`[${log.level}] ${log.message}`);
});
```

## Advanced Configuration

### Custom Health Checks

```javascript
// HTTP health check
await mcp.callTool('start_process', {
  name: 'api-server',
  command: '/usr/local/bin/node',
  args: ['api.js'],
  healthCheckCommand: 'curl -f -s http://localhost:3000/health | grep -q "ok"'
});

// Database connectivity check
await mcp.callTool('start_process', {
  name: 'data-processor',
  command: '/usr/local/bin/node',
  args: ['processor.js'],
  healthCheckCommand: 'psql -h localhost -U user -d db -c "SELECT 1" > /dev/null'
});
```

### Environment-Specific Configuration

```bash
# Development
PM_LOG_LEVEL=debug
PM_AUTO_RESTART_ENABLED=true
PM_MAX_PROCESSES=20

# Production
PM_LOG_LEVEL=warn
PM_AUTO_RESTART_ENABLED=true
PM_MAX_PROCESSES=100
PM_MAX_CPU_PERCENT=90
PM_MAX_MEMORY_MB=2048
```

### Log Rotation and Retention

```bash
# Configure log retention
PM_LOG_RETENTION_DAYS=90
PM_MAX_LOG_SIZE_MB=500

# Manual log cleanup
# The system automatically cleans up old logs based on retention settings
```

## Docker Deployment

### Using Docker Compose

```yaml
version: '3.8'
services:
  mcp-process-manager:
    image: mcp-process-manager:latest
    environment:
      - PM_LOG_LEVEL=info
      - PM_MAX_PROCESSES=100
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    ports:
      - "3000:3000"
    restart: unless-stopped
```

### Building Custom Docker Image

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY src/ ./src/

ENV PM_LOG_LEVEL=info
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

## Troubleshooting

### Common Issues

#### "Command not allowed" Error

**Problem:** Process fails to start with "Command not allowed" error.

**Solution:** Add the command path to `PM_ALLOWED_COMMANDS`:

```bash
# Find the command path
which node
# Output: /usr/local/bin/node

# Update environment
export PM_ALLOWED_COMMANDS="/usr/bin,/bin,/usr/local/bin"
```

#### Database Connection Issues

**Problem:** Server fails to start with database errors.

**Solution:** Check database path and permissions:

```bash
# Ensure data directory exists
mkdir -p ./data

# Check permissions
ls -la ./data/

# Reset database if corrupted
rm ./data/process-manager.db
```

#### Process Won't Start

**Problem:** Process shows as "failed" immediately.

**Solution:** Check command syntax and dependencies:

```javascript
// Verify command exists
const result = await mcp.callTool('start_process', {
  name: 'test',
  command: '/bin/echo',
  args: ['test']
});

// Check logs for detailed error
const logs = await mcp.callTool('get_logs', {
  processId: result.id
});
```

#### High Memory Usage

**Problem:** Server consumes excessive memory.

**Solution:** Configure memory limits and monitoring:

```bash
export PM_MAX_MEMORY_MB=1024
export PM_LOG_RETENTION_DAYS=7
```

### Getting Help

1. **Check Logs:** Enable debug logging to see detailed information
2. **Review Configuration:** Verify all environment variables are set correctly
3. **Test Commands:** Try running commands manually first
4. **Check Permissions:** Ensure the server has necessary file system permissions

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
export PM_LOG_LEVEL=debug
# Restart the server
```

## Next Steps

Now that you have the basics working, explore:

- [API Reference](api.md) - Complete tool documentation
- [Advanced Configuration](configuration.md) - Fine-tune your setup
- [Docker Deployment](docker.md) - Production deployment options
- [Monitoring Guide](monitoring.md) - Advanced monitoring features

## Examples Repository

Check out the [examples repository](https://github.com/yourusername/mcp-process-manager-examples) for:

- Complete application setups
- Docker configurations
- Monitoring dashboards
- Integration examples

---

**Happy process managing! 🚀**