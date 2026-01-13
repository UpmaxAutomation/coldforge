import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptObject } from '@/lib/encryption'

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
  updated_at?: string
}

// GET /api/email-accounts - List all email accounts for the org
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
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Get email accounts (credentials are never returned)
    const { data: accounts, error } = await supabase
      .from('email_accounts')
      .select('id, email, provider, display_name, daily_limit, status, warmup_enabled, health_score, created_at, updated_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false }) as { data: EmailAccountResponse[] | null; error: unknown }

    if (error) {
      throw error
    }

    // Transform to frontend-friendly format
    const transformedAccounts = accounts?.map((account: EmailAccountResponse) => ({
      ...account,
      is_active: account.status === 'active',
    }))

    return NextResponse.json({ accounts: transformedAccounts })
  } catch (error) {
    console.error('Failed to fetch email accounts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch email accounts' },
      { status: 500 }
    )
  }
}

// POST /api/email-accounts - Create a new email account
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const body = await request.json()
    const {
      email,
      provider,
      display_name,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_password,
      imap_host,
      imap_port,
      oauth_tokens,
      daily_limit = 50,
    } = body

    // Validate required fields
    if (!email || !provider) {
      return NextResponse.json(
        { error: 'Email and provider are required' },
        { status: 400 }
      )
    }

    // Build insert data
    const insertData: Record<string, unknown> = {
      organization_id: profile.organization_id,
      email,
      provider,
      display_name: display_name || email,
      daily_limit,
      status: 'active',
      warmup_enabled: false,
      health_score: 100,
    }

    if (provider === 'smtp') {
      if (!smtp_host || !smtp_port || !smtp_user || !smtp_password) {
        return NextResponse.json(
          { error: 'SMTP configuration is required for SMTP provider' },
          { status: 400 }
        )
      }

      insertData.smtp_host = smtp_host
      insertData.smtp_port = smtp_port
      insertData.smtp_username = smtp_user
      insertData.smtp_password_encrypted = encryptObject({
        password: smtp_password,
        imap: imap_host ? {
          host: imap_host,
          port: imap_port || 993,
          password: smtp_password,
        } : null,
      })
      insertData.imap_host = imap_host
      insertData.imap_port = imap_port || 993
    } else if (oauth_tokens) {
      insertData.oauth_tokens_encrypted = encryptObject(oauth_tokens)
    }

    // Create email account
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: account, error } = await (supabase.from('email_accounts') as any)
      .insert(insertData)
      .select('id, email, provider, display_name, daily_limit, status, warmup_enabled, health_score, created_at')
      .single() as { data: EmailAccountResponse | null; error: { code?: string; message?: string } | null }

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 400 }
        )
      }
      throw error
    }

    return NextResponse.json({
      account: account ? {
        ...account,
        is_active: account.status === 'active',
      } : null
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create email account:', error)
    return NextResponse.json(
      { error: 'Failed to create email account' },
      { status: 500 }
    )
  }
}
