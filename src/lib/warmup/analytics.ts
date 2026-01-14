/**
 * Warmup Analytics System
 *
 * Provides comprehensive analytics and insights for email warmup progress,
 * including health monitoring, projections, and performance metrics.
 */

import {
  calculateReputationScore,
  getReputationTrend,
  isReputationAtRisk,
  type ReputationScore,
  type ReputationFactors,
} from './reputation'
import { DEFAULT_WARMUP_STAGES, type WarmupStage } from './types'

// Comprehensive warmup analytics for a single account
export interface WarmupAnalytics {
  accountId: string
  email: string
  startDate: Date
  currentDay: number
  currentStage: number
  totalSent: number
  totalReceived: number
  totalReplied: number
  replyRate: number
  avgDailyVolume: number
  projectedCompletionDate: Date
  healthStatus: 'healthy' | 'warning' | 'critical'
  reputationScore: ReputationScore
  isAtRisk: boolean
  daysUntilCompletion: number
  progressPercent: number
  stageProgress: {
    current: number
    total: number
    daysInCurrent: number
    daysRemaining: number
  }
  dailyStats: {
    sent: number
    received: number
    replied: number
    limit: number
  }
  trends: {
    reputation: 'improving' | 'declining' | 'stable'
    volume: 'increasing' | 'decreasing' | 'stable'
    engagement: 'improving' | 'declining' | 'stable'
  }
}

// Organization-wide warmup summary
export interface OrgWarmupSummary {
  totalAccounts: number
  activeAccounts: number
  healthyAccounts: number
  warningAccounts: number
  criticalAccounts: number
  averageProgress: number
  averageReplyRate: number
  totalSentToday: number
  totalRepliedToday: number
  projectedCapacity: number
  accountsByStage: Record<number, number>
  recentAlerts: number
}

// Daily warmup metrics
export interface DailyWarmupMetrics {
  date: string
  sent: number
  received: number
  replied: number
  opened: number
  bounced: number
  replyRate: number
  deliveryRate: number
}

// Warmup projection data
export interface WarmupProjection {
  daysToFullCapacity: number
  projectedDate: Date
  currentDailyLimit: number
  finalDailyLimit: number
  milestones: Array<{
    stage: number
    expectedDate: Date
    dailyLimit: number
  }>
}

// Input data for analytics calculation
export interface WarmupAnalyticsInput {
  accountId: string
  email: string
  warmupStartDate: Date
  currentStage: number
  daysInCurrentStage: number
  warmupEnabled: boolean
  stats: {
    totalSent: number
    totalReceived: number
    totalReplied: number
    totalOpened: number
    totalBounced: number
    spamReports: number
    unsubscribes: number
  }
  todayStats: {
    sent: number
    received: number
    replied: number
  }
  reputationHistory?: ReputationScore[]
  dailyMetrics?: DailyWarmupMetrics[]
}

/**
 * Calculate comprehensive warmup analytics for an account
 */
