# MCP Process Manager

Run and manage processes from your current directory. Built for the Model Context Protocol.

## Quick Install

```bash
npm install -g @local/process-manager-mcp
```

## Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "process-manager": {
      "command": "npx",
      "args": ["-y", "@local/process-manager-mcp"],
      "env": {
        "PM_ALLOWED_COMMANDS": "pwd"
      }
    }
  }
}
```

This configuration only allows running commands from your current directory (`pwd`).

## What It Does

Once configured, Claude can:
- ✅ Start your dev servers: "Start my Next.js app"
- ✅ Run build scripts: "Build the project"
- ✅ Manage multiple processes: "Start both frontend and backend"
- ✅ Monitor running processes: "What's currently running?"
- ✅ Check logs: "Show me the server logs"
- ✅ Stop processes: "Stop the dev server"

## Security First

By default, this server only runs commands from your current working directory:
- `PM_ALLOWED_COMMANDS="pwd"` - Only current directory (safest)
- `PM_ALLOWED_COMMANDS="pwd,/usr/bin,/usr/local/bin"` - Current directory + system commands
- See [Configuration Guide](docs/CONFIGURATION.md) for more options

## Example Usage

**You:** "Start my dev server"
**Claude:** "I'll start your development server for you."
*[Runs `npm run dev` from your current directory]*
**Claude:** "Your dev server is now running on http://localhost:3000"

**You:** "What's running?"
**Claude:** "You have 1 process running:
- nextjs-app: Running for 2 minutes, healthy"

## Documentation

- [Configuration Guide](docs/CONFIGURATION.md) - Environment variables, security settings
- [API Reference](docs/API.md) - All available tools and commands
- [LLM Usage Guide](docs/LLM_USAGE.md) - How LLMs interact with the server
- [Development](docs/DEVELOPMENT.md) - Building from source, contributing

## Troubleshooting

**"Command not allowed" error?**
The process manager is restricted to your current directory by default. To run system commands, update `PM_ALLOWED_COMMANDS` in your config.

**Need to run npm/yarn/pnpm directly?**
Add them to allowed tools:
```json
"env": {
  "PM_ALLOWED_COMMANDS": "pwd",
  "PM_ALLOWED_TOOL_NAMES": "npm,yarn,pnpm"
}
```

## License

MIT