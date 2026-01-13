import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  calculateDeliverabilityScore,
  generateHealthRecommendations,
  type EmailEventType,
  type MailboxHealth,
} from '@/lib/deliverability'

interface EventCount {
  event_type: EmailEventType
  count: number
}

// GET /api/deliverability - Get deliverability metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const campaignId = searchParams.get('campaignId')
    const period = searchParams.get('period') || '7d' // 7d, 30d, 90d

    // Calculate date range
    const now = new Date()
    let startDate: Date

    switch (period) {
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default: // 7d
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    }

    // Get event counts
    let eventsQuery = supabase
      .from('email_events')
      .select('event_type')
      .eq('organization_id', profile.organization_id)
      .gte('timestamp', startDate.toISOString())

    if (campaignId) {
      eventsQuery = eventsQuery.eq('campaign_id', campaignId)
    }

    const { data: events } = await eventsQuery

    // Count events by type
    const eventCounts: Record<string, number> = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      soft_bounced: 0,
      complained: 0,
      unsubscribed: 0,
    }

    events?.forEach(e => {
      const eventType = (e as { event_type: string }).event_type
      if (eventType in eventCounts) {
        eventCounts[eventType]++
      }
    })

    // Get sent count from email_jobs
    let jobsQuery = supabase
      .from('email_jobs')
      .select('id', { count: 'exact' })
      .eq('organization_id', profile.organization_id)
      .eq('status', 'sent')
      .gte('completed_at', startDate.toISOString())

    if (campaignId) {
      jobsQuery = jobsQuery.eq('campaign_id', campaignId)
    }

    const { count: sentCount } = await jobsQuery

    eventCounts.sent = sentCount || 0

    // Calculate deliverability score
    const score = calculateDeliverabilityScore(
      eventCounts.sent,
      eventCounts.delivered || eventCounts.sent - eventCounts.bounced - eventCounts.soft_bounced,
      eventCounts.opened,
      eventCounts.clicked,
      eventCounts.bounced + eventCounts.soft_bounced,
      eventCounts.complained,
      eventCounts.unsubscribed
    )

    // Get mailbox health
    const { data: mailboxes } = await supabase
      .from('mailboxes')
      .select('id, email, first_name, last_name, status')
      .eq('organization_id', profile.organization_id) as {
        data: Array<{
          id: string
          email: string
          first_name: string
          last_name: string
          status: string
        }> | null
      }

    const mailboxHealth: MailboxHealth[] = []

    for (const mailbox of mailboxes || []) {
      // Get recent events for this mailbox
      const { data: mailboxEvents } = await supabase
        .from('email_events')
        .select('event_type')
        .eq('mailbox_id', mailbox.id)
        .gte('timestamp', startDate.toISOString())

      const mbCounts: Record<string, number> = {
        sent: 0,
        bounced: 0,
        complained: 0,
      }

      mailboxEvents?.forEach(e => {
        const et = (e as { event_type: string }).event_type
        if (et === 'bounced' || et === 'soft_bounced') mbCounts.bounced++
        if (et === 'complained') mbCounts.complained++
      })

      // Get sent count for mailbox
      const { count: mbSentCount } = await supabase
        .from('email_jobs')
        .select('id', { count: 'exact' })
        .eq('mailbox_id', mailbox.id)
        .eq('status', 'sent')
        .gte('completed_at', startDate.toISOString())

      mbCounts.sent = mbSentCount || 0

      const deliveryRate = mbCounts.sent > 0
        ? ((mbCounts.sent - mbCounts.bounced) / mbCounts.sent) * 100
        : 100
      const bounceRate = mbCounts.sent > 0
        ? (mbCounts.bounced / mbCounts.sent) * 100
        : 0
      const spamRate = mbCounts.sent > 0
        ? (mbCounts.complained / mbCounts.sent) * 100
        : 0

      let mbScore = 100
      mbScore -= bounceRate * 2
      mbScore -= spamRate * 5
      mbScore = Math.max(0, Math.min(100, Math.round(mbScore)))

      let status: MailboxHealth['status'] = 'healthy'
      if (mbScore < 50 || spamRate > 0.5) status = 'critical'
      else if (mbScore < 70 || bounceRate > 5) status = 'warning'

      mailboxHealth.push({
        mailboxId: mailbox.id,
        email: mailbox.email,
        score: mbScore,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        bounceRate: Math.round(bounceRate * 10) / 10,
        spamRate: Math.round(spamRate * 100) / 100,
        recentBounces: mbCounts.bounced,
        recentSpamComplaints: mbCounts.complained,
        lastChecked: new Date().toISOString(),
        status,
        recommendations: [],
      })
    }

    // Generate recommendations
    const recommendations = generateHealthRecommendations(
      score,
      mailboxHealth.find(m => m.status === 'critical')
    )

    return NextResponse.json({
      period: {
        start: startDate.toISOString(),
        end: now.toISOString(),
      },
      metrics: {
        sent: eventCounts.sent,
        delivered: eventCounts.delivered || eventCounts.sent - eventCounts.bounced - eventCounts.soft_bounced,
        opened: eventCounts.opened,
        clicked: eventCounts.clicked,
        bounced: eventCounts.bounced + eventCounts.soft_bounced,
        hardBounced: eventCounts.bounced,
        softBounced: eventCounts.soft_bounced,
        spamComplaints: eventCounts.complained,
        unsubscribes: eventCounts.unsubscribed,
      },
      score,
      mailboxHealth,
      recommendations,
    })
  } catch (error) {
    console.error('Deliverability API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
