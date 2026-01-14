/**
 * Content Security Policy (CSP) configuration
 *
 * This module generates CSP headers to protect against XSS, clickjacking,
 * and other code injection attacks.
 */

interface CSPDirectives {
  'default-src': string[]
  'script-src': string[]
  'style-src': string[]
  'img-src': string[]
  'font-src': string[]
  'connect-src': string[]
  'frame-ancestors': string[]
  'form-action': string[]
  'base-uri': string[]
  'object-src': string[]
  'media-src': string[]
  'worker-src': string[]
  'manifest-src': string[]
}

// Supabase URL from environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://diqrtuvibinytpvhllzv.supabase.co'
const supabaseWss = supabaseUrl.replace('https://', 'wss://')

/**
 * CSP directives configuration
 * Modify these based on your application's needs
 */
const cspDirectives: CSPDirectives = {
  'default-src': ["'self'"],
  // Next.js requires 'unsafe-inline' and 'unsafe-eval' for development
  // In production, consider using nonces for inline scripts
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    supabaseUrl,
    supabaseWss,
    'https://api.resend.com',  // For email sending
  ],
  'frame-ancestors': ["'self'"],
  'form-action': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'media-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
}

/**
 * Generate a Content Security Policy header string
 * @param isDevelopment - Whether to use relaxed development settings
 * @returns CSP header value
 */
export function generateCSP(isDevelopment = process.env.NODE_ENV === 'development'): string {
  const directives = { ...cspDirectives }

  // In development, allow localhost connections
  if (isDevelopment) {
    directives['connect-src'] = [
      ...directives['connect-src'],
      'http://localhost:*',
      'ws://localhost:*',
    ]
  }

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')
}

/**
 * Generate CSP header with nonce support
 * Use this when you want to avoid 'unsafe-inline' for scripts
 * @param nonce - A unique nonce value for inline scripts
 * @returns CSP header value
 */
export function generateCSPWithNonce(nonce: string): string {
  const directives = { ...cspDirectives }

  // Replace unsafe-inline with nonce
  directives['script-src'] = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')
}

/**
 * Generate a cryptographically secure nonce
 * @returns A base64 encoded random nonce
 */
export function generateNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return Buffer.from(crypto.randomUUID()).toString('base64')
  }
  // Fallback for older environments
  return Buffer.from(Math.random().toString(36).substring(2)).toString('base64')
}

/**
 * CSP report-only mode header
 * Use this to test CSP without blocking resources
 * @returns CSP header for report-only mode
 */
export function generateCSPReportOnly(): string {
  const csp = generateCSP()
  // Add report-uri if you have a CSP violation reporting endpoint
  // return `${csp}; report-uri /api/csp-report`
  return csp
}

export { cspDirectives }
