import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

type WarmupEmail = Tables<'warmup_emails'>

interface UserWithOrg {
  organization_id: string | null
}

interface EmailAccountPartial {
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
  created_at: string
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

    // Get email accounts
    const accountsResult = await supabase
      .from('email_accounts')
      .select('id, email, display_name, provider, warmup_enabled, warmup_progress, health_score, status, daily_limit, sent_today, created_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    const accounts = accountsResult.data as EmailAccountPartial[] | null
    const error = accountsResult.error

    if (error) {
      throw error
    }

    // Get warmup email stats for each account (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const accountsWithStats: WarmupAccount[] = await Promise.all(
      (accounts || []).map(async (account) => {
        // Get warmup emails sent from this account
        const sentEmailsResult = await supabase
          .from('warmup_emails')
          .select('status')
          .eq('from_account_id', account.id)
          .gte('sent_at', sevenDaysAgo.toISOString())

        const sentEmails = sentEmailsResult.data as Pick<WarmupEmail, 'status'>[] | null

        const totalSent = sentEmails?.length || 0
        const opened = sentEmails?.filter(e => e.status === 'opened' || e.status === 'replied').length || 0

        // Calculate inbox placement rate (simplified: based on opens/replies)
        const inboxPlacementRate = totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0

        // Calculate spam rate (simplified: 100 - inbox placement for demo)
        const spamRate = totalSent > 0 ? Math.max(0, 100 - inboxPlacementRate - 20) : 0

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
          warmup_progress: account.warmup_progress || 0,
          health_score: account.health_score || 0,
          status: account.status,
          daily_limit: account.daily_limit || 50,
          sent_today: account.sent_today || 0,
          inbox_placement_rate: inboxPlacementRate,
          spam_rate: spamRate,
          warmup_stage: warmupStage,
          warmup_days_active: warmupDaysActive,
          created_at: account.created_at,
        }
      })
    )

    return NextResponse.json({ accounts: accountsWithStats })
  } catch (error) {
    console.error('Failed to fetch warmup accounts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch warmup accounts' },
      { status: 500 }
    )
  }
}
