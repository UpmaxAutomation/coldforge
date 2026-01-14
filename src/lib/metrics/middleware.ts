// HTTP Request Metrics Middleware for InstantScale
// Tracks request count, duration, and status codes

import { NextRequest, NextResponse } from 'next/server'
import { metrics } from './index'
import { METRICS, METRIC_LABELS } from './constants'

/**
 * Track HTTP request metrics
 * Use this as a wrapper around your API route handlers
 *
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   return trackRequestMetrics(request, async () => {
 *     // Your handler logic
 *     return NextResponse.json({ data: 'example' })
 *   })
 * }
 * ```
 */
export async function trackRequestMetrics(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const startTime = Date.now()
  const method = request.method
  const path = getPathPattern(request.nextUrl.pathname)

  // Increment active requests
  metrics.incrementGauge(METRICS.HTTP_ACTIVE_REQUESTS)

  try {
    const response = await handler()
    const duration = Date.now() - startTime
    const status = response.status
    const statusCategory = getStatusCategory(status)

    // Record request metrics
    metrics.increment(METRICS.HTTP_REQUESTS_TOTAL, {
      [METRIC_LABELS.METHOD]: method,
      [METRIC_LABELS.PATH]: path,
      [METRIC_LABELS.STATUS]: statusCategory,
      [METRIC_LABELS.STATUS_CODE]: String(status),
    })

    // Record duration
    metrics.recordHistogram(METRICS.HTTP_REQUEST_DURATION_MS, duration)

    // Track errors
    if (status >= 400) {
      metrics.increment(METRICS.HTTP_ERRORS_TOTAL, {
        [METRIC_LABELS.METHOD]: method,
        [METRIC_LABELS.PATH]: path,
        [METRIC_LABELS.STATUS_CODE]: String(status),
      })
    }

    return response
  } catch (error) {
    const duration = Date.now() - startTime

    // Record as server error
    metrics.increment(METRICS.HTTP_REQUESTS_TOTAL, {
      [METRIC_LABELS.METHOD]: method,
      [METRIC_LABELS.PATH]: path,
      [METRIC_LABELS.STATUS]: '5xx',
      [METRIC_LABELS.STATUS_CODE]: '500',
    })

    metrics.increment(METRICS.HTTP_ERRORS_TOTAL, {
      [METRIC_LABELS.METHOD]: method,
      [METRIC_LABELS.PATH]: path,
      [METRIC_LABELS.STATUS_CODE]: '500',
      [METRIC_LABELS.ERROR_TYPE]: error instanceof Error ? error.name : 'UnknownError',
    })

    metrics.recordHistogram(METRICS.HTTP_REQUEST_DURATION_MS, duration)

    throw error
  } finally {
    // Decrement active requests
    metrics.decrementGauge(METRICS.HTTP_ACTIVE_REQUESTS)
  }
}

/**
 * Get status category (2xx, 3xx, 4xx, 5xx)
 */
function getStatusCategory(status: number): string {
  if (status >= 500) return '5xx'
  if (status >= 400) return '4xx'
  if (status >= 300) return '3xx'
  if (status >= 200) return '2xx'
  return '1xx'
}

/**
 * Normalize path to reduce cardinality
 * Replaces UUIDs, numbers, and other dynamic segments with placeholders
 */
function getPathPattern(path: string): string {
  return path
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    // Replace long alphanumeric strings (likely IDs)
    .replace(/\/[a-zA-Z0-9]{20,}(?=\/|$)/g, '/:id')
}

/**
 * Middleware-style metrics wrapper
 * Automatically tracks all API requests
 */
export function withMetricsMiddleware(
  handler: (request: NextRequest) => Promise<NextResponse>
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    return trackRequestMetrics(request, () => handler(request))
  }
}

/**
 * Track rate limit metrics
 */
export function trackRateLimitHit(
  path: string,
  _identifier: string,
  rejected: boolean
): void {
  metrics.increment(METRICS.RATE_LIMIT_HITS, {
    [METRIC_LABELS.PATH]: getPathPattern(path),
  })

  if (rejected) {
    metrics.increment(METRICS.RATE_LIMIT_REJECTIONS, {
      [METRIC_LABELS.PATH]: getPathPattern(path),
    })
  }
}

/**
 * Create a request timer for manual timing
 */
export function createRequestTimer() {
  const startTime = Date.now()

  return {
    /**
     * End the timer and record the duration
     */
    end(): number {
      return Date.now() - startTime
    },

    /**
     * End and record to a histogram
     */
    endAndRecord(metricName: string): number {
      const duration = Date.now() - startTime
      metrics.recordHistogram(metricName, duration)
      return duration
    },
  }
}
