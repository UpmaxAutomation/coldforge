import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Tables, InsertTables } from '@/types/database'

type CampaignSequence = Tables<'campaign_sequences'>
type Campaign = Tables<'campaigns'>

interface ProfileWithOrg {
  organization_id: string
}

interface SequenceStep {
  id: string
  order: number
  type: 'email'
  delayDays: number
  delayHours: number
  condition: 'always' | 'not_opened' | 'not_replied' | 'not_clicked'
  variants: {
    id: string
    name: string
    weight: number
    subject: string
    body: string
    isPlainText: boolean
  }[]
}

// GET /api/campaigns/[id]/sequences - Get all sequence steps for a campaign
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
    const profileResult = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const profile = profileResult.data as ProfileWithOrg | null

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign belongs to organization
    const campaignResult = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single()

    const campaign = campaignResult.data as Pick<Campaign, 'id'> | null

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get all sequence steps
    const sequencesResult = await supabase
      .from('campaign_sequences')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('step_number', { ascending: true })

    const sequences = sequencesResult.data as CampaignSequence[] | null
    const error = sequencesResult.error

    if (error) {
      console.error('Error fetching sequences:', error)
      return NextResponse.json({ error: 'Failed to fetch sequences' }, { status: 500 })
    }

    // Transform database records to step format
    const steps: SequenceStep[] = (sequences || []).map((seq) => ({
      id: seq.id,
      order: seq.step_number,
      type: 'email' as const,
      delayDays: seq.delay_days || 0,
      delayHours: seq.delay_hours || 0,
      condition: (seq.condition_type || 'always') as SequenceStep['condition'],
      variants: [{
        id: `var_${seq.id}`,
        name: 'Version A',
        weight: 100,
        subject: seq.subject || '',
        body: seq.body_html || '',
        isPlainText: !seq.body_html && !!seq.body_text,
      }],
    }))

    return NextResponse.json({ steps })
  } catch (error) {
    console.error('Sequences GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/campaigns/[id]/sequences - Create a new sequence step
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

    // Get user's organization
    const profileResult = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const profile = profileResult.data as ProfileWithOrg | null

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign belongs to organization and is editable
    const campaignResult = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single()

    const campaign = campaignResult.data as Pick<Campaign, 'id' | 'status'> | null

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot modify sequence of an active campaign' },
        { status: 400 }
      )
    }

    // Get the next step number
    const existingStepsResult = await supabase
      .from('campaign_sequences')
      .select('step_number')
      .eq('campaign_id', campaignId)
      .order('step_number', { ascending: false })
      .limit(1)

    const existingSteps = existingStepsResult.data as Pick<CampaignSequence, 'step_number'>[] | null

    const nextStepNumber = existingSteps && existingSteps.length > 0 && existingSteps[0]
      ? existingSteps[0].step_number + 1
      : 1

    // Create the new step
    const variant = body.variants?.[0] || {}

    const insertData: InsertTables<'campaign_sequences'> = {
      campaign_id: campaignId,
      step_number: nextStepNumber,
      subject: variant.subject || '',
      body_html: variant.isPlainText ? '' : variant.body || '',
      body_text: variant.isPlainText ? variant.body || '' : '',
      delay_days: body.delayDays || 0,
      delay_hours: body.delayHours || 0,
      condition_type: body.condition || 'always',
    }

    // Use type assertion to bypass RLS-restricted types
    const insertResult = await (supabase
      .from('campaign_sequences') as ReturnType<typeof supabase.from>)
      .insert(insertData as InsertTables<'campaign_sequences'>)
      .select()
      .single()

    const newStep = insertResult.data as CampaignSequence | null
    const insertError = insertResult.error

    if (insertError || !newStep) {
      console.error('Error creating step:', insertError)
      return NextResponse.json({ error: 'Failed to create step' }, { status: 500 })
    }

    const step: SequenceStep = {
      id: newStep.id,
      order: newStep.step_number,
      type: 'email',
      delayDays: newStep.delay_days,
      delayHours: newStep.delay_hours,
      condition: newStep.condition_type,
      variants: [{
        id: `var_${newStep.id}`,
        name: 'Version A',
        weight: 100,
        subject: newStep.subject,
        body: newStep.body_html || newStep.body_text || '',
        isPlainText: !newStep.body_html,
      }],
    }

    return NextResponse.json({ step }, { status: 201 })
  } catch (error) {
    console.error('Sequences POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/campaigns/[id]/sequences - Update all sequence steps (bulk update)
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
    const { steps } = body as { steps: SequenceStep[] }

    if (!steps || !Array.isArray(steps)) {
      return NextResponse.json({ error: 'Steps array is required' }, { status: 400 })
    }

    // Get user's organization
    const profileResult = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const profile = profileResult.data as ProfileWithOrg | null

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign belongs to organization and is editable
    const campaignResult = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single()

    const campaign = campaignResult.data as Pick<Campaign, 'id' | 'status'> | null

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot modify sequence of an active campaign' },
        { status: 400 }
      )
    }

    // Delete existing steps
    await supabase
      .from('campaign_sequences')
      .delete()
      .eq('campaign_id', campaignId)

    // Insert new steps
    if (steps.length > 0) {
      const stepsToInsert: InsertTables<'campaign_sequences'>[] = steps.map((step, index) => {
        const variant = step.variants?.[0]
        return {
          campaign_id: campaignId,
          step_number: index + 1,
          subject: variant?.subject || '',
          body_html: variant?.isPlainText ? '' : variant?.body || '',
          body_text: variant?.isPlainText ? variant?.body || '' : '',
          delay_days: step.delayDays || 0,
          delay_hours: step.delayHours || 0,
          condition_type: step.condition || 'always',
        }
      })

      // Use type assertion to bypass RLS-restricted types
      const insertResult = await (supabase
        .from('campaign_sequences') as ReturnType<typeof supabase.from>)
        .insert(stepsToInsert as InsertTables<'campaign_sequences'>[])

      if (insertResult.error) {
        console.error('Error inserting steps:', insertResult.error)
        return NextResponse.json({ error: 'Failed to save steps' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, stepsCount: steps.length })
  } catch (error) {
    console.error('Sequences PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/campaigns/[id]/sequences?stepId=xxx - Delete a specific step
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
    const stepId = searchParams.get('stepId')

    if (!stepId) {
      return NextResponse.json({ error: 'Step ID is required' }, { status: 400 })
    }

    // Get user's organization
    const profileResult = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const profile = profileResult.data as ProfileWithOrg | null

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign belongs to organization and is editable
    const campaignResult = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single()

    const campaign = campaignResult.data as Pick<Campaign, 'id' | 'status'> | null

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot modify sequence of an active campaign' },
        { status: 400 }
      )
    }

    // Delete the step
    const deleteResult = await supabase
      .from('campaign_sequences')
      .delete()
      .eq('id', stepId)
      .eq('campaign_id', campaignId)

    if (deleteResult.error) {
      console.error('Error deleting step:', deleteResult.error)
      return NextResponse.json({ error: 'Failed to delete step' }, { status: 500 })
    }

    // Reorder remaining steps
    const remainingStepsResult = await supabase
      .from('campaign_sequences')
      .select('id, step_number')
      .eq('campaign_id', campaignId)
      .order('step_number', { ascending: true })

    const remainingSteps = remainingStepsResult.data as Pick<CampaignSequence, 'id' | 'step_number'>[] | null

    if (remainingSteps && remainingSteps.length > 0) {
      for (let i = 0; i < remainingSteps.length; i++) {
        const step = remainingSteps[i]
        if (step && step.step_number !== i + 1) {
          // Use type assertion to bypass RLS-restricted types
          await (supabase
            .from('campaign_sequences') as ReturnType<typeof supabase.from>)
            .update({ step_number: i + 1 } as Record<string, unknown>)
            .eq('id', step.id)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Sequences DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
