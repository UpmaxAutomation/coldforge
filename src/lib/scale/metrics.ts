// Performance Monitoring & Metrics
import { Redis } from 'ioredis';
import { getRedisClient } from './cache';
import { MetricType, MetricValue, PerformanceMetrics } from './types';

// Metrics collector
export class MetricsCollector {
  private redis: Redis;
  private namespace: string;
  private metrics: Map<string, MetricType>;
  private localCounters: Map<string, number>;
  private localHistograms: Map<string, number[]>;

  constructor(namespace: string = 'metrics') {
    this.redis = getRedisClient();
    this.namespace = namespace;
    this.metrics = new Map();
    this.localCounters = new Map();
    this.localHistograms = new Map();
  }

  private key(name: string): string {
    return `${this.namespace}:${name}`;
  }

  // Register a metric
  register(metric: MetricType): void {
    this.metrics.set(metric.name, metric);
  }

  // Increment a counter
  async increment(
    name: string,
    value: number = 1,
    labels?: Record<string, string>
  ): Promise<void> {
    const key = this.buildKey(name, labels);

    // Update local counter
    const current = this.localCounters.get(key) || 0;
    this.localCounters.set(key, current + value);

    // Update Redis
    await this.redis.incrbyfloat(this.key(key), value);
  }

  // Decrement a counter
  async decrement(
    name: string,
    value: number = 1,
    labels?: Record<string, string>
  ): Promise<void> {
    await this.increment(name, -value, labels);
  }

  // Set a gauge value
  async gauge(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): Promise<void> {
    const key = this.buildKey(name, labels);
    await this.redis.set(this.key(key), value.toString());
  }

  // Record a histogram value
  async histogram(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): Promise<void> {
    const key = this.buildKey(name, labels);

    // Update local histogram
    const values = this.localHistograms.get(key) || [];
    values.push(value);
    this.localHistograms.set(key, values);

    // Store in Redis sorted set for percentile calculations
    const timestamp = Date.now();
    await this.redis.zadd(this.key(key), timestamp, `${timestamp}:${value}`);

    // Keep only last hour of data
    const hourAgo = timestamp - 3600000;
    await this.redis.zremrangebyscore(this.key(key), '-inf', hourAgo);
  }

  // Get histogram percentile
  async getPercentile(
    name: string,
    percentile: number,
    labels?: Record<string, string>
  ): Promise<number> {
    const key = this.buildKey(name, labels);
    const members = await this.redis.zrange(this.key(key), 0, -1);

    if (members.length === 0) {
      return 0;
    }

    const values = members
      .map((m) => parseFloat(m.split(':')[1]))
      .sort((a, b) => a - b);

    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  }

  // Time a function execution
  async time<T>(
    name: string,
    fn: () => Promise<T>,
    labels?: Record<string, string>
  ): Promise<T> {
    const start = performance.now();

    try {
      const result = await fn();
      const duration = performance.now() - start;
      await this.histogram(name, duration, labels);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      await this.histogram(name, duration, { ...labels, error: 'true' });
      throw error;
    }
  }

  // Get metric value
  async get(name: string, labels?: Record<string, string>): Promise<number> {
    const key = this.buildKey(name, labels);
    const value = await this.redis.get(this.key(key));
    return value ? parseFloat(value) : 0;
  }

  // Get all metrics
  async getAll(): Promise<MetricValue[]> {
    const keys = await this.redis.keys(`${this.namespace}:*`);
    const values: MetricValue[] = [];

    for (const key of keys) {
      const type = await this.redis.type(key);
      const name = key.replace(`${this.namespace}:`, '');

      if (type === 'string') {
        const value = await this.redis.get(key);
        if (value) {
          values.push({ name, value: parseFloat(value) });
        }
      } else if (type === 'zset') {
        const count = await this.redis.zcard(key);
        values.push({ name, value: count });
      }
    }

    return values;
  }

  // Reset a metric
  async reset(name: string, labels?: Record<string, string>): Promise<void> {
    const key = this.buildKey(name, labels);
    await this.redis.del(this.key(key));
    this.localCounters.delete(key);
    this.localHistograms.delete(key);
  }

  // Build key with labels
  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelString = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    return `${name}{${labelString}}`;
  }
}

// Request metrics tracker
export class RequestMetrics {
  private collector: MetricsCollector;

  constructor(collector?: MetricsCollector) {
    this.collector = collector || new MetricsCollector('requests');

    // Register metrics
    this.collector.register({
      name: 'http_requests_total',
      type: 'counter',
      help: 'Total HTTP requests',
      labels: ['method', 'path', 'status'],
    });

    this.collector.register({
      name: 'http_request_duration_ms',
      type: 'histogram',
      help: 'HTTP request duration in milliseconds',
      labels: ['method', 'path'],
    });
  }

