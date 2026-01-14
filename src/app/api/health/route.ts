import { NextResponse } from 'next/server'
import { runHealthChecks } from '@/lib/health'

/**
 * GET /api/health
 *
 * Comprehensive health check endpoint with dependency checks.
 * Returns detailed status of database, circuit breakers, cache, and system metrics.
 *
 * Query params:
 *   - detailed=true: Include all circuit breaker details
 *
 * Response format:
 * {
 *   status: 'healthy' | 'degraded' | 'unhealthy',
 *   timestamp: string,
 *   version: string,
 *   uptime: number,
 *   checks: {
 *     database: { status, latencyMs },
 *     circuitBreakers: { summary, services },
 *     cache: { entries, memoryMb },
 *     system: { uptime, memory, nodeVersion }
 *   }
 * }
 *
 * HTTP Status Codes:
 *   - 200: healthy or degraded
 *   - 503: unhealthy (critical failure)
 */
export async function GET() {
  const result = await runHealthChecks()

  // Return appropriate HTTP status code based on health
  const httpStatus = result.status === 'unhealthy' ? 503 : 200

  return NextResponse.json(result, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Health-Status': result.status,
    },
  })
}
