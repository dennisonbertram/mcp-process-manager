/**
 * Action Log Reader: parse and search the markdown action log and attachments.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveActionLogPath } from './actionLogger.js';

export interface ActionLogEntry {
  header: string;
  timestamp: string;
  tool: string;
  outcome: 'SUCCESS' | 'ERROR' | 'DRY-RUN' | string;
  start: number;
  end: number;
  content: string;
}

export interface EntryFilters {
  tool?: string; // exact match
  outcome?: 'SUCCESS' | 'ERROR' | 'DRY-RUN' | string;
  since?: number; // epoch ms
  until?: number; // epoch ms
}

function matchesFilters(e: ActionLogEntry, f?: EntryFilters): boolean {
  if (!f) return true;
  if (f.tool && e.tool !== f.tool) return false;
  if (f.outcome && e.outcome !== f.outcome) return false;
  if (f.since && new Date(e.timestamp).getTime() < f.since) return false;
  if (f.until && new Date(e.timestamp).getTime() > f.until) return false;
  return true;
}

function parseHeader(headerLine: string): { timestamp: string; tool: string; outcome: string } | null {
  // Format: ## [ISO] tool:<name> — OUTCOME
  const m = headerLine.match(/^## \[(.+?)\]\s+tool:(.+?)\s+—\s+(.+)$/);
  if (!m) return null;
  return { timestamp: m[1], tool: m[2], outcome: m[3] };
}

export function readEntries(filePath?: string, filters?: EntryFilters): ActionLogEntry[] {
  const file = filePath || resolveActionLogPath() || '';
  if (!file || !fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const entries: ActionLogEntry[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## [')) {
      const headerInfo = parseHeader(lines[i]);
      if (!headerInfo) continue;
      const start = i;
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('## [')) j++;
      const end = j - 1;
      const content = lines.slice(i, j).join('\n');
      const entry: ActionLogEntry = { header: lines[i], timestamp: headerInfo.timestamp, tool: headerInfo.tool, outcome: headerInfo.outcome as any, start, end, content };
      if (matchesFilters(entry, filters)) entries.push(entry);
      i = j - 1;
    }
  }
  return entries;
}

export interface SearchOptions { includeAttachments?: boolean; limit?: number; caseSensitive?: boolean; }

export function searchEntries(query: string, opts: SearchOptions = {}, filePath?: string, filters?: EntryFilters): Array<{ entry: ActionLogEntry; match: string } | { attachment: string; match: string } > {
  const entries = readEntries(filePath, filters);
  const limit = Math.max(1, Math.min(opts.limit || 20, 1000));
  const results: Array<{ entry: ActionLogEntry; match: string } | { attachment: string; match: string }> = [];

  const haystack = (s: string) => opts.caseSensitive ? s : s.toLowerCase();
  const needle = opts.caseSensitive ? query : query.toLowerCase();

  for (const e of entries) {
    const h = haystack(e.content);
    const idx = h.indexOf(needle);
    if (idx >= 0) {
      const snippet = e.content.slice(Math.max(0, idx - 80), Math.min(e.content.length, idx + 80));
      results.push({ entry: e, match: snippet });
      if (results.length >= limit) return results;
    }
  }

  if (opts.includeAttachments) {
    const file = filePath || resolveActionLogPath() || '';
    const baseDir = path.dirname(file);
    const attachDir = path.join(baseDir, 'attachments');
    if (fs.existsSync(attachDir) && fs.statSync(attachDir).isDirectory()) {
      const files = fs.readdirSync(attachDir).filter(f => f.endsWith('.md'));
      for (const f of files) {
        try {
          const p = path.join(attachDir, f);
          const txt = fs.readFileSync(p, 'utf8');
          const h = haystack(txt);
          const idx = h.indexOf(needle);
          if (idx >= 0) {
            const snippet = txt.slice(Math.max(0, idx - 80), Math.min(txt.length, idx + 80));
            results.push({ attachment: p, match: snippet });
            if (results.length >= limit) return results;
          }
        } catch {}
      }
    }
  }

  return results;
}
