import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptObject } from '@/lib/encryption'
import { logAuditEventAsync, getRequestMetadata } from '@/lib/audit'
import {
  apiLimiter,
  writeLimiter,
  applyRateLimit,
  addRateLimitHeaders,
} from '@/lib/rate-limit/middleware'
import { createEmailAccountSchema } from '@/lib/schemas'
import { invalidateEmailAccountsCache } from '@/lib/cache/queries'
import { validateRequest } from '@/lib/validation'
import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  DatabaseError,
} from '@/lib/errors'
import { handleApiError } from '@/lib/errors/handler'

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
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const { limited, response, result } = applyRateLimit(request, apiLimiter)
  if (limited) return response!

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new AuthenticationError()
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      throw new BadRequestError('No organization found')
    }

    // Get email accounts (credentials are never returned)
    const { data: accounts, error } = await supabase
      .from('email_accounts')
      .select('id, email, provider, display_name, daily_limit, status, warmup_enabled, health_score, created_at, updated_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false }) as { data: EmailAccountResponse[] | null; error: unknown }

    if (error) {
      throw new DatabaseError('Failed to fetch email accounts', { originalError: String(error) })
    }

    // Transform to frontend-friendly format
    const transformedAccounts = accounts?.map((account: EmailAccountResponse) => ({
      ...account,
      is_active: account.status === 'active',
    }))

    const jsonResponse = NextResponse.json({ accounts: transformedAccounts })
    return addRateLimitHeaders(jsonResponse, result)
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/email-accounts - Create a new email account
export async function POST(request: NextRequest) {
  // Apply stricter rate limiting for write operations
  const { limited, response, result } = applyRateLimit(request, writeLimiter)
  if (limited) return response!

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new AuthenticationError()
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      throw new BadRequestError('No organization found')
    }

    // Validate request body with Zod schema
    const validation = await validateRequest(request, createEmailAccountSchema)
    if (!validation.success) return validation.error

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
      daily_limit,
    } = validation.data

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
      // SMTP fields are validated by the schema's refine check

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
        throw new ConflictError('An account with this email already exists')
      }
      throw new DatabaseError('Failed to create email account', { originalError: String(error) })
    }

    // Invalidate email accounts cache
    invalidateEmailAccountsCache(profile.organization_id)

    // Audit log email account creation
    if (account) {
      const reqMetadata = getRequestMetadata(request)
      logAuditEventAsync({
        user_id: user.id,
        organization_id: profile.organization_id,
        action: 'create',
        resource_type: 'email_account',
        resource_id: account.id,
        details: { email: account.email, provider: account.provider },
        ...reqMetadata
      })
    }

    const jsonResponse = NextResponse.json({
      account: account ? {
        ...account,
        is_active: account.status === 'active',
      } : null
    }, { status: 201 })
    return addRateLimitHeaders(jsonResponse, result)
  } catch (error) {
    return handleApiError(error)
  }
}
