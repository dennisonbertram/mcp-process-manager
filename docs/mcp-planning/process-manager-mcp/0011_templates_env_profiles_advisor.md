# 0011 – Templates, Env Profiles, and Project Advisor (LLM-First UX)

## Goals
- Make starting, running, and monitoring multi-process projects intuitive for LLMs and humans.
- Provide flexible presets/templates that work across stacks (Node, Python, Go, services).
- Add environment management that reflects real-world DX (env files, profiles).
- Offer an advisor tool to auto-suggest setups with safe, explainable defaults.

## UX Principles
- Declarative: Keep inputs compact and intention-focused; infer safe defaults.
- Explicit overrides: Always allow precise control (env, cwd, args, health).
- Structured outputs: Return human text + structured JSON for programmatic flows.
- Explainability: Suggest, don’t surprise. Advisor explains what and why.

---

## Schema Extensions

### StartProcess Args (extensions)
```ts
StartProcessArgs = {
  name: string,
  command: string,         // absolute, relative, or bare tool name (see allowlist)
  args?: string[],
  cwd?: string,            // absolute or "pwd"
  env?: Record<string,string>,
  envFiles?: string[],     // e.g., [".env", ".env.local", ".env.dev"]
  envProfile?: string,     // e.g., "development" → maps to default file set
  autoRestart?: boolean,
  healthCheckCommand?: string,
  healthCheckInterval?: number,
  groupId?: string
}
```
Rules:
- envFiles merge order: left→right (later wins). Interpolation supports ${VAR} from merged map.
- envProfile default order: [`.env`, `.env.local`, `.env.${profile}`, `.env.${profile}.local`].
- cwd: allow literal "pwd" to use working directory.
- command: may be a bare name if allowed by tool-name allowlist and resolved under allowed dirs.

### Config File Schema (processes.config.*)
```ts
ProcessesConfig = {
  processes: Record<string, {
    command: string,
    args?: string[],
    cwd?: string,
    env?: Record<string,string>,
    envFiles?: string[],
    envProfile?: string,
    autoRestart?: boolean,
    healthCheckCommand?: string,
    healthCheckInterval?: number,
    dependsOn?: string[]
  }>,
  groups?: Record<string, string[]> // groupName → array of process keys
}
```
- Supported formats: JSON first; JS/TS later via loader.
- Validated before use; helpful errors returned to the client.

### Template Schema
```ts
Template = {
  name: string,
  title: string,
  description: string,
  categories: ("frontend"|"backend"|"worker"|"db"|"cache"|"queue"|"infra")[],
  variables: Record<string, { description: string, required?: boolean, default?: string|number }>,
  processes: Record<string, {
    command: string,
    args?: (string|{ var: string })[], // allows substitutions from variables
    cwd?: string,
    env?: Record<string,string|{ var: string }>,
    envFiles?: string[],
    autoRestart?: boolean,
    healthCheckCommand?: string
  }>,
  groups?: Record<string, string[]>
}
```
- Application result returns concrete `ProcessesConfig` with substitutions applied.

---

## New Tools (MCP)

### templates/list
- Description: List available templates with metadata for discovery.
- Input: `{ category?: string }`
- Output: text summary + JSON `{ templates: TemplateHeader[] }`

### templates/apply
- Description: Materialize a template into a `ProcessesConfig` (does not start processes unless `start: true`).
- Input: `{ name: string, variables?: Record<string,string|number>, start?: boolean, group?: string }`
- Output: text plan + JSON `{ config: ProcessesConfig, started?: string[] }`

### config/read
- Description: Read and validate `processes.config.json` from PWD (or `path`).
- Input: `{ path?: string }`
- Output: text + JSON `{ config?: ProcessesConfig, issues?: string[] }`

### config/reload (future)
- Description: Reload and apply config (start/stop to match target state).
- Input: `{ path?: string, group?: string, dryRun?: boolean }`
- Output: plan text + JSON `{ actions: Action[] }`

### advisor/analyze_project
- Description: Analyze repo to propose processes/groups/health checks.
- Heuristics: package.json scripts, docker-compose.yml, Procfile, common framework files, ports.
- Input: `{ path?: string }`
- Output: text rationale + JSON `{ suggestions: { processes: ..., groups: ..., warnings: ... } }`

---

## Prompts

### setup:choose-template
- Args: `{ category?: string }`
- Produces: A guided selection flow with recommended variables and defaults.

### setup:confirm-config
- Args: `{ config: ProcessesConfig }`
- Produces: A confirmation message plus next steps (start group, monitor).

### setup:troubleshoot-start
- Args: `{ processId?: string }`
- Produces: Checklist for missing env, blocked commands, port conflicts, health failures.

---

## Environment & Allowlist

### PM_ALLOWED_COMMANDS
- Comma-separated list of files/dirs; supports `pwd`, `$PWD`, `${PWD}`, `~`.
- Empty string → allow all (not recommended).

### PM_ALLOWED_TOOL_NAMES
- Comma-separated list of bare tool names (e.g., `pnpm,npm,yarn,node,tsx,next,vite`).
- Resolution: If `command` is a bare name and in this list, resolve via PATH; then apply directory allowlist from `PM_ALLOWED_COMMANDS` (or allow-all if empty).
- Default: empty (opt-in).

---

## Responses (LLM-friendly)
- All tools return 2-part content:
  1) Human text (summary and guidance)
  2) JSON block with machine-readable data (full detail)

Example (templates/apply):
```json
{
  "content": [
    { "type": "text", "text": "Applied template 'node-service' with 2 processes (web, worker)." },
    { "type": "text", "text": "{\n  \"config\": { ... }\n}" }
  ]
}
```

---

## Minimal Initial Catalog (examples)
- node-service: web (vite/next) + worker; ports & env vars as variables.
- python-service: uvicorn app + worker; optional redis var.
- db-services: postgres + redis (via docker-compose command or local binaries).

---

## Roadmap & Phases
- Phase 1: envFiles + PM_ALLOWED_TOOL_NAMES; templates/list + advisor/analyze (read-only suggestions); improved errors (blocked command diagnostics, missing env).
- Phase 2: processes.config loader (JSON), templates/apply (return config), prompts; start_dev_stack convenience built on templates/groups.
- Phase 3: config/reload (apply desired state), template generator from advisor; analyze_logs/check_health summary tools with actionable hints.

---

## Security Notes
- Keep allowlist tight by default; prefer `pwd` + known system bins.
- Tool names resolve only when explicitly whitelisted.
- Advisor never executes; it only suggests.

## Testing Strategy
- Unit: schema validation, env merge & interpolation, PATH resolution.
- Integration: templates/list + advisor/analyze behavior on sample repos.
- E2E: apply template → start group → monitor resources.
