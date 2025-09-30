# 0013 – Guardrails + Action Logging for MCP Process Manager

## Summary
Design and implement robust, LLM-friendly guardrails for high‑impact operations and a comprehensive Markdown action log for every tool invocation. This strengthens safety in containerized environments and provides a transparent audit trail to help the LLM (and humans) review past actions and outcomes.

## Decisions (Locked)
- Simulation mode: No
- Per‑tool configuration for guardrails: No (global policies only)
- Client identity capture in action logs: No (do not attempt to infer/record client identity)

## Goals
- Require two‑phase confirmation (dry‑run → confirm) for dangerous operations.
- Enforce container safety: block PID 1/self‑kill; cap max impact; protect IDs.
- Standardize tool ergonomics for LLMs (schemas, errors, hints).
- Persist a detailed, privacy‑aware Markdown action log with redaction and rotation.
- Align health check execution to the same command safety model (ConfigManager).

## Non‑Goals
- No simulation mode, no per‑tool config, no client identity metadata.
- No transport additions; stdio remains the target transport.
- No changes to the overall process execution model beyond guardrails.

## Success Criteria
- Dry‑run for dangerous tools returns:
  - RiskSummary (impact, reversibility, protected targets, risk level)
  - short‑lived confirmToken bound to tool+args
- Confirmed execution requires a valid, unexpired confirmToken; tokens are single‑use.
- Max impact enforced (default 3) unless `override: true` + confirmation.
- PID 1 and server self‑kill are always blocked.
- Health checks validated via ConfigManager allowlist+denylist.
- Every tool call is logged to Markdown with redactions. Logs rotate by size and prune by retention.
- No duplicate tools in `tools/list`.

## Failure Conditions
- Dangerous action executes without dry‑run/confirmation in safe mode.
- PID 1 or server PID kill allowed.
- Action logs contain unredacted secrets or exceed size limits without truncation.
- Token reuse succeeds or TTL isn’t enforced.

## Edge Cases
- Token replay and concurrent confirmations.
- Mixed group state (some processes already stopped/running).
- Log dir missing/unwritable: guardrails still work; log writer degrades gracefully with warnings.
- Extremely large tool args/outputs: redact+truncate with noted truncation.
- Clock skew irrelevant: TTL uses server wall clock only.

## Architecture
- Registry Middleware (new): wraps tool registration/execution
  - Risk assessment for dangerous tools
  - Dry‑run response path
  - ConfirmToken issuance/validation (in‑memory)
  - ActionLogger call (pre/post)
- ActionLogger (new):
  - Markdown per action; directory configured by env
  - Redaction (key‑based and entropy‑based)
  - Rotation by size (MB) and pruning by retention (days)
- ProcessManager Safety:
  - Block PID 1 and `process.pid`
- GroupManager Impact Preview:
  - Precompute affected processes for start/stop (with skipRunning)
- HealthCheckService:
  - Inject ConfigManager; use `isCommandAllowed` + denylist

## Configuration (new/updated)
- `PM_SAFE_MODE` (bool, default `true`)
- `PM_CONFIRM_TTL_SECONDS` (int, default `60`)
- `PM_MAX_IMPACT` (int, default `3`)
- `PM_PROTECTED_PROCESSES` (string CSV of process IDs, default empty)
- `PM_PROTECTED_GROUPS` (string CSV of group IDs, default empty)
- `MCP_PM_ACTION_LOG_DIR` (path, default `~/.mcp-process-manager/actions`)
- `PM_ACTION_LOG_MAX_MB` (int, default `10`)
- `PM_ACTION_LOG_RETENTION_DAYS` (int, default `30`)

## Risk Model
- RiskSummary
  - `level`: LOW | MEDIUM | HIGH | CRITICAL
  - `impacts`: string[] (e.g., "Stops 4 processes")
  - `reversible`: boolean (did we plan automatic rollback? No; this is informational)
  - `affectedProcesses`: string[]
  - `requiresOverride`: boolean (exceeds max impact or protected targets)
  - `requiresConfirmation`: boolean
  - `suggestedNextSteps`: string[]
- Scoring heuristics
  - Single restart: MEDIUM
  - Stop/kill 1–3: HIGH if `force` or includes protected; else MEDIUM
  - Stop/kill > `PM_MAX_IMPACT`: CRITICAL
  - In all cases, PID 1/self‑kill: BLOCKED (not scored)

## Two‑Phase Confirmation Flow
- Dry‑run: call with `dryRun: true` → returns RiskSummary + `confirmToken`
  - `confirmToken` = base64(HMAC_SHA256(secret=process uptime seed, data=toolName|argHash|issuedAt|nonce))
  - Stored in memory: `{ tool, argHash, expiresAt, used=false }`
- Confirm: same args + `confirmToken` [+ `override: true` if required]
  - Validate: exists, not expired, tool matches, argHash matches, `used=false`
  - Mark `used=true` on success; clear on TTL expiry via sweep
- Arg hashing: JSON‑canonicalize args excluding `dryRun`, `confirmToken`, `override`
- TTL: `PM_CONFIRM_TTL_SECONDS`

## Dangerous Tools and Schemas
- Tools: `stop_process`, `kill_process`, `restart_process`, `start_group`, `stop_group`
- Add optional fields to schemas:
  - `dryRun?: boolean` (default false)
  - `confirmToken?: string`
  - `override?: boolean` (default false; required if CRITICAL or protected)
