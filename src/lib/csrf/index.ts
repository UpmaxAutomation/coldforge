/**
 * CSRF Protection Module
 *
 * Implements Double Submit Cookie pattern for CSRF protection.
 * - Token stored in a secure, httpOnly cookie
 * - Client must send token in X-CSRF-Token header
 * - Server validates token matches cookie value
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// CSRF token configuration
const CSRF_COOKIE_NAME = '__csrf'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_TOKEN_LENGTH = 32
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 24 // 24 hours

// Environment detection
const isProduction = process.env.NODE_ENV === 'production'

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex')
}

/**
 * Get CSRF token from request cookie
 */
export function getCSRFTokenFromCookie(request: NextRequest): string | null {
  const cookie = request.cookies.get(CSRF_COOKIE_NAME)
  return cookie?.value || null
}

/**
 * Get CSRF token from request header
 */
export function getCSRFTokenFromHeader(request: NextRequest): string | null {
  return request.headers.get(CSRF_HEADER_NAME)
}

/**
 * Validate CSRF token
 * Returns true if token is valid, false otherwise
 */
export function validateCSRFToken(request: NextRequest): {
  valid: boolean
  error?: string
} {
  const cookieToken = getCSRFTokenFromCookie(request)
  const headerToken = getCSRFTokenFromHeader(request)

  // Both tokens must be present
  if (!cookieToken) {
    return {
      valid: false,
      error: 'CSRF cookie not found. Please refresh the page.',
    }
  }

  if (!headerToken) {
    return {
      valid: false,
      error: 'CSRF token header missing. Include X-CSRF-Token header.',
    }
  }

  // Tokens must match (constant-time comparison to prevent timing attacks)
  if (!safeCompare(cookieToken, headerToken)) {
    return {
      valid: false,
      error: 'CSRF token mismatch. Please refresh the page.',
    }
  }

  return { valid: true }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)

  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Set CSRF cookie on response
 */
export function setCSRFCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: CSRF_COOKIE_MAX_AGE,
    path: '/',
  })
}

/**
 * Create response with CSRF token in header (for SPA to read)
 * The cookie is httpOnly, so we also return the token in a header
 * that the client can read and include in future requests.
 */
export function addCSRFTokenToResponse(
  response: NextResponse,
  token: string
): NextResponse {
  response.headers.set('X-CSRF-Token', token)
  return response
}

/**
 * Middleware function to enforce CSRF protection on state-changing requests
 */
export async function enforceCSRF(
  request: NextRequest,
  response: NextResponse
): Promise<{ response: NextResponse; error?: string }> {
  const method = request.method
  const protectedMethods = ['POST', 'PUT', 'PATCH', 'DELETE']

  // Only check CSRF for state-changing methods
  if (!protectedMethods.includes(method)) {
    return { response }
  }

  // Skip CSRF for API routes that use API key/OAuth authentication
  // These have their own authentication mechanism
  const path = request.nextUrl.pathname
  if (path.startsWith('/api/v1/')) {
    return { response }
  }

  // Skip CSRF for webhook routes (they use signatures)
  if (path.includes('/webhooks/')) {
    return { response }
  }

  // Skip CSRF for OAuth callback routes
  if (path.includes('/auth/google/callback') || path.includes('/auth/microsoft/callback')) {
    return { response }
  }

  // Validate CSRF token
  const validation = validateCSRFToken(request)

  if (!validation.valid) {
    return {
      response: NextResponse.json(
        {
          error: {
            code: 'CSRF_VALIDATION_FAILED',
            message: validation.error,
          },
        },
        { status: 403 }
      ),
      error: validation.error,
    }
  }

  return { response }
}

/**
 * Ensure CSRF token exists in cookie, generate if missing
 */
export function ensureCSRFToken(
  request: NextRequest,
  response: NextResponse
): { token: string; response: NextResponse } {
  let token = getCSRFTokenFromCookie(request)

  if (!token) {
    token = generateCSRFToken()
    setCSRFCookie(response, token)
  }

  return { token, response }
}

/**
 * Higher-order function to wrap API routes with CSRF protection
 */
export function withCSRFProtection<T extends (...args: unknown[]) => Promise<Response>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    const request = args[0] as NextRequest

    // Validate CSRF
    const validation = validateCSRFToken(request)

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: {
            code: 'CSRF_VALIDATION_FAILED',
            message: validation.error,
          },
        },
        { status: 403 }
      )
    }

    return handler(...args)
  }) as T
}

/**
 * Create a response that includes CSRF token for client to use
 * Call this on initial page loads or when client needs a fresh token
 */
export function createCSRFResponse(): {
  token: string
  cookieValue: string
  cookieName: string
  headerName: string
} {
  const token = generateCSRFToken()

  return {
    token,
    cookieValue: token,
    cookieName: CSRF_COOKIE_NAME,
    headerName: CSRF_HEADER_NAME,
  }
}