  // Record a request
  async recordRequest(options: {
    method: string;
    path: string;
    status: number;
    duration: number;
  }): Promise<void> {
    const { method, path, status, duration } = options;

    // Normalize path (remove dynamic segments)
    const normalizedPath = this.normalizePath(path);

    // Increment request counter
    await this.collector.increment('http_requests_total', 1, {
      method,
      path: normalizedPath,
      status: status.toString(),
    });

    // Record duration
    await this.collector.histogram('http_request_duration_ms', duration, {
      method,
      path: normalizedPath,
    });
  }

  // Get request stats
  async getStats(): Promise<{
    total: number;
    successful: number;
    failed: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
  }> {
    const metrics = await this.collector.getAll();

    let total = 0;
    let successful = 0;
    let failed = 0;

    for (const metric of metrics) {
      if (metric.name.startsWith('http_requests_total')) {
        total += metric.value;

        if (metric.name.includes('status=2') || metric.name.includes('status=3')) {
          successful += metric.value;
        } else if (metric.name.includes('status=4') || metric.name.includes('status=5')) {
          failed += metric.value;
        }
      }
    }

    const [p50, p95, p99] = await Promise.all([
      this.collector.getPercentile('http_request_duration_ms', 50),
      this.collector.getPercentile('http_request_duration_ms', 95),
      this.collector.getPercentile('http_request_duration_ms', 99),
    ]);

    return {
      total,
      successful,
      failed,
      latencyP50: p50,
      latencyP95: p95,
      latencyP99: p99,
    };
  }

  private normalizePath(path: string): string {
    // Replace UUIDs with placeholder
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+/g, '/:id');
  }
}

// Database metrics tracker
export class DatabaseMetrics {
  private collector: MetricsCollector;

  constructor(collector?: MetricsCollector) {
    this.collector = collector || new MetricsCollector('database');

    this.collector.register({
      name: 'db_queries_total',
      type: 'counter',
      help: 'Total database queries',
      labels: ['operation', 'table'],
    });

    this.collector.register({
      name: 'db_query_duration_ms',
      type: 'histogram',
      help: 'Database query duration in milliseconds',
      labels: ['operation', 'table'],
    });

    this.collector.register({
      name: 'db_pool_connections',
      type: 'gauge',
      help: 'Database connection pool status',
      labels: ['status'],
    });
  }

  // Record a query
  async recordQuery(options: {
    operation: string;
    table: string;
    duration: number;
    rowsAffected?: number;
  }): Promise<void> {
    const { operation, table, duration } = options;

    await this.collector.increment('db_queries_total', 1, { operation, table });
    await this.collector.histogram('db_query_duration_ms', duration, { operation, table });
  }

  // Update pool stats
  async updatePoolStats(stats: {
    total: number;
    idle: number;
    waiting: number;
  }): Promise<void> {
    await this.collector.gauge('db_pool_connections', stats.total, { status: 'total' });
    await this.collector.gauge('db_pool_connections', stats.idle, { status: 'idle' });
    await this.collector.gauge('db_pool_connections', stats.waiting, { status: 'waiting' });
  }

  // Get database stats
  async getStats(): Promise<{
    queryCount: number;
    avgQueryTime: number;
    connectionPoolSize: number;
    connectionPoolAvailable: number;
  }> {
    const queryCount = await this.collector.get('db_queries_total');
    const avgQueryTime = await this.collector.getPercentile('db_query_duration_ms', 50);
    const poolSize = await this.collector.get('db_pool_connections', { status: 'total' });
    const poolAvailable = await this.collector.get('db_pool_connections', { status: 'idle' });

    return {
      queryCount,
      avgQueryTime,
      connectionPoolSize: poolSize,
      connectionPoolAvailable: poolAvailable,
    };
  }
}

// Queue metrics tracker
export class QueueMetrics {
  private collector: MetricsCollector;

  constructor(collector?: MetricsCollector) {
    this.collector = collector || new MetricsCollector('queues');

    this.collector.register({
      name: 'queue_jobs_total',
      type: 'counter',
      help: 'Total queue jobs',
      labels: ['queue', 'status'],
    });

    this.collector.register({
      name: 'queue_processing_duration_ms',
      type: 'histogram',
      help: 'Job processing duration',
      labels: ['queue', 'job'],
    });

    this.collector.register({
      name: 'queue_depth',
      type: 'gauge',
      help: 'Current queue depth',
      labels: ['queue', 'status'],
    });
  }

