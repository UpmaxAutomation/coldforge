import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/leads/lists - Get all lead lists
export async function GET() {
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

    // Get all lists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lists, error } = await (supabase.from('lead_lists') as any)
      .select('*')
      .eq('organization_id', userData.organization_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching lead lists:', error)
      return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
    }

    return NextResponse.json({
      lists: lists?.map((list: { id: string; name: string; description: string | null; lead_count: number; created_at: string; updated_at: string }) => ({
        id: list.id,
        name: list.name,
        description: list.description,
        leadCount: list.lead_count,
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
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
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

    // Create list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: list, error: createError } = await (supabase.from('lead_lists') as any)
      .insert({
        organization_id: userData.organization_id,
        name,
        description,
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
