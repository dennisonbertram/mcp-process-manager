# MANDATORY DEVELOPMENT PROCESS — NO EXCEPTIONS

READ THIS BEFORE WRITING ANY CODE. THESE RULES ARE ABSOLUTE.
Any deviation is a failure. The LLM MUST obey every step. No shortcuts. No skipping.

## 0) Prime Directives
- DO NOT misrepresent results. If you didn’t run it, you DO NOT KNOW it works.
- NEVER hardcode secrets. NEVER create fallbacks that hide errors. NO hidden behavior.
- stdout MUST contain ONLY valid MCP JSON-RPC. ALL logs go to stderr.
- Security is non-negotiable: no shell execution, strict path allowlists, input validation.
- Stay on task. Update the TODOs and docs after EVERY meaningful change.

## 1) Workflow Overview (You MUST follow this order)
1. Create/Update a task doc in docs/mcp-planning/process-manager-mcp (link to ticket/commit).
2. Create a short-lived branch per task: `<id>-<slug>`.
3. TDD Loop (repeat until DONE):
   a. Write a failing test (unit/integration/E2E) that captures the desired behavior.
   b. Implement the minimum code to pass the test.
   c. Run: lint, typecheck, tests. They MUST pass.
   d. Refactor safely (small steps). Re-run all checks.
   e. Commit with a descriptive message referencing the task, WHY not just WHAT.
4. Update docs as code changes (README, API notes, architecture where needed).
5. Update TODOs/progress. Never leave TODOs stale.

## 2) Non-Negotiable Quality Gates
- Before every commit:
  - tsc --noEmit MUST PASS
  - eslint MUST PASS
  - vitest MUST PASS (>= 85% coverage target; don’t regress)
- Before merging:
  - E2E smoke test: spawn server, initialize, list tools — MUST PASS
  - Protocol guard: assert stdout-only MCP, logs on stderr — MUST PASS
  - Security checks: path allowlist tests, no shell exec in health/tools — MUST PASS

## 3) TDD Requirements
- Each feature/change STARTS with a failing test. NO test, NO code.
- Test categories to use:
  - Unit: managers, validators, schema conversion (Zod→JSON Schema with ajv validation)
  - Integration: tool registry dispatch, DB PRAGMAs, log buffering, health checks
  - E2E: initialize → tools/resources/prompts flows; negative cases
- Tests MUST initialize MCP session before tools/resources/prompts calls.
- Add regression tests for every bug fixed. Bugs MUST NOT reappear.

## 4) Security Rules (Enforced)
- Command execution: use spawn/execFile ONLY, shell: false. Validate with realpath and subpath boundary check. Reject symlink escapes.
- Health checks: same as above; set timeouts and output caps.
- Rate limiting: per-tool guard. Document thresholds.
- SQLite: WAL, busy_timeout, synchronous=NORMAL, wal_autocheckpoint, journal_size_limit; PRAGMA optimize periodically.

## 5) MCP Compliance Rules
- Single handlers for tools/list and tools/call via the central registry.
- Input schemas in tools/list MUST be valid JSON Schema (converted from Zod). Validate via ajv in tests.
- tools/call responses MUST return only spec fields (`content`, optional `isError`). No extra top-level fields.
- Examples and tests MUST show initialize first.

## 6) Documentation Discipline
- Edit docs alongside code. Out-of-date docs are a blocker.
- Each file needs a purpose header. Public API changes MUST be documented immediately.
- Update docs: 0000–0009 accordingly, and log work in development_log.md.

## 7) Commit Discipline
- Commit small, cohesive changes. Reference task IDs.
- Message format: short imperative title + WHY/impact in body. Include list of affected areas.
- DO NOT commit broken code. EVER.

## 8) Task Tracking & TODOs
- Maintain a live TODO list (in repo or issue). Mark tasks pending/in_progress/completed.
- Start ONE task at a time. Finish it before starting another.
- After each commit, sync TODOs and the task doc. No stale tasks.

## 9) Persistence & Daemon Mode
- Stdio servers are short-lived. Use the daemon-backed architecture so processes persist across sessions.
- The stdio shim MUST proxy to the daemon; DO NOT store state in the shim.
- IPC is internal; MCP transport remains stdio for external clients.

## 10) Definition of Done (DoD)
A task is DONE ONLY IF:
- All tests (unit/integration/E2E) PASS in CI.
- Lint + type checks PASS.
- Protocol smoke & guard tests PASS.
- Security tests PASS.
- Docs are accurate and updated.
- development_log.md updated.
- Commit history is clean and descriptive.

You MUST follow this process. If you cannot, STOP and fix your approach. There are NO exceptions.

## 11) Communication & Autonomy Rules
- Status updates: In every commit message and at logical milestones, include emojis:
  - 🟡 in progress, 🟢 completed, 🔴 blocked, 🔧 refactor, ✅ tests passing, 🚨 security fix.
- Periodic summaries: After each major task, append an entry to development_log.md with emoji status and a concise summary.
- Autonomy: The LLM MUST continue to the next planned task automatically. DO NOT pause to ask for permission between tasks unless a blocking decision is required (e.g., security trade‑off). If blocked, document in TODO and development_log.md and proceed to an unblocked adjacent task when possible.
- Start path for the LLM: Read docs at:
  - /Users/dennisonbertram/Develop/ModelContextProtocol/mcp-process-manager/docs/mcp-planning/process-manager-mcp/
  Then follow 0010_development_process.md and TODO_TEMPLATE.md to begin.
