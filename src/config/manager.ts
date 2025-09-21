import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ConfigSchema = z.object({
  PM_DATABASE_PATH: z.string().default(path.join(os.homedir(), '.mcp-process-manager', 'data', 'process-manager.db')),
  PM_LOG_RETENTION_DAYS: z.number().min(1).max(365).default(30),
  PM_MAX_PROCESSES: z.number().min(1).max(1000).default(50),
  PM_HEALTH_CHECK_INTERVAL: z.number().min(1000).default(60000),
  PM_AUTO_RESTART_ENABLED: z.boolean().default(true),
  PM_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  PM_ALLOWED_COMMANDS: z.string().transform(val => val.split(',')).default('/usr/bin,/usr/local/bin'),
  PM_MAX_LOG_SIZE_MB: z.number().min(1).max(10000).default(100),
  PM_MAX_CPU_PERCENT: z.number().min(1).max(100).default(80),
  PM_MAX_MEMORY_MB: z.number().min(1).max(32000).default(1024),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
    this.validateCommandPaths();
  }

  private loadConfig(): Config {
    const envConfig: any = {};

    // Parse environment variables
    for (const key in ConfigSchema.shape) {
      const envValue = process.env[key];
      if (envValue !== undefined) {
        // Handle type conversions
        if (key.includes('DAYS') || key.includes('PROCESSES') || key.includes('INTERVAL') || key.includes('SIZE') || key.includes('CPU') || key.includes('MEMORY')) {
          envConfig[key] = parseInt(envValue, 10);
        } else if (key === 'PM_AUTO_RESTART_ENABLED') {
          envConfig[key] = envValue.toLowerCase() === 'true';
        } else {
          envConfig[key] = envValue;
        }
      }
    }

    const parsed = ConfigSchema.parse(envConfig);

    // Expand and clean allowed command paths
    const expandEntry = (p: string): string => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed === 'pwd' || trimmed === '$PWD' || trimmed === '${PWD}' || trimmed === '{PWD}') {
        return process.cwd();
      }
      if (trimmed.startsWith('~')) {
        return path.join(os.homedir(), trimmed.slice(1));
      }
      return trimmed;
    };

    const cleaned = (parsed.PM_ALLOWED_COMMANDS || [])
      .map(expandEntry)
      .filter((p) => p.length > 0);

    parsed.PM_ALLOWED_COMMANDS = cleaned;

    return parsed;
  }

  private validateCommandPaths(): void {
    const allowedPaths = this.config.PM_ALLOWED_COMMANDS;
    if (allowedPaths.length === 0) return; // Empty means allow all
    for (const cmdPath of allowedPaths) {
      if (!path.isAbsolute(cmdPath)) {
        throw new Error(`Invalid command path: ${cmdPath} must be absolute`);
      }
    }
  }

  get<K extends keyof Config>(key: K, defaultValue?: Config[K]): Config[K] {
    return this.config[key] ?? defaultValue;
  }

  isCommandAllowed(command: string): boolean {
    try {
      if (this.config.PM_ALLOWED_COMMANDS.length === 0) return true; // Empty means allow all
      const realCmd = fs.realpathSync(command);
      return this.config.PM_ALLOWED_COMMANDS.some((root) => {
        const realRoot = fs.realpathSync(root);
        const withSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
        return realCmd === realRoot || realCmd.startsWith(withSep);
      });
    } catch {
      return false;
    }
  }

  getAll(): Config {
    return { ...this.config };
  }
}