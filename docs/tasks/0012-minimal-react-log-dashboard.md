# 0012 – Minimal React Log Dashboard (shadcn/ui)

## Goal
Build a minimal React app to realtime stream and visualize logs for processes managed by the MCP Process Manager. Focus on a single-page, fast-boot UI with shadcn/ui components.

## Scope
- Realtime logs per process (select process, tail logs, filter levels)
- Process list with status badges and quick actions (start/stop/restart)
- Zero backend duplication: read from existing MCP server via HTTP bridge or local adapter
- Minimal build: Vite + React + Tailwind + shadcn/ui

## Architecture
- FE: React + Vite + TypeScript, TailwindCSS, shadcn/ui (Button, Badge, Tabs, Select, ScrollArea, Input)
- Transport: small node adapter exposing `/logs/stream?processId=...` bridged to MCP `tail_logs` and `get_logs`
  - Alt: direct MCP client in the FE is not feasible (stdio); use a tiny local node proxy (scripts/dev-proxy.ts)
- State: simple Zustand or React Context (processes, selectedProcessId, filters)

## UI Sketch
- Left Sidebar: Processes list (name, status dot, CPU/Memory tiny text)
- Main: Tabs [Logs | Info]
  - Logs: live tail, level filter, search input
  - Info: process details (pid, uptime, health), quick actions
- Top Bar: App title, connection status

## MVP Features
- [ ] List processes via MCP tool `list_processes`
- [ ] Tail logs via MCP tool `tail_logs` (proxy streams newline-delimited JSON)
- [ ] Filter by level (info/warn/error)
- [ ] Pause/resume streaming
- [ ] Start/Stop/Restart actions call corresponding tools

## Implementation Plan
1. Create branch feat/minimal-react-log-dashboard ✓
2. Create docs plan (this file) ✓
3. Add dev proxy: `scripts/dev-proxy.ts` (express) bridging MCP calls to HTTP
   - GET /api/processes → call tools/list + list_processes
   - GET /api/logs?processId=...&stream=true → stream tail_logs as SSE
   - POST /api/process/:id/start|stop|restart → tool calls
4. Scaffold React app under `apps/log-dashboard` with Vite + Tailwind + shadcn/ui
   - Components: ProcessList, LogStream, Toolbar, StatusBadge
   - Use shadcn/ui: Button, Badge, Select, Tabs, ScrollArea, Input
5. Wire SSE client to /api/logs stream, with filters and pause
6. Add minimal styles and empty states
7. Validate with running MCP server; ensure no CORS issues (same-origin during dev)
8. Add README/setup instructions

## Success Criteria
- Select process → see live logs within 2s
- Start/Stop/Restart buttons work and reflect status within 3s
- Filter logs by level; search highlights matches
- No page reload needed; memory stable after 10 min tail

## Risks & Mitigations
- Transport: stdio-only MCP cannot be called from browser → use Node proxy
- Log volume: throttle/concat updates; limit to last N lines (e.g., 2000)
- Cross-platform: avoid shell specifics; rely on existing MCP tools

## Out of Scope (now)
- Auth, multi-user, persistent settings
- Historical analytics and charts
- Process creation UI (stick to actions)

## References
- shadcn/ui docs (components and Tailwind setup)
- MCP tools: list_processes, tail_logs, get_logs, start/stop/restart