export function getWarmupAnalytics(
  input: WarmupAnalyticsInput,
  stages: WarmupStage[] = DEFAULT_WARMUP_STAGES
): WarmupAnalytics {
  const {
    accountId,
    email,
    warmupStartDate,
    currentStage,
    daysInCurrentStage,
    stats,
    todayStats,
    reputationHistory = [],
    dailyMetrics = [],
  } = input

  // Calculate current day
  const now = new Date()
  const msPerDay = 24 * 60 * 60 * 1000
  const currentDay = Math.floor((now.getTime() - warmupStartDate.getTime()) / msPerDay) + 1

  // Calculate reputation
  const reputationFactors: ReputationFactors = {
    sentCount: stats.totalSent,
    deliveredCount: stats.totalSent - stats.totalBounced,
    bouncedCount: stats.totalBounced,
    openedCount: stats.totalOpened,
    clickedCount: 0, // Warmup doesn't track clicks
    repliedCount: stats.totalReplied,
    spamReports: stats.spamReports,
    unsubscribes: stats.unsubscribes,
    daysSinceFirstSend: currentDay,
  }

  const reputationScore = calculateReputationScore(reputationFactors)
  const isAtRisk = isReputationAtRisk(reputationScore)

  // Calculate stage progress
  const currentStageConfig = stages[currentStage - 1] ?? stages[0]
  const totalStageDays = stages.reduce((sum, s) => sum + s.daysInStage, 0)
  let completedDays = 0
  for (let i = 0; i < currentStage - 1 && i < stages.length; i++) {
    const stage = stages[i]
    if (stage) completedDays += stage.daysInStage
  }
  completedDays += daysInCurrentStage

  const progressPercent = Math.min(100, Math.round((completedDays / totalStageDays) * 100))

  // Calculate days until completion
  let daysUntilCompletion = 0
  for (let i = currentStage - 1; i < stages.length; i++) {
    const stage = stages[i]
    if (!stage) continue
    if (i === currentStage - 1) {
      daysUntilCompletion += Math.max(0, stage.daysInStage - daysInCurrentStage)
    } else {
      daysUntilCompletion += stage.daysInStage
    }
  }

  // Calculate projected completion date
  const projectedCompletionDate = new Date(now.getTime() + daysUntilCompletion * msPerDay)

  // Calculate average daily volume
  const avgDailyVolume = currentDay > 0 ? Math.round(stats.totalSent / currentDay) : 0

  // Calculate reply rate
  const replyRate = stats.totalSent > 0
    ? Math.round((stats.totalReplied / stats.totalSent) * 1000) / 10
    : 0

  // Determine health status
  const healthStatus = calculateWarmupHealth({
    reputationScore,
    replyRate,
    isAtRisk,
    currentDay,
    progressPercent,
  })

  // Calculate trends
  const trends = calculateTrends(reputationHistory, dailyMetrics)

  // Get current daily limit
  const dailyLimit = currentStageConfig?.dailySendLimit ?? 50

  return {
    accountId,
    email,
    startDate: warmupStartDate,
    currentDay,
    currentStage,
    totalSent: stats.totalSent,
    totalReceived: stats.totalReceived,
    totalReplied: stats.totalReplied,
    replyRate,
    avgDailyVolume,
    projectedCompletionDate,
    healthStatus,
    reputationScore,
    isAtRisk,
    daysUntilCompletion,
    progressPercent,
    stageProgress: {
      current: currentStage,
      total: stages.length,
      daysInCurrent: daysInCurrentStage,
      daysRemaining: Math.max(0, (currentStageConfig?.daysInStage ?? 0) - daysInCurrentStage),
    },
    dailyStats: {
      sent: todayStats.sent,
      received: todayStats.received,
      replied: todayStats.replied,
      limit: dailyLimit,
    },
    trends,
  }
}

/**
 * Calculate warmup health status
 */
export function calculateWarmupHealth(params: {
  reputationScore: ReputationScore
  replyRate: number
  isAtRisk: boolean
  currentDay: number
  progressPercent: number
}): 'healthy' | 'warning' | 'critical' {
  const { reputationScore, replyRate, isAtRisk, currentDay } = params

  // Critical conditions
  if (reputationScore.overall < 40) return 'critical'
  if (reputationScore.spamScore < 50) return 'critical'
  if (reputationScore.bounceRate < 40) return 'critical'

  // Warning conditions
  if (isAtRisk) return 'warning'
  if (reputationScore.overall < 60) return 'warning'
  if (replyRate < 15 && currentDay > 7) return 'warning'
  if (reputationScore.deliverability < 70) return 'warning'

  return 'healthy'
}

/**
 * Calculate trends from historical data
 */
