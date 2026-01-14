// Metrics Helper Functions for InstantScale
// Utility functions for easy metrics instrumentation

import { metrics } from './index'
import { METRICS, METRIC_LABELS } from './constants'

/**
 * Execute a function and record its duration as a histogram metric
 *
 * @example
 * ```ts
 * const result = await withMetrics('db_query_duration_ms', async () => {
 *   return await db.query(...)
 * })
 * ```
 */
export async function withMetrics<T>(
  metricName: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()

  try {
    const result = await fn()
    const duration = Date.now() - startTime
    metrics.recordHistogram(metricName, duration)
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    metrics.recordHistogram(metricName, duration)
    throw error
  }
}

/**
 * Execute a synchronous function and record its duration
 */
export function withMetricsSync<T>(metricName: string, fn: () => T): T {
  const startTime = Date.now()

  try {
    const result = fn()
    const duration = Date.now() - startTime
    metrics.recordHistogram(metricName, duration)
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    metrics.recordHistogram(metricName, duration)
    throw error
  }
}

/**
 * Create a timer that can be manually ended
 *
 * @example
 * ```ts
 * const timer = createTimer('operation_duration_ms')
 * try {
 *   await doSomething()
 *   timer.success()
 * } catch (error) {
 *   timer.failure()
 *   throw error
 * }
 * ```
 */
export function createTimer(metricName: string) {
  const startTime = Date.now()

  return {
    /**
     * End the timer and record duration
     */
    end(): number {
      const duration = Date.now() - startTime
      metrics.recordHistogram(metricName, duration)
      return duration
    },

    /**
     * End with success counter increment
     */
    success(counterName?: string, labels?: Record<string, string>): number {
      const duration = this.end()
      if (counterName) {
        metrics.increment(counterName, labels)
      }
      return duration
    },

    /**
     * End with failure counter increment
     */
    failure(counterName?: string, labels?: Record<string, string>): number {
      const duration = this.end()
      if (counterName) {
        metrics.increment(counterName, labels)
      }
      return duration
    },

    /**
     * Get elapsed time without recording
     */
    elapsed(): number {
      return Date.now() - startTime
    },
  }
}

// ============= Email Metrics Helpers =============

/**
 * Record email sent metrics
 */
export function recordEmailSent(
  duration: number,
  labels?: { mailboxId?: string; campaignId?: string }
): void {
  metrics.increment(METRICS.EMAILS_SENT_TOTAL, {
    ...(labels?.mailboxId && { [METRIC_LABELS.MAILBOX_ID]: labels.mailboxId }),
    ...(labels?.campaignId && { [METRIC_LABELS.CAMPAIGN_ID]: labels.campaignId }),
  })
  metrics.recordHistogram(METRICS.EMAIL_SEND_DURATION_MS, duration)
}

/**
 * Record email failure metrics
 */
export function recordEmailFailed(
  errorType: string,
  labels?: { mailboxId?: string; campaignId?: string }
): void {
  metrics.increment(METRICS.EMAILS_FAILED_TOTAL, {
    [METRIC_LABELS.ERROR_TYPE]: errorType,
    ...(labels?.mailboxId && { [METRIC_LABELS.MAILBOX_ID]: labels.mailboxId }),
    ...(labels?.campaignId && { [METRIC_LABELS.CAMPAIGN_ID]: labels.campaignId }),
  })
}

/**
 * Record email retry
 */
export function recordEmailRetry(attempt: number): void {
  metrics.increment(METRICS.EMAIL_RETRIES_TOTAL, {
    attempt: String(attempt),
  })
}

/**
 * Record email tracking events
 */
export function recordEmailOpen(campaignId?: string): void {
  metrics.increment(METRICS.EMAIL_OPENS_TOTAL, {
    ...(campaignId && { [METRIC_LABELS.CAMPAIGN_ID]: campaignId }),
  })
}

export function recordEmailClick(campaignId?: string): void {
  metrics.increment(METRICS.EMAIL_CLICKS_TOTAL, {
    ...(campaignId && { [METRIC_LABELS.CAMPAIGN_ID]: campaignId }),
  })
}

// ============= Campaign Metrics Helpers =============

/**
 * Record campaign created
 */
export function recordCampaignCreated(organizationId?: string): void {
  metrics.increment(METRICS.CAMPAIGNS_CREATED, {
    ...(organizationId && { [METRIC_LABELS.ORGANIZATION_ID]: organizationId }),
  })
}

/**
 * Record campaign started
 */
export function recordCampaignStarted(organizationId?: string): void {
  metrics.increment(METRICS.CAMPAIGNS_STARTED, {
    ...(organizationId && { [METRIC_LABELS.ORGANIZATION_ID]: organizationId }),
  })
  metrics.incrementGauge(METRICS.CAMPAIGNS_ACTIVE)
}

