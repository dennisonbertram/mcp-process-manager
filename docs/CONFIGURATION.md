# Configuration Guide

## Simple Setup

The simplest configuration - just specify your project directory:

```json
{
  "mcpServers": {
    "process-manager": {
      "command": "npx",
      "args": ["-y", "mcp-process-manager"],
      "env": {
        "PM_PROJECT_DIR": "/path/to/your/project"
      }
    }
  }
}
```

This allows running any command within your project directory.

## Environment Variables

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `PM_PROJECT_DIR` | Current directory | Your project directory - all commands here are allowed |
| `PM_SYSTEM_DIRS` | None | Additional directories for system commands (e.g., `/usr/bin,/usr/local/bin`) |
| `PM_DATABASE_PATH` | `~/.mcp-process-manager/data/process-manager.db` | Where to store process data |
| `PM_LOG_LEVEL` | `info` | Logging level (error, warn, info, debug) |
| `PM_MAX_PROCESSES` | `50` | Maximum concurrent processes |

### Process Management

| Variable | Default | Description |
|----------|---------|-------------|
| `PM_AUTO_RESTART_ENABLED` | `true` | Auto-restart crashed processes |
| `PM_HEALTH_CHECK_INTERVAL` | `60000` | Health check interval (ms) |
| `PM_LOG_RETENTION_DAYS` | `30` | How long to keep logs |
| `PM_MAX_LOG_SIZE_MB` | `100` | Maximum log file size |

### Resource Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `PM_MAX_CPU_PERCENT` | `80` | CPU usage warning threshold |
| `PM_MAX_MEMORY_MB` | `1024` | Memory usage warning threshold |

### Safety Features

| Variable | Default | Description |
|----------|---------|-------------|
| `PM_DANGEROUS_COMMANDS_DENYLIST` | `kill,killall,pkill,shutdown,reboot,halt,poweroff` | Commands that are always blocked |

## Configuration Examples

### Basic Development Setup

```json
{
  "env": {
    "PM_PROJECT_DIR": "/Users/you/my-project",
    "PM_LOG_LEVEL": "info"
  }
}
```

### With System Commands

```json
{
  "env": {
    "PM_PROJECT_DIR": "/Users/you/my-project",
    "PM_SYSTEM_DIRS": "/usr/bin,/usr/local/bin,/opt/homebrew/bin"
  }
}
```

### Multiple Projects

Create separate configurations for each project:

```json
{
  "mcpServers": {
    "project1": {
      "command": "npx",
      "args": ["-y", "mcp-process-manager"],
      "env": {
        "PM_PROJECT_DIR": "/path/to/project1"
      }
    },
    "project2": {
      "command": "npx",
      "args": ["-y", "mcp-process-manager"],
      "env": {
        "PM_PROJECT_DIR": "/path/to/project2"
      }
    }
  }
}
```

## Process Configuration Files

### Auto-Loading

If `processes.config.json` exists in your project root, it's automatically loaded on startup.

### Config File Format

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
      "autoRestart": true,
      "healthCheckCommand": "curl -f http://localhost:3000"
    },
    "backend": {
      "command": "python",
      "args": ["app.py"],
      "cwd": "./backend",
      "env": {
        "PORT": "8000"
      }
    }
  },
  "groups": {
    "dev": ["frontend", "backend"],
    "frontend-only": ["frontend"]
  }
}
```

### Process Options

- `command`: The executable to run
- `args`: Command arguments array
- `cwd`: Working directory (relative to project root)
- `env`: Environment variables object
- `envFiles`: Array of .env files to load
- `autoRestart`: Restart on crash (boolean)
- `healthCheckCommand`: Command to verify process health
- `healthCheckInterval`: Health check frequency (ms)

## Templates

Common project templates are built-in:

- `fullstack-dev`: Frontend + backend + database
- `node-dev`: Node.js application
- `python-dev`: Python application
- `static-site`: Static site with build process

Use them via:
```javascript
await mcp.callTool('templates/apply', { name: 'fullstack-dev' })
```

## Docker Support

### Docker Environment

```bash
PM_PROJECT_DIR=/app
PM_DATABASE_PATH=/data/process-manager.db
PM_LOG_LEVEL=info
PM_MAX_PROCESSES=50
```

### Docker Compose

```yaml
version: '3.8'
services:
  mcp-process-manager:
    image: mcp-process-manager
    environment:
      PM_PROJECT_DIR: /app
    volumes:
      - ./:/app
      - pm-data:/data
volumes:
  pm-data:
```

## Troubleshooting

### Commands Not Working?

1. **Check project directory**: Ensure `PM_PROJECT_DIR` points to the right location
2. **Verify executables exist**: Commands must exist in the project or system directories
3. **Look at logs**: Set `PM_LOG_LEVEL=debug` for detailed output

### Process Won't Start?

- Check if the command exists: `which your-command`
- Verify working directory is correct
- Check environment variables are set properly
- Look for port conflicts if it's a server

### Auto-Config Not Loading?

- File must be named exactly `processes.config.json`
- Must be in the project root directory
- Check JSON syntax is valid
- Verify file permissions allow reading

## Action Logging (Default: ON)

Minimal, always-on Markdown logging records every tool call for LLM review.

- File: `.mcp-actions.md` in the current working directory by default
- Env override: `MCP_PM_ACTION_LOG_FILE=/absolute/path/to/actions.md`
- Disable: `MCP_PM_ACTION_LOG_FILE=off`
- Format: one append-only Markdown file; each entry includes timestamp, tool name, redacted args, and output/error summary
- Large output/error (>1000 chars): full content saved to a separate Markdown file under `<log_dir>/attachments/`; the main log contains a pointer with instructions to read that file
- Redaction: masks common secret keys (token, password, secret, apiKey, auth, bearer); values are truncated in the main log
- Reliability: log writes never throw; on failure, a warning is emitted to stderr

Rationale: a single append-only log is easiest for LLMs to grep and reason about across sessions.