function calculateTrends(
  reputationHistory: ReputationScore[],
  dailyMetrics: DailyWarmupMetrics[]
): WarmupAnalytics['trends'] {
  // Reputation trend
  const reputationTrend = reputationHistory.length >= 2
    ? getReputationTrend(reputationHistory)
    : 'stable'

  // Volume trend (compare last 7 days to previous 7 days)
  let volumeTrend: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (dailyMetrics.length >= 14) {
    const recent7 = dailyMetrics.slice(-7)
    const previous7 = dailyMetrics.slice(-14, -7)
    const recentAvg = recent7.reduce((sum, d) => sum + d.sent, 0) / 7
    const previousAvg = previous7.reduce((sum, d) => sum + d.sent, 0) / 7
    const volumeChange = ((recentAvg - previousAvg) / previousAvg) * 100

    if (volumeChange > 10) volumeTrend = 'increasing'
    else if (volumeChange < -10) volumeTrend = 'decreasing'
  }

  // Engagement trend (based on reply rates)
  let engagementTrend: 'improving' | 'declining' | 'stable' = 'stable'
  if (dailyMetrics.length >= 14) {
    const recent7 = dailyMetrics.slice(-7)
    const previous7 = dailyMetrics.slice(-14, -7)
    const recentReplyRate = recent7.reduce((sum, d) => sum + d.replyRate, 0) / 7
    const previousReplyRate = previous7.reduce((sum, d) => sum + d.replyRate, 0) / 7

    if (recentReplyRate > previousReplyRate + 5) engagementTrend = 'improving'
    else if (recentReplyRate < previousReplyRate - 5) engagementTrend = 'declining'
  }

  return {
    reputation: reputationTrend,
    volume: volumeTrend,
    engagement: engagementTrend,
  }
}

/**
 * Get warmup analytics summary for entire organization
 */
export function getOrgWarmupSummary(
  accountAnalytics: WarmupAnalytics[]
): OrgWarmupSummary {
  if (accountAnalytics.length === 0) {
    return {
      totalAccounts: 0,
      activeAccounts: 0,
      healthyAccounts: 0,
      warningAccounts: 0,
      criticalAccounts: 0,
      averageProgress: 0,
      averageReplyRate: 0,
      totalSentToday: 0,
      totalRepliedToday: 0,
      projectedCapacity: 0,
      accountsByStage: {},
      recentAlerts: 0,
    }
  }

  const healthyAccounts = accountAnalytics.filter(a => a.healthStatus === 'healthy').length
  const warningAccounts = accountAnalytics.filter(a => a.healthStatus === 'warning').length
  const criticalAccounts = accountAnalytics.filter(a => a.healthStatus === 'critical').length

  const averageProgress = Math.round(
    accountAnalytics.reduce((sum, a) => sum + a.progressPercent, 0) / accountAnalytics.length
  )

  const averageReplyRate = Math.round(
    (accountAnalytics.reduce((sum, a) => sum + a.replyRate, 0) / accountAnalytics.length) * 10
  ) / 10

  const totalSentToday = accountAnalytics.reduce((sum, a) => sum + a.dailyStats.sent, 0)
  const totalRepliedToday = accountAnalytics.reduce((sum, a) => sum + a.dailyStats.replied, 0)

  // Calculate projected capacity (sum of all daily limits when warmup complete)
  const projectedCapacity = accountAnalytics.length * 75 // Stage 6 limit

  // Group accounts by stage
  const accountsByStage: Record<number, number> = {}
  for (const account of accountAnalytics) {
    accountsByStage[account.currentStage] = (accountsByStage[account.currentStage] || 0) + 1
  }

  // Count accounts with alerts
  const recentAlerts = warningAccounts + criticalAccounts

  return {
    totalAccounts: accountAnalytics.length,
    activeAccounts: accountAnalytics.length,
    healthyAccounts,
    warningAccounts,
    criticalAccounts,
    averageProgress,
    averageReplyRate,
    totalSentToday,
    totalRepliedToday,
    projectedCapacity,
    accountsByStage,
    recentAlerts,
  }
}

/**
 * Calculate warmup projection milestones
 */
export function getWarmupProjection(
  currentStage: number,
  daysInCurrentStage: number,
  stages: WarmupStage[] = DEFAULT_WARMUP_STAGES
): WarmupProjection {
  const now = new Date()
  const msPerDay = 24 * 60 * 60 * 1000

  const currentStageConfig = stages[currentStage - 1]
  const finalStageConfig = stages[stages.length - 1]

  // Calculate days to full capacity
  let totalDays = 0
  for (let i = currentStage - 1; i < stages.length; i++) {
    const stage = stages[i]
    if (!stage) continue
    if (i === currentStage - 1) {
      totalDays += Math.max(0, stage.daysInStage - daysInCurrentStage)
    } else {
      totalDays += stage.daysInStage
    }
  }

  // Calculate milestones
  const milestones: WarmupProjection['milestones'] = []
  let cumulativeDays = 0

  for (let i = currentStage - 1; i < stages.length; i++) {
    const stage = stages[i]
    if (!stage) continue

    if (i === currentStage - 1) {
      cumulativeDays += Math.max(0, stage.daysInStage - daysInCurrentStage)
    } else {
      cumulativeDays += stage.daysInStage
    }

    milestones.push({
      stage: stage.stage,
      expectedDate: new Date(now.getTime() + cumulativeDays * msPerDay),
      dailyLimit: stage.dailySendLimit,
    })
  }

  return {
    daysToFullCapacity: totalDays,
    projectedDate: new Date(now.getTime() + totalDays * msPerDay),
    currentDailyLimit: currentStageConfig?.dailySendLimit ?? 5,
    finalDailyLimit: finalStageConfig?.dailySendLimit ?? 75,
    milestones,
  }
}

