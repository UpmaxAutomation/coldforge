import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMicrosoftAuthUrl } from '@/lib/microsoft'
import { randomBytes } from 'crypto'

// GET /api/auth/microsoft - Initiate Microsoft OAuth flow
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Generate state for CSRF protection
    const state = randomBytes(32).toString('hex')

    // Store state in a cookie or session for verification
    // For simplicity, we'll include the user ID in the state
    const stateData = Buffer.from(JSON.stringify({
      userId: user.id,
      nonce: state,
    })).toString('base64')

    const authUrl = getMicrosoftAuthUrl(stateData)

    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('Failed to initiate Microsoft OAuth:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Microsoft OAuth' },
      { status: 500 }
    )
  }
}
