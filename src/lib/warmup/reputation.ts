/**
 * Email Reputation Monitoring System
 *
 * Calculates and tracks email sender reputation scores based on
 * various engagement and deliverability metrics.
 */

// Reputation score breakdown
export interface ReputationScore {
  overall: number // 0-100 overall reputation score
  deliverability: number // 0-100 how many emails reach inbox
  engagement: number // 0-100 opens, clicks, replies
  spamScore: number // 0-100 spam complaints (lower is better)
  bounceRate: number // 0-100 bounce percentage (lower is better)
}

// Factors that influence reputation
export interface ReputationFactors {
  sentCount: number
  deliveredCount: number
  bouncedCount: number
  openedCount: number
  clickedCount: number
  repliedCount: number
  spamReports: number
  unsubscribes: number
  // Time-based factors
  daysSinceFirstSend?: number
  consistentSendingDays?: number
}

// Historical reputation entry
export interface ReputationHistoryEntry {
  date: string
  score: ReputationScore
  factors: ReputationFactors
}

// Reputation thresholds for different health levels
export const REPUTATION_THRESHOLDS = {
  excellent: 90,
  good: 75,
  fair: 60,
  poor: 40,
  critical: 20,
} as const

// Weights for calculating overall score
const SCORE_WEIGHTS = {
  deliverability: 0.35,
  engagement: 0.30,
  spamScore: 0.20,
  bounceRate: 0.15,
}

/**
 * Calculate comprehensive reputation score from engagement factors
 */
export function calculateReputationScore(
  factors: ReputationFactors
): ReputationScore {
  const {
    sentCount,
    deliveredCount,
    bouncedCount,
    openedCount,
    repliedCount,
    spamReports,
    unsubscribes,
  } = factors

  // Avoid division by zero
  if (sentCount === 0) {
    return {
      overall: 50, // Neutral score for new accounts
      deliverability: 50,
      engagement: 50,
      spamScore: 100, // Perfect - no spam reports
      bounceRate: 100, // Perfect - no bounces
    }
  }

  // Calculate deliverability (0-100, higher is better)
  const deliverability = Math.round((deliveredCount / sentCount) * 100)

  // Calculate engagement (weighted combination of opens and replies)
  // Opens contribute 40%, replies contribute 60% (replies are more valuable)
  const openRate = deliveredCount > 0 ? openedCount / deliveredCount : 0
  const replyRate = deliveredCount > 0 ? repliedCount / deliveredCount : 0
  const engagement = Math.min(100, Math.round((openRate * 40 + replyRate * 200)))

  // Calculate spam score (inverted - 100 means no spam reports)
  const spamRate = sentCount > 0 ? spamReports / sentCount : 0
  // Any spam rate above 0.1% is considered problematic
  const spamScore = Math.max(0, Math.round(100 - (spamRate * 10000)))

  // Calculate bounce rate score (inverted - 100 means no bounces)
  const bounceRateValue = sentCount > 0 ? (bouncedCount + unsubscribes) / sentCount : 0
  // Bounce rate above 2% is considered problematic
  const bounceRate = Math.max(0, Math.round(100 - (bounceRateValue * 5000)))

  // Calculate weighted overall score
  const overall = Math.round(
    deliverability * SCORE_WEIGHTS.deliverability +
    engagement * SCORE_WEIGHTS.engagement +
    spamScore * SCORE_WEIGHTS.spamScore +
    bounceRate * SCORE_WEIGHTS.bounceRate
  )

  return {
    overall: Math.min(100, Math.max(0, overall)),
    deliverability: Math.min(100, Math.max(0, deliverability)),
    engagement: Math.min(100, Math.max(0, engagement)),
    spamScore: Math.min(100, Math.max(0, spamScore)),
    bounceRate: Math.min(100, Math.max(0, bounceRate)),
  }
}

/**
 * Analyze reputation trend from historical data
 */
