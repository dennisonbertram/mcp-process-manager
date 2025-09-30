#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveActionLogPath } from '../utils/actionLogger.js';
import { readEntries, searchEntries } from '../utils/actionLogReader.js';

function usage() {
  console.log(`mcp-actions-log

Usage:
  mcp-actions-log list [-n N] [--file PATH] [--tool NAME] [--outcome SUCCESS|ERROR] [--since ISO|epoch] [--until ISO|epoch]
  mcp-actions-log search <pattern> [--file PATH] [--limit N] [--attachments] [--case-sensitive] [--tool NAME] [--outcome SUCCESS|ERROR] [--since ISO|epoch] [--until ISO|epoch]

Defaults:
  --file defaults to MCP_PM_ACTION_LOG_FILE or ./.mcp-actions.md
`);
}

function getFileFromArgs(argv: string[]): string | null {
  const idx = argv.indexOf('--file');
  if (idx >= 0 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return resolveActionLogPath();
}

function parseTime(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isNaN(n) && n > 0) return n;
  const d = new Date(s);
  const t = d.getTime();
  return Number.isNaN(t) ? undefined : t;
}

async function cmdList(argv: string[]) {
  const nIdx = argv.indexOf('-n');
  const limit = nIdx >= 0 && argv[nIdx + 1] ? Math.max(1, Math.min(parseInt(argv[nIdx + 1], 10) || 10, 200)) : 10;
  const file = getFileFromArgs(argv);
  if (!file) { console.log('Action logging is disabled (MCP_PM_ACTION_LOG_FILE=off).'); return; }
  if (!fs.existsSync(file)) { console.log('No action log found at', file); return; }
  const toolIdx = argv.indexOf('--tool');
  const tool = toolIdx >= 0 ? argv[toolIdx + 1] : undefined;
  const outIdx = argv.indexOf('--outcome');
  const outcome = outIdx >= 0 ? argv[outIdx + 1] : undefined;
  const sinceIdx = argv.indexOf('--since');
  const untilIdx = argv.indexOf('--until');
  const since = parseTime(sinceIdx >= 0 ? argv[sinceIdx + 1] : undefined);
  const until = parseTime(untilIdx >= 0 ? argv[untilIdx + 1] : undefined);

  const entries = readEntries(file, { tool, outcome: outcome as any, since, until }).slice(-limit).reverse();
  if (entries.length === 0) { console.log('No entries.'); return; }
  for (const e of entries) {
    console.log(`[${e.timestamp}] ${e.tool} — ${e.outcome}`);
  }
}

async function cmdSearch(argv: string[]) {
  const pattern = argv.find(a => !a.startsWith('-'));
  if (!pattern) { usage(); process.exit(1); }
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 && argv[limitIdx + 1] ? Math.max(1, Math.min(parseInt(argv[limitIdx + 1], 10) || 20, 1000)) : 20;
  const includeAttachments = argv.includes('--attachments');
  const caseSensitive = argv.includes('--case-sensitive');
  const file = getFileFromArgs(argv);
  if (!file) { console.log('Action logging is disabled (MCP_PM_ACTION_LOG_FILE=off).'); return; }
  if (!fs.existsSync(file)) { console.log('No action log found at', file); return; }
  const toolIdx = argv.indexOf('--tool');
  const tool = toolIdx >= 0 ? argv[toolIdx + 1] : undefined;
  const outIdx = argv.indexOf('--outcome');
  const outcome = outIdx >= 0 ? argv[outIdx + 1] : undefined;
  const sinceIdx = argv.indexOf('--since');
  const untilIdx = argv.indexOf('--until');
  const since = parseTime(sinceIdx >= 0 ? argv[sinceIdx + 1] : undefined);
  const until = parseTime(untilIdx >= 0 ? argv[untilIdx + 1] : undefined);

  const matches = searchEntries(pattern, { includeAttachments, limit, caseSensitive }, file, { tool, outcome: outcome as any, since, until });
  if (matches.length === 0) { console.log('No matches.'); return; }
  for (const m of matches) {
    if ('entry' in m) {
      console.log(`ENTRY: [${m.entry.timestamp}] ${m.entry.tool} — ${m.entry.outcome}`);
      console.log(`  …${m.match}…`);
    } else {
      console.log(`ATTACHMENT: ${m.attachment}`);
      console.log(`  …${m.match}…`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv.shift();
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { usage(); return; }
  if (cmd === 'list') return cmdList(argv);
  if (cmd === 'search') return cmdSearch(argv);
  usage(); process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
