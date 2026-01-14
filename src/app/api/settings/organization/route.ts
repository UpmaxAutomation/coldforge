import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
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

    // Build update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) {
      updateData.name = name
    }

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

    updateData.settings = newSettings

    // Update organization
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: organization, error } = await (supabase.from('organizations') as any)
      .update(updateData)
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
