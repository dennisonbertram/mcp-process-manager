# MCP Process Manager

Dead simple process management. Start, stop, and monitor processes in your current directory.

## Install

```bash
npm install -g mcp-process-manager
```

## Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pm": {
      "command": "npx",
      "args": ["-y", "mcp-process-manager"]
    }
  }
}
```

That's it. Works in whatever directory you're in.

## What You Can Say

**Start something:**
- "Run npm dev"
- "Start the server"
- "Run the build script"

**Check status:**
- "What's running?"
- "Show me the logs"

**Stop something:**
- "Stop the server"
- "Kill all processes"

## Just 5 Tools

1. **start** - Start a process
2. **stop** - Stop a process
3. **list** - See what's running
4. **logs** - View output
5. **restart** - Restart a process

No complex configuration. No profiles. It just works.

## Examples

**You:** "Start my dev server"
**Claude:** *Runs `npm run dev`*

**You:** "What's running?"
**Claude:** "1 process running: npm (2 minutes)"

**You:** "Show me the logs"
**Claude:** *Shows recent output*

**You:** "Stop it"
**Claude:** "Process stopped"

## Auto-Detection

If you have `processes.json` in your directory:

```json
{
  "dev": "npm run dev",
  "build": "npm run build",
  "test": "npm test"
}
```

Then just say "start dev" and it knows what to do.

## Safety

- Can only run commands in current directory
- Can't run system-level commands (shutdown, reboot, etc.)
- All processes are tracked and cleanable

## License

MIT