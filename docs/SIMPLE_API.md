# Simple API

Just 5 tools. That's it.

## start
Start a process in the current directory.

```javascript
await mcp.callTool('start', {
  name: 'dev-server',
  command: 'npm',
  args: ['run', 'dev']
})
```

## stop
Stop a running process.

```javascript
await mcp.callTool('stop', {
  name: 'dev-server'
})
```

## list
See what's running.

```javascript
await mcp.callTool('list')
// Returns: [{ name: 'dev-server', command: 'npm', status: 'running', duration: '5m' }]
```

## logs
Get recent output from a process.

```javascript
await mcp.callTool('logs', {
  name: 'dev-server',
  lines: 50  // optional, default 100
})
```

## restart
Restart a process.

```javascript
await mcp.callTool('restart', {
  name: 'dev-server'
})
```

## That's All

No complex configuration. No confusion. Just these 5 tools to manage processes.