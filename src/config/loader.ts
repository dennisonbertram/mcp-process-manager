import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const ProcessDefSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  envFiles: z.array(z.string()).optional(),
  envProfile: z.string().optional(),
  autoRestart: z.boolean().optional(),
  healthCheckCommand: z.string().optional(),
  healthCheckInterval: z.number().optional(),
  dependsOn: z.array(z.string()).optional()
});

export const ProcessesConfigSchema = z.object({
  processes: z.record(ProcessDefSchema),
  groups: z.record(z.array(z.string())).optional()
});

export type ProcessesConfig = z.infer<typeof ProcessesConfigSchema>;

export function readProcessesConfig(baseDir: string, relPath: string = 'processes.config.json'): { config?: ProcessesConfig; issues?: string[] } {
  const issues: string[] = [];
  try {
    const p = path.isAbsolute(relPath) ? relPath : path.join(baseDir, relPath);
    if (!fs.existsSync(p)) {
      return { issues: [`Config file not found at ${p}`] };
    }
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    const parsed = ProcessesConfigSchema.safeParse(data);
    if (!parsed.success) {
      issues.push(...parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
      return { issues };
    }
    return { config: parsed.data };
  } catch (e) {
    issues.push(e instanceof Error ? e.message : String(e));
    return { issues };
  }
}
