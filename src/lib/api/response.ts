/**
 * Standardized API Response Utilities
 *
 * All API routes should use these utilities for consistent response formats.
 *
 * Success Response Format:
 * {
 *   data: T,
 *   meta?: { page, limit, total, hasMore }
 * }
 *
 * Error Response Format:
 * {
 *   error: {
 *     code: string,
 *     message: string,
 *     details?: unknown,
 *     requestId?: string
 *   }
 * }
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

// Standard error codes
export const ErrorCodes = {
  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  CSRF_VALIDATION_FAILED: 'CSRF_VALIDATION_FAILED',

  // Client errors (400)
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_PARAMETER: 'MISSING_PARAMETER',

  // Resource errors (404, 409)
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Rate limiting (429)
  RATE_LIMITED: 'RATE_LIMITED',
  DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

// Error response interface
export interface APIError {
  code: ErrorCode | string
  message: string
  details?: unknown
  requestId?: string
  documentationUrl?: string
}

// Pagination metadata
export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
  nextCursor?: string
  prevCursor?: string
}

// Success response with data
export function success<T>(
  data: T,
  status: number = 200,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { data },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  )
}

// Success response with pagination
export function paginated<T>(
  data: T[],
  meta: Omit<PaginationMeta, 'totalPages'>,
  headers?: Record<string, string>
): NextResponse {
  const totalPages = Math.ceil(meta.total / meta.limit)

  return NextResponse.json(
    {
      data,
      meta: {
        ...meta,
        totalPages,
      },
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  )
}

// Created response (201)
export function created<T>(
  data: T,
  headers?: Record<string, string>
): NextResponse {
  return success(data, 201, headers)
}

// Accepted response (202)
export function accepted<T>(
  data: T,
  headers?: Record<string, string>
): NextResponse {
  return success(data, 202, headers)
}

// No content response (204)
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

// Error response
export function error(
  code: ErrorCode | string,
  message: string,
  status: number,
  details?: unknown,
  headers?: Record<string, string>
): NextResponse {
  const errorResponse: APIError = {
    code,
    message,
    ...(details && { details }),
  }

  return NextResponse.json(
    { error: errorResponse },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  )
}

// Specific error responses
export function unauthorized(
  message: string = 'Authentication required',
  code: ErrorCode = ErrorCodes.UNAUTHORIZED
): NextResponse {
  return error(code, message, 401)
}

export function forbidden(
  message: string = 'Access denied',
  code: ErrorCode = ErrorCodes.FORBIDDEN
): NextResponse {
  return error(code, message, 403)
}

export function notFound(
  message: string = 'Resource not found',
  resource?: string
): NextResponse {
  return error(
    ErrorCodes.NOT_FOUND,
    resource ? `${resource} not found` : message,
    404
  )
}

export function badRequest(
  message: string = 'Invalid request',
  details?: unknown
): NextResponse {
  return error(ErrorCodes.BAD_REQUEST, message, 400, details)
}

export function validationError(
  zodError: ZodError
): NextResponse {
  const details = zodError.flatten()
  return error(
    ErrorCodes.VALIDATION_ERROR,
    'Validation failed',
    400,
    details
  )
}

export function conflict(
  message: string = 'Resource already exists'
): NextResponse {
  return error(ErrorCodes.CONFLICT, message, 409)
}

export function rateLimited(
  message: string = 'Rate limit exceeded',
  retryAfter?: number
): NextResponse {
  const headers: Record<string, string> = {}
  if (retryAfter) {
    headers['Retry-After'] = String(retryAfter)
  }
  return error(ErrorCodes.RATE_LIMITED, message, 429, undefined, headers)
}

export function internalError(
  message: string = 'Internal server error'
): NextResponse {
  return error(ErrorCodes.INTERNAL_ERROR, message, 500)
}

export function serviceUnavailable(
  message: string = 'Service temporarily unavailable',
  retryAfter?: number
): NextResponse {
  const headers: Record<string, string> = {}
  if (retryAfter) {
    headers['Retry-After'] = String(retryAfter)
  }
  return error(ErrorCodes.SERVICE_UNAVAILABLE, message, 503, undefined, headers)
}

// Type-safe wrapper for API handlers with error handling
export function withErrorHandling<T>(
  handler: () => Promise<T>
): Promise<T | NextResponse> {
  return handler().catch((err) => {
    console.error('API Error:', err)

    if (err instanceof ZodError) {
      return validationError(err)
    }

    if (err instanceof Error) {
      // Check for specific error types
      if (err.message.includes('unauthorized') || err.message.includes('auth')) {
        return unauthorized(err.message)
      }
      if (err.message.includes('not found')) {
        return notFound(err.message)
      }
      if (err.message.includes('rate limit')) {
        return rateLimited(err.message)
      }
    }

    return internalError()
  })
}

// Generate request ID for tracking
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

// Add request ID to response headers
export function withRequestId(
  response: NextResponse,
  requestId?: string
): NextResponse {
  const id = requestId || generateRequestId()
  response.headers.set('X-Request-ID', id)
  return response
}
