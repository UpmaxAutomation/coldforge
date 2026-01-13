// Deliverability Monitoring Types

export interface EmailEvent {
  id: string
  organizationId: string
  campaignId: string
  leadId: string
  mailboxId: string
  messageId: string
  eventType: EmailEventType
  eventData?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  timestamp: string
  createdAt: string
}

export type EmailEventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'soft_bounced'
  | 'complained'
  | 'unsubscribed'

export interface BounceDetails {
  type: 'hard' | 'soft'
  code?: string
  message: string
  category: BounceCategory
}

export type BounceCategory =
  | 'invalid_email'
  | 'mailbox_full'
  | 'domain_not_found'
  | 'rejected'
  | 'spam_block'
  | 'temporary_failure'
  | 'unknown'

export interface DeliverabilityScore {
  overall: number // 0-100
  deliveryRate: number
  openRate: number
  clickRate: number
  bounceRate: number
  spamRate: number
  unsubscribeRate: number
}

export interface MailboxHealth {
  mailboxId: string
  email: string
  score: number
  deliveryRate: number
  bounceRate: number
  spamRate: number
  recentBounces: number
  recentSpamComplaints: number
  lastChecked: string
  status: MailboxHealthStatus
  recommendations: string[]
}

export type MailboxHealthStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'suspended'

export interface DomainReputation {
  domain: string
  score: number
  spfStatus: DnsStatus
  dkimStatus: DnsStatus
  dmarcStatus: DnsStatus
  blacklistStatus: BlacklistStatus
  lastChecked: string
}

export type DnsStatus = 'pass' | 'fail' | 'missing' | 'unknown'

export interface BlacklistStatus {
  isBlacklisted: boolean
  blacklists: string[]
  lastChecked: string
}

export interface DeliverabilityReport {
  periodStart: string
  periodEnd: string
  totalSent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  spamComplaints: number
  unsubscribes: number
  metrics: DeliverabilityScore
  topIssues: Issue[]
  recommendations: string[]
}

export interface Issue {
  severity: 'low' | 'medium' | 'high' | 'critical'
  type: string
  description: string
  affectedCount: number
  recommendation: string
}

// Bounce classification
export function classifyBounce(
  code: string | undefined,
  message: string
): BounceDetails {
  const messageLower = message.toLowerCase()

  // Hard bounces
  if (code?.startsWith('5.1') || messageLower.includes('user unknown') ||
      messageLower.includes('mailbox not found') || messageLower.includes('invalid recipient')) {
    return {
      type: 'hard',
      code,
      message,
      category: 'invalid_email',
    }
  }

  if (code?.startsWith('5.5') || messageLower.includes('domain not found') ||
      messageLower.includes('no such domain')) {
    return {
      type: 'hard',
      code,
      message,
      category: 'domain_not_found',
    }
  }

  // Soft bounces
  if (code?.startsWith('4.2') || messageLower.includes('mailbox full') ||
      messageLower.includes('over quota')) {
    return {
      type: 'soft',
      code,
      message,
      category: 'mailbox_full',
    }
  }

  if (messageLower.includes('spam') || messageLower.includes('blocked') ||
      messageLower.includes('blacklist')) {
    return {
      type: 'soft',
      code,
      message,
      category: 'spam_block',
    }
  }

  if (code?.startsWith('4') || messageLower.includes('temporary') ||
      messageLower.includes('try again')) {
    return {
      type: 'soft',
      code,
      message,
      category: 'temporary_failure',
    }
  }

  if (code?.startsWith('5.7') || messageLower.includes('rejected') ||
      messageLower.includes('policy')) {
    return {
      type: 'hard',
      code,
      message,
      category: 'rejected',
    }
  }

  return {
    type: 'hard',
    code,
    message,
    category: 'unknown',
  }
}

// Calculate deliverability score
export function calculateDeliverabilityScore(
  sent: number,
  delivered: number,
  opened: number,
  clicked: number,
  bounced: number,
  spam: number,
  unsubscribed: number
): DeliverabilityScore {
  const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0
  const openRate = delivered > 0 ? (opened / delivered) * 100 : 0
  const clickRate = opened > 0 ? (clicked / opened) * 100 : 0
  const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0
  const spamRate = sent > 0 ? (spam / sent) * 100 : 0
  const unsubscribeRate = delivered > 0 ? (unsubscribed / delivered) * 100 : 0

  // Calculate overall score (weighted)
  let overall = 100

  // Penalize for bounces (high weight)
  overall -= bounceRate * 2

  // Penalize for spam complaints (highest weight)
  overall -= spamRate * 5

  // Penalize for low delivery
  if (deliveryRate < 95) {
    overall -= (95 - deliveryRate) * 0.5
  }

  // Penalize for high unsubscribes
  if (unsubscribeRate > 1) {
    overall -= (unsubscribeRate - 1) * 2
  }

  // Bonus for good engagement
  if (openRate > 20) {
    overall += Math.min(5, (openRate - 20) * 0.2)
  }

  // Ensure score is between 0 and 100
  overall = Math.max(0, Math.min(100, Math.round(overall)))

  return {
    overall,
    deliveryRate: Math.round(deliveryRate * 10) / 10,
    openRate: Math.round(openRate * 10) / 10,
    clickRate: Math.round(clickRate * 10) / 10,
    bounceRate: Math.round(bounceRate * 10) / 10,
    spamRate: Math.round(spamRate * 100) / 100,
    unsubscribeRate: Math.round(unsubscribeRate * 100) / 100,
  }
}

// Generate health recommendations
export function generateHealthRecommendations(
  score: DeliverabilityScore,
  mailboxHealth?: MailboxHealth
): string[] {
  const recommendations: string[] = []

  if (score.bounceRate > 5) {
    recommendations.push('High bounce rate detected. Clean your email list and verify addresses before sending.')
  }

  if (score.spamRate > 0.1) {
    recommendations.push('Spam complaints detected. Review your email content and ensure you have proper consent.')
  }

  if (score.unsubscribeRate > 2) {
    recommendations.push('High unsubscribe rate. Consider segmenting your audience and personalizing content.')
  }

  if (score.openRate < 15) {
    recommendations.push('Low open rate. Test different subject lines and optimize send times.')
  }

  if (score.deliveryRate < 95) {
    recommendations.push('Delivery rate below optimal. Check your sender reputation and email authentication.')
  }

  if (mailboxHealth) {
    if (mailboxHealth.recentBounces > 10) {
      recommendations.push(`Mailbox ${mailboxHealth.email} has high recent bounces. Consider pausing and investigating.`)
    }

    if (mailboxHealth.recentSpamComplaints > 0) {
      recommendations.push(`Mailbox ${mailboxHealth.email} received spam complaints. Reduce sending volume.`)
    }
  }

  return recommendations
}
