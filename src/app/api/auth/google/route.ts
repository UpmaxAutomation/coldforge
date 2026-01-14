import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleAuthUrl } from '@/lib/google'
import { randomBytes } from 'crypto'
import {
  authLimiter,
  applyRateLimit,
  addRateLimitHeaders,
} from '@/lib/rate-limit/middleware'

// GET /api/auth/google - Initiate Google OAuth flow
export async function GET(request: NextRequest) {
  // Apply strict rate limiting for auth routes (5 requests per 15 minutes)
  const { limited, response, result } = applyRateLimit(request, authLimiter)
  if (limited) return response!

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Generate state for CSRF protection
    const state = randomBytes(32).toString('hex')

    // Store state in a cookie or session for verification
    // For simplicity, we'll include the user ID in the state
    const stateData = Buffer.from(JSON.stringify({
      userId: user.id,
      nonce: state,
    })).toString('base64')

    const authUrl = getGoogleAuthUrl(stateData)

    const jsonResponse = NextResponse.json({ authUrl })
    return addRateLimitHeaders(jsonResponse, result)
  } catch (error) {
    console.error('Failed to initiate Google OAuth:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Google OAuth' },
      { status: 500 }
    )
  }
}
