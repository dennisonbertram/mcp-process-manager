import { DatabaseManager } from '../database/manager.js';
import winston from 'winston';
import { ErrorEntry } from '../types/process.js';
import { EventEmitter } from 'events';

export interface ErrorFilter {
  processId?: string;
  errorType?: string;
  resolved?: boolean;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

export interface ErrorSummary {
  totalErrors: number;
  unresolvedErrors: number;
  errorsByType: Record<string, number>;
  errorsByProcess: Record<string, number>;
  mostRecentError?: ErrorEntry;
  errorRate: number; // Errors per hour
}

export class ErrorManager extends EventEmitter {
  private database: DatabaseManager;
  private logger: winston.Logger;
  private errorPatterns: Map<string, RegExp>;

  constructor(database: DatabaseManager, logger: winston.Logger) {
    super();
    this.database = database;
    this.logger = logger;
    this.errorPatterns = this.initializeErrorPatterns();
  }

  private initializeErrorPatterns(): Map<string, RegExp> {
    const patterns = new Map<string, RegExp>();

    // Common error patterns for categorization - order matters, more specific first
    patterns.set('OutOfMemory', /\bENOMEM\b|out of memory|heap out of memory/i);
    patterns.set('PermissionDenied', /\bEACCES\b|permission denied|access denied/i);
    patterns.set('FileNotFound', /\bENOENT\b|no such file|file not found/i);
    patterns.set('ConnectionError', /\bECONNREFUSED\b|\bETIMEDOUT\b|connection refused|connection timeout/i);
    patterns.set('SyntaxError', /\bSyntaxError\b|unexpected token|parsing error/i);
    patterns.set('TypeError', /\bTypeError\b|undefined is not|cannot read property/i);
    patterns.set('NetworkError', /\bEHOSTUNREACH\b|\bENETUNREACH\b|network unreachable/i);
    patterns.set('DiskSpace', /\bENOSPC\b|no space left|disk full/i);

    return patterns;
  }

  private categorizeError(message: string, stack?: string): string {
    const fullText = `${message} ${stack || ''}`;

    for (const [category, pattern] of this.errorPatterns.entries()) {
      if (pattern.test(fullText)) {
        return category;
      }
    }

    // Default categorization based on error class
    if (message.includes('Error:')) {
      const errorType = message.split(':')[0].trim();
      return errorType;
    }

    return 'UnknownError';
  }

  async recordError(
    processId: string,
    error: Error | string,
    additionalContext?: Record<string, any>
  ): Promise<void> {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'object' ? error.stack : undefined;
    const errorType = this.categorizeError(errorMessage, errorStack);

    const errorEntry: ErrorEntry = {
      processId,
      errorType,
      message: errorMessage,
      stackTrace: errorStack,
      timestamp: Date.now(),
      resolved: false
    };

    // Store in database
    this.database.getStatement('insertError').run({
      process_id: errorEntry.processId,
      error_type: errorEntry.errorType,
      message: errorEntry.message,
      stack_trace: errorEntry.stackTrace,
      timestamp: errorEntry.timestamp
    });

    // Log the error
    this.logger.error(`Process ${processId} error:`, {
      type: errorType,
      message: errorMessage,
      context: additionalContext
    });

    // Emit event for real-time monitoring
    this.emit('newError', errorEntry);

    // Check if this is a critical error that needs immediate attention
    if (this.isCriticalError(errorType)) {
      this.emit('criticalError', errorEntry);
    }
  }

  private isCriticalError(errorType: string): boolean {
    const criticalTypes = ['OutOfMemory', 'DiskSpace', 'PermissionDenied'];
    return criticalTypes.includes(errorType);
  }

