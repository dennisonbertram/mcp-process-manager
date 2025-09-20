import Database from 'better-sqlite3';
import winston from 'winston';

export class DatabaseManager {
  private db: Database.Database;
  private logger: winston.Logger;
  private preparedStatements: Map<string, Database.Statement>;

  constructor(dbPath: string, logger: winston.Logger) {
    this.logger = logger;
    this.db = new Database(dbPath);
    this.preparedStatements = new Map();

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('wal_autocheckpoint = 1000');
    this.db.pragma('journal_size_limit = 67108864'); // 64MB

    this.initializeSchema();
    this.prepareStatements();
  }

  private initializeSchema(): void {
    const schema = `
      CREATE TABLE IF NOT EXISTS processes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        args TEXT,
        env TEXT,
        cwd TEXT,
        pid INTEGER,
        status TEXT CHECK(status IN ('starting', 'running', 'stopped', 'failed', 'crashed')),
        group_id TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        stopped_at INTEGER,
        restart_count INTEGER DEFAULT 0,
        auto_restart BOOLEAN DEFAULT FALSE,
        health_check_command TEXT,
        health_check_interval INTEGER,
        last_health_check INTEGER,
        health_status TEXT CHECK(health_status IN ('healthy', 'unhealthy', 'unknown'))
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id TEXT NOT NULL,
        type TEXT CHECK(type IN ('stdout', 'stderr', 'system')),
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        level TEXT CHECK(level IN ('debug', 'info', 'warn', 'error')),
        FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id TEXT NOT NULL,
        error_type TEXT NOT NULL,
        message TEXT NOT NULL,
        stack_trace TEXT,
        timestamp INTEGER NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS process_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        startup_order TEXT
      );

      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id TEXT NOT NULL,
        cpu_usage REAL,
        memory_usage INTEGER,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_logs_process_timestamp ON logs(process_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_errors_process_timestamp ON errors(process_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_metrics_process_timestamp ON metrics(process_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_processes_group ON processes(group_id);
      CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(status);
    `;

    this.db.exec(schema);
    this.logger.info('Database schema initialized');
  }

  private prepareStatements(): void {
    // Process management statements
    this.preparedStatements.set('insertProcess', this.db.prepare(`
      INSERT INTO processes (id, name, command, args, env, cwd, status, created_at)
      VALUES (@id, @name, @command, @args, @env, @cwd, @status, @created_at)
    `));

    this.preparedStatements.set('updateProcessStatus', this.db.prepare(`
      UPDATE processes
      SET status = @status, pid = @pid, started_at = @started_at
      WHERE id = @id
    `));

    this.preparedStatements.set('updateProcessHealth', this.db.prepare(`
      UPDATE processes
      SET health_status = @health_status, last_health_check = @last_health_check
      WHERE id = @id
    `));

    // Log management statements
    this.preparedStatements.set('insertLog', this.db.prepare(`
      INSERT INTO logs (process_id, type, message, timestamp, level)
      VALUES (@process_id, @type, @message, @timestamp, @level)
    `));

    this.preparedStatements.set('getRecentLogs', this.db.prepare(`
      SELECT * FROM logs
      WHERE process_id = @process_id
      ORDER BY timestamp DESC
      LIMIT @limit
    `));

    // Error tracking statements
    this.preparedStatements.set('insertError', this.db.prepare(`
      INSERT INTO errors (process_id, error_type, message, stack_trace, timestamp)
      VALUES (@process_id, @error_type, @message, @stack_trace, @timestamp)
    `));

    // Metrics statements
    this.preparedStatements.set('insertMetric', this.db.prepare(`
      INSERT INTO metrics (process_id, cpu_usage, memory_usage, timestamp)
      VALUES (@process_id, @cpu_usage, @memory_usage, @timestamp)
    `));
  }

  // Transaction wrapper for atomic operations
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // Cleanup old data
  cleanupOldData(retentionDays: number): void {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    this.transaction(() => {
      this.db.prepare('DELETE FROM logs WHERE timestamp < ?').run(cutoffTime);
      this.db.prepare('DELETE FROM metrics WHERE timestamp < ?').run(cutoffTime);
      this.db.prepare('DELETE FROM errors WHERE timestamp < ? AND resolved = TRUE').run(cutoffTime);
    });
  }

  close(): void {
    try {
      this.db.pragma('optimize');
    } catch (error) {
      this.logger.warn('Failed to optimize database on shutdown', error);
    }
    this.db.close();
  }

  // Getter for prepared statements
  getStatement(name: string): Database.Statement {
    const stmt = this.preparedStatements.get(name);
    if (!stmt) throw new Error(`Prepared statement ${name} not found`);
    return stmt;
  }

  // Direct database access for complex queries
  getDb(): Database.Database {
    return this.db;
  }
}