/**
 * Calculate warmup efficiency score
 */
export function calculateWarmupEfficiency(analytics: WarmupAnalytics): number {
  // Efficiency based on:
  // - Reply rate vs target (30% weight)
  // - Reputation score (40% weight)
  // - Progress pace (30% weight)

  const targetReplyRate = 30
  const replyEfficiency = Math.min(100, (analytics.replyRate / targetReplyRate) * 100)

  const reputationEfficiency = analytics.reputationScore.overall

  // Progress pace: are we on track?
  const expectedProgress = (analytics.currentDay / 26) * 100 // 26 days for full warmup
  const paceEfficiency = Math.min(100, (analytics.progressPercent / expectedProgress) * 100)

  return Math.round(
    replyEfficiency * 0.3 +
    reputationEfficiency * 0.4 +
    paceEfficiency * 0.3
  )
}

/**
 * Get recommended actions based on analytics
 */
export function getAnalyticsRecommendations(analytics: WarmupAnalytics): string[] {
  const recommendations: string[] = []

  // Check health status
  if (analytics.healthStatus === 'critical') {
    recommendations.push('URGENT: Pause warmup and investigate deliverability issues')
  }

  // Check reply rate
  if (analytics.replyRate < 20 && analytics.currentDay > 5) {
    recommendations.push('Increase warmup pool size to improve reply rates')
  }

  // Check reputation
  if (analytics.reputationScore.overall < 70) {
    recommendations.push('Review email content quality and list hygiene')
  }

  // Check daily utilization
  const utilization = (analytics.dailyStats.sent / analytics.dailyStats.limit) * 100
  if (utilization < 80 && analytics.healthStatus === 'healthy') {
    recommendations.push('Increase daily sending volume to match limits')
  }

  // Check engagement trend
  if (analytics.trends.engagement === 'declining') {
    recommendations.push('Engagement declining - vary email templates and timing')
  }

  // Positive recommendation
  if (analytics.healthStatus === 'healthy' && analytics.progressPercent > 80) {
    recommendations.push('Warmup nearly complete - prepare for production sending')
  }

  return recommendations
}

/**
 * Compare warmup progress between accounts
 */
export function compareWarmupProgress(
  account1: WarmupAnalytics,
  account2: WarmupAnalytics
): {
  progressDiff: number
  replyRateDiff: number
  healthComparison: string
  recommendation: string
} {
  const progressDiff = account1.progressPercent - account2.progressPercent
  const replyRateDiff = account1.replyRate - account2.replyRate

  const healthRank = { healthy: 3, warning: 2, critical: 1 }
  const health1 = healthRank[account1.healthStatus]
  const health2 = healthRank[account2.healthStatus]

  let healthComparison: string
  if (health1 > health2) {
    healthComparison = `${account1.email} is healthier`
  } else if (health2 > health1) {
    healthComparison = `${account2.email} is healthier`
  } else {
    healthComparison = 'Both accounts have similar health'
  }

  let recommendation: string
  if (account1.healthStatus === 'critical' || account2.healthStatus === 'critical') {
    recommendation = 'Focus on resolving critical issues before comparing progress'
  } else if (Math.abs(replyRateDiff) > 10) {
    recommendation = replyRateDiff > 0
      ? `Apply ${account1.email} strategies to ${account2.email}`
      : `Apply ${account2.email} strategies to ${account1.email}`
  } else {
    recommendation = 'Both accounts performing similarly - maintain current approach'
  }

  return {
    progressDiff,
    replyRateDiff,
    healthComparison,
    recommendation,
  }
}
