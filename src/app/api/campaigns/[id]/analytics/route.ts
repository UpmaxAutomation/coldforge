import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

type SentEmail = Tables<'sent_emails'>
type CampaignSequence = Tables<'campaign_sequences'>

// GET /api/campaigns/[id]/analytics - Get campaign analytics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: campaignId } = await params
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '7d'

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign belongs to organization
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Calculate date range
    let startDate: Date
    const endDate = new Date()

    switch (range) {
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '14d':
        startDate = new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'all':
      default:
        startDate = new Date(0)
        break
    }

    // Get sent emails with their stats
    const emailsResult = await supabase
      .from('sent_emails')
      .select('*')
      .eq('campaign_id', campaignId)
      .gte('sent_at', range !== 'all' ? startDate.toISOString() : new Date(0).toISOString())

    const sentEmails = emailsResult.data as SentEmail[] | null
    const emailsError = emailsResult.error

    if (emailsError) {
      console.error('Error fetching sent emails:', emailsError)
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
    }

    // Get sequence steps for step-by-step analytics
    const sequencesResult = await supabase
      .from('campaign_sequences')
      .select('id, step_number')
      .eq('campaign_id', campaignId)
      .order('step_number', { ascending: true })

    const sequences = sequencesResult.data as Pick<CampaignSequence, 'id' | 'step_number'>[] | null

    // Calculate step-by-step analytics
    const stepAnalytics = (sequences || []).map((seq) => {
      // For now, return placeholder data since we'd need to track which step each email was sent from
      // In a real implementation, you'd join sent_emails with a step tracking field
      const stepEmails = sentEmails?.filter(() => {
        // This would filter by step - placeholder for now
        return true
      }) || []

      const sent = stepEmails.length
      const opened = stepEmails.filter(e => e.status === 'opened' || e.opened_at).length
      const clicked = stepEmails.filter(e => e.status === 'clicked' || e.clicked_at).length
      const replied = stepEmails.filter(e => e.status === 'replied' || e.replied_at).length
      const bounced = stepEmails.filter(e => e.status === 'bounced' || e.bounced_at).length

      return {
        step: seq.step_number,
        sent,
        opened,
        clicked,
        replied,
        bounced,
        openRate: sent > 0 ? Math.round((opened / sent) * 100 * 10) / 10 : 0,
        clickRate: sent > 0 ? Math.round((clicked / sent) * 100 * 10) / 10 : 0,
        replyRate: sent > 0 ? Math.round((replied / sent) * 100 * 10) / 10 : 0,
      }
    })

    // Calculate daily stats
    const dailyStats: Record<string, { sent: number; opened: number; clicked: number; replied: number }> = {}

    sentEmails?.forEach((email) => {
      const date = new Date(email.sent_at).toISOString().split('T')[0] || ''
      if (!dailyStats[date]) {
        dailyStats[date] = { sent: 0, opened: 0, clicked: 0, replied: 0 }
      }
      dailyStats[date].sent++
      if (email.opened_at) dailyStats[date].opened++
      if (email.clicked_at) dailyStats[date].clicked++
      if (email.replied_at) dailyStats[date].replied++
    })

    const dailyStatsArray = Object.entries(dailyStats)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      stepAnalytics,
      dailyStats: dailyStatsArray,
    })
  } catch (error) {
    console.error('Campaign analytics GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
