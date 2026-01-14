import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAvailableAccounts,
  selectNextAccount,
  getTotalRemainingCapacity,
} from '@/lib/sending/rotation'
import {
  apiLimiter,
  applyRateLimit,
  addRateLimitHeaders,
} from '@/lib/rate-limit/middleware'
import { AuthenticationError, BadRequestError } from '@/lib/errors'
import { handleApiError } from '@/lib/errors/handler'

// GET /api/sending/rotate - Get next available account for sending
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const { limited, response, result } = applyRateLimit(request, apiLimiter)
  if (limited) return response!

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new AuthenticationError()
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      throw new BadRequestError('No organization found')
    }

    // Get all available accounts for the organization
    const accounts = await getAvailableAccounts(profile.organization_id)

    // Select the next account using round-robin
    const nextAccount = selectNextAccount(accounts)

    // Calculate remaining capacity
    const remainingCapacity = getTotalRemainingCapacity(accounts)

    const jsonResponse = NextResponse.json({
      account: nextAccount ? {
        id: nextAccount.id,
        email: nextAccount.email,
        dailyLimit: nextAccount.dailyLimit,
        sentToday: nextAccount.sentToday,
        remaining: nextAccount.dailyLimit - nextAccount.sentToday,
      } : null,
      availableAccounts: accounts.length,
      totalRemainingCapacity: remainingCapacity,
      hasCapacity: remainingCapacity > 0,
    })

    return addRateLimitHeaders(jsonResponse, result)
  } catch (error) {
    return handleApiError(error)
  }
}
