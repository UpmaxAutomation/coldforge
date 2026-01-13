import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRandomTagColor } from '@/lib/leads'

interface LeadTagRecord {
  id: string
  organization_id: string
  name: string
  color: string
  lead_count: number
  created_at: string
}

// GET /api/leads/tags - Get all tags
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

    // Get all tags
    const { data: tags, error } = await supabase
      .from('lead_tags')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('name', { ascending: true }) as {
        data: LeadTagRecord[] | null
        error: Error | null
      }

    if (error) {
      console.error('Error fetching tags:', error)
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 })
    }

    return NextResponse.json({
      tags: tags?.map(tag => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        leadCount: tag.lead_count,
        createdAt: tag.created_at,
      })) || [],
    })
  } catch (error) {
    console.error('Lead tags API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/leads/tags - Create a new tag
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, color } = body

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

    // Check for existing tag with same name
    const { data: existing } = await supabase
      .from('lead_tags')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('name', name)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Tag already exists' }, { status: 409 })
    }

    // Create tag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tag, error: createError } = await (supabase.from('lead_tags') as any)
      .insert({
        organization_id: profile.organization_id,
        name,
        color: color || getRandomTagColor(),
        lead_count: 0,
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating tag:', createError)
      return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 })
    }

    return NextResponse.json({
      tag: {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        leadCount: tag.lead_count,
        createdAt: tag.created_at,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Lead tag create error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/leads/tags - Delete a tag
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tagId } = body

    if (!tagId) {
      return NextResponse.json({ error: 'Tag ID required' }, { status: 400 })
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

    // Get tag name for removing from leads
    const { data: tag } = await supabase
      .from('lead_tags')
      .select('name')
      .eq('id', tagId)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { name: string } | null }

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    // Delete tag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase.from('lead_tags') as any)
      .delete()
      .eq('id', tagId)
      .eq('organization_id', profile.organization_id)

    if (deleteError) {
      console.error('Error deleting tag:', deleteError)
      return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 })
    }

    // Note: In a real implementation, you'd also remove the tag from all leads
    // This would typically be done via a database trigger or background job

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Lead tag delete error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
