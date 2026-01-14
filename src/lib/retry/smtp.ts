/**
 * SMTP-specific retry wrapper with enhanced error handling
 * for email sending operations
 */

import { withRetry, type RetryConfig } from '.'

export interface SmtpRetryResult<T> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
  attempts: number
  totalTime: number
}

export interface SmtpRetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number
  /** Callback invoked before each retry */
  onRetry?: (error: Error, attempt: number, delay: number) => void
  /** Custom retryable error patterns */
  retryableErrors?: string[]
}

const SMTP_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    // Connection errors
    'econnreset',
    'etimedout',
    'econnrefused',
    'enotfound',
    'socket hang up',
    'connection',
    // SMTP temporary failures (4xx)
    '421', // Service not available, closing transmission channel
    '450', // Requested mail action not taken: mailbox unavailable
    '451', // Requested action aborted: local error in processing
    '452', // Requested action not taken: insufficient system storage
    // Generic transient patterns
    'temporary',
    'try again',
    'rate limit',
    'too many',
    'greylist',
  ],
}

/**
 * Wraps an SMTP sending function with retry logic
 * Returns a result object with success status, data, and attempt count
 */
export async function sendWithRetry<T>(
  sendFn: () => Promise<T>,
  options: SmtpRetryOptions = {}
): Promise<SmtpRetryResult<T>> {
  const startTime = Date.now()
  let attempts = 0

  const config: Partial<RetryConfig> = {
    ...SMTP_RETRY_CONFIG,
    maxRetries: options.maxRetries ?? SMTP_RETRY_CONFIG.maxRetries,
    retryableErrors: options.retryableErrors ?? SMTP_RETRY_CONFIG.retryableErrors,
    onRetry: (error, attempt, delay) => {
      attempts = attempt
      options.onRetry?.(error, attempt, delay)
    },
  }

  try {
    const data = await withRetry(
      async () => {
        attempts++
        return await sendFn()
      },
      config
    )

    return {
      success: true,
      data,
      attempts,
      totalTime: Date.now() - startTime,
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    return {
      success: false,
      error: err.message,
      errorCode: extractSmtpErrorCode(err.message),
      attempts,
      totalTime: Date.now() - startTime,
    }
  }
}

/**
 * Extracts SMTP error code from error message
 */
function extractSmtpErrorCode(message: string): string | undefined {
  // Match 3-digit SMTP codes
  const match = message.match(/\b([45]\d{2})\b/)
  return match ? match[1] : undefined
}

/**
 * Classifies SMTP errors into categories for better handling
 */
export function classifySmtpError(error: Error): SmtpErrorCategory {
  const message = error.message.toLowerCase()

  // Permanent failures (5xx) - don't retry
  if (message.includes('550') || message.includes('551') ||
      message.includes('552') || message.includes('553') ||
      message.includes('554') || message.includes('555')) {
    if (message.includes('user') || message.includes('mailbox') ||
        message.includes('recipient')) {
      return 'invalid_recipient'
    }
    if (message.includes('spam') || message.includes('reject') ||
        message.includes('block')) {
      return 'rejected'
    }
    return 'permanent_failure'
  }

  // Connection issues
  if (message.includes('econnreset') || message.includes('etimedout') ||
      message.includes('econnrefused') || message.includes('socket')) {
    return 'connection_error'
  }

  // Rate limiting
  if (message.includes('rate') || message.includes('too many') ||
      message.includes('throttl') || message.includes('429')) {
    return 'rate_limited'
  }

  // Graylisting
  if (message.includes('greylist') || message.includes('graylist') ||
      message.includes('try again later')) {
    return 'greylisted'
  }

  // Temporary failures
  if (message.includes('421') || message.includes('450') ||
      message.includes('451') || message.includes('452')) {
    return 'temporary_failure'
  }

  // Authentication issues
  if (message.includes('auth') || message.includes('credential') ||
      message.includes('535')) {
    return 'authentication_error'
  }

  return 'unknown'
}

export type SmtpErrorCategory =
  | 'connection_error'
  | 'authentication_error'
  | 'rate_limited'
  | 'greylisted'
  | 'invalid_recipient'
  | 'rejected'
  | 'temporary_failure'
  | 'permanent_failure'
  | 'unknown'

/**
 * Determines if a specific SMTP error should be retried
 * More granular than the default retry logic
 */
export function shouldRetrySmtpError(error: Error): boolean {
  const category = classifySmtpError(error)

  switch (category) {
    case 'connection_error':
    case 'rate_limited':
    case 'greylisted':
    case 'temporary_failure':
      return true
    case 'authentication_error':
    case 'invalid_recipient':
    case 'rejected':
    case 'permanent_failure':
      return false
    case 'unknown':
      // For unknown errors, check the generic patterns
      return true
  }
}

/**
 * Gets recommended retry delay based on error type
 */
export function getSmtpRetryDelay(
  error: Error,
  attempt: number,
  baseDelay: number = 2000
): number {
  const category = classifySmtpError(error)

  switch (category) {
    case 'rate_limited':
      // Longer delays for rate limiting
      return Math.min(baseDelay * Math.pow(3, attempt), 60000)
    case 'greylisted':
      // Graylisting typically requires 5-15 minute delays
      return Math.min(5 * 60 * 1000, 15 * 60 * 1000) // 5-15 minutes
    case 'connection_error':
      // Quick retries for connection issues
      return Math.min(baseDelay * Math.pow(2, attempt - 1), 10000)
    default:
      // Standard exponential backoff
      return Math.min(baseDelay * Math.pow(2, attempt - 1), 30000)
  }
}

/**
 * Creates a retry-enabled SMTP sender with logging
 */
export function createRetrySender<T>(
  sender: () => Promise<T>,
  logger?: {
    info: (msg: string, data?: Record<string, unknown>) => void
    warn: (msg: string, data?: Record<string, unknown>) => void
    error: (msg: string, data?: Record<string, unknown>) => void
  }
): () => Promise<SmtpRetryResult<T>> {
  return () =>
    sendWithRetry(sender, {
      onRetry: (error, attempt, delay) => {
        const category = classifySmtpError(error)
        logger?.warn('SMTP send retry', {
          attempt,
          delay,
          error: error.message,
          category,
        })
      },
    })
}
