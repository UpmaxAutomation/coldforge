import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

type SentEmail = Tables<'sent_emails'>
type Reply = Tables<'replies'>

interface DailyStats {
  date: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  replied: number
  bounced: number
}

interface HourlyStats {
  hour: number
  dayOfWeek: number
  count: number
  openRate: number
}

interface SummaryStats {
  totalSent: number
  totalDelivered: number
  totalOpened: number
  totalClicked: number
  totalReplied: number
  totalBounced: number
  openRate: number
  clickRate: number
  replyRate: number
  bounceRate: number
  deliveryRate: number
}

// GET /api/analytics - Return aggregated analytics data
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || '30d'
    const campaignId = searchParams.get('campaignId')

    // Calculate date range
    const now = new Date()
    let startDate: Date

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case '30d':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
    }

    // Build base query
    let query = supabase
      .from('sent_emails')
      .select('*')
      .eq('organization_id', userData.organization_id)
      .gte('sent_at', startDate.toISOString())
      .lte('sent_at', now.toISOString())

    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }

    const { data: emails, error: emailsError } = await query as {
      data: SentEmail[] | null
      error: Error | null
    }

    if (emailsError) {
      console.error('Error fetching sent emails:', emailsError)
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
    }

    // Calculate summary statistics
    const totalSent = emails?.length || 0
    const totalDelivered = emails?.filter(e => e.status !== 'bounced').length || 0
    const totalOpened = emails?.filter(e => e.opened_at).length || 0
    const totalClicked = emails?.filter(e => e.clicked_at).length || 0
    const totalReplied = emails?.filter(e => e.replied_at).length || 0
    const totalBounced = emails?.filter(e => e.status === 'bounced').length || 0

    const summary: SummaryStats = {
      totalSent,
      totalDelivered,
      totalOpened,
      totalClicked,
      totalReplied,
      totalBounced,
      openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0,
      clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 1000) / 10 : 0,
      replyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 1000) / 10 : 0,
      bounceRate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 1000) / 10 : 0,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 1000) / 10 : 0,
    }

    // Generate daily breakdown for charts
    const dailyMap = new Map<string, DailyStats>()

    // Initialize all days in the period
    const dayCount = period === '7d' ? 7 : period === '90d' ? 90 : 30
    for (let i = dayCount - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0] || ''
      dailyMap.set(dateStr, {
        date: dateStr,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
      })
    }

    // Populate with actual data
    emails?.forEach(email => {
      const dateStr = email.sent_at.split('T')[0] || ''
      const dayStats = dailyMap.get(dateStr)
      if (dayStats) {
        dayStats.sent++
        if (email.status !== 'bounced') dayStats.delivered++
        if (email.opened_at) dayStats.opened++
        if (email.clicked_at) dayStats.clicked++
        if (email.replied_at) dayStats.replied++
        if (email.status === 'bounced') dayStats.bounced++
      }
    })

    const dailyBreakdown: DailyStats[] = Array.from(dailyMap.values())

    // Generate hourly heatmap data (hour of day vs day of week)
    const hourlyMap = new Map<string, { count: number; opened: number }>()

    // Initialize all hour/day combinations
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        hourlyMap.set(`${day}-${hour}`, { count: 0, opened: 0 })
      }
    }

    // Populate with actual data
    emails?.forEach(email => {
      const sentDate = new Date(email.sent_at)
      const dayOfWeek = sentDate.getUTCDay()
      const hour = sentDate.getUTCHours()
      const key = `${dayOfWeek}-${hour}`
      const stats = hourlyMap.get(key)
      if (stats) {
        stats.count++
        if (email.opened_at) stats.opened++
      }
    })

    const heatmapData: HourlyStats[] = []
    hourlyMap.forEach((stats, key) => {
      const parts = key.split('-').map(Number)
      const day = parts[0] ?? 0
      const hour = parts[1] ?? 0
      heatmapData.push({
        hour,
        dayOfWeek: day,
        count: stats.count,
        openRate: stats.count > 0 ? Math.round((stats.opened / stats.count) * 100) : 0,
      })
    })

    // Get reply categories from replies table
    let repliesQuery = supabase
      .from('replies')
      .select('category')
      .eq('organization_id', userData.organization_id)
      .gte('received_at', startDate.toISOString())
      .lte('received_at', now.toISOString())

    if (campaignId) {
      // Get sent_email_ids for this campaign
      const campaignEmailIds = emails?.map(e => e.id) || []
      if (campaignEmailIds.length > 0) {
        repliesQuery = repliesQuery.in('sent_email_id', campaignEmailIds)
      }
    }

    const { data: replies } = await repliesQuery as {
      data: Reply[] | null
    }

    // Count by category
    const categoryCounts = {
      interested: 0,
      not_interested: 0,
      out_of_office: 0,
      unsubscribe: 0,
      uncategorized: 0,
    }

    replies?.forEach(reply => {
      if (reply.category && categoryCounts.hasOwnProperty(reply.category)) {
        categoryCounts[reply.category as keyof typeof categoryCounts]++
      }
    })

    const replyCategories = Object.entries(categoryCounts).map(([name, value]) => ({
      name: name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      value,
      key: name,
    }))

    return NextResponse.json({
      summary,
      dailyBreakdown,
      heatmapData,
      replyCategories,
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString(),
      },
    })
  } catch (error) {
    console.error('Analytics API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
