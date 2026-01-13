import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { LeadStatus, LeadSource, LeadFilter } from '@/lib/leads'

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
  source: LeadSource
  source_details: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}

// GET /api/leads - List leads with filtering and pagination
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

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')?.split(',') as LeadStatus[] | undefined
    const tags = searchParams.get('tags')?.split(',')
    const listIds = searchParams.get('listIds')?.split(',')
    const source = searchParams.get('source')?.split(',') as LeadSource[] | undefined

    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    // Apply filters
    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`)
    }

    if (status && status.length > 0) {
      query = query.in('status', status)
    }

    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags)
    }

    if (listIds && listIds.length > 0) {
      query = query.overlaps('list_ids', listIds)
    }

    if (source && source.length > 0) {
      query = query.in('source', source)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: leads, error, count } = await query as {
      data: LeadRecord[] | null
      error: Error | null
      count: number | null
    }

    if (error) {
      console.error('Error fetching leads:', error)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    return NextResponse.json({
      leads: leads?.map(lead => ({
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
      })) || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    })
  } catch (error) {
    console.error('Leads API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/leads - Create a new lead
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      email,
      firstName,
      lastName,
      company,
      title,
      phone,
      linkedinUrl,
      website,
      customFields,
      tags,
      listIds,
    } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
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

    // Check for duplicate email
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('email', email.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Lead with this email already exists' }, { status: 409 })
    }

    // Create lead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: createError } = await (supabase.from('leads') as any)
      .insert({
        organization_id: profile.organization_id,
        email: email.toLowerCase(),
        first_name: firstName,
        last_name: lastName,
        company,
        title,
        phone,
        linkedin_url: linkedinUrl,
        website,
        custom_fields: customFields || {},
        tags: tags || [],
        list_ids: listIds || [],
        status: 'new',
        source: 'manual',
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating lead:', createError)
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
    }

    return NextResponse.json({ lead }, { status: 201 })
  } catch (error) {
    console.error('Lead create error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/leads - Bulk delete leads
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { leadIds } = body

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'Lead IDs required' }, { status: 400 })
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

    // Delete leads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase.from('leads') as any)
      .delete()
      .eq('organization_id', profile.organization_id)
      .in('id', leadIds)

    if (deleteError) {
      console.error('Error deleting leads:', deleteError)
      return NextResponse.json({ error: 'Failed to delete leads' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted: leadIds.length,
    })
  } catch (error) {
    console.error('Lead delete error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
