import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEmailAccountsWithWarmup } from '@/lib/db/queries'

interface UserWithOrg {
  organization_id: string | null
}

export interface WarmupAccount {
  id: string
  email: string
  display_name: string | null
  provider: 'google' | 'microsoft' | 'smtp'
  warmup_enabled: boolean
  warmup_progress: number
  health_score: number
  status: 'active' | 'paused' | 'error' | 'warming'
  daily_limit: number
  sent_today: number
  inbox_placement_rate: number
  spam_rate: number
  warmup_stage: number
  warmup_days_active: number
  created_at: string
}

// GET /api/warmup/accounts - List all accounts with warmup status
// Optimized: Uses single query instead of N+1 pattern
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const profileResult = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const profile = profileResult.data as UserWithOrg | null

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Use optimized query that avoids N+1
    const { data: accounts, error } = await getEmailAccountsWithWarmup(profile.organization_id)

    if (error) {
      throw error
    }

    // Transform to WarmupAccount format with calculated stages
    const accountsWithStats: WarmupAccount[] = (accounts || []).map(account => {
      // Calculate warmup stage based on progress
      const warmupStage = Math.min(6, Math.floor((account.warmup_progress || 0) / 17) + 1)

      // Calculate days active (simplified based on progress)
      const warmupDaysActive = Math.floor((account.warmup_progress || 0) / 4)

      return {
        id: account.id,
        email: account.email,
        display_name: account.display_name,
        provider: account.provider,
        warmup_enabled: account.warmup_enabled,
        warmup_progress: account.warmup_progress,
        health_score: account.health_score,
        status: account.status,
        daily_limit: account.daily_limit,
        sent_today: account.sent_today,
        inbox_placement_rate: account.inbox_placement_rate,
        spam_rate: account.spam_rate,
        warmup_stage: warmupStage,
        warmup_days_active: warmupDaysActive,
        created_at: account.created_at,
      }
    })

    return NextResponse.json({ accounts: accountsWithStats })
  } catch (error) {
    console.error('Failed to fetch warmup accounts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch warmup accounts' },
      { status: 500 }
    )
  }
}