/**
 * Record campaign paused
 */
export function recordCampaignPaused(organizationId?: string): void {
  metrics.increment(METRICS.CAMPAIGNS_PAUSED, {
    ...(organizationId && { [METRIC_LABELS.ORGANIZATION_ID]: organizationId }),
  })
  metrics.decrementGauge(METRICS.CAMPAIGNS_ACTIVE)
}

/**
 * Record campaign completed
 */
export function recordCampaignCompleted(organizationId?: string): void {
  metrics.increment(METRICS.CAMPAIGNS_COMPLETED, {
    ...(organizationId && { [METRIC_LABELS.ORGANIZATION_ID]: organizationId }),
  })
  metrics.decrementGauge(METRICS.CAMPAIGNS_ACTIVE)
}

// ============= Auth Metrics Helpers =============

/**
 * Record successful login
 */
export function recordLoginSuccess(provider?: string): void {
  metrics.increment(METRICS.AUTH_LOGINS_TOTAL, {
    ...(provider && { [METRIC_LABELS.PROVIDER]: provider }),
  })
}

/**
 * Record failed login attempt
 */
export function recordLoginFailure(reason?: string): void {
  metrics.increment(METRICS.AUTH_FAILURES_TOTAL, {
    ...(reason && { [METRIC_LABELS.ERROR_TYPE]: reason }),
  })
}

/**
 * Record OAuth flow initiated
 */
export function recordOAuthInitiated(provider: string): void {
  metrics.increment(METRICS.AUTH_OAUTH_INITIATED, {
    [METRIC_LABELS.PROVIDER]: provider,
  })
}

/**
 * Record OAuth flow completed
 */
export function recordOAuthCompleted(provider: string): void {
  metrics.increment(METRICS.AUTH_OAUTH_COMPLETED, {
    [METRIC_LABELS.PROVIDER]: provider,
  })
}

// ============= Database Metrics Helpers =============

/**
 * Record database query duration
 */
export function recordDbQuery(duration: number, operation?: string): void {
  metrics.recordHistogram(METRICS.DB_QUERY_DURATION_MS, duration)

  // Track slow queries (> 1 second)
  if (duration > 1000) {
    metrics.increment(METRICS.DB_SLOW_QUERIES_TOTAL, {
      ...(operation && { [METRIC_LABELS.OPERATION]: operation }),
    })
  }
}

/**
 * Record database error
 */
export function recordDbError(errorType: string, operation?: string): void {
  metrics.increment(METRICS.DB_ERRORS_TOTAL, {
    [METRIC_LABELS.ERROR_TYPE]: errorType,
    ...(operation && { [METRIC_LABELS.OPERATION]: operation }),
  })
}

/**
 * Execute a database operation with metrics
 */
export async function withDbMetrics<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()

  try {
    const result = await fn()
    const duration = Date.now() - startTime
    recordDbQuery(duration, operation)
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    recordDbQuery(duration, operation)
    recordDbError(
      error instanceof Error ? error.name : 'UnknownError',
      operation
    )
    throw error
  }
}

// ============= Cache Metrics Helpers =============

/**
 * Record cache hit
 */
export function recordCacheHit(cacheName?: string): void {
  metrics.increment(METRICS.CACHE_HITS_TOTAL, {
    ...(cacheName && { cache: cacheName }),
  })
}

/**
 * Record cache miss
 */
export function recordCacheMiss(cacheName?: string): void {
  metrics.increment(METRICS.CACHE_MISSES_TOTAL, {
    ...(cacheName && { cache: cacheName }),
  })
}

// ============= Circuit Breaker Metrics Helpers =============

/**
 * Record circuit breaker trip
 */
export function recordCircuitBreakerTrip(name: string): void {
  metrics.increment(METRICS.CIRCUIT_BREAKER_TRIPS, {
    name,
  })
}

/**
 * Record circuit breaker reset
 */
export function recordCircuitBreakerReset(name: string): void {
  metrics.increment(METRICS.CIRCUIT_BREAKER_RESETS, {
    name,
  })
}

// ============= Webhook Metrics Helpers =============

/**
 * Record webhook received
 */
export function recordWebhookReceived(source: string): void {
  metrics.increment(METRICS.WEBHOOKS_RECEIVED_TOTAL, {
    source,
  })
}

/**
 * Record webhook error
 */
export function recordWebhookError(source: string, errorType: string): void {
  metrics.increment(METRICS.WEBHOOKS_ERRORS_TOTAL, {
    source,
    [METRIC_LABELS.ERROR_TYPE]: errorType,
  })
}

/**
 * Record webhook processing duration
 */
export function recordWebhookDuration(duration: number, _source: string): void {
  metrics.recordHistogram(METRICS.WEBHOOK_PROCESSING_DURATION_MS, duration)
}
