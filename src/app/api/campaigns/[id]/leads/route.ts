// @ts-nocheck - TODO: Add proper Supabase type inference
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/campaigns/[id]/leads - Get leads for a campaign
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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

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

    // Build query
    let query = supabase
      .from('campaign_leads')
      .select(`
        id,
        current_step,
        status,
        last_sent_at,
        next_send_at,
        created_at,
        lead:leads(
          id,
          email,
          first_name,
          last_name,
          company,
          title
        )
      `, { count: 'exact' })
      .eq('campaign_id', campaignId)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Calculate pagination
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data: campaignLeads, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('Error fetching campaign leads:', error)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    // Transform data
    const leads = (campaignLeads || [])
      .filter((cl) => cl.lead)
      .map((cl) => {
        const lead = cl.lead as {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          company: string | null
          title: string | null
        }
        return {
          id: cl.id,
          email: lead.email,
          firstName: lead.first_name,
          lastName: lead.last_name,
          company: lead.company,
          title: lead.title,
          status: cl.status,
          currentStep: cl.current_step,
          lastSentAt: cl.last_sent_at,
          nextSendAt: cl.next_send_at,
        }
      })
      .filter((lead) => {
        if (!search) return true
        const searchLower = search.toLowerCase()
        return (
          lead.email.toLowerCase().includes(searchLower) ||
          (lead.firstName && lead.firstName.toLowerCase().includes(searchLower)) ||
          (lead.lastName && lead.lastName.toLowerCase().includes(searchLower)) ||
          (lead.company && lead.company.toLowerCase().includes(searchLower))
        )
      })

    const totalPages = count ? Math.ceil(count / limit) : 1

    return NextResponse.json({
      leads,
      page,
      limit,
      total: count || 0,
      totalPages,
    })
  } catch (error) {
    console.error('Campaign leads GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/campaigns/[id]/leads - Add leads to a campaign from lists
export async function POST(
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
    const body = await request.json()
    const { listIds } = body as { listIds: string[] }

    if (!listIds || !Array.isArray(listIds) || listIds.length === 0) {
      return NextResponse.json({ error: 'List IDs are required' }, { status: 400 })
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

    // Verify campaign belongs to organization
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { id: string; status: string } | null }

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get leads from the specified lists that aren't already in the campaign
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id')
      .in('list_id', listIds)
      .eq('organization_id', profile.organization_id)
      .eq('status', 'active')

    if (leadsError) {
      console.error('Error fetching leads:', leadsError)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ addedCount: 0 })
    }

    // Get existing campaign leads
    const { data: existingCampaignLeads } = await supabase
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', campaignId)

    const existingLeadIds = new Set((existingCampaignLeads || []).map(cl => cl.lead_id))

    // Filter out leads that are already in the campaign
    const newLeadIds = leads
      .filter(lead => !existingLeadIds.has(lead.id))
      .map(lead => lead.id)

    if (newLeadIds.length === 0) {
      return NextResponse.json({ addedCount: 0 })
    }

    // Add leads to campaign
    const campaignLeadsToInsert = newLeadIds.map(leadId => ({
      campaign_id: campaignId,
      lead_id: leadId,
      current_step: 1,
      status: 'pending',
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase.from('campaign_leads') as any)
      .insert(campaignLeadsToInsert)

    if (insertError) {
      console.error('Error adding leads to campaign:', insertError)
      return NextResponse.json({ error: 'Failed to add leads' }, { status: 500 })
    }

    // Update campaign stats
    const { data: statsData } = await supabase
      .from('campaign_leads')
      .select('id', { count: 'exact' })
      .eq('campaign_id', campaignId)

    const totalLeads = statsData?.length || 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('campaigns') as any)
      .update({
        stats: {
          totalLeads,
          contacted: 0,
          opened: 0,
          clicked: 0,
          replied: 0,
          bounced: 0,
          unsubscribed: 0,
          openRate: 0,
          clickRate: 0,
          replyRate: 0,
          bounceRate: 0,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)

    return NextResponse.json({ addedCount: newLeadIds.length })
  } catch (error) {
    console.error('Campaign leads POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/campaigns/[id]/leads - Remove leads from campaign
export async function DELETE(
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
    const leadId = searchParams.get('leadId')

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 })
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

    // Verify campaign belongs to organization
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Remove lead from campaign
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase.from('campaign_leads') as any)
      .delete()
      .eq('id', leadId)
      .eq('campaign_id', campaignId)

    if (deleteError) {
      console.error('Error removing lead from campaign:', deleteError)
      return NextResponse.json({ error: 'Failed to remove lead' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Campaign leads DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
