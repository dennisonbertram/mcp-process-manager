export enum ProcessStatus {
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPED = 'stopped',
  FAILED = 'failed',
  CRASHED = 'crashed'
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

export enum LogType {
  STDOUT = 'stdout',
  STDERR = 'stderr',
  SYSTEM = 'system'
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface ProcessConfig {
  id?: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  autoRestart?: boolean;
  healthCheckCommand?: string;
  healthCheckInterval?: number;
  groupId?: string;
}

export interface ProcessInfo extends ProcessConfig {
  id: string;
  pid?: number;
  status: ProcessStatus;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  restartCount: number;
  healthStatus: HealthStatus;
  lastHealthCheck?: number;
}

export interface ProcessMetrics {
  processId: string;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: number;
}

export interface LogEntry {
  id?: number;
  processId: string;
  type: LogType;
  message: string;
  timestamp: number;
  level: LogLevel;
}

export interface ErrorEntry {
  id?: number;
  processId: string;
  errorType: string;
  message: string;
  stackTrace?: string;
  timestamp: number;
  resolved: boolean;
}

export interface ProcessGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  startupOrder?: string[]; // Process IDs in order
}