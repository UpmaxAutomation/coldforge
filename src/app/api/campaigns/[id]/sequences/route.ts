// @ts-nocheck - TODO: Add proper Supabase type inference
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Get all sequence steps
    const { data: sequences, error } = await supabase
      .from('campaign_sequences')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('step_number', { ascending: true })

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
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign belongs to organization and is editable
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { id: string; status: string } | null }

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
    const { data: existingSteps } = await supabase
      .from('campaign_sequences')
      .select('step_number')
      .eq('campaign_id', campaignId)
      .order('step_number', { ascending: false })
      .limit(1)

    const nextStepNumber = existingSteps && existingSteps.length > 0
      ? existingSteps[0].step_number + 1
      : 1

    // Create the new step
    const variant = body.variants?.[0] || {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newStep, error: insertError } = await (supabase.from('campaign_sequences') as any)
      .insert({
        campaign_id: campaignId,
        step_number: nextStepNumber,
        subject: variant.subject || '',
        body_html: variant.isPlainText ? '' : variant.body || '',
        body_text: variant.isPlainText ? variant.body || '' : '',
        delay_days: body.delayDays || 0,
        delay_hours: body.delayHours || 0,
        condition_type: body.condition || 'always',
      })
      .select()
      .single()

    if (insertError) {
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
        body: newStep.body_html || newStep.body_text,
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign belongs to organization and is editable
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { id: string; status: string } | null }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('campaign_sequences') as any)
      .delete()
      .eq('campaign_id', campaignId)

    // Insert new steps
    if (steps.length > 0) {
      const stepsToInsert = steps.map((step, index) => {
        const variant = step.variants?.[0] || {}
        return {
          campaign_id: campaignId,
          step_number: index + 1,
          subject: variant.subject || '',
          body_html: variant.isPlainText ? '' : variant.body || '',
          body_text: variant.isPlainText ? variant.body || '' : '',
          delay_days: step.delayDays || 0,
          delay_hours: step.delayHours || 0,
          condition_type: step.condition || 'always',
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase.from('campaign_sequences') as any)
        .insert(stepsToInsert)

      if (insertError) {
        console.error('Error inserting steps:', insertError)
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify campaign belongs to organization and is editable
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { id: string; status: string } | null }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase.from('campaign_sequences') as any)
      .delete()
      .eq('id', stepId)
      .eq('campaign_id', campaignId)

    if (deleteError) {
      console.error('Error deleting step:', deleteError)
      return NextResponse.json({ error: 'Failed to delete step' }, { status: 500 })
    }

    // Reorder remaining steps
    const { data: remainingSteps } = await supabase
      .from('campaign_sequences')
      .select('id, step_number')
      .eq('campaign_id', campaignId)
      .order('step_number', { ascending: true })

    if (remainingSteps && remainingSteps.length > 0) {
      for (let i = 0; i < remainingSteps.length; i++) {
        if (remainingSteps[i].step_number !== i + 1) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('campaign_sequences') as any)
            .update({ step_number: i + 1 })
            .eq('id', remainingSteps[i].id)
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
