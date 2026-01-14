// Metrics API Endpoint for InstantScale
// Exports metrics in Prometheus format or JSON

import { NextRequest, NextResponse } from 'next/server'
import { metrics } from '@/lib/metrics'

// Content types for different formats
const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8'
const JSON_CONTENT_TYPE = 'application/json'

/**
 * GET /api/metrics
 *
 * Returns application metrics.
 *
 * Formats:
 * - Prometheus text format (default)
 * - JSON format (if Accept header includes application/json)
 *
 * Security Note: In production, this endpoint should be protected
 * and only accessible from internal monitoring systems.
 *
 * @example
 * ```bash
 * # Prometheus format (default)
 * curl http://localhost:3000/api/metrics
 *
 * # JSON format
 * curl -H "Accept: application/json" http://localhost:3000/api/metrics
 * ```
 */
export async function GET(request: NextRequest) {
  // Check if caller wants JSON format
  const acceptHeader = request.headers.get('accept') || ''
  const wantsJson = acceptHeader.includes('application/json')

  // Optional: Add basic auth or IP whitelist check for production
  // const authHeader = request.headers.get('authorization')
  // if (process.env.NODE_ENV === 'production' && !isValidMetricsAuth(authHeader)) {
  //   return new NextResponse('Unauthorized', { status: 401 })
  // }

  if (wantsJson) {
    // Return JSON format
    const snapshot = metrics.getAll()

    return NextResponse.json(snapshot, {
      headers: {
        'Content-Type': JSON_CONTENT_TYPE,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  }

  // Return Prometheus format (default)
  const prometheusOutput = metrics.toPrometheusFormat()

  return new NextResponse(prometheusOutput, {
    headers: {
      'Content-Type': PROMETHEUS_CONTENT_TYPE,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

/**
 * HEAD /api/metrics
 *
 * Health check for the metrics endpoint.
 */
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': PROMETHEUS_CONTENT_TYPE,
    },
  })
}
