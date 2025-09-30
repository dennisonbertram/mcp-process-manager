# LLM Usage Guide

How AI assistants (Claude, GPT, etc.) interact with the MCP Process Manager.

## Understanding MCP Tool Calls

When you ask an AI assistant to manage processes, it translates your request into MCP tool calls. This happens behind the scenes - you just see the results.

### The Flow

1. **You say:** "Start my dev server"
2. **AI translates to:** Tool call with specific parameters
3. **MCP server:** Executes the command
4. **AI responds:** "Your dev server is running on port 3000"

## Common Patterns

### Starting a Development Environment

**User Request:** "Set up and start my full development environment"

**What the AI Does:**
```javascript
// 1. Apply a development template
await mcp.callTool('templates/apply', {
  name: 'fullstack-dev'
})

// 2. Save configuration
// AI saves the returned JSON to processes.config.json

// 3. Validate configuration
const config = await mcp.callTool('config/read')
// AI checks if config.issues array is empty

// 4. Preview changes (dry run)
const preview = await mcp.callTool('config/reload', {
  dryRun: true,
  group: 'dev'
})
// AI shows you what will be started

// 5. Start the processes
await mcp.callTool('config/reload', {
  dryRun: false,
  group: 'dev'
})
```

### Managing Individual Processes

**User Request:** "Start my Next.js app with the local environment"

**What the AI Does:**
```javascript
const result = await mcp.callTool('start_process', {
  name: 'nextjs-app',
  command: 'npm',
  args: ['run', 'dev'],
  cwd: 'pwd',
  envFiles: ['.env.local', '.env'],
  healthCheckCommand: 'curl -f http://localhost:3000',
  autoRestart: true
})
```

### Monitoring and Debugging

**User Request:** "Check if everything is running properly"

**What the AI Does:**
```javascript
// 1. Get process list
const processes = await mcp.callTool('list_processes')

// 2. Check health summary
const health = await mcp.callTool('check_health_summary')

// 3. Analyze recent logs for issues
const analysis = await mcp.callTool('analyze_logs', {
  limit: 500
})

// 4. Get system resource usage
const stats = await mcp.callTool('get_system_stats')
```

## Real Examples

### Example 1: Starting a Full Stack App

**You:** "Start my frontend and backend servers"

**AI's Internal Process:**
```javascript
// Check what's defined in config
const config = await mcp.callTool('config/read')

// Start the development group
await mcp.callTool('start_group', {
  groupId: 'dev',
  startupDelay: 2000
})

// Verify health
await new Promise(r => setTimeout(r, 5000))
const health = await mcp.callTool('check_health_summary')
```

**AI Response:** "I've started both your frontend and backend servers. Frontend is running on port 3000, backend on port 8000. Both are healthy and responding."

### Example 2: Debugging a Failed Process

**You:** "My API server keeps crashing, can you help?"

**AI's Internal Process:**
```javascript
// Find the failed process
const processes = await mcp.callTool('list_processes', {
  status: 'failed'
})

// Get recent errors
const errors = await mcp.callTool('get_latest_errors', {
  limit: 10
})

// Get last 100 log lines
const logs = await mcp.callTool('get_logs', {
  processId: processes[0].id,
  limit: 100
})

// Analyze the logs
const analysis = await mcp.callTool('analyze_logs', {
  limit: 500
})
```

**AI Response:** "I found the issue. Your API server is failing because port 8000 is already in use. Here are the error logs: [shows relevant errors]. Would you like me to restart it on a different port?"

### Example 3: Setting Up a New Project

**You:** "I just cloned a new project. Can you help me get it running?"

**AI's Internal Process:**
```javascript
// Analyze the project structure
const suggestions = await mcp.callTool('advisor/analyze_project', {
  path: 'pwd'
})

// Create process configuration
const config = {
  processes: suggestions.processes,
  groups: suggestions.groups
}

// Start with npm install first
await mcp.callTool('start_process', {
  name: 'install-deps',
  command: 'npm',
  args: ['install'],
  cwd: 'pwd'
})

// Wait for installation
await new Promise(r => setTimeout(r, 30000))

// Start the dev group
await mcp.callTool('config/reload', {
  dryRun: false,
  group: 'dev'
})
```

**AI Response:** "I've analyzed your project. It's a Node.js app with a React frontend. I'm installing dependencies first, then I'll start the development server."

## Advanced Workflows

### Continuous Monitoring

When you ask: "Keep an eye on my servers and alert me if anything goes wrong"

The AI sets up:
```javascript
// Initial health check
const baseline = await mcp.callTool('check_health_summary')

// Periodic checks (AI remembers to check)
setInterval(async () => {
  const health = await mcp.callTool('check_health_summary')
  const errors = await mcp.callTool('get_latest_errors')

  if (errors.length > 0 || health.unhealthy.length > 0) {
    // AI alerts you about issues
  }
}, 60000)
```

### Graceful Shutdown

When you ask: "Stop everything cleanly"

The AI executes:
```javascript
// Stop in reverse startup order
await mcp.callTool('stop_group', {
  groupId: 'dev',
  stopStrategy: 'reverse'
})

// Verify all stopped
const processes = await mcp.callTool('list_processes', {
  status: 'running'
})

// Clear old logs if requested
await mcp.callTool('clear_logs', {
  beforeTimestamp: Date.now() - (7 * 24 * 60 * 60 * 1000)
})
```

## Tips for Users

### Be Specific
-  "Start my Next.js frontend on port 3001"
- L "Start the thing"

### Provide Context
-  "Start the API server with the production environment file"
- L "Start the server"

### Ask for Status
- "What's currently running?"
- "Show me the server logs"
- "Is everything healthy?"

### Request Help with Errors
- "Why did my server crash?"
- "Show me recent errors"
- "Help me debug the API failures"

## How AI Assistants Learn Your Setup

Over time, AI assistants learn your project structure:

1. **First time:** AI analyzes your project, suggests configuration
2. **Saves config:** Creates `processes.config.json` with your setup
3. **Next time:** AI reads config, knows exactly what to start
4. **Remembers issues:** AI tracks common problems and solutions

This means interactions get smoother over time as the AI learns your specific setup and preferences.

## Action Log Review

- Every tool call is logged to a Markdown file (default: `~/.mcp-process-manager/actions.md`).
- If the output or error is longer than 1000 characters, the main log includes a clear pointer saying: "Output exceeds 1000 chars. See full content: <path>" (or for errors), where `<path>` is a separate Markdown file under `attachments/`.
- When you see such a pointer, read that attachment path to view the entire output/error.
- Sensitive fields in arguments are redacted by default (e.g., tokens, passwords).