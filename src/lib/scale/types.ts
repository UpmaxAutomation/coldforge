// Scale & Performance Types

// Cache Types
export interface CacheConfig {
  defaultTtl: number;
  maxSize?: number;
  namespace?: string;
}

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
  expiresAt: number;
  tags?: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
  evictions: number;
}

// Job Queue Types
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

export interface JobOptions {
  priority?: JobPriority;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  jobId?: string;
  timeout?: number;
}

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  progress: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
  failedReason?: string;
  returnValue?: unknown;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

// Rate Limiting Types
export interface RateLimitConfig {
  points: number;
  duration: number;
  blockDuration?: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

// Connection Pool Types
export interface PoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis?: number;
  createTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  reapIntervalMillis?: number;
  createRetryIntervalMillis?: number;
}

export interface PoolStats {
  size: number;
  available: number;
  pending: number;
  borrowed: number;
  spareCapacity: number;
}

// Performance Monitoring Types
export interface MetricType {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  labels?: string[];
}

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: Date;
}

export interface PerformanceMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
  };
  database: {
    queryCount: number;
    avgQueryTime: number;
    connectionPoolSize: number;
    connectionPoolAvailable: number;
  };
  cache: {
    hitRate: number;
    memoryUsage: number;
    keyCount: number;
  };
  queues: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    processingRate: number;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
    eventLoopLag: number;
  };
}

// Load Balancer Types
export interface LoadBalancerConfig {
  algorithm: 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash';
  healthCheck: {
    path: string;
    interval: number;
    timeout: number;
    unhealthyThreshold: number;
  };
  servers: ServerConfig[];
}

export interface ServerConfig {
  id: string;
  host: string;
  port: number;
  weight?: number;
  maxConnections?: number;
  healthy?: boolean;
}

export interface ServerHealth {
  serverId: string;
  healthy: boolean;
  lastCheck: Date;
  responseTime?: number;
  consecutiveFailures: number;
}

// Database Sharding Types
export interface ShardConfig {
  shardCount: number;
  shardKey: string;
  shardFunction: 'hash' | 'range' | 'directory';
  connectionStrings: string[];
}

export interface ShardInfo {
  shardId: number;
  connectionString: string;
  rowCount?: number;
  sizeBytes?: number;
}

// CDN Types
export interface CDNConfig {
  provider: 'cloudflare' | 'aws-cloudfront' | 'fastly' | 'bunny';
  zoneId?: string;
  apiKey?: string;
  purgeUrl?: string;
}

export interface CDNPurgeRequest {
  type: 'all' | 'url' | 'prefix' | 'tag';
  urls?: string[];
  prefixes?: string[];
  tags?: string[];
}

export interface CDNStats {
  bandwidth: number;
  requests: number;
  cacheHitRatio: number;
  uniqueVisitors: number;
  topPaths: Array<{ path: string; requests: number }>;
}

// Circuit Breaker Types
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  nextRetry?: Date;
}

// Retry Types
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: Error) => boolean;
}

// Timeout Types
export interface TimeoutConfig {
  connection: number;
  read: number;
  write: number;
  idle: number;
}

// Bulk Operation Types
export interface BulkOperationConfig {
  batchSize: number;
  concurrency: number;
  retryFailedItems: boolean;
  continueOnError: boolean;
}

export interface BulkOperationResult<T = unknown> {
  successful: number;
  failed: number;
  total: number;
  errors: Array<{ item: T; error: string }>;
  duration: number;
}

// Feature Flags for Scale
export interface ScaleFeatureFlags {
  enableRedisCache: boolean;
  enableJobQueue: boolean;
  enableMetrics: boolean;
  enableSharding: boolean;
  enableCircuitBreaker: boolean;
  enableRateLimitingRedis: boolean;
}