  async getErrors(filter: ErrorFilter): Promise<ErrorEntry[]> {
    let query = 'SELECT * FROM errors WHERE 1=1';
    const params: any[] = [];

    if (filter.processId) {
      query += ' AND process_id = ?';
      params.push(filter.processId);
    }

    if (filter.errorType) {
      query += ' AND error_type = ?';
      params.push(filter.errorType);
    }

    if (filter.resolved !== undefined) {
      query += ' AND resolved = ?';
      params.push(filter.resolved ? 1 : 0);
    }

    if (filter.startTime) {
      query += ' AND timestamp >= ?';
      params.push(filter.startTime);
    }

    if (filter.endTime) {
      query += ' AND timestamp <= ?';
      params.push(filter.endTime);
    }

    query += ' ORDER BY timestamp DESC';

    if (filter.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);

      if (filter.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.database.getDb().prepare(query);
    const results = stmt.all(...params) as Array<{
      id: number;
      process_id: string;
      error_type: string;
      message: string;
      stack_trace?: string;
      timestamp: number;
      resolved: number;
    }>;

    return results.map(row => ({
      id: row.id,
      processId: row.process_id,
      errorType: row.error_type,
      message: row.message,
      stackTrace: row.stack_trace,
      timestamp: row.timestamp,
      resolved: Boolean(row.resolved)
    }));
  }

  async getLatestErrors(
    limit: number = 10,
    unresolvedOnly: boolean = true
  ): Promise<ErrorEntry[]> {
    const filter: ErrorFilter = {
      limit,
      resolved: unresolvedOnly ? false : undefined
    };

    return this.getErrors(filter);
  }

  async markErrorResolved(errorId: number, resolution?: string): Promise<void> {
    const stmt = this.database.getDb().prepare(
      'UPDATE errors SET resolved = 1 WHERE id = ?'
    );
    const result = stmt.run(errorId);

    if (result.changes > 0) {
      this.logger.info(`Marked error ${errorId} as resolved${resolution ? `: ${resolution}` : ''}`);
      this.emit('errorResolved', { errorId, resolution });
    } else {
      throw new Error(`Error ${errorId} not found`);
    }
  }

  async getErrorSummary(
    processId?: string,
    timeWindow?: number // milliseconds
  ): Promise<ErrorSummary> {
    const startTime = timeWindow ? Date.now() - timeWindow : 0;
    const whereClause = [];
    const params: any[] = [];

    if (processId) {
      whereClause.push('process_id = ?');
      params.push(processId);
    }

    if (startTime > 0) {
      whereClause.push('timestamp >= ?');
      params.push(startTime);
    }

    const where = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    // Get total and unresolved counts
    const countStmt = this.database.getDb().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved
      FROM errors ${where}
    `);
    const counts = countStmt.get(...params) as { total: number; unresolved: number };

    // Get errors by type
    const typeStmt = this.database.getDb().prepare(`
      SELECT error_type, COUNT(*) as count
      FROM errors ${where}
      GROUP BY error_type
      ORDER BY count DESC
    `);
    const typeResults = typeStmt.all(...params) as Array<{ error_type: string; count: number }>;
    const errorsByType = typeResults.reduce((acc, row) => {
      acc[row.error_type] = row.count;
      return acc;
    }, {} as Record<string, number>);

    // Get errors by process
    const processStmt = this.database.getDb().prepare(`
      SELECT process_id, COUNT(*) as count
      FROM errors ${where}
      GROUP BY process_id
      ORDER BY count DESC
    `);
    const processResults = processStmt.all(...params) as Array<{ process_id: string; count: number }>;
    const errorsByProcess = processResults.reduce((acc, row) => {
      acc[row.process_id] = row.count;
      return acc;
    }, {} as Record<string, number>);

    // Get most recent error
    const recentErrors = await this.getLatestErrors(1, false);
    const mostRecentError = recentErrors[0];

    // Calculate error rate (errors per hour)
    const timeRange = timeWindow || (Date.now() - (mostRecentError?.timestamp || Date.now()));
    const hoursElapsed = Math.max(timeRange / (1000 * 60 * 60), 1);
    const errorRate = counts.total / hoursElapsed;

    return {
      totalErrors: counts.total,
      unresolvedErrors: counts.unresolved || 0,
      errorsByType,
      errorsByProcess,
      mostRecentError,
      errorRate
    };
  }

  async getErrorTrends(
    processId?: string,
    bucketSizeMs: number = 3600000, // 1 hour buckets by default
    limit: number = 24
  ): Promise<Array<{ timestamp: number; count: number; types: Record<string, number> }>> {
    const now = Date.now();
    const startTime = now - (bucketSizeMs * limit);

    let query = `
      SELECT
        (timestamp / ?) * ? as bucket,
        COUNT(*) as count,
        error_type
      FROM errors
      WHERE timestamp >= ?
    `;
    const params: any[] = [bucketSizeMs, bucketSizeMs, startTime];

    if (processId) {
      query += ' AND process_id = ?';
      params.push(processId);
    }

    query += ' GROUP BY bucket, error_type ORDER BY bucket DESC';

    const stmt = this.database.getDb().prepare(query);
    const results = stmt.all(...params) as Array<{
      bucket: number;
      count: number;
      error_type: string;
    }>;

    // Group by bucket
    const buckets = new Map<number, { count: number; types: Record<string, number> }>();

    for (const row of results) {
      if (!buckets.has(row.bucket)) {
        buckets.set(row.bucket, { count: 0, types: {} });
      }

      const bucket = buckets.get(row.bucket)!;
      bucket.count += row.count;
      bucket.types[row.error_type] = (bucket.types[row.error_type] || 0) + row.count;
    }

    return Array.from(buckets.entries())
      .map(([timestamp, data]) => ({ timestamp, ...data }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async getSimilarErrors(
    errorId: number,
    limit: number = 10
  ): Promise<ErrorEntry[]> {
    // Get the original error
    const originalStmt = this.database.getDb().prepare(
      'SELECT * FROM errors WHERE id = ?'
    );
    const original = originalStmt.get(errorId) as {
      id: number;
      process_id: string;
      error_type: string;
      message: string;
      stack_trace?: string;
      timestamp: number;
      resolved: number;
    } | undefined;

    if (!original) {
      throw new Error(`Error ${errorId} not found`);
    }

    // Find similar errors based on type and message similarity
    const stmt = this.database.getDb().prepare(`
      SELECT * FROM errors
      WHERE id != ?
        AND error_type = ?
        AND process_id = ?
      ORDER BY ABS(timestamp - ?) ASC
      LIMIT ?
    `);

    const results = stmt.all(
      errorId,
      original.error_type,
      original.process_id,
      original.timestamp,
      limit
    ) as Array<{
      id: number;
      process_id: string;
      error_type: string;
      message: string;
      stack_trace?: string;
      timestamp: number;
      resolved: number;
    }>;

    return results.map(row => ({
      id: row.id,
      processId: row.process_id,
      errorType: row.error_type,
      message: row.message,
      stackTrace: row.stack_trace,
      timestamp: row.timestamp,
      resolved: Boolean(row.resolved)
    }));
  }
}