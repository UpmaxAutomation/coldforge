import { NextResponse } from 'next/server'
import { checkLive } from '@/lib/health'

/**
 * GET /api/health/live
 *
 * Kubernetes liveness probe endpoint.
 * Simple check that the application is running.
 *
 * Always returns 200 if the endpoint is reachable.
 * This verifies the application process is alive and responsive.
 *
 * HTTP Status Codes:
 *   - 200: Application is live
 *
 * Usage in Kubernetes:
 * ```yaml
 * livenessProbe:
 *   httpGet:
 *     path: /api/health/live
 *     port: 3000
 *   initialDelaySeconds: 10
 *   periodSeconds: 15
 *   failureThreshold: 3
 * ```
 */
export async function GET() {
  const result = checkLive()

  return NextResponse.json(
    {
      status: 'live',
      timestamp: new Date().toISOString(),
      uptime: result.uptime,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  )
}
