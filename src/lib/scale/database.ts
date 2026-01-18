// Database Optimization & Connection Pooling
import { PoolConfig, PoolStats, ShardConfig, ShardInfo, BulkOperationConfig, BulkOperationResult } from './types';

// Query builder for optimized queries
export class QueryOptimizer {
  // Optimize SELECT with proper pagination
  static paginate(query: string, page: number, pageSize: number): string {
    const offset = (page - 1) * pageSize;
    return `${query} LIMIT ${pageSize} OFFSET ${offset}`;
  }

  // Optimize SELECT with cursor-based pagination
  static cursorPaginate(
    query: string,
    cursor: string | null,
    cursorColumn: string,
    pageSize: number,
    direction: 'ASC' | 'DESC' = 'DESC'
  ): string {
    let optimizedQuery = query;

    if (cursor) {
      const operator = direction === 'DESC' ? '<' : '>';
      if (query.toLowerCase().includes('where')) {
        optimizedQuery = query.replace(
          /where/i,
          `WHERE ${cursorColumn} ${operator} '${cursor}' AND`
        );
      } else {
        optimizedQuery = `${query} WHERE ${cursorColumn} ${operator} '${cursor}'`;
      }
    }

    return `${optimizedQuery} ORDER BY ${cursorColumn} ${direction} LIMIT ${pageSize}`;
  }

  // Optimize for batch inserts
  static batchInsert(table: string, columns: string[], values: unknown[][]): string {
    const columnList = columns.join(', ');
    const valuePlaceholders = values
      .map((row, rowIndex) =>
        `(${row.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`
      )
      .join(', ');

    return `INSERT INTO ${table} (${columnList}) VALUES ${valuePlaceholders}`;
  }

  // Optimize for upsert
  static upsert(
    table: string,
    columns: string[],
    conflictColumns: string[],
    updateColumns: string[]
  ): string {
    const columnList = columns.join(', ');
    const valuePlaceholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const conflictList = conflictColumns.join(', ');
    const updateList = updateColumns
      .map((col) => `${col} = EXCLUDED.${col}`)
      .join(', ');

    return `
      INSERT INTO ${table} (${columnList})
      VALUES (${valuePlaceholders})
      ON CONFLICT (${conflictList})
      DO UPDATE SET ${updateList}
    `;
  }

  // Add query hints for index usage
  static forceIndex(query: string, indexName: string): string {
    // PostgreSQL doesn't support index hints directly, use SET commands instead
    return `/*+ IndexScan(${indexName}) */ ${query}`;
  }

  // Optimize for count queries
  static optimizedCount(table: string, where?: string): string {
    const whereClause = where ? `WHERE ${where}` : '';
    // Use approximate count for large tables
    return `
      SELECT
        CASE
          WHEN reltuples > 10000 THEN reltuples::bigint
          ELSE (SELECT COUNT(*) FROM ${table} ${whereClause})
        END as count
      FROM pg_class
      WHERE relname = '${table}'
    `;
  }
}

// Connection pool manager
export class ConnectionPoolManager {
  private config: PoolConfig;
  private stats: PoolStats;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = {
      min: config.min || 2,
      max: config.max || 10,
      acquireTimeoutMillis: config.acquireTimeoutMillis || 30000,
      createTimeoutMillis: config.createTimeoutMillis || 30000,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      reapIntervalMillis: config.reapIntervalMillis || 1000,
      createRetryIntervalMillis: config.createRetryIntervalMillis || 200,
    };

    this.stats = {
      size: 0,
      available: 0,
      pending: 0,
      borrowed: 0,
      spareCapacity: this.config.max,
    };
  }

  getConfig(): PoolConfig {
    return { ...this.config };
  }

  getStats(): PoolStats {
    return { ...this.stats };
  }

  // Generate Supabase connection string with pooler
  generateConnectionString(options: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    poolerMode?: 'transaction' | 'session';
    sslMode?: 'require' | 'verify-full' | 'disable';
  }): string {
    const { host, port, database, user, password, poolerMode = 'transaction', sslMode = 'require' } = options;

    return `postgres://${user}:${password}@${host}:${port}/${database}?sslmode=${sslMode}&pgbouncer=true&connection_limit=${this.config.max}`;
  }

  // Supabase-specific pooler configuration
  getSupabasePoolerConfig(): {
    connectionString: string;
    options: Record<string, unknown>;
  } {
    return {
      connectionString: process.env.DATABASE_URL || '',
      options: {
        max: this.config.max,
        min: this.config.min,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.acquireTimeoutMillis,
        // Use Supabase connection pooler (PgBouncer)
        poolMode: 'transaction',
      },
    };
  }
}

