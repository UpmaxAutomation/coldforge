import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  calculateQueueStats,
  type EmailJob,
  type EmailJobStatus,
} from '@/lib/sending'
import {
  sendingQueueQuerySchema,
  createQueueJobsSchema,
  cancelQueueJobsSchema,
} from '@/lib/schemas'
import { validateRequest, validateQuery } from '@/lib/validation'

interface EmailJobRecord {
  id: string
  organization_id: string
  campaign_id: string
  lead_id: string
  mailbox_id: string
  sequence_step_id: string
  variant_id: string
  status: EmailJobStatus
  priority: number
  scheduled_at: string
  attempts: number
  max_attempts: number
  last_attempt_at: string | null
  completed_at: string | null
  error: string | null
  message_id: string | null
  created_at: string
  updated_at: string
}

// GET /api/sending/queue - Get queue status and jobs
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

    // Validate query parameters
    const queryValidation = validateQuery(request, sendingQueueQuerySchema)
    if (!queryValidation.success) return queryValidation.error

    const { campaignId, status, page, limit } = queryValidation.data
    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('email_jobs')
      .select('*', { count: 'exact' })
      .eq('organization_id', profile.organization_id)

    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }

    if (status && status.length > 0) {
      query = query.in('status', status)
    }

    query = query
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + limit - 1)

    const { data: jobs, error, count } = await query as {
      data: EmailJobRecord[] | null
      error: Error | null
      count: number | null
    }

    if (error) {
      console.error('Error fetching queue:', error)
      return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 })
    }

    // Get stats
    const { data: allJobs } = await supabase
      .from('email_jobs')
      .select('status')
      .eq('organization_id', profile.organization_id)
      .eq(campaignId ? 'campaign_id' : 'organization_id', campaignId || profile.organization_id) as {
        data: Array<{ status: EmailJobStatus }> | null
      }

    const stats = calculateQueueStats(
      allJobs?.map(j => ({ status: j.status } as EmailJob)) || []
    )

    return NextResponse.json({
      jobs: jobs?.map(j => ({
        id: j.id,
        campaignId: j.campaign_id,
        leadId: j.lead_id,
        mailboxId: j.mailbox_id,
        sequenceStepId: j.sequence_step_id,
        variantId: j.variant_id,
        status: j.status,
        priority: j.priority,
        scheduledAt: j.scheduled_at,
        attempts: j.attempts,
        maxAttempts: j.max_attempts,
        lastAttemptAt: j.last_attempt_at,
        completedAt: j.completed_at,
        error: j.error,
        messageId: j.message_id,
        createdAt: j.created_at,
        updatedAt: j.updated_at,
      })) || [],
      stats,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    })
  } catch (error) {
    console.error('Queue API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/sending/queue - Add jobs to queue
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate request body
    const validation = await validateRequest(request, createQueueJobsSchema)
    if (!validation.success) return validation.error

    const { campaignId, leadIds, sequenceStepId, variantId, scheduledAt, priority } = validation.data

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
      .select('mailbox_ids')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { mailbox_ids: string[] } | null }

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Create jobs
    const jobs = leadIds.map((leadId: string, index: number) => ({
      organization_id: profile.organization_id,
      campaign_id: campaignId,
      lead_id: leadId,
      mailbox_id: campaign.mailbox_ids[index % campaign.mailbox_ids.length], // Round-robin
      sequence_step_id: sequenceStepId,
      variant_id: variantId || 'default',
      status: 'scheduled' as EmailJobStatus,
      priority,
      scheduled_at: scheduledAt || new Date().toISOString(),
      attempts: 0,
      max_attempts: 3,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: createdJobs, error: createError } = await (supabase.from('email_jobs') as any)
      .insert(jobs)
      .select()

    if (createError) {
      console.error('Error creating jobs:', createError)
      return NextResponse.json({ error: 'Failed to create jobs' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      jobsCreated: createdJobs?.length || 0,
    }, { status: 201 })
  } catch (error) {
    console.error('Queue POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/sending/queue - Cancel jobs
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate request body
    const validation = await validateRequest(request, cancelQueueJobsSchema)
    if (!validation.success) return validation.error

    const { jobIds, campaignId, cancelAll: _cancelAll } = validation.data

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('email_jobs') as any)
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', profile.organization_id)
      .in('status', ['pending', 'scheduled']) // Only cancel pending/scheduled

    if (jobIds && jobIds.length > 0) {
      query = query.in('id', jobIds)
    } else if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }
    // If cancelAll is true and no specific jobIds/campaignId, all pending jobs will be cancelled

    const { error: updateError, count } = await query

    if (updateError) {
      console.error('Error cancelling jobs:', updateError)
      return NextResponse.json({ error: 'Failed to cancel jobs' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      cancelled: count || 0,
    })
  } catch (error) {
    console.error('Queue DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
