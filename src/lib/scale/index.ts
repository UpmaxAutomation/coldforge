// Scale & Performance Module
// Comprehensive scaling infrastructure for high-performance applications

// Types
export type {
  // Cache types
  CacheConfig,
  CacheEntry,
  CacheStats,
  // Queue types
  JobStatus,
  JobPriority,
  JobOptions,
  Job,
  QueueStats,
  // Rate limiting types
  RateLimitConfig,
  RateLimitResult,
  // Pool types
  PoolConfig,
  PoolStats,
  // Metrics types
  MetricType,
  MetricValue,
  PerformanceMetrics,
  // Load balancer types
  LoadBalancerConfig,
  ServerConfig,
  ServerHealth,
  // Sharding types
  ShardConfig,
  ShardInfo,
  // CDN types
  CDNConfig,
  CDNPurgeRequest,
  CDNStats,
  // Circuit breaker types
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  // Retry types
  RetryConfig,
  TimeoutConfig,
  // Bulk operation types
  BulkOperationConfig,
  BulkOperationResult,
  // Feature flags
  ScaleFeatureFlags,
} from './types';

// Cache
export {
  getRedisClient,
  closeRedis,
  Cache,
  getCache,
  caches,
  cached,
  cacheKeys,
} from './cache';

// Queue
export { Queue, getQueue, queues_defined } from './queue';

// Rate Limiting
export {
  RateLimiter,
  rateLimiters,
  IPRateLimiter,
  ConcurrencyLimiter,
  DistributedRateLimiter,
  checkRateLimit,
} from './rate-limit';

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  circuitBreakers,
  serviceBreakers,
  retryWithBackoff,
  Bulkhead,
  BulkheadFullError,
  getBulkhead,
  bulkheads,
  withFallback,
  withTimeout,
  resilient,
} from './circuit-breaker';

// Metrics
export {
  MetricsCollector,
  RequestMetrics,
  DatabaseMetrics,
  QueueMetrics,
  SystemMetrics,
  CacheMetrics,
  getPerformanceMetrics,
  collectors,
  startMetricsCollection,
  stopMetricsCollection,
  exportPrometheusMetrics,
} from './metrics';

// Database
export {
  QueryOptimizer,
  ConnectionPoolManager,
  ShardManager,
  BulkOperations,
  ReadReplicaManager,
  QueryCache,
  SlowQueryDetector,
  checkDatabaseHealth,
  queryOptimizer,
  connectionPool,
  queryCache,
  slowQueryDetector,
} from './database';

// CDN
export {
  CDNManager,
  generateCacheHeaders,
  cachePolicies,
  EdgeCache,
  createCDN,
  getDefaultCDN,
} from './cdn';

// Load Balancer
export {
  LoadBalancer,
  ServiceRegistry,
  createHealthCheckHandler,
  livenessProbe,
  readinessProbe,
  markStartupComplete,
  startupProbe,
  createLoadBalancer,
  serviceRegistry,
  ConnectionDrainer,
  gracefulShutdown,
} from './load-balancer';

// Utility functions
export { initializeScale, shutdownScale, getScaleHealth } from './lifecycle';

// Re-export commonly used utilities
export {
  // Quick cache access
  getCache as cache,
  // Quick queue access
  getQueue as queue,
  // Quick rate limiter access
  rateLimiters as limits,
};
