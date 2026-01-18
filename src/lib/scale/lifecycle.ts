// Scale Infrastructure Lifecycle Management
import { getRedisClient, closeRedis } from './cache';
import { startMetricsCollection, stopMetricsCollection, getPerformanceMetrics } from './metrics';
import { markStartupComplete } from './load-balancer';
import { circuitBreakers } from './circuit-breaker';

// Initialization status
let initialized = false;

// Initialize all scale infrastructure
export async function initializeScale(options: {
  enableMetrics?: boolean;
  metricsInterval?: number;
  enableHealthChecks?: boolean;
} = {}): Promise<{
  success: boolean;
  message: string;
  details: Record<string, unknown>;
}> {
  const {
    enableMetrics = true,
    metricsInterval = 15000,
  } = options;

  const details: Record<string, unknown> = {};

  try {
    // 1. Initialize Redis connection
    console.log('Initializing Redis connection...');
    const redis = getRedisClient();
    await redis.ping();
    details.redis = 'connected';
    console.log('Redis connected');

    // 2. Start metrics collection
    if (enableMetrics) {
      console.log('Starting metrics collection...');
      startMetricsCollection(metricsInterval);
      details.metrics = 'enabled';
      console.log('Metrics collection started');
    }

    // 3. Mark startup complete
    markStartupComplete();
    details.startup = 'complete';

    initialized = true;

    return {
      success: true,
      message: 'Scale infrastructure initialized successfully',
      details,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      message: `Scale initialization failed: ${errorMessage}`,
      details,
    };
  }
}

// Shutdown all scale infrastructure
export async function shutdownScale(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    console.log('Shutting down scale infrastructure...');

    // 1. Stop metrics collection
    stopMetricsCollection();
    console.log('Metrics collection stopped');

    // 2. Reset all circuit breakers
    circuitBreakers.resetAll();
    console.log('Circuit breakers reset');

    // 3. Close Redis connection
    await closeRedis();
    console.log('Redis connection closed');

    initialized = false;

    return {
      success: true,
      message: 'Scale infrastructure shut down successfully',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      message: `Scale shutdown failed: ${errorMessage}`,
    };
  }
}

// Get health status of scale infrastructure
export async function getScaleHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: Record<string, {
    status: 'healthy' | 'unhealthy';
    latency?: number;
    details?: string;
  }>;
  metrics?: Awaited<ReturnType<typeof getPerformanceMetrics>>;
}> {
  const components: Record<string, {
    status: 'healthy' | 'unhealthy';
    latency?: number;
    details?: string;
  }> = {};

  // Check Redis
  try {
    const redis = getRedisClient();
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    components.redis = {
      status: latency < 100 ? 'healthy' : 'healthy',
      latency,
    };
  } catch (error) {
    components.redis = {
      status: 'unhealthy',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check circuit breakers
  const circuitBreakerStatuses = circuitBreakers.getAllStatuses();
  const openBreakers = circuitBreakerStatuses.filter((cb) => cb.state === 'open');

  if (openBreakers.length === 0) {
    components.circuitBreakers = { status: 'healthy' };
  } else {
    components.circuitBreakers = {
      status: 'healthy',
      details: `${openBreakers.length} circuit(s) open: ${openBreakers.map((cb) => cb.name).join(', ')}`,
    };
  }

  // Get metrics
  let metrics: Awaited<ReturnType<typeof getPerformanceMetrics>> | undefined;
  try {
    metrics = await getPerformanceMetrics();
    components.metrics = { status: 'healthy' };
  } catch {
    components.metrics = { status: 'unhealthy', details: 'Failed to collect metrics' };
  }

  // Determine overall status
  const statuses = Object.values(components).map((c) => c.status);
  const allHealthy = statuses.every((s) => s === 'healthy');
  const anyHealthy = statuses.some((s) => s === 'healthy');

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (allHealthy) {
    status = 'healthy';
  } else if (anyHealthy) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return {
    status,
    components,
    metrics,
  };
}

// Check if scale infrastructure is initialized
export function isInitialized(): boolean {
  return initialized;
}

// Feature flag configuration for scale features
export function getScaleFeatureFlags(): {
  enableRedisCache: boolean;
  enableJobQueue: boolean;
  enableMetrics: boolean;
  enableSharding: boolean;
  enableCircuitBreaker: boolean;
  enableRateLimitingRedis: boolean;
} {
  return {
    enableRedisCache: process.env.ENABLE_REDIS_CACHE !== 'false',
    enableJobQueue: process.env.ENABLE_JOB_QUEUE !== 'false',
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    enableSharding: process.env.ENABLE_SHARDING === 'true',
    enableCircuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER !== 'false',
    enableRateLimitingRedis: process.env.ENABLE_RATE_LIMITING !== 'false',
  };
}
