import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { updateProfileSchema } from '@/lib/schemas'
import { validateRequest } from '@/lib/validation'

// Profile response type
interface UserProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: 'owner' | 'admin' | 'member'
  settings: Json
}

// GET /api/settings/profile - Get user profile
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile, error } = await supabase
      .from('users')
      .select('id, email, full_name, avatar_url, role, settings')
      .eq('id', user.id)
      .single() as { data: UserProfile | null; error: { code?: string; message?: string } | null }

    if (error) {
      // If no profile exists, create one
      if (error.code === 'PGRST116') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newProfile, error: insertError } = await (supabase.from('users') as any)
          .insert({
            id: user.id,
            email: user.email!,
            settings: { timezone: 'America/New_York' }
          })
          .select('id, email, full_name, avatar_url, role, settings')
          .single() as { data: UserProfile | null; error: { code?: string; message?: string } | null }

        if (insertError) {
          throw insertError
        }

        const newProfileSettings = (newProfile?.settings as Record<string, unknown>) || {}
        return NextResponse.json({
          profile: {
            id: newProfile?.id,
            email: newProfile?.email,
            full_name: newProfile?.full_name,
            avatar_url: newProfile?.avatar_url,
            role: newProfile?.role,
            timezone: newProfileSettings.timezone || 'America/New_York'
          }
        })
      }
      throw error
    }

    const profileSettings = (profile?.settings as Record<string, unknown>) || {}
    return NextResponse.json({
      profile: {
        id: profile?.id,
        email: profile?.email,
        full_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
        role: profile?.role,
        timezone: profileSettings.timezone || 'America/New_York'
      }
    })
  } catch (error) {
    console.error('Failed to fetch profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

// PATCH /api/settings/profile - Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate request body
    const validation = await validateRequest(request, updateProfileSchema)
    if (!validation.success) return validation.error

    const { full_name, timezone, avatar_url } = validation.data

    // Get current settings
    const { data: currentProfile } = await supabase
      .from('users')
      .select('settings')
      .eq('id', user.id)
      .single() as { data: { settings: Json } | null }

    const currentSettings = (currentProfile?.settings as Record<string, unknown>) || {}

    // Build update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    if (full_name !== undefined) {
      updateData.full_name = full_name
    }

    if (avatar_url !== undefined) {
      updateData.avatar_url = avatar_url
    }

    if (timezone !== undefined) {
      updateData.settings = {
        ...currentSettings,
        timezone
      }
    }

    // Update profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error } = await (supabase.from('users') as any)
      .update(updateData)
      .eq('id', user.id)
      .select('id, email, full_name, avatar_url, role, settings')
      .single() as { data: UserProfile | null; error: { code?: string; message?: string } | null }

    if (error) {
      throw error
    }

    const profileSettings = (profile?.settings as Record<string, unknown>) || {}
    return NextResponse.json({
      profile: {
        id: profile?.id,
        email: profile?.email,
        full_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
        role: profile?.role,
        timezone: profileSettings.timezone || 'America/New_York'
      }
    })
  } catch (error) {
    console.error('Failed to update profile:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
