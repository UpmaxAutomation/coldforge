import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes, createHash } from 'crypto'
import type { Json } from '@/types/database'
import { logAuditEventAsync, getRequestMetadata } from '@/lib/audit'

// API Key type stored in user settings
interface ApiKeyData {
  id: string
  name: string
  key_preview: string
  key_hash: string
  created_at: string
  last_used_at: string | null
  is_active: boolean
}

// User profile response type
interface UserProfile {
  organization_id: string | null
  settings: Json
}

// Generate a secure API key
function generateApiKey(): string {
  return `is_${randomBytes(32).toString('hex')}`
}

// Hash API key for storage (we only store hashed version after creation)
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// Create preview version (first 12 chars + last 4)
function createKeyPreview(key: string): string {
  return `${key.slice(0, 12)}...${key.slice(-4)}`
}

// GET /api/settings/api-keys - Get all API keys
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
      .select('organization_id, settings')
      .eq('id', user.id)
      .single() as { data: UserProfile | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Get API keys from user settings (stored in JSON since there's no api_keys table)
    const userSettings = (profile.settings as Record<string, unknown>) || {}
    const apiKeys = (userSettings.api_keys as ApiKeyData[]) || []

    // Return keys without the hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const safeKeys = apiKeys.map(({ key_hash: _, ...rest }) => rest)

    return NextResponse.json({
      api_keys: safeKeys
    })
  } catch (error) {
    console.error('Failed to fetch API keys:', error)
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    )
  }
}

// POST /api/settings/api-keys - Create a new API key
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Get user's organization and settings
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, settings')
      .eq('id', user.id)
      .single() as { data: UserProfile | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const userSettings = (profile.settings as Record<string, unknown>) || {}
    const existingKeys = (userSettings.api_keys as ApiKeyData[]) || []

    // Generate new key
    const newKey = generateApiKey()
    const keyHash = hashApiKey(newKey)
    const keyPreview = createKeyPreview(newKey)

    const newApiKey: ApiKeyData = {
      id: randomBytes(16).toString('hex'),
      name: name.trim(),
      key_preview: keyPreview,
      key_hash: keyHash,
      created_at: new Date().toISOString(),
      last_used_at: null,
      is_active: true
    }

    // Add to existing keys
    const updatedKeys = [...existingKeys, newApiKey]

    // Update user settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('users') as any)
      .update({
        settings: {
          ...userSettings,
          api_keys: updatedKeys
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (error) {
      throw error
    }

    // Audit log API key creation
    const reqMetadata = getRequestMetadata(request)
    logAuditEventAsync({
      user_id: user.id,
      organization_id: profile.organization_id ?? undefined,
      action: 'api_key_create',
      resource_type: 'api_key',
      resource_id: newApiKey.id,
      details: { name: newApiKey.name },
      ...reqMetadata
    })

    // Return the full key (only time it's visible)
    return NextResponse.json({
      api_key: {
        id: newApiKey.id,
        name: newApiKey.name,
        key: newKey, // Full key only on creation
        key_preview: newApiKey.key_preview,
        created_at: newApiKey.created_at,
        is_active: true
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create API key:', error)
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    )
  }
}

// DELETE /api/settings/api-keys?id=xxx - Delete an API key
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')

    if (!keyId) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 })
    }

    // Get user's settings
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, settings')
      .eq('id', user.id)
      .single() as { data: UserProfile | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const userSettings = (profile.settings as Record<string, unknown>) || {}
    const existingKeys = (userSettings.api_keys as ApiKeyData[]) || []

    // Filter out the key to delete
    const updatedKeys = existingKeys.filter(key => key.id !== keyId)

    if (updatedKeys.length === existingKeys.length) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    // Update user settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('users') as any)
      .update({
        settings: {
          ...userSettings,
          api_keys: updatedKeys
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (error) {
      throw error
    }

    // Audit log API key revocation
    const reqMetadata = getRequestMetadata(request)
    logAuditEventAsync({
      user_id: user.id,
      organization_id: profile.organization_id ?? undefined,
      action: 'api_key_revoke',
      resource_type: 'api_key',
      resource_id: keyId,
      ...reqMetadata
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete API key:', error)
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    )
  }
}
