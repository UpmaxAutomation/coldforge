import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleTokens, getGoogleUserInfo } from '@/lib/google'
import { encryptObject } from '@/lib/encryption'

// GET /api/auth/google/callback - Handle Google OAuth callback
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(
        new URL(`/accounts?error=${encodeURIComponent(error)}`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/accounts?error=missing_params', request.url)
      )
    }

    // Decode and verify state
    let stateData: { userId: string; nonce: string }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    } catch {
      return NextResponse.redirect(
        new URL('/accounts?error=invalid_state', request.url)
      )
    }

    const supabase = await createClient()

    // Verify user is still logged in
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== stateData.userId) {
      return NextResponse.redirect(
        new URL('/login?redirect=/accounts', request.url)
      )
    }

    // Exchange code for tokens
    const tokens = await getGoogleTokens(code)

    if (!tokens.access_token) {
      return NextResponse.redirect(
        new URL('/accounts?error=token_exchange_failed', request.url)
      )
    }

    // Get user info
    const userInfo = await getGoogleUserInfo(tokens.access_token)

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      return NextResponse.redirect(
        new URL('/accounts?error=no_organization', request.url)
      )
    }

    // Encrypt tokens
    const encryptedCredentials = encryptObject({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    })

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('email', userInfo.email)
      .single() as { data: { id: string } | null }

    if (existingAccount) {
      // Update existing account
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('email_accounts') as any).update({
        oauth_tokens_encrypted: encryptedCredentials,
        status: 'active',
        health_score: 100,
        updated_at: new Date().toISOString(),
      }).eq('id', existingAccount.id)
    } else {
      // Create new account
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('email_accounts') as any).insert({
        organization_id: profile.organization_id,
        email: userInfo.email,
        provider: 'google',
        display_name: userInfo.name,
        oauth_tokens_encrypted: encryptedCredentials,
        daily_limit: 50,
        status: 'active',
        warmup_enabled: false,
        health_score: 100,
      })
    }

    return NextResponse.redirect(
      new URL('/accounts?success=google_connected', request.url)
    )
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    return NextResponse.redirect(
      new URL('/accounts?error=oauth_failed', request.url)
    )
  }
}
