/**
 * Minimal Markdown Action Logger for tool calls.
 * - Always-on by default; opt-out with MCP_PM_ACTION_LOG_FILE=off
 * - Single append-only markdown file (no rotation).
 * - If output/error exceeds 1000 chars, write full content to a separate file and
 *   put a pointer + instruction in the main log.
 */
import fs from 'node:fs';
import path from 'node:path';
// import os from 'node:os';

const REDACT_KEYS = /token|password|secret|apikey|api_key|auth|bearer/i;

function ensureDirSync(p: string) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function homeDefault(): string {
  // Default to current working directory to keep logs alongside the project
  const dir = process.cwd();
  ensureDirSync(dir);
  return path.join(dir, '.mcp-actions.md');
}

export function resolveActionLogPath(): string | null {
  const env = process.env.MCP_PM_ACTION_LOG_FILE;
  if (env && env.toLowerCase() === 'off') return null;
  if (env && env.trim() !== '') {
    const p = path.resolve(env);
    ensureDirSync(path.dirname(p));
    return p;
  }
  const p = homeDefault();
  ensureDirSync(path.dirname(p));
  return p;
}

function redactValue(v: any): any {
  if (v == null) return v;
  if (typeof v === 'string') {
    // Truncate very long inline strings in the log body; full data kept in attachment if needed
    const s = v.length > 500 ? v.slice(0, 500) + '…(truncated)' : v;
    return s;
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (typeof v === 'object') return redactObject(v);
  return v;
}

function redactObject(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    out[k] = redactValue(v);
  }
  return out;
}

function writeFileSafe(p: string, data: string) {
  try { fs.writeFileSync(p, data, { encoding: 'utf8' }); } catch {}
}

function appendFileSafe(p: string, data: string) {
  try { fs.appendFileSync(p, data, { encoding: 'utf8' }); } catch {}
}

export interface ActionLogInput {
  requestId: string;
  tool: string;
  timestamp: string; // ISO
  args: any;
  isError: boolean;
  outputText?: string; // concatenated tool text outputs
  errorText?: string;  // thrown error or error details
}

export function logToolAction(entry: ActionLogInput): void {
  const mainFile = resolveActionLogPath();
  if (!mainFile) return; // opted out

  const baseDir = path.dirname(mainFile);
  const attachmentsDir = path.join(baseDir, 'attachments');
  ensureDirSync(attachmentsDir);

  const header = `\n\n## [${entry.timestamp}] tool:${entry.tool} — ${entry.isError ? 'ERROR' : 'SUCCESS'}\n`;

  const redactedArgs = redactObject(entry.args || {});
  const argsBlock = '### Args (redacted)\n' + '```json\n' + JSON.stringify(redactedArgs, null, 2) + '\n```\n';

  let outputRef = '';
  if (entry.outputText && entry.outputText.length > 0) {
    if (entry.outputText.length > 1000) {
      const outName = `${entry.timestamp.replace(/[:]/g, '-')}_${entry.tool}_${entry.requestId}_output.md`;
      const outPath = path.join(attachmentsDir, outName);
      writeFileSafe(outPath, entry.outputText);
      outputRef = `### Output\nOutput exceeds 1000 chars. See full content: ${outPath}\n`;
    } else {
      outputRef = `### Output\n` + '```\n' + entry.outputText + '\n```\n';
    }
  }

  let errorRef = '';
  if (entry.errorText && entry.errorText.length > 0) {
    if (entry.errorText.length > 1000) {
      const errName = `${entry.timestamp.replace(/[:]/g, '-')}_${entry.tool}_${entry.requestId}_error.md`;
      const errPath = path.join(attachmentsDir, errName);
      writeFileSafe(errPath, entry.errorText);
      errorRef = `### Error\nError exceeds 1000 chars. See full content: ${errPath}\n`;
    } else {
      errorRef = `### Error\n` + '```\n' + entry.errorText + '\n```\n';
    }
  }

  const body = header + argsBlock + outputRef + errorRef;
  appendFileSafe(mainFile, body);
}