// Database sharding utilities
export class ShardManager {
  private config: ShardConfig;
  private shards: Map<number, ShardInfo>;

  constructor(config: ShardConfig) {
    this.config = config;
    this.shards = new Map();

    // Initialize shards
    for (let i = 0; i < config.shardCount; i++) {
      this.shards.set(i, {
        shardId: i,
        connectionString: config.connectionStrings[i] || config.connectionStrings[0],
      });
    }
  }

  // Get shard for a key
  getShardId(key: string): number {
    switch (this.config.shardFunction) {
      case 'hash':
        return this.hashShard(key);
      case 'range':
        return this.rangeShard(key);
      case 'directory':
        return this.directoryShard(key);
      default:
        return this.hashShard(key);
    }
  }

  // Get shard info
  getShard(shardId: number): ShardInfo | undefined {
    return this.shards.get(shardId);
  }

  // Get all shards
  getAllShards(): ShardInfo[] {
    return Array.from(this.shards.values());
  }

  // Hash-based sharding
  private hashShard(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % this.config.shardCount;
  }

  // Range-based sharding
  private rangeShard(key: string): number {
    const firstChar = key.charCodeAt(0);
    const rangeSize = Math.ceil(256 / this.config.shardCount);
    return Math.floor(firstChar / rangeSize);
  }

  // Directory-based sharding (requires lookup table)
  private directoryShard(key: string): number {
    // This would typically query a directory table
    // For now, fall back to hash
    return this.hashShard(key);
  }

  // Execute query across all shards
  async executeOnAllShards<T>(
    executor: (shardInfo: ShardInfo) => Promise<T>
  ): Promise<Map<number, T>> {
    const results = new Map<number, T>();

    await Promise.all(
      Array.from(this.shards.entries()).map(async ([shardId, shardInfo]) => {
        const result = await executor(shardInfo);
        results.set(shardId, result);
      })
    );

    return results;
  }
}

// Bulk operation utilities
export class BulkOperations {
  // Execute bulk insert with batching
  static async bulkInsert<T>(
    items: T[],
    executor: (batch: T[]) => Promise<number>,
    config: Partial<BulkOperationConfig> = {}
  ): Promise<BulkOperationResult<T>> {
    const {
      batchSize = 1000,
      concurrency = 5,
      retryFailedItems = true,
      continueOnError = true,
    } = config;

    const startTime = Date.now();
    const errors: Array<{ item: T; error: string }> = [];
    let successful = 0;

    // Split into batches
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    // Process batches with concurrency limit
    const processQueue = async () => {
      const activeBatches: Promise<void>[] = [];

      for (const batch of batches) {
        if (activeBatches.length >= concurrency) {
          await Promise.race(activeBatches);
        }

        const batchPromise = (async () => {
          try {
            const count = await executor(batch);
            successful += count;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            if (retryFailedItems) {
              // Retry individual items
              for (const item of batch) {
                try {
                  await executor([item]);
                  successful++;
                } catch (itemError) {
                  errors.push({
                    item,
                    error: itemError instanceof Error ? itemError.message : 'Unknown error',
                  });
                }
              }
            } else {
              batch.forEach((item) => {
                errors.push({ item, error: errorMessage });
              });
            }

            if (!continueOnError) {
              throw error;
            }
          }
        })();

        activeBatches.push(batchPromise);

        // Clean up completed promises
        batchPromise.finally(() => {
          const index = activeBatches.indexOf(batchPromise);
          if (index > -1) {
            activeBatches.splice(index, 1);
          }
        });
      }

      // Wait for remaining batches
      await Promise.all(activeBatches);
    };

    await processQueue();

    return {
      successful,
      failed: errors.length,
      total: items.length,
      errors,
      duration: Date.now() - startTime,
    };
  }

  // Execute bulk update
  static async bulkUpdate<T extends { id: string }>(
    items: T[],
    executor: (batch: T[]) => Promise<number>,
    config: Partial<BulkOperationConfig> = {}
  ): Promise<BulkOperationResult<T>> {
    return this.bulkInsert(items, executor, config);
  }

  // Execute bulk delete
  static async bulkDelete(
    ids: string[],
    executor: (batch: string[]) => Promise<number>,
    config: Partial<BulkOperationConfig> = {}
  ): Promise<BulkOperationResult<string>> {
    return this.bulkInsert(ids, executor, config);
  }
}

// Read replica manager
export class ReadReplicaManager {
  private primary: string;
  private replicas: string[];
  private currentReplicaIndex: number;
  private replicaHealthy: boolean[];