export function getReputationTrend(
  history: ReputationScore[]
): 'improving' | 'declining' | 'stable' {
  if (history.length < 2) {
    return 'stable'
  }

  // Compare average of first half vs second half
  const midpoint = Math.floor(history.length / 2)
  const firstHalf = history.slice(0, midpoint)
  const secondHalf = history.slice(midpoint)

  const firstAvg = firstHalf.reduce((sum, s) => sum + s.overall, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((sum, s) => sum + s.overall, 0) / secondHalf.length

  const difference = secondAvg - firstAvg

  // Threshold of 5 points for meaningful change
  if (difference > 5) {
    return 'improving'
  } else if (difference < -5) {
    return 'declining'
  }
  return 'stable'
}

/**
 * Calculate rate of change in reputation
 */
export function getReputationChangeRate(
  history: ReputationScore[]
): number {
  if (history.length < 2) {
    return 0
  }

  const oldest = history[0]
  const newest = history[history.length - 1]

  if (!oldest || !newest) return 0

  // Points change per day
  const daysDiff = history.length
  return (newest.overall - oldest.overall) / daysDiff
}

/**
 * Check if reputation is at risk and needs attention
 */
export function isReputationAtRisk(score: ReputationScore): boolean {
  // At risk if overall is below fair threshold
  if (score.overall < REPUTATION_THRESHOLDS.fair) {
    return true
  }

  // At risk if any individual metric is critical
  if (score.deliverability < REPUTATION_THRESHOLDS.poor) {
    return true
  }

  if (score.spamScore < REPUTATION_THRESHOLDS.fair) {
    return true // Spam complaints are very damaging
  }

  if (score.bounceRate < REPUTATION_THRESHOLDS.poor) {
    return true
  }

  return false
}

/**
 * Get reputation health status label
 */
export function getReputationHealth(
  score: ReputationScore
): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  const overall = score.overall

  if (overall >= REPUTATION_THRESHOLDS.excellent) return 'excellent'
  if (overall >= REPUTATION_THRESHOLDS.good) return 'good'
  if (overall >= REPUTATION_THRESHOLDS.fair) return 'fair'
  if (overall >= REPUTATION_THRESHOLDS.poor) return 'poor'
  return 'critical'
}

/**
 * Get specific reputation issues that need addressing
 */
export function getReputationIssues(
  score: ReputationScore,
  factors: ReputationFactors
): string[] {
  const issues: string[] = []

  // Check deliverability
  if (score.deliverability < REPUTATION_THRESHOLDS.fair) {
    const deliveryRate = factors.sentCount > 0
      ? Math.round((factors.deliveredCount / factors.sentCount) * 100)
      : 0
    issues.push(`Low deliverability rate (${deliveryRate}%) - check DNS settings and email authentication`)
  }

  // Check engagement
  if (score.engagement < REPUTATION_THRESHOLDS.fair) {
    const openRate = factors.deliveredCount > 0
      ? Math.round((factors.openedCount / factors.deliveredCount) * 100)
      : 0
    issues.push(`Low engagement (${openRate}% open rate) - improve subject lines and content`)
  }

  // Check spam complaints
  if (score.spamScore < REPUTATION_THRESHOLDS.good) {
    const spamRate = factors.sentCount > 0
      ? (factors.spamReports / factors.sentCount * 100).toFixed(2)
      : '0'
    issues.push(`High spam complaints (${spamRate}%) - review email content and targeting`)
  }

  // Check bounce rate
  if (score.bounceRate < REPUTATION_THRESHOLDS.good) {
    const bouncePercent = factors.sentCount > 0
      ? (factors.bouncedCount / factors.sentCount * 100).toFixed(1)
      : '0'
    issues.push(`High bounce rate (${bouncePercent}%) - clean your email list`)
  }

  // Check unsubscribes
  if (factors.sentCount > 0) {
    const unsubRate = (factors.unsubscribes / factors.sentCount) * 100
    if (unsubRate > 0.5) {
      issues.push(`High unsubscribe rate (${unsubRate.toFixed(2)}%) - review email frequency and relevance`)
    }
  }

  // Check volume consistency
  if (factors.consistentSendingDays !== undefined && factors.consistentSendingDays < 7) {
    issues.push('Inconsistent sending pattern - maintain regular sending schedule')
  }

  return issues
}

