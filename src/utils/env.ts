// Simple .env loader/merger with ${VAR} interpolation (LLM-friendly)
// Note: intentionally minimal; no multi-line or export support
import fs from 'node:fs';
import path from 'node:path';

export function loadEnvFiles(cwd: string, files: string[]): Record<string,string> {
  const result: Record<string,string> = {};
  for (const rel of files) {
    const p = rel === 'pwd' ? cwd : path.isAbsolute(rel) ? rel : path.join(cwd, rel);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const raw = trimmed.slice(eq + 1).trim();
      const val = unquote(raw);
      result[key] = interpolate(val, result);
    }
  }
  return result;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function interpolate(value: string, ctx: Record<string,string>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => (ctx[k] ?? process.env[k] ?? ''));
}
