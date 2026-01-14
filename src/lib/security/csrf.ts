import { cookies } from 'next/headers'
import crypto from 'crypto'

const CSRF_TOKEN_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Generate a CSRF token and store it in an HTTP-only cookie
 * @returns The generated CSRF token for inclusion in forms/headers
 */
export async function generateCSRFToken(): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set(CSRF_TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 // 24 hours
  })
  return token
}

/**
 * Validate a CSRF token from request header against stored cookie
 * @param headerToken - Token from request header
 * @returns Boolean indicating if token is valid
 */
export async function validateCSRFToken(headerToken: string | null): Promise<boolean> {
  if (!headerToken) return false
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(CSRF_TOKEN_NAME)?.value
  if (!cookieToken) return false

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(headerToken)
    )
  } catch {
    return false
  }
}

/**
 * Get current CSRF token from cookie (for client-side usage)
 * @returns The current token or null if not set
 */
export async function getCSRFToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(CSRF_TOKEN_NAME)?.value ?? null
}

export { CSRF_TOKEN_NAME, CSRF_HEADER_NAME }