  // Record job completion
  async recordJobComplete(options: {
    queue: string;
    job: string;
    duration: number;
    success: boolean;
  }): Promise<void> {
    const { queue, job, duration, success } = options;

    await this.collector.increment('queue_jobs_total', 1, {
      queue,
      status: success ? 'completed' : 'failed',
    });

    await this.collector.histogram('queue_processing_duration_ms', duration, { queue, job });
  }

  // Update queue depth
  async updateDepth(queue: string, depths: {
    waiting: number;
    active: number;
    delayed: number;
  }): Promise<void> {
    await this.collector.gauge('queue_depth', depths.waiting, { queue, status: 'waiting' });
    await this.collector.gauge('queue_depth', depths.active, { queue, status: 'active' });
    await this.collector.gauge('queue_depth', depths.delayed, { queue, status: 'delayed' });
  }

  // Get queue stats
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    processingRate: number;
  }> {
    const waiting = await this.collector.get('queue_depth', { status: 'waiting' });
    const active = await this.collector.get('queue_depth', { status: 'active' });

    const metrics = await this.collector.getAll();
    let completed = 0;
    let failed = 0;

    for (const metric of metrics) {
      if (metric.name.includes('status=completed')) {
        completed += metric.value;
      } else if (metric.name.includes('status=failed')) {
        failed += metric.value;
      }
    }

    // Calculate processing rate (jobs per minute)
    const processingRate = (completed + failed) / 60;

    return { waiting, active, completed, failed, processingRate };
  }
}

// System metrics
export class SystemMetrics {
  private collector: MetricsCollector;
  private startTime: number;

  constructor(collector?: MetricsCollector) {
    this.collector = collector || new MetricsCollector('system');
    this.startTime = Date.now();

    this.collector.register({
      name: 'process_cpu_percent',
      type: 'gauge',
      help: 'CPU usage percentage',
    });

    this.collector.register({
      name: 'process_memory_bytes',
      type: 'gauge',
      help: 'Memory usage in bytes',
      labels: ['type'],
    });

    this.collector.register({
      name: 'process_uptime_seconds',
      type: 'gauge',
      help: 'Process uptime in seconds',
    });

    this.collector.register({
      name: 'nodejs_eventloop_lag_ms',
      type: 'gauge',
      help: 'Event loop lag in milliseconds',
    });
  }

  // Update system metrics
  async update(): Promise<void> {
    const memUsage = process.memoryUsage();

    await Promise.all([
      this.collector.gauge('process_memory_bytes', memUsage.heapUsed, { type: 'heapUsed' }),
      this.collector.gauge('process_memory_bytes', memUsage.heapTotal, { type: 'heapTotal' }),
      this.collector.gauge('process_memory_bytes', memUsage.rss, { type: 'rss' }),
      this.collector.gauge('process_memory_bytes', memUsage.external, { type: 'external' }),
      this.collector.gauge('process_uptime_seconds', (Date.now() - this.startTime) / 1000),
    ]);

    // Measure event loop lag
    const start = performance.now();
    await new Promise((resolve) => setImmediate(resolve));
    const lag = performance.now() - start;
    await this.collector.gauge('nodejs_eventloop_lag_ms', lag);
  }

  // Get system stats
  async getStats(): Promise<{
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
    eventLoopLag: number;
  }> {
    const memUsage = process.memoryUsage();
    const uptime = (Date.now() - this.startTime) / 1000;
    const eventLoopLag = await this.collector.get('nodejs_eventloop_lag_ms');

    // Calculate memory usage percentage
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    const memoryUsage = (usedMemory / totalMemory) * 100;

    return {
      cpuUsage: 0, // Would need more complex calculation
      memoryUsage,
      uptime,
      eventLoopLag,
    };
  }
}

// Cache metrics
export class CacheMetrics {
  private collector: MetricsCollector;

  constructor(collector?: MetricsCollector) {
    this.collector = collector || new MetricsCollector('cache');

    this.collector.register({
      name: 'cache_hits_total',
      type: 'counter',
      help: 'Total cache hits',
      labels: ['namespace'],
    });

    this.collector.register({
      name: 'cache_misses_total',
      type: 'counter',
      help: 'Total cache misses',
      labels: ['namespace'],
    });

    this.collector.register({
      name: 'cache_size',
      type: 'gauge',
      help: 'Cache size',
      labels: ['namespace'],
    });
  }

  // Record cache hit
  async recordHit(namespace: string): Promise<void> {
    await this.collector.increment('cache_hits_total', 1, { namespace });
  }

