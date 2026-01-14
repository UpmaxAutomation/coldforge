/**
 * Health check utilities for comprehensive system monitoring.
 * Provides checks for database, cache, circuit breakers, rate limiters, and system metrics.
 */

import { createClient } from '@/lib/supabase/server'
import { getAllCircuitStats, getCircuitBreakerSummary } from '@/lib/circuit-breaker/services'
import { CircuitState } from '@/lib/circuit-breaker'
import { cache } from '@/lib/cache'

// Track server start time for uptime calculation
const serverStartTime = Date.now()

// Types for health check responses
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface DatabaseHealth {
  status: 'pass' | 'fail'
  latencyMs: number
  error?: string
}

export interface CircuitBreakerHealth {
  name: string
  state: CircuitState
  failures: number
  successes: number
  lastFailure: number
  nextRetry: number
}

export interface CircuitBreakersHealth {
  summary: {
    healthy: string[]
    degraded: string[]
    unhealthy: string[]
    total: number
  }
  services: Record<string, { state: CircuitState; failures: number }>
}

export interface CacheHealth {
  entries: number
  memoryMb: number
  keys: string[]
}

export interface MemoryHealth {
  heapUsedMb: number
  heapTotalMb: number
  percentUsed: number
  rssMb: number
}

export interface SystemHealth {
  uptime: number
  memory: MemoryHealth
  nodeVersion: string
  platform: string
  pid: number
}

export interface HealthCheckResult {
  status: HealthStatus
  timestamp: string
  version: string
  uptime: number
  checks: {
    database: DatabaseHealth
    circuitBreakers: CircuitBreakersHealth
    cache: CacheHealth
    system: SystemHealth
  }
}

/**
 * Check database connectivity and latency.
 */
export async function checkDatabase(): Promise<DatabaseHealth> {
  const startTime = Date.now()

  try {
    const supabase = await createClient()

    // Use a simple query to test connectivity
    // Using raw query to minimize overhead
    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)

    const latencyMs = Date.now() - startTime

    if (error) {
      return {
        status: 'fail',
        latencyMs,
        error: error.message,
      }
    }

    return {
      status: 'pass',
      latencyMs,
    }
  } catch (err) {
    return {
      status: 'fail',
      latencyMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : 'Unknown database error',
    }
  }
}

/**
 * Check all circuit breakers status.
 */
export function checkCircuitBreakers(): CircuitBreakersHealth {
  const summary = getCircuitBreakerSummary()
  const stats = getAllCircuitStats()

  const services: Record<string, { state: CircuitState; failures: number }> = {}

  for (const stat of stats) {
    services[stat.service] = {
      state: stat.state,
      failures: stat.failureCount,
    }
  }

  return {
    summary,
    services,
  }
}

/**
 * Check cache statistics.
 */
export function checkCache(): CacheHealth {
  const stats = cache.stats()

  // Estimate memory usage (rough approximation)
  // Each entry is approximately 100 bytes for key + overhead + data size varies
  // This is a rough estimate - in production you'd want more precise measurements
  const estimatedBytesPerEntry = 500 // Conservative estimate including data
  const estimatedMemoryBytes = stats.size * estimatedBytesPerEntry
  const memoryMb = Number((estimatedMemoryBytes / (1024 * 1024)).toFixed(2))

  return {
    entries: stats.size,
    memoryMb,
    keys: stats.keys.slice(0, 20), // Limit to first 20 keys for readability
  }
}

/**
 * Check system metrics including memory and uptime.
 */
export function checkSystem(): SystemHealth {
  const memoryUsage = process.memoryUsage()
  const heapUsedMb = Number((memoryUsage.heapUsed / (1024 * 1024)).toFixed(2))
  const heapTotalMb = Number((memoryUsage.heapTotal / (1024 * 1024)).toFixed(2))
  const rssMb = Number((memoryUsage.rss / (1024 * 1024)).toFixed(2))
  const percentUsed = Number(((heapUsedMb / heapTotalMb) * 100).toFixed(1))

  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000)

  return {
    uptime: uptimeSeconds,
    memory: {
      heapUsedMb,
      heapTotalMb,
      percentUsed,
      rssMb,
    },
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
  }
}

/**
 * Calculate overall health status based on all checks.
 */
function calculateStatus(
  database: DatabaseHealth,
  circuitBreakers: CircuitBreakersHealth
): HealthStatus {
  // Unhealthy if database is down
  if (database.status === 'fail') {
    return 'unhealthy'
  }

  // Unhealthy if critical circuit breakers are open
  const criticalServices = ['supabase']
  const hasUnhealthyCritical = circuitBreakers.summary.unhealthy.some(
    service => criticalServices.includes(service)
  )

  if (hasUnhealthyCritical) {
    return 'unhealthy'
  }

  // Degraded if any circuit breakers are open or half-open
  if (
    circuitBreakers.summary.unhealthy.length > 0 ||
    circuitBreakers.summary.degraded.length > 0
  ) {
    return 'degraded'
  }

  // Degraded if database latency is high (>1000ms)
  if (database.latencyMs > 1000) {
    return 'degraded'
  }

  return 'healthy'
}

/**
 * Run all health checks and return comprehensive result.
 */
export async function runHealthChecks(): Promise<HealthCheckResult> {
  // Run checks in parallel where possible
  const [database] = await Promise.all([
    checkDatabase(),
  ])

  const circuitBreakers = checkCircuitBreakers()
  const cacheHealth = checkCache()
  const system = checkSystem()

  const status = calculateStatus(database, circuitBreakers)

  return {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: system.uptime,
    checks: {
      database,
      circuitBreakers,
      cache: cacheHealth,
      system,
    },
  }
}

/**
 * Simple readiness check - only checks if database is reachable.
 * Used for Kubernetes readiness probes.
 */
export async function checkReady(): Promise<{ ready: boolean; error?: string }> {
  try {
    const database = await checkDatabase()
    return {
      ready: database.status === 'pass',
      error: database.error,
    }
  } catch (err) {
    return {
      ready: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Simple liveness check - verifies the application is running.
 * Used for Kubernetes liveness probes.
 */
export function checkLive(): { live: boolean; uptime: number } {
  return {
    live: true,
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
  }
}

/**
 * Get server start time.
 */
export function getServerStartTime(): number {
  return serverStartTime
}
