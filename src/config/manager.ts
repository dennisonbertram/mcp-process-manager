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

    return ConfigSchema.parse(envConfig);
  }

  private validateCommandPaths(): void {
    const allowedPaths = this.config.PM_ALLOWED_COMMANDS;
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