  // Record cache miss
  async recordMiss(namespace: string): Promise<void> {
    await this.collector.increment('cache_misses_total', 1, { namespace });
  }

  // Update cache size
  async updateSize(namespace: string, size: number): Promise<void> {
    await this.collector.gauge('cache_size', size, { namespace });
  }

  // Get cache stats
  async getStats(): Promise<{
    hitRate: number;
    memoryUsage: number;
    keyCount: number;
  }> {
    const hits = await this.collector.get('cache_hits_total');
    const misses = await this.collector.get('cache_misses_total');
    const total = hits + misses;
    const hitRate = total > 0 ? hits / total : 0;

    const redis = getRedisClient();
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory:(\d+)/);
    const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;

    const keyCount = await redis.dbsize();

    return { hitRate, memoryUsage, keyCount };
  }
}

// Combined performance metrics
export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  const requestMetrics = new RequestMetrics();
  const databaseMetrics = new DatabaseMetrics();
  const queueMetrics = new QueueMetrics();
  const systemMetrics = new SystemMetrics();
  const cacheMetrics = new CacheMetrics();

  const [requests, database, queues, system, cache] = await Promise.all([
    requestMetrics.getStats(),
    databaseMetrics.getStats(),
    queueMetrics.getStats(),
    systemMetrics.getStats(),
    cacheMetrics.getStats(),
  ]);

  return {
    requests,
    database,
    cache,
    queues,
    system,
  };
}

// Singleton collectors
export const collectors = {
  requests: new RequestMetrics(),
  database: new DatabaseMetrics(),
  queues: new QueueMetrics(),
  system: new SystemMetrics(),
  cache: new CacheMetrics(),
};

// Start periodic system metrics collection
let metricsInterval: NodeJS.Timeout | null = null;

export function startMetricsCollection(intervalMs: number = 15000): void {
  if (metricsInterval) {
    return;
  }

  metricsInterval = setInterval(async () => {
    try {
      await collectors.system.update();
    } catch (error) {
      console.error('Failed to collect system metrics:', error);
    }
  }, intervalMs);
}

export function stopMetricsCollection(): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

// Export metrics in Prometheus format
export async function exportPrometheusMetrics(): Promise<string> {
  const metrics = await getPerformanceMetrics();
  const lines: string[] = [];

  // Request metrics
  lines.push('# HELP http_requests_total Total HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  lines.push(`http_requests_total ${metrics.requests.total}`);
  lines.push(`http_requests_success_total ${metrics.requests.successful}`);
  lines.push(`http_requests_failed_total ${metrics.requests.failed}`);

  lines.push('# HELP http_request_duration_ms HTTP request duration');
  lines.push('# TYPE http_request_duration_ms histogram');
  lines.push(`http_request_duration_ms{quantile="0.5"} ${metrics.requests.latencyP50}`);
  lines.push(`http_request_duration_ms{quantile="0.95"} ${metrics.requests.latencyP95}`);
  lines.push(`http_request_duration_ms{quantile="0.99"} ${metrics.requests.latencyP99}`);

  // Database metrics
  lines.push('# HELP db_queries_total Total database queries');
  lines.push('# TYPE db_queries_total counter');
  lines.push(`db_queries_total ${metrics.database.queryCount}`);
  lines.push(`db_query_avg_duration_ms ${metrics.database.avgQueryTime}`);

  // Cache metrics
  lines.push('# HELP cache_hit_rate Cache hit rate');
  lines.push('# TYPE cache_hit_rate gauge');
  lines.push(`cache_hit_rate ${metrics.cache.hitRate}`);
  lines.push(`cache_memory_bytes ${metrics.cache.memoryUsage}`);
  lines.push(`cache_keys_total ${metrics.cache.keyCount}`);

  // Queue metrics
  lines.push('# HELP queue_jobs Queue job counts');
  lines.push('# TYPE queue_jobs gauge');
  lines.push(`queue_jobs_waiting ${metrics.queues.waiting}`);
  lines.push(`queue_jobs_active ${metrics.queues.active}`);
  lines.push(`queue_jobs_completed_total ${metrics.queues.completed}`);
  lines.push(`queue_jobs_failed_total ${metrics.queues.failed}`);

  // System metrics
  lines.push('# HELP process_metrics Process metrics');
  lines.push('# TYPE process_metrics gauge');
  lines.push(`process_memory_percent ${metrics.system.memoryUsage}`);
  lines.push(`process_uptime_seconds ${metrics.system.uptime}`);
  lines.push(`nodejs_eventloop_lag_ms ${metrics.system.eventLoopLag}`);

  return lines.join('\n');
}
