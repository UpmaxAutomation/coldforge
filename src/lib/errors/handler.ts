import { NextResponse } from 'next/server'
import {
  AuthenticationError,
  AuthorizationError,
  BadRequestError,
  ConflictError,
  DatabaseError,
  NotFoundError,
  ValidationError,
  isAppError,
} from '.'

/**
 * Handle API errors and return appropriate NextResponse
 * Supports AppError instances, Supabase errors, and unknown errors
 */
export function handleApiError(error: unknown): NextResponse {
  // Known application errors
  if (isAppError(error)) {
    return NextResponse.json(error.toJSON(), { status: error.statusCode })
  }

  // Supabase/PostgreSQL errors
  if (error && typeof error === 'object' && 'code' in error) {
    const dbError = error as { code: string; message?: string; details?: string }

    // Handle common PostgreSQL error codes
    switch (dbError.code) {
      case 'PGRST116': // Row not found
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Resource not found' } },
          { status: 404 }
        )
      case '23505': // Unique violation
        return NextResponse.json(
          { error: { code: 'CONFLICT', message: 'Resource already exists' } },
          { status: 409 }
        )
      case '23503': // Foreign key violation
        return NextResponse.json(
          { error: { code: 'BAD_REQUEST', message: 'Referenced resource does not exist' } },
          { status: 400 }
        )
      case '23502': // Not null violation
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Required field is missing' } },
          { status: 400 }
        )
      case '42501': // Insufficient privilege
        return NextResponse.json(
          { error: { code: 'AUTHORIZATION_ERROR', message: 'Access denied' } },
          { status: 403 }
        )
      case 'PGRST301': // JWT expired
      case 'PGRST302': // JWT invalid
        return NextResponse.json(
          { error: { code: 'AUTHENTICATION_ERROR', message: 'Authentication required' } },
          { status: 401 }
        )
      default:
        // Log unknown database errors for debugging
        console.error('Unhandled database error:', dbError)
    }
  }

  // Zod validation errors
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ message: string; path: (string | number)[] }> }
    const firstIssue = zodError.issues[0]
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message || 'Validation failed',
          details: { issues: zodError.issues },
        },
      },
      { status: 400 }
    )
  }

  // Unknown errors - log and return generic message
  console.error('Unhandled error:', error)
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    { status: 500 }
  )
}

/**
 * Create error response helpers for common scenarios
 */
export const createError = {
  unauthorized: (message?: string) => new AuthenticationError(message),
  forbidden: (message?: string) => new AuthorizationError(message),
  notFound: (resource: string, id?: string) => new NotFoundError(resource, id),
  badRequest: (message: string, details?: Record<string, unknown>) => new BadRequestError(message, details),
  validation: (message: string, details?: Record<string, unknown>) => new ValidationError(message, details),
  conflict: (message: string, details?: Record<string, unknown>) => new ConflictError(message, details),
  database: (message: string, details?: Record<string, unknown>) => new DatabaseError(message, details),
}

/**
 * Throw appropriate error for authentication failure
 */
export function requireAuth(user: unknown): asserts user {
  if (!user) {
    throw new AuthenticationError()
  }
}

/**
 * Throw appropriate error for missing organization
 */
export function requireOrganization(organizationId: string | null | undefined): asserts organizationId is string {
  if (!organizationId) {
    throw new BadRequestError('No organization found')
  }
}

/**
 * Throw appropriate error for missing resource
 */
export function requireResource<T>(resource: T | null | undefined, resourceName: string, id?: string): asserts resource is T {
  if (!resource) {
    throw new NotFoundError(resourceName, id)
  }
}

/**
 * Wrap an async handler with error handling
 * Usage: export const GET = withErrorHandling(async (req) => { ... })
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (error) {
      return handleApiError(error)
    }
  }
}

// Re-export type guard for convenience
export { isAppError }
