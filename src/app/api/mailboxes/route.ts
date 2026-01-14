import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createMailboxSchema,
  listMailboxesQuerySchema,
} from '@/lib/schemas'
import {
  AuthenticationError,
  ConflictError,
  DatabaseError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import { handleApiError } from '@/lib/errors/handler'

interface MailboxRecord {
  id: string
  email: string
  domain_id: string
  provider: string
  provider_user_id: string | null
  first_name: string
  last_name: string
  status: 'active' | 'suspended' | 'pending' | 'error'
  sending_quota: number
  emails_sent_today: number
  warmup_enabled: boolean
  warmup_stage: number
  last_activity: string | null
  created_at: string
  updated_at: string
}

// GET /api/mailboxes - List all mailboxes
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AuthenticationError()
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url)
    const queryResult = listMailboxesQuerySchema.safeParse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      domain_id: searchParams.get('domain_id'),
      status: searchParams.get('status'),
    })

    const { page, limit, domain_id: domainId, status } = queryResult.success
      ? queryResult.data
      : { page: 1, limit: 50, domain_id: undefined, status: undefined }

    const offset = (page - 1) * limit

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      throw new NotFoundError('Profile')
    }

    // Build query
    let query = supabase
      .from('mailboxes')
      .select('*, domains!inner(domain, organization_id)', { count: 'exact' })
      .eq('domains.organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (domainId) {
      query = query.eq('domain_id', domainId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: mailboxes, error, count } = await query as {
      data: Array<MailboxRecord & { domains: { domain: string; organization_id: string } }> | null
      error: Error | null
      count: number | null
    }

    if (error) {
      throw new DatabaseError('Failed to fetch mailboxes', { originalError: error.message })
    }

    return NextResponse.json({
      mailboxes: mailboxes?.map(m => ({
        id: m.id,
        email: m.email,
        domain: m.domains.domain,
        domainId: m.domain_id,
        provider: m.provider,
        firstName: m.first_name,
        lastName: m.last_name,
        displayName: `${m.first_name} ${m.last_name}`.trim(),
        status: m.status,
        sendingQuota: m.sending_quota,
        emailsSentToday: m.emails_sent_today,
        warmupEnabled: m.warmup_enabled,
        warmupStage: m.warmup_stage,
        lastActivity: m.last_activity,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })) || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/mailboxes - Create a new mailbox
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AuthenticationError()
    }

    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = createMailboxSchema.safeParse(body)
    if (!validationResult.success) {
      throw new ValidationError(
        validationResult.error.issues[0]?.message || 'Invalid request body',
        { issues: validationResult.error.issues }
      )
    }

    const {
      domainId,
      email,
      firstName,
      lastName,
      password: _password,
      provider,
      warmupEnabled,
      sendingQuota,
    } = validationResult.data

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      throw new NotFoundError('Profile')
    }

    // Verify domain belongs to organization
    const { data: domain, error: domainError } = await supabase
      .from('domains')
      .select('id, domain, provider_config')
      .eq('id', domainId)
      .eq('organization_id', profile.organization_id)
      .single() as {
        data: { id: string; domain: string; provider_config: Record<string, unknown> | null } | null
        error: Error | null
      }

    if (domainError || !domain) {
      throw new NotFoundError('Domain', domainId)
    }

    // Validate email matches domain
    if (!email.endsWith(`@${domain.domain}`)) {
      throw new ValidationError(`Email must end with @${domain.domain}`)
    }

    // Check if mailbox already exists
    const { data: existingMailbox } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('email', email)
      .single() as { data: { id: string } | null }

    if (existingMailbox) {
      throw new ConflictError('A mailbox with this email already exists')
    }

    // TODO: If provider is google_workspace or microsoft_365, provision via API
    // For now, just create the database record

    // Create mailbox record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mailbox, error: createError } = await (supabase.from('mailboxes') as any)
      .insert({
        email,
        domain_id: domainId,
        provider,
        first_name: firstName,
        last_name: lastName,
        status: 'pending',
        sending_quota: sendingQuota,
        emails_sent_today: 0,
        warmup_enabled: warmupEnabled,
        warmup_stage: 0,
      })
      .select()
      .single() as { data: MailboxRecord | null; error: Error | null }

    if (createError) {
      throw new DatabaseError('Failed to create mailbox', { originalError: createError.message })
    }

    return NextResponse.json({
      success: true,
      mailbox: {
        id: mailbox?.id,
        email: mailbox?.email,
        firstName: mailbox?.first_name,
        lastName: mailbox?.last_name,
        status: mailbox?.status,
        provider: mailbox?.provider,
      },
    }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
