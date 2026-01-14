import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptObject, decryptObject } from '@/lib/encryption'
import { testSmtpConnection, SmtpConfig } from '@/lib/smtp'
import { testImapConnection, ImapConfig } from '@/lib/imap'
import { testGoogleConnection } from '@/lib/google'
import { testMicrosoftConnection } from '@/lib/microsoft'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Type for email account response
interface EmailAccountResponse {
  id: string
  email: string
  provider: 'google' | 'microsoft' | 'smtp'
  display_name: string | null
  daily_limit: number
  status: 'active' | 'paused' | 'error' | 'warming'
  warmup_enabled: boolean
  health_score: number
  created_at: string
  updated_at: string
}

// Type for full account with credentials
interface EmailAccountFull extends EmailAccountResponse {
  smtp_host?: string | null
  smtp_port?: number | null
  smtp_username?: string | null
  smtp_password_encrypted?: string | null
  imap_host?: string | null
  imap_port?: number | null
  oauth_tokens_encrypted?: string | null
}

// GET /api/email-accounts/[id] - Get a single email account
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: account, error } = await supabase
      .from('email_accounts')
      .select('id, email, provider, display_name, daily_limit, status, warmup_enabled, health_score, created_at, updated_at')
      .eq('id', id)
      .single() as { data: EmailAccountResponse | null; error: unknown }

    if (error || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({
      account: {
        ...account,
        is_active: account.status === 'active',
      }
    })
  } catch (error) {
    console.error('Failed to fetch email account:', error)
    return NextResponse.json(
      { error: 'Failed to fetch email account' },
      { status: 500 }
    )
  }
}

// PATCH /api/email-accounts/[id] - Update an email account
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      display_name,
      daily_limit,
      is_active,
      warmup_enabled,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_password,
      imap_host,
      imap_port,
    } = body

    const updates: Record<string, unknown> = {}

    if (display_name !== undefined) updates.display_name = display_name
    if (daily_limit !== undefined) updates.daily_limit = daily_limit
    if (is_active !== undefined) updates.status = is_active ? 'active' : 'paused'
    if (warmup_enabled !== undefined) updates.warmup_enabled = warmup_enabled

    // Update credentials if provided
    if (smtp_host && smtp_password) {
      updates.smtp_host = smtp_host
      updates.smtp_port = smtp_port || 587
      updates.smtp_username = smtp_user
      updates.smtp_password_encrypted = encryptObject({
        password: smtp_password,
      })
      if (imap_host) {
        updates.imap_host = imap_host
        updates.imap_port = imap_port || 993
      }
    }

    updates.updated_at = new Date().toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: account, error } = await (supabase.from('email_accounts') as any)
      .update(updates)
      .eq('id', id)
      .select('id, email, provider, display_name, daily_limit, status, warmup_enabled, health_score, created_at, updated_at')
      .single() as { data: EmailAccountResponse | null; error: unknown }

    if (error) {
      throw error
    }

    return NextResponse.json({
      account: account ? {
        ...account,
        is_active: account.status === 'active',
      } : null
    })
  } catch (error) {
    console.error('Failed to update email account:', error)
    return NextResponse.json(
      { error: 'Failed to update email account' },
      { status: 500 }
    )
  }
}

// DELETE /api/email-accounts/[id] - Delete an email account
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('email_accounts') as any)
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete email account:', error)
    return NextResponse.json(
      { error: 'Failed to delete email account' },
      { status: 500 }
    )
  }
}

// POST /api/email-accounts/[id]/test - Test connection
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get account with credentials
    const { data: account, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', id)
      .single() as { data: EmailAccountFull | null; error: unknown }

    if (error || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    let testResult: { success: boolean; email?: string; error?: string }

    switch (account.provider) {
      case 'google': {
        if (!account.oauth_tokens_encrypted) {
          return NextResponse.json({ error: 'No OAuth tokens configured' }, { status: 400 })
        }
        const tokens = decryptObject<{ access_token: string; refresh_token: string }>(
          typeof account.oauth_tokens_encrypted === 'string'
            ? account.oauth_tokens_encrypted
            : JSON.stringify(account.oauth_tokens_encrypted)
        )
        testResult = await testGoogleConnection(tokens.access_token, tokens.refresh_token)
        break
      }
      case 'microsoft': {
        if (!account.oauth_tokens_encrypted) {
          return NextResponse.json({ error: 'No OAuth tokens configured' }, { status: 400 })
        }
        const tokens = decryptObject<{ access_token: string }>(
          typeof account.oauth_tokens_encrypted === 'string'
            ? account.oauth_tokens_encrypted
            : JSON.stringify(account.oauth_tokens_encrypted)
        )
        testResult = await testMicrosoftConnection(tokens.access_token)
        break
      }
      case 'smtp': {
        if (!account.smtp_host || !account.smtp_password_encrypted) {
          return NextResponse.json({ error: 'No SMTP configuration' }, { status: 400 })
        }

        const credentials = decryptObject<{ password: string; imap?: { host: string; port: number; password: string } }>(
          account.smtp_password_encrypted
        )

        const smtpConfig: SmtpConfig = {
          host: account.smtp_host,
          port: account.smtp_port || 587,
          secure: account.smtp_port === 465,
          user: account.smtp_username || account.email,
          password: credentials.password,
        }

        const smtpResult = await testSmtpConnection(smtpConfig)

        // Also test IMAP if configured
        if (account.imap_host && credentials.imap) {
          const imapConfig: ImapConfig = {
            host: account.imap_host,
            port: account.imap_port || 993,
            secure: true,
            user: account.smtp_username || account.email,
            password: credentials.imap.password || credentials.password,
          }
          const imapResult = await testImapConnection(imapConfig)
          if (!imapResult.success) {
            testResult = {
              success: false,
              error: `SMTP OK, but IMAP failed: ${imapResult.error}`,
            }
          } else {
            testResult = smtpResult
          }
        } else {
          testResult = smtpResult
        }
        break
      }
      default:
        testResult = { success: false, error: 'Unknown provider' }
    }

    // Update health score based on test result
    const healthScore = testResult.success ? 100 : 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('email_accounts') as any)
      .update({
        health_score: healthScore,
        status: testResult.success ? 'active' : 'error',
        last_error: testResult.success ? null : testResult.error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({
      success: testResult.success,
      email: testResult.email,
      error: testResult.error,
      health_score: healthScore,
    })
  } catch (error) {
    console.error('Failed to test connection:', error)
    return NextResponse.json(
      { error: 'Failed to test connection' },
      { status: 500 }
    )
  }
}
