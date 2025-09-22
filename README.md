# MCP Process Manager

Dead simple process management. Start, stop, and monitor processes in your current directory.

## Install

```bash
npm install -g mcp-process-manager
```

## Cursor Setup

Add to your Cursor `settings.json`:

```json
{
  "mcpServers": {
    "mcp-process-manager": {
      "command": "node",
      "args": ["/Users/dennisonbertram/Develop/ModelContextProtocol/mcp-process-manager/dist/index.js"],
      "env": {
        "PM_ALLOWED_COMMANDS": "pwd,/bin,/usr/bin,/usr/local/bin,/opt/homebrew/bin",
        "PM_ALLOWED_TOOL_NAMES": "node,npm,pnpm,yarn,npx,tsc,tsx,ts-node,next,vite,vitest,git,ls,bash,sh,curl,bun",
        "PM_LOG_LEVEL": "info"
      }
    }
  }
}
```

Notes:
- Allows anything in the workspace plus common system bins.
- Dangerous system killers (kill/killall/pkill/etc.) are blocked by default.
- cwd defaults to the current project; you can pass `cwd: "pwd"` explicitly with start_process.

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

## Advanced Usage

- Templates & Advisor: Use presets or get suggestions.
  - templates/list: discover templates by category
  - templates/apply: generate a ProcessesConfig (dry-run)
  - advisor/analyze_project: scan repo and suggest processes/groups
  - start_dev_stack: auto-loads processes.config.json if group not found, then starts it

- Config Files: Optional, for one-command dev stacks.
  - File: processes.config.json
  - Schema (minimal):
    {
      "processes": {
        "frontend": { "command": "pnpm", "args": ["dev"], "cwd": "pwd" },
        "backend": { "command": "pnpm", "args": ["worker:dev"], "cwd": "pwd" }
      },
      "groups": { "dev": ["backend","frontend"] }
    }
  - Validate: config/read
  - Preview/apply: config/reload with { "dryRun": true|false, "group": "dev" }

- Monitoring & Health:
  - get_system_stats: CPU/memory snapshot
  - get_process_info: status + latest metric
  - get_process_stats: aggregates over duration
  - check_process_health: run health checks
  - analyze_logs: summarize errors/warnings
  - check_health_summary: overall health status

- Parameter Hints (start_process):
  - { "name":"api", "command":"pnpm", "args":["dev"], "cwd":"pwd", "env":{ "PORT":"3000" }, "envFiles":[".env",".env.local"], "envProfile":"development" }
  - args is an array; env is an object; cwd supports "pwd"

- Permissions & Safety:
  - Default PM_ALLOWED_COMMANDS includes: pwd,/bin,/usr/bin,/usr/local/bin,/opt/homebrew/bin
  - Default PM_ALLOWED_TOOL_NAMES includes: node,npm,pnpm,yarn,npx,tsc,tsx,ts-node,next,vite,vitest,git,ls,bash,sh,curl,bun
  - Dangerous commands blocked by default: kill, killall, pkill, shutdown, reboot, halt, poweroff, launchctl, scutil
  - Tools stop/kill only managed child processes (not your shell or Cursor)
  - To widen allowlist, add names to PM_ALLOWED_TOOL_NAMES or directories to PM_ALLOWED_COMMANDS