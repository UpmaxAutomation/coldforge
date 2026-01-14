import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import {
  calculateReputationScore,
  type ReputationFactors,
} from '@/lib/warmup/reputation'
import {
  getWarmupAnalytics,
  getOrgWarmupSummary,
  type WarmupAnalyticsInput,
  type WarmupAnalytics,
} from '@/lib/warmup/analytics'

type EmailAccount = Tables<'email_accounts'>
type WarmupEmail = Tables<'warmup_emails'>

interface UserWithOrg {
  organization_id: string | null
}

/**
 * GET /api/warmup/dashboard
 * Get organization-wide warmup overview with aggregated metrics
 */
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

    // Get all email accounts for the organization
    const accountsResult = await supabase
      .from('email_accounts')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    const accounts = (accountsResult.data as EmailAccount[] | null) || []

    if (accounts.length === 0) {
      return NextResponse.json({
        overview: {
          totalAccounts: 0,
          activeAccounts: 0,
          warmupEnabled: 0,
          healthyAccounts: 0,
          warningAccounts: 0,
          criticalAccounts: 0,
          averageProgress: 0,
          averageReplyRate: 0,
          averageReputationScore: 0,
          totalSentToday: 0,
          totalReceivedToday: 0,
          projectedDailyCapacity: 0,
        },
        accounts: [],
        accountsByStage: {},
        accountsByHealth: { healthy: 0, warning: 0, critical: 0 },
        recentActivity: [],
      })
    }

    // Get all account IDs
    const accountIds = accounts.map(a => a.id)

    // Get warmup emails for all accounts (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const warmupEmailsResult = await supabase
      .from('warmup_emails')
      .select('*')
      .or(`from_account_id.in.(${accountIds.join(',')}),to_account_id.in.(${accountIds.join(',')})`)
      .gte('sent_at', thirtyDaysAgo.toISOString())
      .order('sent_at', { ascending: false })

    const warmupEmails = (warmupEmailsResult.data as WarmupEmail[] | null) || []

    // Group warmup emails by account
    const emailsByAccount = new Map<string, WarmupEmail[]>()
    for (const email of warmupEmails) {
      const fromId = email.from_account_id
      const toId = email.to_account_id
      if (fromId) {
        if (!emailsByAccount.has(fromId)) {
          emailsByAccount.set(fromId, [])
        }
        emailsByAccount.get(fromId)?.push(email)
      }
      if (toId && toId !== fromId) {
        if (!emailsByAccount.has(toId)) {
          emailsByAccount.set(toId, [])
        }
        emailsByAccount.get(toId)?.push(email)
      }
    }

    // Get today's date for filtering
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Process each account
    const accountAnalytics: WarmupAnalytics[] = []
    const accountSummaries: Array<{
      id: string
      email: string
      displayName: string | null
      provider: string
      warmupEnabled: boolean
      status: string
      currentStage: number
      progressPercent: number
      healthStatus: 'healthy' | 'warning' | 'critical'
      reputationScore: number
      replyRate: number
      sentToday: number
      receivedToday: number
      dailyLimit: number
    }> = []

    let totalSentToday = 0
    let totalReceivedToday = 0
    let totalReputationScore = 0

    const stageLimits = [5, 10, 20, 35, 50, 75]

    for (const account of accounts) {
      const accountEmails = emailsByAccount.get(account.id) || []
      const sentEmails = accountEmails.filter(e => e.from_account_id === account.id)
      const receivedEmails = accountEmails.filter(e => e.to_account_id === account.id)

      // Today's emails
      const todaySent = sentEmails.filter(e => new Date(e.sent_at) >= today)
      const todayReceived = receivedEmails.filter(e => new Date(e.sent_at) >= today)

      totalSentToday += todaySent.length
      totalReceivedToday += todayReceived.length

      // Calculate stats
      const repliedCount = sentEmails.filter(e => e.status === 'replied').length
      const openedCount = sentEmails.filter(e => e.status === 'opened' || e.status === 'replied').length
      const deliveredCount = sentEmails.filter(e => e.status !== 'sent').length

      // Calculate reputation
      const reputationFactors: ReputationFactors = {
        sentCount: sentEmails.length,
        deliveredCount,
        bouncedCount: 0,
        openedCount,
        clickedCount: 0,
        repliedCount,
        spamReports: 0,
        unsubscribes: 0,
        daysSinceFirstSend: Math.ceil(
          (Date.now() - new Date(account.created_at).getTime()) / (1000 * 60 * 60 * 24)
        ),
      }

      const reputationScore = calculateReputationScore(reputationFactors)
      totalReputationScore += reputationScore.overall

      // Calculate warmup stage and progress
      const warmupProgress = account.warmup_progress || 0
      const currentStage = Math.min(6, Math.floor(warmupProgress / 17) + 1)
      const daysInCurrentStage = Math.floor((warmupProgress % 17) / 3)

      // Build analytics input
      const analyticsInput: WarmupAnalyticsInput = {
        accountId: account.id,
        email: account.email,
        warmupStartDate: new Date(account.created_at),
        currentStage,
        daysInCurrentStage,
        warmupEnabled: account.warmup_enabled,
        stats: {
          totalSent: sentEmails.length,
          totalReceived: receivedEmails.length,
          totalReplied: repliedCount,
          totalOpened: openedCount,
          totalBounced: 0,
          spamReports: 0,
          unsubscribes: 0,
        },
        todayStats: {
          sent: todaySent.length,
          received: todayReceived.length,
          replied: todaySent.filter(e => e.status === 'replied').length,
        },
      }

      // Get analytics for this account
      const analytics = getWarmupAnalytics(analyticsInput)
      if (account.warmup_enabled) {
        accountAnalytics.push(analytics)
      }

      // Build account summary
      accountSummaries.push({
        id: account.id,
        email: account.email,
        displayName: account.display_name,
        provider: account.provider,
        warmupEnabled: account.warmup_enabled,
        status: account.status,
        currentStage,
        progressPercent: analytics.progressPercent,
        healthStatus: analytics.healthStatus,
        reputationScore: reputationScore.overall,
        replyRate: analytics.replyRate,
        sentToday: todaySent.length,
        receivedToday: todayReceived.length,
        dailyLimit: stageLimits[currentStage - 1] || 75,
      })
    }

    // Get organization summary from analytics
    const orgSummary = getOrgWarmupSummary(accountAnalytics)

    // Group accounts by stage
    const accountsByStage: Record<number, number> = {}
    for (const summary of accountSummaries.filter(a => a.warmupEnabled)) {
      const stage = summary.currentStage
      accountsByStage[stage] = (accountsByStage[stage] || 0) + 1
    }

    // Group accounts by health
    const accountsByHealth = {
      healthy: accountSummaries.filter(a => a.healthStatus === 'healthy').length,
      warning: accountSummaries.filter(a => a.healthStatus === 'warning').length,
      critical: accountSummaries.filter(a => a.healthStatus === 'critical').length,
    }

    // Calculate projected daily capacity (sum of all daily limits for active warmup accounts)
    const projectedDailyCapacity = accountSummaries
      .filter(a => a.warmupEnabled)
      .reduce((sum, a) => sum + a.dailyLimit, 0)

    // Get recent activity (last 10 warmup emails)
    const recentActivity = warmupEmails.slice(0, 10).map(email => ({
      id: email.id,
      fromAccountId: email.from_account_id,
      toAccountId: email.to_account_id,
      subject: email.subject,
      status: email.status,
      sentAt: email.sent_at,
      openedAt: email.opened_at,
      repliedAt: email.replied_at,
    }))

    // Build response
    return NextResponse.json({
      overview: {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter(a => a.status === 'active' || a.status === 'warming').length,
        warmupEnabled: accounts.filter(a => a.warmup_enabled).length,
        healthyAccounts: orgSummary.healthyAccounts,
        warningAccounts: orgSummary.warningAccounts,
        criticalAccounts: orgSummary.criticalAccounts,
        averageProgress: orgSummary.averageProgress,
        averageReplyRate: orgSummary.averageReplyRate,
        averageReputationScore: accounts.length > 0
          ? Math.round(totalReputationScore / accounts.length)
          : 0,
        totalSentToday,
        totalReceivedToday,
        projectedDailyCapacity,
      },
      accounts: accountSummaries.map(account => ({
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        provider: account.provider,
        warmupEnabled: account.warmupEnabled,
        status: account.status,
        currentStage: account.currentStage,
        progressPercent: account.progressPercent,
        healthStatus: account.healthStatus,
        reputationScore: account.reputationScore,
        replyRate: account.replyRate,
        sentToday: account.sentToday,
        receivedToday: account.receivedToday,
        dailyLimit: account.dailyLimit,
        utilizationPercent: account.dailyLimit > 0
          ? Math.round((account.sentToday / account.dailyLimit) * 100)
          : 0,
      })),
      accountsByStage,
      accountsByHealth,
      stageBreakdown: [
        { stage: 1, name: 'Initial', count: accountsByStage[1] || 0, dailyLimit: 5 },
        { stage: 2, name: 'Building', count: accountsByStage[2] || 0, dailyLimit: 10 },
        { stage: 3, name: 'Growing', count: accountsByStage[3] || 0, dailyLimit: 20 },
        { stage: 4, name: 'Moderate', count: accountsByStage[4] || 0, dailyLimit: 35 },
        { stage: 5, name: 'High', count: accountsByStage[5] || 0, dailyLimit: 50 },
        { stage: 6, name: 'Maintenance', count: accountsByStage[6] || 0, dailyLimit: 75 },
      ],
      alerts: [
        ...(orgSummary.criticalAccounts > 0 ? [{
          type: 'critical' as const,
          message: `${orgSummary.criticalAccounts} account(s) need immediate attention`,
          count: orgSummary.criticalAccounts,
        }] : []),
        ...(orgSummary.warningAccounts > 0 ? [{
          type: 'warning' as const,
          message: `${orgSummary.warningAccounts} account(s) showing warning signs`,
          count: orgSummary.warningAccounts,
        }] : []),
        ...(orgSummary.averageReplyRate < 20 && accountAnalytics.length > 0 ? [{
          type: 'info' as const,
          message: 'Average reply rate is below target (20%)',
          value: orgSummary.averageReplyRate,
        }] : []),
      ],
      recentActivity,
    })
  } catch (error) {
    console.error('Warmup dashboard GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
