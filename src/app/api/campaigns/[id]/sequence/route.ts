import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SequenceStep, CampaignStatus } from '@/lib/campaigns'

interface SequenceRecord {
  id: string
  campaign_id: string
  steps: SequenceStep[]
  created_at: string
  updated_at: string
}

// GET /api/campaigns/[id]/sequence - Get campaign sequence
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

    const { id: campaignId } = await params

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

    // Get sequence
    const { data: sequence, error } = await supabase
      .from('campaign_sequences')
      .select('*')
      .eq('campaign_id', campaignId)
      .single() as { data: SequenceRecord | null; error: Error | null }

    if (error && error.message !== 'No rows found') {
      console.error('Error fetching sequence:', error)
      return NextResponse.json({ error: 'Failed to fetch sequence' }, { status: 500 })
    }

    return NextResponse.json({
      sequence: sequence ? {
        id: sequence.id,
        campaignId: sequence.campaign_id,
        steps: sequence.steps,
        createdAt: sequence.created_at,
        updatedAt: sequence.updated_at,
      } : null,
    })
  } catch (error) {
    console.error('Sequence GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/campaigns/[id]/sequence - Create or update sequence
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

    const { id: campaignId } = await params
    const body = await request.json()
    const { steps } = body

    if (!steps || !Array.isArray(steps)) {
      return NextResponse.json({ error: 'Steps array is required' }, { status: 400 })
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

    // Verify campaign belongs to organization and is in draft/paused status
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { id: string; status: CampaignStatus } | null }

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot modify sequence of an active campaign' },
        { status: 400 }
      )
    }

    // Check if sequence exists
    const { data: existing } = await supabase
      .from('campaign_sequences')
      .select('id')
      .eq('campaign_id', campaignId)
      .single() as { data: { id: string } | null }

    let sequence: SequenceRecord

    if (existing) {
      // Update existing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('campaign_sequences') as any)
        .update({
          steps,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating sequence:', error)
        return NextResponse.json({ error: 'Failed to update sequence' }, { status: 500 })
      }

      sequence = data
    } else {
      // Create new
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('campaign_sequences') as any)
        .insert({
          campaign_id: campaignId,
          steps,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating sequence:', error)
        return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 })
      }

      sequence = data
    }

    return NextResponse.json({
      sequence: {
        id: sequence.id,
        campaignId: sequence.campaign_id,
        steps: sequence.steps,
        createdAt: sequence.created_at,
        updatedAt: sequence.updated_at,
      },
    })
  } catch (error) {
    console.error('Sequence PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
