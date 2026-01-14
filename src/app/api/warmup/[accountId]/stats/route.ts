import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import {
  calculateReputationScore,
  getReputationHealth,
  getReputationIssues,
  getReputationRecommendations,
  getReputationTrend,
  type ReputationFactors,
  type ReputationScore,
} from '@/lib/warmup/reputation'
import {
  getWarmupAnalytics,
  getWarmupProjection,
  calculateWarmupEfficiency,
  getAnalyticsRecommendations,
  type WarmupAnalyticsInput,
} from '@/lib/warmup/analytics'

type EmailAccount = Tables<'email_accounts'>
type WarmupEmail = Tables<'warmup_emails'>

interface UserWithOrg {
  organization_id: string | null
}

/**
 * GET /api/warmup/[accountId]/stats
 * Get comprehensive warmup statistics and reputation metrics for a specific account
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { accountId } = await params

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

    // Get account details
    const accountResult = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', profile.organization_id)
      .single()

    const account = accountResult.data as EmailAccount | null
    const accountError = accountResult.error

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Get warmup emails for this account (last 30 days for detailed stats)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const warmupEmailsResult = await supabase
      .from('warmup_emails')
      .select('*')
      .or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .gte('sent_at', thirtyDaysAgo.toISOString())
      .order('sent_at', { ascending: false })

    const warmupEmails = (warmupEmailsResult.data as WarmupEmail[] | null) || []

    // Get today's stats
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayEmails = warmupEmails.filter(e => new Date(e.sent_at) >= today)

    // Calculate sent vs received
    const sentEmails = warmupEmails.filter(e => e.from_account_id === accountId)
    const receivedEmails = warmupEmails.filter(e => e.to_account_id === accountId)
    const todaySent = todayEmails.filter(e => e.from_account_id === accountId)
    const todayReceived = todayEmails.filter(e => e.to_account_id === accountId)

    // Count statuses
    const repliedCount = sentEmails.filter(e => e.status === 'replied').length
    const openedCount = sentEmails.filter(e => e.status === 'opened' || e.status === 'replied').length
    const deliveredCount = sentEmails.filter(e => e.status !== 'sent').length // Any status change means delivered
    const bouncedCount = 0 // Would need to track bounces separately

    // Build reputation factors
    const reputationFactors: ReputationFactors = {
      sentCount: sentEmails.length,
      deliveredCount: deliveredCount,
      bouncedCount: bouncedCount,
      openedCount: openedCount,
      clickedCount: 0, // Warmup doesn't track clicks
      repliedCount: repliedCount,
      spamReports: 0, // Would need spam tracking
      unsubscribes: 0, // N/A for warmup
      daysSinceFirstSend: Math.ceil(
        (Date.now() - new Date(account.created_at).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }

    // Calculate reputation score
    const reputationScore = calculateReputationScore(reputationFactors)
    const reputationHealth = getReputationHealth(reputationScore)
    const reputationIssues = getReputationIssues(reputationScore, reputationFactors)
    const reputationRecommendations = getReputationRecommendations(reputationScore, reputationFactors)

    // Build history for trend analysis (group by day)
    const dailyScores: ReputationScore[] = []
    const emailsByDay = new Map<string, typeof warmupEmails>()

    for (const email of sentEmails) {
      const day = email.sent_at.split('T')[0] ?? ''
      if (!emailsByDay.has(day)) {
        emailsByDay.set(day, [])
      }
      emailsByDay.get(day)?.push(email)
    }

    // Calculate daily reputation scores for trend
    for (const [, dayEmails] of emailsByDay) {
      const dayReplied = dayEmails.filter(e => e.status === 'replied').length
      const dayOpened = dayEmails.filter(e => e.status === 'opened' || e.status === 'replied').length
      const dayDelivered = dayEmails.filter(e => e.status !== 'sent').length

      const dayFactors: ReputationFactors = {
        sentCount: dayEmails.length,
        deliveredCount: dayDelivered,
        bouncedCount: 0,
        openedCount: dayOpened,
        clickedCount: 0,
        repliedCount: dayReplied,
        spamReports: 0,
        unsubscribes: 0,
      }
      dailyScores.push(calculateReputationScore(dayFactors))
    }

    const reputationTrend = getReputationTrend(dailyScores)

    // Calculate warmup stage and progress
    const warmupProgress = account.warmup_progress || 0
    const currentStage = Math.min(6, Math.floor(warmupProgress / 17) + 1)
    const daysInCurrentStage = Math.floor((warmupProgress % 17) / 3) // Approximate

    // Build analytics input
    const warmupStartDate = new Date(account.created_at)
    const analyticsInput: WarmupAnalyticsInput = {
      accountId: account.id,
      email: account.email,
      warmupStartDate,
      currentStage,
      daysInCurrentStage,
      warmupEnabled: account.warmup_enabled,
      stats: {
        totalSent: sentEmails.length,
        totalReceived: receivedEmails.length,
        totalReplied: repliedCount,
        totalOpened: openedCount,
        totalBounced: bouncedCount,
        spamReports: 0,
        unsubscribes: 0,
      },
      todayStats: {
        sent: todaySent.length,
        received: todayReceived.length,
        replied: todaySent.filter(e => e.status === 'replied').length,
      },
      reputationHistory: dailyScores,
    }

    // Get comprehensive analytics
    const analytics = getWarmupAnalytics(analyticsInput)
    const projection = getWarmupProjection(currentStage, daysInCurrentStage)
    const efficiency = calculateWarmupEfficiency(analytics)
    const analyticsRecommendations = getAnalyticsRecommendations(analytics)

    // Build daily metrics for the last 7 days
    const dailyMetrics: Array<{
      date: string
      sent: number
      received: number
      replied: number
      opened: number
      replyRate: number
    }> = []

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    for (let i = 0; i < 7; i++) {
      const date = new Date(sevenDaysAgo)
      date.setDate(date.getDate() + i)
      const dateStr = date.toISOString().split('T')[0] ?? ''

      const dayEmails = warmupEmails.filter(e => e.sent_at.startsWith(dateStr))
      const daySent = dayEmails.filter(e => e.from_account_id === accountId)
      const dayReceived = dayEmails.filter(e => e.to_account_id === accountId)
      const dayReplied = daySent.filter(e => e.status === 'replied').length
      const dayOpened = daySent.filter(e => e.status === 'opened' || e.status === 'replied').length

      dailyMetrics.push({
        date: dateStr,
        sent: daySent.length,
        received: dayReceived.length,
        replied: dayReplied,
        opened: dayOpened,
        replyRate: daySent.length > 0 ? Math.round((dayReplied / daySent.length) * 100) : 0,
      })
    }

    // Get stage configuration
    const stageLimits = [5, 10, 20, 35, 50, 75]
    const stageDescriptions = [
      'Initial warmup',
      'Building reputation',
      'Increasing volume',
      'Moderate volume',
      'High volume',
      'Maintenance',
    ]

    return NextResponse.json({
      account: {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
        provider: account.provider,
        warmupEnabled: account.warmup_enabled,
        status: account.status,
        createdAt: account.created_at,
      },
      warmup: {
        currentDay: analytics.currentDay,
        currentStage,
        stageDescription: stageDescriptions[currentStage - 1],
        daysInCurrentStage,
        progressPercent: analytics.progressPercent,
        dailyLimit: stageLimits[currentStage - 1] || 75,
        sentToday: todaySent.length,
        receivedToday: todayReceived.length,
        repliedToday: todaySent.filter(e => e.status === 'replied').length,
      },
      stats: {
        totalSent: sentEmails.length,
        totalReceived: receivedEmails.length,
        totalReplied: repliedCount,
        totalOpened: openedCount,
        replyRate: sentEmails.length > 0
          ? Math.round((repliedCount / sentEmails.length) * 1000) / 10
          : 0,
        openRate: sentEmails.length > 0
          ? Math.round((openedCount / sentEmails.length) * 1000) / 10
          : 0,
        avgDailyVolume: analytics.avgDailyVolume,
      },
      reputation: {
        score: reputationScore,
        health: reputationHealth,
        trend: reputationTrend,
        issues: reputationIssues,
        recommendations: reputationRecommendations,
      },
      analytics: {
        healthStatus: analytics.healthStatus,
        isAtRisk: analytics.isAtRisk,
        efficiency,
        trends: analytics.trends,
        recommendations: analyticsRecommendations,
      },
      projection: {
        daysToFullCapacity: projection.daysToFullCapacity,
        projectedCompletionDate: projection.projectedDate.toISOString(),
        currentDailyLimit: projection.currentDailyLimit,
        finalDailyLimit: projection.finalDailyLimit,
        milestones: projection.milestones.map(m => ({
          stage: m.stage,
          expectedDate: m.expectedDate.toISOString(),
          dailyLimit: m.dailyLimit,
        })),
      },
      dailyMetrics,
    })
  } catch (error) {
    console.error('Warmup stats GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
