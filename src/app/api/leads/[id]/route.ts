import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { LeadStatus } from '@/lib/leads'

interface LeadRecord {
  id: string
  organization_id: string
  email: string
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  phone: string | null
  linkedin_url: string | null
  website: string | null
  custom_fields: Record<string, string>
  tags: string[]
  list_ids: string[]
  status: LeadStatus
  source: string
  source_details: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}

// GET /api/leads/[id] - Get single lead
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

    // Get lead
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single() as { data: LeadRecord | null; error: Error | null }

    if (error || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json({
      lead: {
        id: lead.id,
        email: lead.email,
        firstName: lead.first_name,
        lastName: lead.last_name,
        company: lead.company,
        title: lead.title,
        phone: lead.phone,
        linkedinUrl: lead.linkedin_url,
        website: lead.website,
        customFields: lead.custom_fields,
        tags: lead.tags,
        listIds: lead.list_ids,
        status: lead.status,
        source: lead.source,
        sourceDetails: lead.source_details,
        lastContactedAt: lead.last_contacted_at,
        createdAt: lead.created_at,
        updatedAt: lead.updated_at,
      },
    })
  } catch (error) {
    console.error('Lead GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/leads/[id] - Update lead
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

    // Verify lead belongs to organization
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.firstName !== undefined) updates.first_name = body.firstName
    if (body.lastName !== undefined) updates.last_name = body.lastName
    if (body.company !== undefined) updates.company = body.company
    if (body.title !== undefined) updates.title = body.title
    if (body.phone !== undefined) updates.phone = body.phone
    if (body.linkedinUrl !== undefined) updates.linkedin_url = body.linkedinUrl
    if (body.website !== undefined) updates.website = body.website
    if (body.customFields !== undefined) updates.custom_fields = body.customFields
    if (body.tags !== undefined) updates.tags = body.tags
    if (body.listIds !== undefined) updates.list_ids = body.listIds
    if (body.status !== undefined) updates.status = body.status

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: updateError } = await (supabase.from('leads') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating lead:', updateError)
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
    }

    return NextResponse.json({ lead })
  } catch (error) {
    console.error('Lead PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/leads/[id] - Delete lead
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

    // Delete lead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase.from('leads') as any)
      .delete()
      .eq('id', id)
      .eq('organization_id', profile.organization_id)

    if (deleteError) {
      console.error('Error deleting lead:', deleteError)
      return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Lead DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
