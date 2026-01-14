export interface DeliverabilityHealth {
  overallScore: number  // 0-100
  metrics: {
    deliveryRate: number
    bounceRate: number
    openRate: number
    replyRate: number
    spamRate: number
  }
  status: 'excellent' | 'good' | 'warning' | 'critical'
}

export function calculateHealth(sent: number, delivered: number, bounced: number, opened: number, replied: number, spam: number): DeliverabilityHealth {
  if (sent === 0) return { overallScore: 100, metrics: { deliveryRate: 1, bounceRate: 0, openRate: 0, replyRate: 0, spamRate: 0 }, status: 'excellent' }

  const deliveryRate = delivered / sent
  const bounceRate = bounced / sent
  const openRate = opened / Math.max(delivered, 1)
  const replyRate = replied / Math.max(delivered, 1)
  const spamRate = spam / sent

  let score = 100
  score -= bounceRate * 100
  score -= spamRate * 200
  score += openRate * 20
  score += replyRate * 30
  score = Math.max(0, Math.min(100, score))

  const status = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'warning' : 'critical'

  return { overallScore: Math.round(score), metrics: { deliveryRate, bounceRate, openRate, replyRate, spamRate }, status }
}
