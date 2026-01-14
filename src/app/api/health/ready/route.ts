import { NextResponse } from 'next/server'
import { checkReady } from '@/lib/health'

/**
 * GET /api/health/ready
 *
 * Kubernetes readiness probe endpoint.
 * Checks if the application is ready to receive traffic.
 *
 * Primary check: Database connectivity
 *
 * HTTP Status Codes:
 *   - 200: Ready to receive traffic
 *   - 503: Not ready (database unavailable)
 *
 * Usage in Kubernetes:
 * ```yaml
 * readinessProbe:
 *   httpGet:
 *     path: /api/health/ready
 *     port: 3000
 *   initialDelaySeconds: 5
 *   periodSeconds: 10
 *   failureThreshold: 3
 * ```
 */
export async function GET() {
  const result = await checkReady()

  if (result.ready) {
    return NextResponse.json(
      {
        status: 'ready',
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  }

  return NextResponse.json(
    {
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: result.error,
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Retry-After': '5',
      },
    }
  )
}
