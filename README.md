# MCP Process Manager

A comprehensive Model Context Protocol (MCP) server for advanced process management, monitoring, and orchestration. Built with TypeScript, SQLite, and designed for production use.

[![CI/CD Pipeline](https://github.com/yourusername/mcp-process-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/mcp-process-manager/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

### Core Process Management
- **Start/Stop/Restart Processes**: Full lifecycle management with automatic restart capabilities
- **Process Monitoring**: Real-time CPU, memory, and system resource tracking
- **Health Checks**: Configurable health check commands with automatic failure detection
- **Process Groups**: Organize processes into groups with startup/shutdown ordering

### Advanced Monitoring & Analytics
- **System Statistics**: Comprehensive system resource monitoring
- **Performance Metrics**: Historical performance data with aggregation
- **Log Management**: Structured logging with search and filtering capabilities
- **Error Tracking**: Automatic error categorization and resolution tracking

### Enterprise-Ready Features
- **Security**: Command path validation and sandboxing
- **Scalability**: Efficient SQLite database with connection pooling
- **Reliability**: Comprehensive error handling and recovery mechanisms
- **Observability**: Structured logging and health monitoring

### MCP Integration
- **20+ Tools**: Complete process management toolset
- **Dynamic Resources**: Real-time process and system information
- **Interactive Prompts**: Guided workflows for common operations
- **Type Safety**: Full TypeScript support with Zod validation

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Docker](#docker)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## 🛠️ Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager

### Install from npm (Recommended)

```bash
npm install -g @local/process-manager-mcp
```

This installs the MCP Process Manager globally. The server stores its database in `~/.mcp-process-manager/data/` by default, so it maintains state across runs and can be used from any working directory.

### Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-process-manager.git
cd mcp-process-manager

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## 🚀 Quick Start

### Basic Usage

1. **Start the MCP Server**
```bash
npm start
```

2. **Configure Your MCP Client**

Add to your MCP client configuration:

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

3. **Start Managing Processes**

```javascript
// Start a simple process
await mcp.callTool('start_process', {
  name: 'my-app',
  command: '/usr/bin/node',
  args: ['app.js']
});

// Monitor system resources
const stats = await mcp.callTool('get_system_stats', {});
console.log(`CPU: ${stats.cpuUsage}%, Memory: ${stats.memoryTotal}MB`);

// Create a process group
const group = await mcp.callTool('create_group', {
  name: 'web-services',
  description: 'Web application services'
});
```

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PM_DATABASE_PATH` | `~/.mcp-process-manager/data/process-manager.db` | SQLite database file path |
| `PM_LOG_LEVEL` | `info` | Logging level (error, warn, info, debug) |
| `PM_MAX_PROCESSES` | `50` | Maximum number of concurrent processes |
| `PM_ALLOWED_COMMANDS` | `/usr/bin,/usr/local/bin` | Allowed command paths (comma-separated) |
| `PM_AUTO_RESTART_ENABLED` | `true` | Enable automatic process restart |
| `PM_LOG_RETENTION_DAYS` | `30` | Log retention period in days |
| `PM_MAX_LOG_SIZE_MB` | `100` | Maximum log file size in MB |
| `PM_MAX_CPU_PERCENT` | `80` | CPU usage threshold for alerts |
| `PM_MAX_MEMORY_MB` | `1024` | Memory usage threshold for alerts |
| `PM_HEALTH_CHECK_INTERVAL` | `60000` | Health check interval in milliseconds |

### Command Path Security

The server validates all commands against the `PM_ALLOWED_COMMANDS` list to prevent security vulnerabilities:

```bash
# Allow specific directories
export PM_ALLOWED_COMMANDS="/usr/bin,/bin,/usr/local/bin,/opt/node/bin"

# Allow specific commands
export PM_ALLOWED_COMMANDS="/usr/bin/node,/usr/bin/npm,/bin/bash"
```

## 📖 Usage

### Process Lifecycle Management

```javascript
// Start a process
const result = await mcp.callTool('start_process', {
  name: 'web-server',
  command: '/usr/bin/node',
  args: ['server.js', '--port', '3000'],
  env: { NODE_ENV: 'production' },
  cwd: '/var/www/app',
  autoRestart: true,
  healthCheckCommand: 'curl -f http://localhost:3000/health'
});

// List all processes
const processes = await mcp.callTool('list_processes', {});

// Stop a process
await mcp.callTool('stop_process', { processId: result.id });

// Restart with new configuration
await mcp.callTool('restart_process', {
  processId: result.id,
  newConfig: {
    args: ['server.js', '--port', '4000']
  }
});
```

### Process Groups

```javascript
// Create a group
const group = await mcp.callTool('create_group', {
  name: 'api-services',
  description: 'Backend API services',
  startupOrder: ['database', 'cache', 'api']
});

// Add processes to group
await mcp.callTool('add_to_group', {
  groupId: group.id,
  processId: 'database-process-id'
});

// Start entire group
await mcp.callTool('start_group', {
  groupId: group.id,
  startupDelay: 2000  // 2 second delay between processes
});

// Get group status
const status = await mcp.callTool('get_group_status', { groupId: group.id });
```

### Monitoring and Health Checks

```javascript
// Get system statistics
const systemStats = await mcp.callTool('get_system_stats', {});
console.log(`CPU Usage: ${systemStats.cpuUsage}%`);
console.log(`Memory Free: ${systemStats.memoryFree}MB`);

// Monitor specific process
const processStats = await mcp.callTool('get_process_stats', {
  processId: 'web-server-id',
  duration: 3600000  // Last hour
});

// Check process health
const health = await mcp.callTool('check_process_health', {
  processId: 'web-server-id'
});

if (health.status === 'unhealthy') {
  console.log(`Process unhealthy: ${health.message}`);
}
```

### Log Management

```javascript
// Get recent logs
const logs = await mcp.callTool('get_logs', {
  processId: 'web-server-id',
  limit: 100
});

// Search logs
const searchResults = await mcp.callTool('search_logs', {
  query: 'ERROR',
  processId: 'web-server-id',
  caseSensitive: false
});

// Clear old logs
await mcp.callTool('clear_logs', {
  processId: 'web-server-id',
  beforeTimestamp: Date.now() - (7 * 24 * 60 * 60 * 1000)  // Older than 7 days
});
```

### Error Tracking

```javascript
// Get error summary
const summary = await mcp.callTool('get_error_summary', {});
console.log(`${summary.totalErrors} total errors, ${summary.unresolvedErrors} unresolved`);

// Get errors for specific process
const errors = await mcp.callTool('get_errors', {
  processId: 'web-server-id',
  resolved: false
});

// Mark error as resolved
await mcp.callTool('resolve_error', {
  errorId: errors[0].id,
  resolution: 'Fixed configuration issue'
});
```

## 🔧 API Reference

### Process Management Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `start_process` | Start a new managed process | `name`, `command`, `args?`, `env?`, `cwd?`, `autoRestart?`, `healthCheckCommand?` |
| `stop_process` | Stop a running process | `processId`, `force?` |
| `restart_process` | Restart process with new config | `processId`, `newConfig?` |
| `kill_process` | Force kill a process | `processId` |
| `list_processes` | List all managed processes | `status?`, `groupId?` |

### Monitoring Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_system_stats` | Get system resource statistics | - |
| `get_process_info` | Get detailed process information | `processId` |
| `get_process_stats` | Get process performance metrics | `processId`, `duration?` |
| `check_process_health` | Check process health status | `processId` |

### Group Management Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `create_group` | Create a new process group | `name`, `description?`, `startupOrder?` |
| `add_to_group` | Add process to group | `processId`, `groupId` |
| `remove_from_group` | Remove process from group | `processId` |
| `start_group` | Start all processes in group | `groupId`, `startupDelay?`, `skipRunning?` |
| `stop_group` | Stop all processes in group | `groupId`, `stopStrategy?` |
| `get_group_status` | Get group status and process list | `groupId` |

### Log Management Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_logs` | Retrieve process logs | `processId?`, `type?`, `level?`, `startTime?`, `endTime?`, `limit?` |
| `search_logs` | Search logs with query | `query`, `processId?`, `limit?`, `caseSensitive?` |
| `tail_logs` | Get most recent logs | `processId?`, `lines?`, `follow?` |
| `clear_logs` | Clear logs for process | `processId`, `beforeTimestamp?` |

### Error Management Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_errors` | Get process errors | `processId?`, `errorType?`, `resolved?`, `limit?` |
| `get_error_summary` | Get error statistics | `processId?`, `timeWindow?` |
| `resolve_error` | Mark error as resolved | `errorId`, `resolution?` |
| `get_similar_errors` | Find similar errors | `errorId`, `limit?` |

## 🐳 Docker

### Build and Run with Docker

```bash
# Build the image
docker build -t mcp-process-manager .

# Run the container
docker run -d \
  --name mcp-process-manager \
  -e PM_LOG_LEVEL=info \
  -e PM_MAX_PROCESSES=50 \
  -v $(pwd)/data:/app/data \
  mcp-process-manager
```

### Docker Compose

```bash
# Start with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f mcp-process-manager

# Stop services
docker-compose down
```

### Environment Configuration

```yaml
version: '3.8'
services:
  mcp-process-manager:
    build: .
    environment:
      - PM_LOG_LEVEL=debug
      - PM_MAX_PROCESSES=100
      - PM_DATABASE_PATH=/app/data/process-manager.db
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
```

## 🧪 Development

### Setup Development Environment

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run tests in watch mode
npm test -- --watch

# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

### Project Structure

```
mcp-process-manager/
├── src/
│   ├── config/          # Configuration management
│   ├── database/        # SQLite database layer
│   ├── process/         # Process lifecycle management
│   ├── monitoring/      # System and process monitoring
│   ├── logs/           # Log management system
│   ├── errors/         # Error tracking and analysis
│   ├── groups/         # Process group management
│   ├── tools/          # MCP tool implementations
│   ├── resources/      # Dynamic resource providers
│   ├── prompts/        # Interactive prompt templates
│   └── types/          # TypeScript type definitions
├── tests/              # Comprehensive test suite
├── docs/               # Documentation and planning
├── .github/           # CI/CD workflows
└── docker/            # Containerization files
```

### Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/process.test.ts

# Run with coverage
npm test -- --coverage

# Run integration tests
npm test -- tests/integration.test.ts
```

### Code Quality

The project uses ESLint and TypeScript for code quality:

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint -- --fix

# Type checking
npx tsc --noEmit
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes** with tests
4. **Run the test suite**: `npm test`
5. **Update documentation** if needed
6. **Submit a pull request**

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb config with TypeScript support
- **Testing**: 100% test coverage required
- **Documentation**: JSDoc comments for all public APIs
- **Commits**: Conventional commit format

### Reporting Issues

- Use [GitHub Issues](https://github.com/yourusername/mcp-process-manager/issues) for bugs
- Include detailed reproduction steps
- Attach relevant logs and configuration
- Specify your environment (OS, Node.js version, etc.)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the protocol specification
- [SQLite](https://www.sqlite.org/) for the embedded database
- [Winston](https://github.com/winstonjs/winston) for logging
- [Zod](https://github.com/colinhacks/zod) for schema validation

## 📞 Support

- **Documentation**: [Full API Reference](docs/api.md)
- **Issues**: [GitHub Issues](https://github.com/yourusername/mcp-process-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/mcp-process-manager/discussions)

---

**Made with ❤️ for the MCP community**