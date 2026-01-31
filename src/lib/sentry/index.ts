/**
 * Sentry Error Tracking Integration
 *
 * Provides centralized error tracking and monitoring for:
 * - Server-side errors (API routes, server actions)
 * - Client-side errors (React components)
 * - Queue job failures
 * - Email delivery issues
 */

import * as Sentry from '@sentry/nextjs'

// Error severity levels
export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

// Error context for better debugging
export interface ErrorContext {
  userId?: string
  organizationId?: string
  accountId?: string
  campaignId?: string
  leadId?: string
  jobId?: string
  action?: string
  component?: string
  metadata?: Record<string, unknown>
}

// Initialize Sentry (called once in instrumentation.ts)
export function initSentry() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

  if (!dsn) {
    console.warn('[Sentry] DSN not configured. Error tracking disabled.')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_VERSION || 'development',

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Error Sampling
    sampleRate: 1.0, // Capture 100% of errors

    // Ignore common non-actionable errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      /Loading chunk \d+ failed/,
      'Network request failed',
      'Failed to fetch',
      'AbortError',
      'User cancelled',
    ],

    // Breadcrumb configuration
    beforeBreadcrumb(breadcrumb) {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
        return null
      }
      return breadcrumb
    },

    // Process errors before sending
    beforeSend(event, hint) {
      // Don't send errors in development unless explicitly enabled
      if (process.env.NODE_ENV === 'development' && !process.env.SENTRY_DEBUG) {
        console.error('[Sentry] Development error:', hint.originalException)
        return null
      }

      // Add custom tags based on error type
      if (event.exception?.values?.[0]?.type === 'SMTPError') {
        event.tags = { ...event.tags, category: 'email' }
      }

      return event
    },
  })

  console.log('[Sentry] Initialized successfully')
}

/**
 * Capture an error with context
 */
export function captureError(
  error: Error | string,
  context?: ErrorContext,
  severity: ErrorSeverity = 'error'
): string {
  const err = typeof error === 'string' ? new Error(error) : error

  return Sentry.captureException(err, {
    level: severity,
    tags: {
      ...(context?.userId && { userId: context.userId }),
      ...(context?.organizationId && { organizationId: context.organizationId }),
      ...(context?.action && { action: context.action }),
      ...(context?.component && { component: context.component }),
    },
    extra: {
      ...(context?.accountId && { accountId: context.accountId }),
      ...(context?.campaignId && { campaignId: context.campaignId }),
      ...(context?.leadId && { leadId: context.leadId }),
      ...(context?.jobId && { jobId: context.jobId }),
      ...(context?.metadata && { metadata: context.metadata }),
    },
  })
}

/**
 * Capture a message (non-error event)
 */
export function captureMessage(
  message: string,
  severity: ErrorSeverity = 'info',
  context?: ErrorContext
): string {
  return Sentry.captureMessage(message, {
    level: severity,
    tags: {
      ...(context?.userId && { userId: context.userId }),
      ...(context?.organizationId && { organizationId: context.organizationId }),
      ...(context?.action && { action: context.action }),
    },
    extra: context?.metadata,
  })
}

/**
 * Set user context for error tracking
 */
export function setUser(user: {
  id: string
  email?: string
  organizationId?: string
}): void {
  Sentry.setUser({
    id: user.id,
    email: user.email,
  })

  if (user.organizationId) {
    Sentry.setTag('organizationId', user.organizationId)
  }
}

/**
 * Clear user context (on logout)
 */
export function clearUser(): void {
  Sentry.setUser(null)
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: ErrorSeverity = 'info'
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level,
  })
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  op: string
): ReturnType<typeof Sentry.startInactiveSpan> | undefined {
  return Sentry.startInactiveSpan({
    name,
    op,
    forceTransaction: true,
  })
}

/**
 * Wrap an async function with error tracking
 */
export function withSentry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: ErrorContext
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      captureError(error as Error, context)
      throw error
    }
  }) as T
}

/**
 * Track email delivery errors
 */
export function trackEmailError(
  error: Error,
  emailContext: {
    accountId: string
    to: string
    campaignId?: string
    leadId?: string
    errorType: 'send' | 'bounce' | 'complaint' | 'delivery'
  }
): void {
  captureError(error, {
    accountId: emailContext.accountId,
    campaignId: emailContext.campaignId,
    leadId: emailContext.leadId,
    action: `email.${emailContext.errorType}`,
    metadata: {
      to: emailContext.to,
      errorType: emailContext.errorType,
    },
  })

  Sentry.setTag('email.errorType', emailContext.errorType)
}

/**
 * Track queue job errors
 */
export function trackJobError(
  error: Error,
  jobContext: {
    queueName: string
    jobId: string
    jobName: string
    attempts: number
    organizationId?: string
  }
): void {
  captureError(error, {
    organizationId: jobContext.organizationId,
    jobId: jobContext.jobId,
    action: `queue.${jobContext.queueName}`,
    metadata: {
      jobName: jobContext.jobName,
      attempts: jobContext.attempts,
    },
  }, jobContext.attempts >= 3 ? 'error' : 'warning')

  Sentry.setTag('queue', jobContext.queueName)
}

/**
 * Track API errors
 */
export function trackAPIError(
  error: Error,
  apiContext: {
    method: string
    path: string
    statusCode: number
    userId?: string
    organizationId?: string
  }
): void {
  captureError(error, {
    userId: apiContext.userId,
    organizationId: apiContext.organizationId,
    action: `api.${apiContext.method}.${apiContext.path}`,
    metadata: {
      statusCode: apiContext.statusCode,
    },
  }, apiContext.statusCode >= 500 ? 'error' : 'warning')

  Sentry.setTag('api.path', apiContext.path)
  Sentry.setTag('api.method', apiContext.method)
  Sentry.setTag('api.statusCode', String(apiContext.statusCode))
}

/**
 * Flush pending events (useful before process exit)
 */
export async function flush(timeout: number = 2000): Promise<boolean> {
  return Sentry.flush(timeout)
}

// Export Sentry instance for advanced usage
export { Sentry }
