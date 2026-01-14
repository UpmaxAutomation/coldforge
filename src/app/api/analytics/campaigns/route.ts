import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CampaignRecord {
  id: string
  name: string
  status: string
  created_at: string
}

interface EmailRecord {
  campaign_id: string | null
  status: string
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  sent_at: string
}

interface CampaignAnalytics {
  id: string
  name: string
  status: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  replied: number
  bounced: number
  openRate: number
  clickRate: number
  replyRate: number
  bounceRate: number
  startedAt: string | null
}

// GET /api/analytics/campaigns - Return per-campaign analytics comparison
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)

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

    // Get all campaigns for the organization
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, name, status, created_at')
      .eq('organization_id', userData.organization_id)
      .order('created_at', { ascending: false })
      .limit(limit) as { data: CampaignRecord[] | null; error: Error | null }

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError)
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ campaigns: [] })
    }

    // Get all sent emails for these campaigns in the date range
    const campaignIds = campaigns.map(c => c.id)
    const { data: emails, error: emailsError } = await supabase
      .from('sent_emails')
      .select('campaign_id, status, opened_at, clicked_at, replied_at, sent_at')
      .eq('organization_id', userData.organization_id)
      .in('campaign_id', campaignIds)
      .gte('sent_at', startDate.toISOString())
      .lte('sent_at', now.toISOString()) as { data: EmailRecord[] | null; error: Error | null }

    if (emailsError) {
      console.error('Error fetching sent emails:', emailsError)
      return NextResponse.json({ error: 'Failed to fetch email data' }, { status: 500 })
    }

    // Group emails by campaign
    const emailsByCampaign = new Map<string, EmailRecord[]>()
    campaigns.forEach(c => emailsByCampaign.set(c.id, []))

    emails?.forEach(email => {
      if (email.campaign_id) {
        const campaignEmails = emailsByCampaign.get(email.campaign_id)
        if (campaignEmails) {
          campaignEmails.push(email)
        }
      }
    })

    // Calculate analytics for each campaign
    const campaignAnalytics: CampaignAnalytics[] = campaigns.map(campaign => {
      const campaignEmails = emailsByCampaign.get(campaign.id) || []
      const sent = campaignEmails.length
      const delivered = campaignEmails.filter(e => e.status !== 'bounced').length
      const opened = campaignEmails.filter(e => e.opened_at).length
      const clicked = campaignEmails.filter(e => e.clicked_at).length
      const replied = campaignEmails.filter(e => e.replied_at).length
      const bounced = campaignEmails.filter(e => e.status === 'bounced').length

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        sent,
        delivered,
        opened,
        clicked,
        replied,
        bounced,
        openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
        clickRate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0,
        replyRate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
        bounceRate: sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0,
        startedAt: campaign.created_at,
      }
    })

    // Sort by sent count (most active first)
    campaignAnalytics.sort((a, b) => b.sent - a.sent)

    return NextResponse.json({
      campaigns: campaignAnalytics,
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString(),
      },
    })
  } catch (error) {
    console.error('Campaign Analytics API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
