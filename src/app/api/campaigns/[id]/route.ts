import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type {
  CampaignStatus,
  CampaignType,
  CampaignSettings,
  CampaignStats,
} from '@/lib/campaigns'

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

// GET /api/campaigns/[id] - Get single campaign
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get campaign
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single() as { data: CampaignRecord | null; error: Error | null }

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
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
        scheduleId: campaign.schedule_id,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
        startedAt: campaign.started_at,
        pausedAt: campaign.paused_at,
        completedAt: campaign.completed_at,
      },
    })
  } catch (error) {
    console.error('Campaign GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/campaigns/[id] - Update campaign
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign exists
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { id: string; status: CampaignStatus } | null }

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.name !== undefined) updates.name = body.name
    if (body.type !== undefined) updates.type = body.type
    if (body.settings !== undefined) updates.settings = body.settings
    if (body.leadListIds !== undefined) updates.lead_list_ids = body.leadListIds
    if (body.mailboxIds !== undefined) updates.mailbox_ids = body.mailboxIds

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: campaign, error: updateError } = await (supabase.from('campaigns') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating campaign:', updateError)
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    return NextResponse.json({ campaign })
  } catch (error) {
    console.error('Campaign PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/campaigns/[id] - Delete campaign
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign is in draft status (can't delete active campaigns)
    const { data: existing } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { status: CampaignStatus } | null }

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (existing.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot delete active campaign. Pause it first.' },
        { status: 400 }
      )
    }

    // Delete campaign
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase.from('campaigns') as any)
      .delete()
      .eq('id', id)
      .eq('organization_id', profile.organization_id)

    if (deleteError) {
      console.error('Error deleting campaign:', deleteError)
      return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Campaign DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
