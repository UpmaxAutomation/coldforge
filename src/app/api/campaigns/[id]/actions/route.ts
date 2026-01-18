import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CampaignStatus } from '@/lib/campaigns'
import { logAuditEventAsync, getRequestMetadata, AuditAction } from '@/lib/audit'

// POST /api/campaigns/[id]/actions - Campaign actions (start, pause, resume, complete)
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
    const { action } = body

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
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

    // Get current campaign status
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status, lead_list_ids, mailbox_ids')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single() as {
        data: {
          id: string
          status: CampaignStatus
          lead_list_ids: string[]
          mailbox_ids: string[]
        } | null
      }

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    let newStatus: CampaignStatus
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    switch (action) {
      case 'start':
        if (campaign.status !== 'draft' && campaign.status !== 'paused') {
          return NextResponse.json(
            { error: 'Can only start draft or paused campaigns' },
            { status: 400 }
          )
        }

        // Validate campaign has leads and mailboxes
        if (!campaign.lead_list_ids || campaign.lead_list_ids.length === 0) {
          return NextResponse.json(
            { error: 'Campaign must have at least one lead list' },
            { status: 400 }
          )
        }

        if (!campaign.mailbox_ids || campaign.mailbox_ids.length === 0) {
          return NextResponse.json(
            { error: 'Campaign must have at least one mailbox' },
            { status: 400 }
          )
        }

        // Check if campaign has a sequence
        const { data: sequence } = await supabase
          .from('campaign_sequences')
          .select('steps')
          .eq('campaign_id', campaignId)
          .single() as { data: { steps: unknown[] } | null }

        if (!sequence || !sequence.steps || sequence.steps.length === 0) {
          return NextResponse.json(
            { error: 'Campaign must have at least one sequence step' },
            { status: 400 }
          )
        }

        newStatus = 'active'
        updates.status = newStatus
        updates.started_at = campaign.status === 'draft' ? new Date().toISOString() : undefined
        updates.paused_at = null
        break

      case 'pause':
        if (campaign.status !== 'active') {
          return NextResponse.json(
            { error: 'Can only pause active campaigns' },
            { status: 400 }
          )
        }

        newStatus = 'paused'
        updates.status = newStatus
        updates.paused_at = new Date().toISOString()
        break

      case 'resume':
        if (campaign.status !== 'paused') {
          return NextResponse.json(
            { error: 'Can only resume paused campaigns' },
            { status: 400 }
          )
        }

        newStatus = 'active'
        updates.status = newStatus
        updates.paused_at = null
        break

      case 'complete':
        if (campaign.status !== 'active' && campaign.status !== 'paused') {
          return NextResponse.json(
            { error: 'Can only complete active or paused campaigns' },
            { status: 400 }
          )
        }

        newStatus = 'completed'
        updates.status = newStatus
        updates.completed_at = new Date().toISOString()
        break

      case 'archive':
        if (campaign.status === 'active') {
          return NextResponse.json(
            { error: 'Cannot archive active campaigns. Pause or complete first.' },
            { status: 400 }
          )
        }

        newStatus = 'archived'
        updates.status = newStatus
        break

      case 'duplicate': {
        // Create a copy of the campaign
        const { data: original } = await supabase.from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .single()

        if (!original) {
          return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
        }

        // Use admin client to bypass RLS for INSERT operations
        const adminClient = createAdminClient()
        const { data: duplicate, error: dupError } = await adminClient.from('campaigns')
          .insert({
            organization_id: original.organization_id,
            name: `${original.name} (Copy)`,
            status: 'draft' as const,
            type: original.type,
            settings: original.settings,
            stats: {
              totalLeads: 0,
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
            lead_list_ids: original.lead_list_ids,
            mailbox_ids: original.mailbox_ids,
          })
          .select()
          .single()

        if (dupError) {
          console.error('Error duplicating campaign:', dupError)
          return NextResponse.json({ error: 'Failed to duplicate campaign' }, { status: 500 })
        }

        // Also duplicate sequence
        const { data: originalSequence } = await supabase
          .from('campaign_sequences')
          .select('steps')
          .eq('campaign_id', campaignId)
          .single() as { data: { steps: unknown[] } | null }

        if (originalSequence && duplicate) {
          await adminClient.from('campaign_sequences')
            .insert({
              campaign_id: duplicate.id,
              steps: originalSequence.steps,
            })
        }

        return NextResponse.json({
          success: true,
          campaign: {
            id: duplicate?.id,
            name: duplicate?.name,
            status: duplicate?.status,
          },
          message: 'Campaign duplicated successfully',
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Update campaign status
    const { error: updateError } = await supabase.from('campaigns')
      .update(updates)
      .eq('id', campaignId)

    if (updateError) {
      console.error('Error updating campaign status:', updateError)
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    // Map action to audit action
    const actionToAuditAction: Record<string, AuditAction> = {
      'start': 'campaign_start',
      'pause': 'campaign_pause',
      'resume': 'campaign_start',
      'complete': 'update',
      'archive': 'update',
    }

    // Audit log campaign action
    const reqMetadata = getRequestMetadata(request)
    logAuditEventAsync({
      user_id: user.id,
      organization_id: profile.organization_id,
      action: actionToAuditAction[action] || 'update',
      resource_type: 'campaign',
      resource_id: campaignId,
      details: { action, previousStatus: campaign.status, newStatus: newStatus! },
      ...reqMetadata
    })

    return NextResponse.json({
      success: true,
      status: newStatus!,
      message: `Campaign ${action}ed successfully`,
    })
  } catch (error) {
    console.error('Campaign action error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
