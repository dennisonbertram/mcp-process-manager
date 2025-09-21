# 0009 - MCP Compliance, Security Hardening, and ESM Fixes

## Description
Address critical review items: secure health checks, proper MCP schema handlers, ESM import correctness, path allowlist behavior, types tightening, and documentation/test alignment.

## Success Criteria
- All tests pass (`npm test`).
- No ESM runtime errors; all local imports use `.js`.
- Health checks avoid shell; commands validated against allowlist.
- Server uses official MCP request schemas from `@modelcontextprotocol/sdk/types.js` for tools, resources, and prompts.
- README reflects accurate tool counts and default DB path.
- Config test matches actual defaults.

## Failure Conditions
- Any `exec`-based health check remains.
- Imports missing `.js` extensions.
- Custom Zod request envelopes still used for MCP handlers.
- README/documentation out of sync with defaults.

## Edge Cases
- Allowed entries may include directories or exact files; resolve symlinks and check subpath containment.
- Large health-check outputs should be capped; timeouts enforced.
- Windows path semantics (out of current scope; target POSIX).

## Checklist
- [x] Fix ESM imports missing `.js` (resources/provider, tools/{monitoring,groups,errors}).
- [x] Replace `exec` in `ProcessManager.performHealthCheck` with validated `spawn` and caps.
- [x] Update `HealthCheckService.isPathAllowed` to support allowed directories.
- [x] Tighten `StatsCollector` process filter to `ProcessStatus.RUNNING`.
- [x] Use official MCP schemas in `src/index.ts`, `src/resources/provider.ts`, `src/prompts/provider.ts`.
- [x] Update README tool count and default DB path.
- [x] Update `tests/config.test.ts` to assert home-based default DB path.

## Implementation Notes
- Tools continue to use Zod for inputSchema; only the envelope request schemas switch to SDK.
- Structured tool outputs can be extended later.

## Commands
- Lint and type-check: `npm run lint && npx tsc --noEmit`
- Tests: `npm test`
- Build: `npm run build`

## Follow-ups (Optional)
- Emit list-change notifications when dynamic state alters capabilities.
- Add structured JSON blocks to tool outputs.
- Document daemon-backed mode status and roadmap in README.
