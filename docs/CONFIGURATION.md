# Configuration Guide

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PM_DATABASE_PATH` | `~/.mcp-process-manager/data/process-manager.db` | SQLite database file path |
| `PM_LOG_LEVEL` | `info` | Logging level (error, warn, info, debug) |
| `PM_MAX_PROCESSES` | `50` | Maximum number of concurrent processes |
| `PM_ALLOWED_COMMANDS` | `/usr/bin,/usr/local/bin` | Comma-separated files/dirs; supports `pwd`, `~`; empty string = allow all |
| `PM_AUTO_RESTART_ENABLED` | `true` | Enable automatic process restart |
| `PM_LOG_RETENTION_DAYS` | `30` | Log retention period in days |
| `PM_MAX_LOG_SIZE_MB` | `100` | Maximum log file size in MB |
| `PM_MAX_CPU_PERCENT` | `80` | CPU usage threshold for alerts |
| `PM_MAX_MEMORY_MB` | `1024` | Memory usage threshold for alerts |
| `PM_HEALTH_CHECK_INTERVAL` | `60000` | Health check interval in milliseconds |
| `PM_ALLOWED_TOOL_NAMES` |  | Comma-separated bare tool names allowed via PATH (e.g., `pnpm,node`) |
| `PM_DANGEROUS_COMMANDS_DENYLIST` | `kill,killall,pkill,shutdown,reboot,halt,poweroff,launchctl,scutil` | Commands blocked even if otherwise allowed |

## Security Configuration

### Allowed Commands

Commands are validated against `PM_ALLOWED_COMMANDS` to prevent executing unexpected binaries.

Rules:
- Entries may be absolute directories or files; symlinks are resolved
- A command is allowed if its realpath is exactly an allowed file or a subpath of an allowed directory
- Special tokens: `pwd`, `$PWD`, `${PWD}`, `{PWD}` expand to the current working directory; `~` expands to your home
- Empty value means allow all commands (not recommended)

Examples:
```bash
# Allow common system bins
export PM_ALLOWED_COMMANDS="/usr/bin,/usr/local/bin"

# Allow current workspace and system bins
export PM_ALLOWED_COMMANDS="pwd,/usr/bin,/usr/local/bin"

# Allow only current workspace (most secure)
export PM_ALLOWED_COMMANDS="pwd"

# Allow specific files only
export PM_ALLOWED_COMMANDS="/usr/bin/node,/bin/bash"

# Allow everything (not recommended)
export PM_ALLOWED_COMMANDS=""
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "process-manager": {
      "command": "node",
      "args": ["/abs/path/to/mcp-process-manager/dist/index.js"],
      "env": {
        "PM_ALLOWED_COMMANDS": "pwd,/usr/bin,/usr/local/bin",
        "PM_LOG_LEVEL": "info"
      }
    }
  }
}
```

## Environment Templates

### Development Environment (.env.development)
```bash
# Development settings - more permissive for local work
PM_DATABASE_PATH=./data/dev-process-manager.db
PM_LOG_LEVEL=debug
PM_MAX_PROCESSES=20
PM_ALLOWED_COMMANDS=pwd,/usr/bin,/usr/local/bin,/opt/homebrew/bin
PM_AUTO_RESTART_ENABLED=true
PM_LOG_RETENTION_DAYS=7
PM_MAX_LOG_SIZE_MB=50
PM_MAX_CPU_PERCENT=90
PM_MAX_MEMORY_MB=2048
PM_HEALTH_CHECK_INTERVAL=30000
PM_ALLOWED_TOOL_NAMES=node,npm,pnpm,yarn,python,python3,go,cargo,rustc
```

### Production Environment (.env.production)
```bash
# Production settings - strict security and monitoring
PM_DATABASE_PATH=/var/lib/mcp-process-manager/process-manager.db
PM_LOG_LEVEL=warn
PM_MAX_PROCESSES=100
PM_ALLOWED_COMMANDS=/usr/bin/node,/usr/local/bin/node
PM_AUTO_RESTART_ENABLED=true
PM_LOG_RETENTION_DAYS=90
PM_MAX_LOG_SIZE_MB=500
PM_MAX_CPU_PERCENT=75
PM_MAX_MEMORY_MB=4096
PM_HEALTH_CHECK_INTERVAL=60000
PM_ALLOWED_TOOL_NAMES=node
PM_DANGEROUS_COMMANDS_DENYLIST=kill,killall,pkill,shutdown,reboot,halt,poweroff,rm,dd
```

### Minimal Security (.env.minimal)
```bash
# Minimal configuration - highest security
PM_DATABASE_PATH=~/.mcp-process-manager/data/process-manager.db
PM_LOG_LEVEL=error
PM_MAX_PROCESSES=10
PM_ALLOWED_COMMANDS=pwd
PM_AUTO_RESTART_ENABLED=false
PM_ALLOWED_TOOL_NAMES=
```

### Docker Environment (.env.docker)
```bash
# Docker-specific configuration
PM_DATABASE_PATH=/app/data/process-manager.db
PM_LOG_LEVEL=info
PM_MAX_PROCESSES=50
PM_ALLOWED_COMMANDS=/usr/bin,/usr/local/bin,/app/bin
PM_AUTO_RESTART_ENABLED=true
PM_LOG_RETENTION_DAYS=30
PM_MAX_LOG_SIZE_MB=200
PM_MAX_CPU_PERCENT=80
PM_MAX_MEMORY_MB=1024
PM_HEALTH_CHECK_INTERVAL=45000
```

### Testing Environment (.env.test)
```bash
# Testing configuration - for CI/CD and automated tests
PM_DATABASE_PATH=:memory:
PM_LOG_LEVEL=debug
PM_MAX_PROCESSES=5
PM_ALLOWED_COMMANDS=pwd,/usr/bin,/usr/local/bin
PM_AUTO_RESTART_ENABLED=false
PM_LOG_RETENTION_DAYS=1
PM_MAX_LOG_SIZE_MB=10
PM_MAX_CPU_PERCENT=95
PM_MAX_MEMORY_MB=512
PM_HEALTH_CHECK_INTERVAL=5000
PM_ALLOWED_TOOL_NAMES=echo,cat,ls,sleep
```

### Template for New Projects (.env.template)
```bash
# Copy this template and adjust for your needs
# Security: Start restrictive and expand as needed

