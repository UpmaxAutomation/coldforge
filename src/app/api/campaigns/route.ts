import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  INITIAL_CAMPAIGN_STATS,
  type CampaignStatus,
  type CampaignType,
  type CampaignSettings,
  type CampaignStats,
} from '@/lib/campaigns'
import {
  createCampaignSchema,
  listCampaignsQuerySchema,
} from '@/lib/schemas'

interface CampaignRecord {
  id: string
  organization_id: string
  name: string
  status: CampaignStatus
  type: CampaignType
  settings: CampaignSettings
  stats: CampaignStats
  lead_list_ids: string[]
  mailbox_ids: string[]
  schedule_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  paused_at: string | null
  completed_at: string | null
}

// GET /api/campaigns - List campaigns
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

    // Parse and validate query parameters
    const queryResult = listCampaignsQuerySchema.safeParse({
      page: request.nextUrl.searchParams.get('page'),
      limit: request.nextUrl.searchParams.get('limit'),
      status: request.nextUrl.searchParams.get('status'),
    })

    const { page, limit, status } = queryResult.success
      ? queryResult.data
      : { page: 1, limit: 20, status: undefined }

    const statusFilter = status as CampaignStatus[] | undefined
    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .eq('organization_id', userData.organization_id)
      .order('created_at', { ascending: false })

    if (statusFilter && statusFilter.length > 0) {
      query = query.in('status', statusFilter)
    }

    query = query.range(offset, offset + limit - 1)

    const { data: campaigns, error, count } = await query as {
      data: CampaignRecord[] | null
      error: Error | null
      count: number | null
    }

    if (error) {
      console.error('Error fetching campaigns:', error)
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }

    return NextResponse.json({
      campaigns: campaigns?.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        type: c.type,
        settings: c.settings,
        stats: c.stats,
        leadListIds: c.lead_list_ids,
        mailboxIds: c.mailbox_ids,
        scheduleId: c.schedule_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        startedAt: c.started_at,
        pausedAt: c.paused_at,
        completedAt: c.completed_at,
      })) || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    })
  } catch (error) {
    console.error('Campaigns API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/campaigns - Create campaign
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = createCampaignSchema.safeParse(body)
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || 'Invalid request body'
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    const { name, type, settings, leadListIds, mailboxIds } = validationResult.data

    // Get user's organization
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Create campaign
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: campaign, error: createError } = await (supabase.from('campaigns') as any)
      .insert({
        organization_id: userData.organization_id,
        name,
        type,
        status: 'draft',
        settings: { ...DEFAULT_CAMPAIGN_SETTINGS, ...settings },
        stats: INITIAL_CAMPAIGN_STATS,
        lead_list_ids: leadListIds || [],
        mailbox_ids: mailboxIds || [],
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating campaign:', createError)
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    }

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        type: campaign.type,
        settings: campaign.settings,
        stats: campaign.stats,
        leadListIds: campaign.lead_list_ids,
        mailboxIds: campaign.mailbox_ids,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Campaign create error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
