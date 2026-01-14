// Request context management using AsyncLocalStorage for correlation
import { AsyncLocalStorage } from 'async_hooks'
import { type Logger } from 'pino'
import { logger, createLogger, generateRequestId, type RequestContext } from './index'

// AsyncLocalStorage for request context propagation
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>()

/**
 * Get the current request context from AsyncLocalStorage
 * Returns undefined if no context is set
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore()
}

/**
 * Get the current request ID from context
 * Generates a new one if no context exists
 */
export function getRequestId(): string {
  const context = getRequestContext()
  return context?.requestId || generateRequestId()
}

/**
 * Get user ID from current request context
 */
export function getUserId(): string | undefined {
  return getRequestContext()?.userId
}

/**
 * Get organization ID from current request context
 */
export function getOrganizationId(): string | undefined {
  return getRequestContext()?.organizationId
}

/**
 * Run a function within a request context
 * All logging within the callback will include the context
 */
export function runWithContext<T>(
  context: RequestContext,
  callback: () => T
): T {
  return asyncLocalStorage.run(context, callback)
}

/**
 * Run an async function within a request context
 * All logging within the callback will include the context
 */
export async function runWithContextAsync<T>(
  context: RequestContext,
  callback: () => Promise<T>
): Promise<T> {
  return asyncLocalStorage.run(context, callback)
}

/**
 * Create a new request context from an HTTP request
 */
export function createRequestContext(
  method: string,
  path: string,
  options?: {
    requestId?: string
    userId?: string
    organizationId?: string
    query?: Record<string, string>
    userAgent?: string
    ip?: string
  }
): RequestContext {
  return {
    requestId: options?.requestId || generateRequestId(),
    method,
    path,
    userId: options?.userId,
    organizationId: options?.organizationId,
    startTime: Date.now(),
    query: options?.query,
    userAgent: options?.userAgent,
    ip: options?.ip,
  }
}

/**
 * Update the current request context with additional information
 * Useful for adding userId after authentication
 */
export function updateRequestContext(updates: Partial<RequestContext>): RequestContext | undefined {
  const current = getRequestContext()
  if (current) {
    Object.assign(current, updates)
  }
  return current
}

/**
 * Create a child logger that automatically includes request context
 * This logger will include requestId, userId, and organizationId from the current context
 */
export function getContextLogger(module?: string): Logger {
  const context = getRequestContext()
  const baseLogger = module ? createLogger(module) : logger

  if (context) {
    return baseLogger.child({
      requestId: context.requestId,
      userId: context.userId,
      organizationId: context.organizationId,
    })
  }

  return baseLogger
}

/**
 * Create a child logger with both module and custom context
 */
export function createContextLogger(
  module: string,
  additionalContext?: Record<string, unknown>
): Logger {
  const context = getRequestContext()
  const baseLogger = createLogger(module)

  const contextData: Record<string, unknown> = {
    ...additionalContext,
  }

  if (context) {
    contextData.requestId = context.requestId
    contextData.userId = context.userId
    contextData.organizationId = context.organizationId
  }

  return baseLogger.child(contextData)
}

/**
 * Helper to calculate request duration from context
 */
export function getRequestDuration(): number {
  const context = getRequestContext()
  return context ? Date.now() - context.startTime : 0
}

/**
 * Decorator-style wrapper for running async functions with context
 */
export function withContext<T extends (...args: unknown[]) => Promise<unknown>>(
  contextFactory: (...args: Parameters<T>) => RequestContext,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    const context = contextFactory(...args)
    return runWithContextAsync(context, () => fn(...args))
  }) as T
}

// Export AsyncLocalStorage instance for advanced usage
export { asyncLocalStorage }
