/**
 * Retry logic for transient failures
 * Implements exponential backoff with jitter for external service calls
 */

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number
  /** Multiplier for exponential backoff */
  backoffMultiplier: number
  /** Optional list of error patterns that are retryable */
  retryableErrors?: string[]
  /** Optional callback invoked before each retry */
  onRetry?: (error: Error, attempt: number, delay: number) => void
  /** Add jitter to prevent thundering herd */
  jitter?: boolean
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
}

/**
 * Wraps an async function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const opts = { ...DEFAULT_CONFIG, ...config }
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if error is retryable
      if (!isRetryableError(lastError, opts.retryableErrors)) {
        throw lastError
      }

      // Last attempt - don't retry
      if (attempt > opts.maxRetries) {
        throw lastError
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      )

      // Add jitter (up to 25% variance)
      if (opts.jitter) {
        const jitterRange = delay * 0.25
        delay = delay + Math.random() * jitterRange - jitterRange / 2
      }

      delay = Math.round(delay)

      // Optional callback
      opts.onRetry?.(lastError, attempt, delay)

      // Wait before retry
      await sleep(delay)
    }
  }

  throw lastError
}

/**
 * Checks if an error is retryable based on common transient failure patterns
 */
export function isRetryableError(
  error: Error,
  customRetryableErrors?: string[]
): boolean {
  const message = error.message.toLowerCase()

  // Network errors
  if (message.includes('econnreset')) return true
  if (message.includes('etimedout')) return true
  if (message.includes('econnrefused')) return true
  if (message.includes('enotfound')) return true
  if (message.includes('socket hang up')) return true
  if (message.includes('network')) return true
  if (message.includes('connection')) return true

  // Rate limiting
  if (message.includes('rate limit')) return true
  if (message.includes('too many requests')) return true
  if (message.includes('throttl')) return true
  if (message.includes('429')) return true

  // Temporary service errors
  if (message.includes('503')) return true
  if (message.includes('502')) return true
  if (message.includes('504')) return true
  if (message.includes('temporarily unavailable')) return true
  if (message.includes('service unavailable')) return true
  if (message.includes('try again')) return true
  if (message.includes('temporary')) return true

  // SMTP-specific transient errors
  if (message.includes('421')) return true // Service not available
  if (message.includes('450')) return true // Requested action not taken
  if (message.includes('451')) return true // Requested action aborted
  if (message.includes('452')) return true // Insufficient storage

  // Custom retryable errors
  if (customRetryableErrors) {
    return customRetryableErrors.some((e) =>
      message.includes(e.toLowerCase())
    )
  }

  return false
}

/**
 * Determines if an HTTP status code is retryable
 */
export function isRetryableStatusCode(status: number): boolean {
  // Too Many Requests
  if (status === 429) return true
  // Server errors that might be transient
  if (status === 502) return true // Bad Gateway
  if (status === 503) return true // Service Unavailable
  if (status === 504) return true // Gateway Timeout
  if (status === 520) return true // Cloudflare: Unknown Error
  if (status === 521) return true // Cloudflare: Web Server Is Down
  if (status === 522) return true // Cloudflare: Connection Timed Out
  if (status === 523) return true // Cloudflare: Origin Is Unreachable
  if (status === 524) return true // Cloudflare: A Timeout Occurred

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Pre-configured retry functions for common use cases

/**
 * Retry wrapper for SMTP operations
 * Longer delays to handle mail server congestion
 */
export const retrySmtp = <T>(
  fn: () => Promise<T>,
  onRetry?: (error: Error, attempt: number, delay: number) => void
) =>
  withRetry(fn, {
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: ['econnreset', 'etimedout', 'temporary', 'try again', '421', '450', '451', '452'],
    onRetry,
  })

/**
 * Retry wrapper for external API calls
 * Moderate retry policy for third-party APIs
 */
export const retryApi = <T>(
  fn: () => Promise<T>,
  onRetry?: (error: Error, attempt: number, delay: number) => void
) =>
  withRetry(fn, {
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    onRetry,
  })

/**
 * Retry wrapper for database operations
 * Quick retries for transient DB issues
 */
export const retryDatabase = <T>(
  fn: () => Promise<T>,
  onRetry?: (error: Error, attempt: number, delay: number) => void
) =>
  withRetry(fn, {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 3000,
    backoffMultiplier: 2,
    retryableErrors: ['connection', 'pool', 'timeout', 'deadlock', 'lock'],
    onRetry,
  })

/**
 * Retry wrapper for DNS operations
 * Moderate delays for DNS propagation and API limits
 */
export const retryDns = <T>(
  fn: () => Promise<T>,
  onRetry?: (error: Error, attempt: number, delay: number) => void
) =>
  withRetry(fn, {
    maxRetries: 3,
    initialDelayMs: 1500,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    retryableErrors: ['rate', 'throttl', 'timeout', '429', '503'],
    onRetry,
  })

/**
 * Retry wrapper with HTTP response handling
 * Use this for fetch operations where you need to handle HTTP status codes
 */
export async function withRetryFetch<T>(
  fn: () => Promise<Response>,
  parse: (response: Response) => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const opts = { ...DEFAULT_CONFIG, maxRetries: 2, ...config }
  let lastError: Error = new Error('Request failed')

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      const response = await fn()

      // Check for retryable status codes
      if (!response.ok && isRetryableStatusCode(response.status)) {
        // Check for Retry-After header
        const retryAfter = response.headers.get('Retry-After')
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(
              opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
              opts.maxDelayMs
            )

        if (attempt <= opts.maxRetries) {
          opts.onRetry?.(
            new Error(`HTTP ${response.status}`),
            attempt,
            delay
          )
          await sleep(delay)
          continue
        }
      }

      // Non-retryable error or success
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      return await parse(response)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if network error is retryable
      if (!isRetryableError(lastError, opts.retryableErrors)) {
        throw lastError
      }

      if (attempt > opts.maxRetries) {
        throw lastError
      }

      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      )

      opts.onRetry?.(lastError, attempt, delay)
      await sleep(delay)
    }
  }

  throw lastError
}