  constructor(primary: string, replicas: string[]) {
    this.primary = primary;
    this.replicas = replicas;
    this.currentReplicaIndex = 0;
    this.replicaHealthy = replicas.map(() => true);
  }

  // Get connection for read operations (uses replicas)
  getReadConnection(): string {
    if (this.replicas.length === 0) {
      return this.primary;
    }

    // Round-robin through healthy replicas
    let attempts = 0;
    while (attempts < this.replicas.length) {
      const index = this.currentReplicaIndex;
      this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicas.length;

      if (this.replicaHealthy[index]) {
        return this.replicas[index];
      }

      attempts++;
    }

    // All replicas unhealthy, use primary
    return this.primary;
  }

  // Get connection for write operations (always primary)
  getWriteConnection(): string {
    return this.primary;
  }

  // Mark replica as unhealthy
  markReplicaUnhealthy(index: number): void {
    if (index >= 0 && index < this.replicaHealthy.length) {
      this.replicaHealthy[index] = false;
    }
  }

  // Mark replica as healthy
  markReplicaHealthy(index: number): void {
    if (index >= 0 && index < this.replicaHealthy.length) {
      this.replicaHealthy[index] = true;
    }
  }

  // Get replica status
  getReplicaStatus(): Array<{ connection: string; healthy: boolean }> {
    return this.replicas.map((conn, index) => ({
      connection: conn,
      healthy: this.replicaHealthy[index],
    }));
  }
}

// Query result cache
export class QueryCache {
  private cache: Map<string, { data: unknown; expiresAt: number }>;
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  // Generate cache key for a query
  generateKey(query: string, params?: unknown[]): string {
    const paramsString = params ? JSON.stringify(params) : '';
    return `${query}:${paramsString}`;
  }

  // Get cached result
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  // Set cached result
  set<T>(key: string, data: T, ttlMs: number = 60000): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  // Invalidate by pattern
  invalidatePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
  }

  // Get cache stats
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// Slow query detector
export class SlowQueryDetector {
  private threshold: number;
  private slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
    params?: unknown[];
  }>;
  private maxLogSize: number;

  constructor(thresholdMs: number = 1000, maxLogSize: number = 100) {
    this.threshold = thresholdMs;
    this.slowQueries = [];
    this.maxLogSize = maxLogSize;
  }

  // Record query execution
  record(query: string, durationMs: number, params?: unknown[]): boolean {
    if (durationMs >= this.threshold) {
      if (this.slowQueries.length >= this.maxLogSize) {
        this.slowQueries.shift();
      }

      this.slowQueries.push({
        query,
        duration: durationMs,
        timestamp: new Date(),
        params,
      });

      console.warn(`Slow query detected (${durationMs}ms): ${query.substring(0, 100)}...`);
      return true;
    }

    return false;
  }

  // Get slow queries
  getSlowQueries(): typeof this.slowQueries {
    return [...this.slowQueries];
  }

  // Get summary
  getSummary(): {
    count: number;
    avgDuration: number;
    maxDuration: number;
    topQueries: Array<{ query: string; count: number; avgDuration: number }>;
  } {
    if (this.slowQueries.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        maxDuration: 0,
        topQueries: [],
      };
    }

    const avgDuration =
      this.slowQueries.reduce((sum, q) => sum + q.duration, 0) / this.slowQueries.length;
    const maxDuration = Math.max(...this.slowQueries.map((q) => q.duration));

    // Group by query pattern
    const queryGroups = new Map<string, number[]>();
    for (const sq of this.slowQueries) {
      const pattern = sq.query.substring(0, 50);
      const durations = queryGroups.get(pattern) || [];
      durations.push(sq.duration);
      queryGroups.set(pattern, durations);
    }

    const topQueries = Array.from(queryGroups.entries())
      .map(([query, durations]) => ({
        query,
        count: durations.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      count: this.slowQueries.length,
      avgDuration,
      maxDuration,
      topQueries,
    };
  }

  // Clear logs
  clear(): void {
    this.slowQueries = [];
  }
}

// Database health check
export async function checkDatabaseHealth(supabaseUrl: string): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  details: Record<string, unknown>;
}> {
  const start = Date.now();

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return {
        status: latencyMs < 100 ? 'healthy' : 'degraded',
        latencyMs,
        details: {
          statusCode: response.status,
        },
      };
    }

    return {
      status: 'unhealthy',
      latencyMs,
      details: {
        statusCode: response.status,
        statusText: response.statusText,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// Singleton instances
export const queryOptimizer = new QueryOptimizer();
export const connectionPool = new ConnectionPoolManager();
export const queryCache = new QueryCache();
export const slowQueryDetector = new SlowQueryDetector();
