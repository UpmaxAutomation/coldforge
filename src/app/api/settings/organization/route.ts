import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'
import { logAuditEventAsync, getRequestMetadata } from '@/lib/audit'

// Type definitions
interface UserProfile {
  organization_id: string | null
  role: 'owner' | 'admin' | 'member'
}

interface Organization {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'pro' | 'agency'
  settings: Json
}

interface TeamMember {
  id: string
  email: string
  full_name: string | null
  role: 'owner' | 'admin' | 'member'
  avatar_url: string | null
  created_at: string
}

// POST /api/settings/organization - Create organization for user without one
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user already has an organization
    const { data: existingProfile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string | null } | null }

    if (existingProfile?.organization_id) {
      return NextResponse.json(
        { error: 'User already has an organization' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { name } = body

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Organization name is required' },
        { status: 400 }
      )
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient()

    // Create unique slug
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const slug = `${baseSlug}-${user.id.slice(0, 8)}`

    // Create organization using admin client (bypasses RLS)
    const { data: organization, error: orgError } = await adminClient
      .from('organizations')
      .insert({
        name: name.trim(),
        slug,
        plan: 'starter',
        settings: {}
      })
      .select('id, name, slug, plan')
      .single()

    if (orgError) {
      console.error('Failed to create organization:', orgError)
      return NextResponse.json(
        { error: 'Failed to create organization' },
        { status: 500 }
      )
    }

    // Check if user profile exists
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (existingUser) {
      // Update existing profile
      const { error: updateError } = await adminClient
        .from('users')
        .update({
          organization_id: organization.id,
          role: 'owner'
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('Failed to update user profile:', updateError)
      }
    } else {
      // Create new profile
      const { error: insertError } = await adminClient
        .from('users')
        .insert({
          id: user.id,
          organization_id: organization.id,
          email: user.email!,
          full_name: user.user_metadata?.full_name || null,
          role: 'owner',
          settings: {}
        })

      if (insertError) {
        console.error('Failed to create user profile:', insertError)
      }
    }

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan
      }
    })
  } catch (error) {
    console.error('Failed to create organization:', error)
    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 }
    )
  }
}

// GET /api/settings/organization - Get organization details
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single() as { data: UserProfile | null }

    if (!profile?.organization_id) {
      // Return special response indicating user needs to create org
      return NextResponse.json({
        needs_organization: true,
        message: 'Please create an organization to continue'
      }, { status: 200 })
    }

    // Get organization details
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, slug, plan, settings')
      .eq('id', profile.organization_id)
      .single() as { data: Organization | null; error: { code?: string; message?: string } | null }

    if (orgError) {
      throw orgError
    }

    // Get team members
    const { data: teamMembers, error: teamError } = await supabase
      .from('users')
      .select('id, email, full_name, role, avatar_url, created_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: true }) as { data: TeamMember[] | null; error: { code?: string; message?: string } | null }

    if (teamError) {
      throw teamError
    }

    const orgSettings = (organization?.settings as Record<string, unknown>) || {}

    return NextResponse.json({
      organization: {
        id: organization?.id,
        name: organization?.name,
        slug: organization?.slug,
        plan: organization?.plan,
        domain: orgSettings.domain || null,
        settings: {
          default_timezone: orgSettings.default_timezone || 'America/New_York',
          default_daily_limit: orgSettings.default_daily_limit || 50
        }
      },
      team_members: teamMembers || [],
      user_role: profile.role
    })
  } catch (error) {
    console.error('Failed to fetch organization:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organization' },
      { status: 500 }
    )
  }
}

// PATCH /api/settings/organization - Update organization
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization and role
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single() as { data: UserProfile | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Only owners and admins can update organization
    if (!['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = await request.json()
    const { name, domain, default_timezone, default_daily_limit } = body

    // Get current settings
    const { data: currentOrg } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', profile.organization_id)
      .single() as { data: { settings: Json } | null }

    const currentSettings = (currentOrg?.settings as Record<string, unknown>) || {}

    // Update settings
    const newSettings: Record<string, unknown> = { ...currentSettings }

    if (domain !== undefined) {
      newSettings.domain = domain
    }

    if (default_timezone !== undefined) {
      newSettings.default_timezone = default_timezone
    }

    if (default_daily_limit !== undefined) {
      newSettings.default_daily_limit = Math.min(Math.max(1, default_daily_limit), 500)
    }

    // Build update object dynamically
    interface OrgUpdate {
      updated_at: string
      name?: string
      settings: Json
    }

    const updateObj: OrgUpdate = {
      updated_at: new Date().toISOString(),
      settings: newSettings as unknown as Json
    }

    if (name !== undefined) {
      updateObj.name = name
    }

    const { data: organization, error } = await supabase
      .from('organizations')
      // @ts-expect-error - Supabase type inference issue with Json column updates
      .update(updateObj)
      .eq('id', profile.organization_id)
      .select('id, name, slug, plan, settings')
      .single() as { data: Organization | null; error: { code?: string; message?: string } | null }

    if (error) {
      throw error
    }

    // Audit log organization settings change
    const reqMetadata = getRequestMetadata(request)
    logAuditEventAsync({
      user_id: user.id,
      organization_id: profile.organization_id ?? undefined,
      action: 'settings_change',
      resource_type: 'organization',
      resource_id: profile.organization_id ?? undefined,
      details: { changes: Object.keys(body) },
      ...reqMetadata
    })

    const orgSettings = (organization?.settings as Record<string, unknown>) || {}

    return NextResponse.json({
      organization: {
        id: organization?.id,
        name: organization?.name,
        slug: organization?.slug,
        plan: organization?.plan,
        domain: orgSettings.domain || null,
        settings: {
          default_timezone: orgSettings.default_timezone || 'America/New_York',
          default_daily_limit: orgSettings.default_daily_limit || 50
        }
      }
    })
  } catch (error) {
    console.error('Failed to update organization:', error)
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    )
  }
}
