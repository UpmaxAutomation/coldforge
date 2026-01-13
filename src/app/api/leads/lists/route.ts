import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface LeadListRecord {
  id: string
  organization_id: string
  name: string
  description: string | null
  lead_count: number
  color: string | null
  created_at: string
  updated_at: string
}

// GET /api/leads/lists - Get all lead lists
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

    // Get all lists
    const { data: lists, error } = await supabase
      .from('lead_lists')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false }) as {
        data: LeadListRecord[] | null
        error: Error | null
      }

    if (error) {
      console.error('Error fetching lead lists:', error)
      return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
    }

    return NextResponse.json({
      lists: lists?.map(list => ({
        id: list.id,
        name: list.name,
        description: list.description,
        leadCount: list.lead_count,
        color: list.color,
        createdAt: list.created_at,
        updatedAt: list.updated_at,
      })) || [],
    })
  } catch (error) {
    console.error('Lead lists API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/leads/lists - Create a new list
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, color } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
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

    // Create list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: list, error: createError } = await (supabase.from('lead_lists') as any)
      .insert({
        organization_id: profile.organization_id,
        name,
        description,
        color,
        lead_count: 0,
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating list:', createError)
      return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
    }

    return NextResponse.json({
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        leadCount: list.lead_count,
        color: list.color,
        createdAt: list.created_at,
        updatedAt: list.updated_at,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Lead list create error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