# Database location (use absolute path in production)
PM_DATABASE_PATH=~/.mcp-process-manager/data/process-manager.db

# Logging: error, warn, info, debug
PM_LOG_LEVEL=info

# Process limits
PM_MAX_PROCESSES=50

# SECURITY: Specify allowed command paths
# Examples:
#   Current directory only: pwd
#   System binaries: /usr/bin,/usr/local/bin
#   Specific commands: /usr/bin/node,/usr/bin/python3
#   Allow all (NOT RECOMMENDED): (empty string)
PM_ALLOWED_COMMANDS=pwd,/usr/bin,/usr/local/bin

# Process management
PM_AUTO_RESTART_ENABLED=true
PM_LOG_RETENTION_DAYS=30
PM_MAX_LOG_SIZE_MB=100

# Resource limits
PM_MAX_CPU_PERCENT=80
PM_MAX_MEMORY_MB=1024

# Health monitoring
PM_HEALTH_CHECK_INTERVAL=60000

# Additional tool names allowed via PATH
# PM_ALLOWED_TOOL_NAMES=node,npm,python3

# Dangerous commands to block (even if in allowed paths)
# PM_DANGEROUS_COMMANDS_DENYLIST=kill,killall,pkill,shutdown,reboot,halt,poweroff
```

## Loading Environment Files

### Direct export (bash/zsh)
```bash
source .env.development
npm start
```

### Using dotenv in package.json
```json
{
  "scripts": {
    "start:dev": "dotenv -e .env.development node dist/index.js",
    "start:prod": "dotenv -e .env.production node dist/index.js"
  }
}
```

### Docker Compose
```yaml
version: '3.8'
services:
  mcp-process-manager:
    build: .
    env_file:
      - .env.production
```

## Process Configuration Files

### Config File Schema (processes.config.json)

```json
{
  "processes": {
    "frontend": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "./frontend",
      "env": {
        "PORT": "3000"
      },
      "envFiles": [".env.local"],
      "autoRestart": true,
      "healthCheckCommand": "curl -f http://localhost:3000",
      "healthCheckInterval": 30000
    },
    "backend": {
      "command": "python",
      "args": ["app.py"],
      "cwd": "./backend",
      "envProfile": "development",
      "autoRestart": true
    }
  },
  "groups": {
    "dev": ["frontend", "backend"],
    "frontend-only": ["frontend"]
  }
}
```

### Using Config Files

```javascript
// Load and validate config
await mcp.callTool('config/read', { path: 'processes.config.json' })

// Preview changes (dry run)
await mcp.callTool('config/reload', { dryRun: true })

// Apply configuration
await mcp.callTool('config/reload', { dryRun: false, group: 'dev' })

// Start specific group
await mcp.callTool('start_dev_stack', { group: 'dev' })
```