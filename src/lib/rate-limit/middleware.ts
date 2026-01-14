// Rate limit middleware for API routes
// Wraps API handlers with rate limiting functionality

import { NextRequest, NextResponse } from 'next/server'
import {
  RateLimitConfig,
  RateLimitResult,
  checkRateLimitAdvanced,
  createRateLimitResponse,
  addRateLimitHeaders,
  rateLimitConfigs,
  apiLimiter,
  authLimiter,
  sendingLimiter,
  writeLimiter,
} from './index'

type RateLimiter = (req: NextRequest, identifier?: string) => RateLimitResult
type ApiHandler = (req: NextRequest) => Promise<NextResponse>

/**
 * Higher-order function that wraps an API handler with rate limiting
 *
 * @example
 * // Using pre-configured limiter
 * export const GET = withRateLimitMiddleware(
 *   apiLimiter,
 *   async (req) => {
 *     return NextResponse.json({ data: 'success' })
 *   }
 * )
 *
 * @example
 * // Using custom config
 * const customLimiter = (req: NextRequest) =>
 *   checkRateLimitAdvanced(req, { windowMs: 60000, max: 50, keyPrefix: 'custom' })
 *
 * export const POST = withRateLimitMiddleware(customLimiter, handler)
 */
export function withRateLimitMiddleware(
  limiter: RateLimiter,
  handler: ApiHandler
): ApiHandler {
  return async (req: NextRequest): Promise<NextResponse> => {
    const result = limiter(req)

    if (!result.success) {
      return createRateLimitResponse(result)
    }

    const response = await handler(req)
    return addRateLimitHeaders(response, result)
  }
}

/**
 * Apply multiple rate limiters (all must pass)
 *
 * @example
 * export const POST = withMultipleRateLimits(
 *   [authLimiter, writeLimiter],
 *   async (req) => { ... }
 * )
 */
export function withMultipleRateLimits(
  limiters: RateLimiter[],
  handler: ApiHandler
): ApiHandler {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Check all limiters
    for (const limiter of limiters) {
      const result = limiter(req)
      if (!result.success) {
        return createRateLimitResponse(result)
      }
    }

    // Get result from first limiter for headers
    const primaryResult = limiters[0]?.(req) ?? {
      success: true,
      limit: 100,
      remaining: 100,
      reset: Date.now() + 60000,
    }

    const response = await handler(req)
    return addRateLimitHeaders(response, primaryResult)
  }
}

/**
 * Apply rate limiting based on authenticated user ID
 *
 * @example
 * export const POST = withUserRateLimit(
 *   rateLimitConfigs.write,
 *   getUserId,
 *   async (req) => { ... }
 * )
 */
export function withUserRateLimit(
  config: RateLimitConfig,
  getUserId: (req: NextRequest) => string | undefined | Promise<string | undefined>,
  handler: ApiHandler
): ApiHandler {
  return async (req: NextRequest): Promise<NextResponse> => {
    const userId = await getUserId(req)
    const result = checkRateLimitAdvanced(req, config, userId)

    if (!result.success) {
      return createRateLimitResponse(result)
    }

    const response = await handler(req)
    return addRateLimitHeaders(response, result)
  }
}

/**
 * Create a rate-limited response helper for direct use in route handlers
 *
 * @example
 * export async function GET(req: NextRequest) {
 *   const { limited, response } = applyRateLimit(req, apiLimiter)
 *   if (limited) return response
 *
 *   // ... rest of handler
 * }
 */
export function applyRateLimit(
  req: NextRequest,
  limiter: RateLimiter
): { limited: boolean; response?: NextResponse; result: RateLimitResult } {
  const result = limiter(req)

  if (!result.success) {
    return {
      limited: true,
      response: createRateLimitResponse(result),
      result,
    }
  }

  return { limited: false, result }
}

// Re-export for convenience
export {
  apiLimiter,
  authLimiter,
  sendingLimiter,
  writeLimiter,
  rateLimitConfigs,
  checkRateLimitAdvanced,
  createRateLimitResponse,
  addRateLimitHeaders,
}