/**
 * Get recommendations for improving reputation
 */
export function getReputationRecommendations(
  score: ReputationScore,
  factors: ReputationFactors
): string[] {
  const recommendations: string[] = []

  // Deliverability recommendations
  if (score.deliverability < REPUTATION_THRESHOLDS.good) {
    recommendations.push('Verify SPF, DKIM, and DMARC records are properly configured')
    recommendations.push('Warm up email accounts gradually before high-volume sending')
  }

  // Engagement recommendations
  if (score.engagement < REPUTATION_THRESHOLDS.good) {
    recommendations.push('A/B test subject lines to improve open rates')
    recommendations.push('Personalize email content for better engagement')
    recommendations.push('Segment your audience for more relevant messaging')
  }

  // Spam score recommendations
  if (score.spamScore < REPUTATION_THRESHOLDS.excellent) {
    recommendations.push('Include clear unsubscribe links in all emails')
    recommendations.push('Avoid spam trigger words in subject lines')
    recommendations.push('Maintain a clean, permission-based email list')
  }

  // Bounce rate recommendations
  if (score.bounceRate < REPUTATION_THRESHOLDS.good) {
    recommendations.push('Implement email verification before adding to lists')
    recommendations.push('Regularly clean inactive subscribers from your list')
    recommendations.push('Remove hard bounces immediately')
  }

  // Volume-based recommendations
  if (factors.daysSinceFirstSend !== undefined && factors.daysSinceFirstSend < 30) {
    recommendations.push('Continue warmup process - account is still building reputation')
  }

  // If everything is good
  if (recommendations.length === 0 && score.overall >= REPUTATION_THRESHOLDS.good) {
    recommendations.push('Maintain current practices - reputation is healthy')
    recommendations.push('Consider gradually increasing sending volume')
  }

  return recommendations
}

/**
 * Calculate reputation score projection based on current trend
 */
export function projectReputationScore(
  currentScore: number,
  trend: 'improving' | 'declining' | 'stable',
  daysAhead: number
): number {
  const ratePerDay = trend === 'improving' ? 0.5 : trend === 'declining' ? -0.5 : 0
  const projected = currentScore + (ratePerDay * daysAhead)
  return Math.min(100, Math.max(0, Math.round(projected)))
}

/**
 * Compare reputation between accounts
 */
export function compareReputationScores(
  scoreA: ReputationScore,
  scoreB: ReputationScore
): {
  overall: number
  deliverability: number
  engagement: number
  spamScore: number
  bounceRate: number
} {
  return {
    overall: scoreA.overall - scoreB.overall,
    deliverability: scoreA.deliverability - scoreB.deliverability,
    engagement: scoreA.engagement - scoreB.engagement,
    spamScore: scoreA.spamScore - scoreB.spamScore,
    bounceRate: scoreA.bounceRate - scoreB.bounceRate,
  }
}

/**
 * Get a summary string for reputation health
 */
export function getReputationSummary(score: ReputationScore): string {
  const health = getReputationHealth(score)

  const summaries: Record<typeof health, string> = {
    excellent: `Excellent reputation (${score.overall}/100) - Your email deliverability is optimal.`,
    good: `Good reputation (${score.overall}/100) - Minor improvements could boost performance.`,
    fair: `Fair reputation (${score.overall}/100) - Some areas need attention to improve deliverability.`,
    poor: `Poor reputation (${score.overall}/100) - Significant issues affecting email delivery.`,
    critical: `Critical reputation (${score.overall}/100) - Immediate action required to restore deliverability.`,
  }

  return summaries[health]
}
