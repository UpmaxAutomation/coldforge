import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateHealth } from '@/lib/deliverability/health'

// GET /api/deliverability/health - Get deliverability health score
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

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || '7d'
    const campaignId = searchParams.get('campaignId')

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
      delivered: 0,
      opened: 0,
      replied: 0,
      bounced: 0,
      soft_bounced: 0,
      complained: 0,
    }

    events?.forEach(e => {
      const eventType = (e as { event_type: string }).event_type
      if (eventType in eventCounts) {
        eventCounts[eventType] = (eventCounts[eventType] ?? 0) + 1
      }
    })

    const sent = sentCount || 0
    const delivered = eventCounts.delivered ?? (sent - (eventCounts.bounced ?? 0) - (eventCounts.soft_bounced ?? 0))
    const bounced = (eventCounts.bounced ?? 0) + (eventCounts.soft_bounced ?? 0)
    const opened = eventCounts.opened ?? 0
    const replied = eventCounts.replied ?? 0
    const spam = eventCounts.complained ?? 0

    const health = calculateHealth(sent, delivered, bounced, opened, replied, spam)

    return NextResponse.json({
      period: {
        start: startDate.toISOString(),
        end: now.toISOString(),
      },
      totals: {
        sent,
        delivered,
        bounced,
        opened,
        replied,
        spam,
      },
      health,
    })
  } catch (error) {
    console.error('Deliverability health API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
