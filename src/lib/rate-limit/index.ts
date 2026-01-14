// Rate limiting utilities for InstantScale
// Uses in-memory store for development, can be upgraded to Redis/Upstash for production

import { NextRequest, NextResponse } from 'next/server'
import { RateLimitError } from '@/lib/errors'

export interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  max: number           // Max requests per window
  keyPrefix?: string    // Prefix for rate limit keys
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

// In-memory store for rate limiting (replace with Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically (only in non-edge environments)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key)
      }
    }
  }, 60000) // Clean up every minute
}

// Default rate limit configurations
export const rateLimitConfigs = {
  // Auth endpoints - stricter limits (5 requests per 15 minutes)
  auth: { windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'auth' },

  // Standard API endpoints (100 requests per minute)
  api: { windowMs: 60 * 1000, max: 100, keyPrefix: 'api' },

  // Write operations (30 requests per minute)
  write: { windowMs: 60 * 1000, max: 30, keyPrefix: 'write' },

  // Email sending - strict limit (1000 requests per hour)
  sending: { windowMs: 60 * 60 * 1000, max: 1000, keyPrefix: 'sending' },

  // Email operations (10 requests per minute)
  email: { windowMs: 60 * 1000, max: 10, keyPrefix: 'email' },

  // Webhook endpoints - high limit
  webhook: { windowMs: 60 * 1000, max: 500, keyPrefix: 'webhook' },
}

// Pre-configured rate limiters (factory functions)
export const apiLimiter = (req: NextRequest, identifier?: string) =>
  checkRateLimitAdvanced(req, rateLimitConfigs.api, identifier)

export const authLimiter = (req: NextRequest, identifier?: string) =>
  checkRateLimitAdvanced(req, rateLimitConfigs.auth, identifier)

export const sendingLimiter = (req: NextRequest, identifier?: string) =>
  checkRateLimitAdvanced(req, rateLimitConfigs.sending, identifier)

export const writeLimiter = (req: NextRequest, identifier?: string) =>
  checkRateLimitAdvanced(req, rateLimitConfigs.write, identifier)

// Get client identifier from request
function getClientId(request: NextRequest): string {
  // Try to get user ID from auth header
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    // Use a hash of the auth token as identifier
    return `user:${hashCode(authHeader)}`
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown'

  return `ip:${ip}`
}

// Simple hash function for strings
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// Rate limit checker (basic version)
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig = rateLimitConfigs.api
): { allowed: boolean; remaining: number; resetTime: number } {
  const clientId = getClientId(request)
  const key = `${config.keyPrefix}:${clientId}`
  const now = Date.now()

  let entry = rateLimitStore.get(key)

  // Create new entry if doesn't exist or has expired
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    }
  }

  entry.count++
  rateLimitStore.set(key, entry)

  const remaining = Math.max(0, config.max - entry.count)
  const allowed = entry.count <= config.max

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
  }
}

// Advanced rate limit checker with custom identifier support
export function checkRateLimitAdvanced(
  request: NextRequest,
  config: RateLimitConfig = rateLimitConfigs.api,
  identifier?: string
): RateLimitResult {
  const key = identifier
    ? `${config.keyPrefix}:custom:${identifier}`
    : `${config.keyPrefix}:${getClientId(request)}`
  const now = Date.now()

  let entry = rateLimitStore.get(key)

  // Create new entry if doesn't exist or has expired
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    }
  }

  entry.count++
  rateLimitStore.set(key, entry)

  const remaining = Math.max(0, config.max - entry.count)
  const success = entry.count <= config.max

  return {
    success,
    limit: config.max,
    remaining,
    reset: entry.resetTime,
  }
}

// Create rate limit error response with proper headers
export function createRateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000)

  return NextResponse.json(
    {
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.toString(),
        'Retry-After': retryAfter.toString(),
      },
    }
  )
}

// Add rate limit headers to a successful response
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set('X-RateLimit-Limit', result.limit.toString())
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', result.reset.toString())
  return response
}

// Rate limit middleware helper
export function withRateLimit(
  request: NextRequest,
  config: RateLimitConfig = rateLimitConfigs.api
): void {
  const { allowed, remaining: _remaining, resetTime } = checkRateLimit(request, config)

  if (!allowed) {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
    throw new RateLimitError(retryAfter)
  }
}

// Get rate limit headers for response
export function getRateLimitHeaders(
  request: NextRequest,
  config: RateLimitConfig = rateLimitConfigs.api
): Record<string, string> {
  const { remaining, resetTime } = checkRateLimit(request, config)

  return {
    'X-RateLimit-Limit': config.max.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
  }
}

// Rate limit response helper
export function rateLimitResponse(retryAfter: number = 60): Response {
  return Response.json(
    {
      error: {
        code: 'RATE_LIMIT',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
      },
    }
  )
}