- Uniform failure messaging with guidance: "Run with `dryRun: true` for a risk summary."

## Action Logger Specification
- Directory: `MCP_PM_ACTION_LOG_DIR`
- Filenames: `YYYY-MM-DDTHH-mm-ss.SSSZ__<tool>__<short-id>.md`
- Markdown outline
  - Title: `<tool> @ <timestamp> – <SUCCESS|ERROR|DRY‑RUN>`
  - Request
    - Tool
    - Timestamp (ISO)
    - Request ID (random) and correlation hash (tool+argHash+time)
    - Arguments (redacted/truncated JSON)
  - Risk Summary (if dry‑run/guarded): formatted JSON block
  - Result
    - isError, summary line(s)
    - Output excerpts (bounded size; indicate truncation)
    - Error stack (if present; truncated)
  - Footer
    - Content hash (SHA256 of normalized content for tamper‑evidence)
- Redaction policy
  - Key‑based: redact values for keys matching `/token|password|secret|apikey|auth|bearer/i`
  - Entropy‑based: redact long, high‑entropy strings (>32 chars; shannon entropy threshold)
  - Always annotate: `[redacted]`
- Rotation
  - Track current file size; when exceeding `PM_ACTION_LOG_MAX_MB` → start new file
- Pruning
  - Daily job (or reuse existing cleanup tick) to delete files older than `PM_ACTION_LOG_RETENTION_DAYS`
- Failure handling
  - Never throw from logger; emit winston warn on failure

## Resource: action‑log://latest
- `resources/list` adds `action-log://latest` (JSON)
- `resources/read` for `action-log://latest` returns:
  - `entries: Array<{ file: string, timestamp: string, tool: string, outcome: string, size: number }>` (last N, e.g., 50)
  - `directory: string`
- Security: resource only lists file metadata, not contents

## HealthCheck Alignment
- Replace local allow‑paths with `ConfigManager.isCommandAllowed`
- Denylist check with `ConfigManager.isDangerousCommand`
- Enforce stdout/stderr size/time caps (existing behavior remains)

## Implementation Steps
1) Fix duplicate tool registration in `src/tools/index.ts` (remove extra `registerLifecycleTools`).
2) Implement `src/logs/manager.ts` per existing planning doc; ensure tests pass or adjust accordingly.
3) Add config fields to `ConfigManager` and parsing logic.
4) Create ActionLogger utility and wire it into `tools/registry.ts` (pre/post execution hooks).
5) Add registry middleware for dangerous tools:
   - Risk estimation (using GroupManager impact previews and ProcessManager state)
   - Dry‑run response + token issuance
   - Confirm path with token validation and override enforcement
6) Add ProcessManager safety checks (PID 1, self‑kill) and fail‑safe messaging.
7) Update HealthCheckService to take ConfigManager and use `isCommandAllowed`.
8) Extend ResourceProvider with `action-log://latest`.
9) Standardize error messages and hints across modified tools.
10) Documentation: update CONFIGURATION.md and LLM_USAGE.md.

## API Examples (LLM‑friendly)
- Dry‑run stop group
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 1,
  "params": {
    "name": "stop_group",
    "arguments": { "groupId": "dev", "dryRun": true }
  }
}
```
- Confirm with override
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 2,
  "params": {
    "name": "stop_group",
    "arguments": { "groupId": "dev", "confirmToken": "<token>", "override": true }
  }
}
```

## Testing Plan
- Unit
  - Token issue/validate/expire/reuse; argHash stability
  - Risk scoring thresholds; protected IDs
  - PID 1/self‑kill rejection
  - Redaction: key‑based and entropy‑based; truncation markers
  - Rotation/pruning behaviors
- Integration (stdio)
  - `tools/call` dry‑run → confirm for `stop_group` where impact > `PM_MAX_IMPACT`
  - `kill_process` dry‑run blocked for protected/self/PID 1; confirm with override if allowed
  - `resources/list` includes `action-log://latest`; read returns metadata
  - No duplicate tools in `tools/list`
- Performance
  - ActionLogger does not materially block tool paths (bounded sync writes or micro‑batching); ensure acceptable latency

## Rollout
- Phase 1: duplicates fix, LogManager (if missing), basic safety checks, config additions
- Phase 2: registry middleware (dry‑run/confirm/override)
- Phase 3: ActionLogger + resource index
- Phase 4: polish UX, docs, and broaden tests

## Open Items (Future Consideration)
- Per‑group max‑impact overrides governed by policy (not per‑tool config)
- Optional FTS5 for log search performance (out of scope here)
- Structured event bus for external alerting (out of scope)

## Checklist
- [ ] Duplicate tool registration removed
- [ ] Config flags implemented and documented
- [ ] Health checks use ConfigManager safety
- [ ] ProcessManager PID 1/self‑kill guards
- [ ] Registry middleware for dangerous tools (dry‑run/confirm/override)
- [ ] ActionLogger writes markdown with redaction, rotation, pruning
- [ ] action-log://latest resource added
- [ ] Tests: unit, integration, performance smoke
- [ ] LLM‑friendly schema/error copy verified
- [ ] Docs updated (CONFIGURATION.md, LLM_USAGE.md)
