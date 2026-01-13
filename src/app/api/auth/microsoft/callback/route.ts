import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMicrosoftTokens, getMicrosoftUserInfo } from '@/lib/microsoft'
import { encryptObject } from '@/lib/encryption'

// GET /api/auth/microsoft/callback - Handle Microsoft OAuth callback
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (error) {
      return NextResponse.redirect(
        new URL(`/accounts?error=${encodeURIComponent(errorDescription || error)}`, request.url)
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
    const tokens = await getMicrosoftTokens(code)

    if (!tokens.accessToken) {
      return NextResponse.redirect(
        new URL('/accounts?error=token_exchange_failed', request.url)
      )
    }

    // Get user info
    const userInfo = await getMicrosoftUserInfo(tokens.accessToken)

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
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_on: tokens.expiresOn,
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
        provider: 'microsoft',
        display_name: userInfo.name,
        oauth_tokens_encrypted: encryptedCredentials,
        daily_limit: 50,
        status: 'active',
        warmup_enabled: false,
        health_score: 100,
      })
    }

    return NextResponse.redirect(
      new URL('/accounts?success=microsoft_connected', request.url)
    )
  } catch (error) {
    console.error('Microsoft OAuth callback error:', error)
    return NextResponse.redirect(
      new URL('/accounts?error=oauth_failed', request.url)
    )
  }
}
