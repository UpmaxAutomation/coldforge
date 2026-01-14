import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Security headers to add to all responses
const securityHeaders = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

// HTTP methods that require CSRF protection
const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

// Routes that skip CSRF validation (auth routes use their own protection)
const CSRF_EXEMPT_ROUTES = [
  '/api/auth/',
  '/api/webhooks/',
]

export async function middleware(request: NextRequest) {
  // First, run the session update middleware
  const response = await updateSession(request)

  // Add security headers to the response
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  // CSRF protection for API routes with state-changing methods
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const method = request.method

    if (CSRF_PROTECTED_METHODS.includes(method)) {
      // Check if route is exempt from CSRF validation
      const isExempt = CSRF_EXEMPT_ROUTES.some(route =>
        request.nextUrl.pathname.startsWith(route)
      )

      if (!isExempt) {
        // Mark that CSRF validation is required for this route
        // The actual validation happens in the API route handlers
        response.headers.set('X-CSRF-Required', 'true')
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
