import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Validation result type for request body validation
 */
type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: NextResponse }

/**
 * Validates a request body against a Zod schema.
 * Returns a discriminated union with either the validated data or an error response.
 *
 * @example
 * ```ts
 * const result = await validateRequest(req, createUserSchema)
 * if (!result.success) return result.error
 * const { name, email } = result.data
 * ```
 */
export async function validateRequest<T extends z.ZodSchema>(
  req: NextRequest,
  schema: T
): Promise<ValidationResult<z.infer<T>>> {
  try {
    const body = await req.json()
    const data = schema.parse(body)
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Validation failed',
            details: error.issues.map((e: z.ZodIssue) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 }
        ),
      }
    }
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: NextResponse.json(
          { error: 'Invalid JSON in request body' },
          { status: 400 }
        ),
      }
    }
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      ),
    }
  }
}

/**
 * Validates query parameters against a Zod schema.
 * Returns a discriminated union with either the validated data or an error response.
 *
 * @example
 * ```ts
 * const result = validateQuery(req, listUsersQuerySchema)
 * if (!result.success) return result.error
 * const { page, limit, search } = result.data
 * ```
 */
export function validateQuery<T extends z.ZodSchema>(
  req: NextRequest,
  schema: T
): ValidationResult<z.infer<T>> {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams)
    const data = schema.parse(params)
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Invalid query parameters',
            details: error.issues.map((e: z.ZodIssue) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 }
        ),
      }
    }
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      ),
    }
  }
}

/**
 * Validates path parameters against a Zod schema.
 * Useful for dynamic route segments like [id].
 *
 * @example
 * ```ts
 * const result = validateParams({ id: params.id }, z.object({ id: z.string().uuid() }))
 * if (!result.success) return result.error
 * const { id } = result.data
 * ```
 */
export function validateParams<T extends z.ZodSchema>(
  params: Record<string, unknown>,
  schema: T
): ValidationResult<z.infer<T>> {
  try {
    const data = schema.parse(params)
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Invalid path parameters',
            details: error.issues.map((e: z.ZodIssue) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 }
        ),
      }
    }
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Invalid path parameters' },
        { status: 400 }
      ),
    }
  }
}

/**
 * Creates a validation error response with proper formatting.
 * Useful when you need to return a validation error outside of the helper functions.
 */
export function validationError(message: string, details?: Array<{ path: string; message: string }>): NextResponse {
  return NextResponse.json(
    {
      error: message,
      ...(details && { details }),
    },
    { status: 400 }
  )
}
