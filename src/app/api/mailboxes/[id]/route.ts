import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  aliases: string[]
  created_at: string
  updated_at: string
}

// GET /api/mailboxes/[id] - Get a single mailbox
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get mailbox with domain verification
    const { data: mailbox, error } = await supabase
      .from('mailboxes')
      .select('*, domains!inner(domain, organization_id)')
      .eq('id', id)
      .eq('domains.organization_id', profile.organization_id)
      .single() as {
        data: (MailboxRecord & { domains: { domain: string; organization_id: string } }) | null
        error: Error | null
      }

    if (error || !mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: mailbox.id,
      email: mailbox.email,
      domain: mailbox.domains.domain,
      domainId: mailbox.domain_id,
      provider: mailbox.provider,
      providerUserId: mailbox.provider_user_id,
      firstName: mailbox.first_name,
      lastName: mailbox.last_name,
      displayName: `${mailbox.first_name} ${mailbox.last_name}`.trim(),
      status: mailbox.status,
      sendingQuota: mailbox.sending_quota,
      emailsSentToday: mailbox.emails_sent_today,
      warmupEnabled: mailbox.warmup_enabled,
      warmupStage: mailbox.warmup_stage,
      aliases: mailbox.aliases || [],
      lastActivity: mailbox.last_activity,
      createdAt: mailbox.created_at,
      updatedAt: mailbox.updated_at,
    })
  } catch (error) {
    console.error('Mailbox GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/mailboxes/[id] - Update a mailbox
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const {
      firstName,
      lastName,
      status,
      sendingQuota,
      warmupEnabled,
      warmupStage,
    } = body

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify mailbox belongs to organization
    const { data: existingMailbox, error: fetchError } = await supabase
      .from('mailboxes')
      .select('*, domains!inner(organization_id)')
      .eq('id', id)
      .eq('domains.organization_id', profile.organization_id)
      .single() as {
        data: (MailboxRecord & { domains: { organization_id: string } }) | null
        error: Error | null
      }

    if (fetchError || !existingMailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (firstName !== undefined) updates.first_name = firstName
    if (lastName !== undefined) updates.last_name = lastName
    if (status !== undefined) updates.status = status
    if (sendingQuota !== undefined) updates.sending_quota = sendingQuota
    if (warmupEnabled !== undefined) updates.warmup_enabled = warmupEnabled
    if (warmupStage !== undefined) updates.warmup_stage = warmupStage

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mailbox, error: updateError } = await (supabase.from('mailboxes') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single() as { data: MailboxRecord | null; error: Error | null }

    if (updateError) {
      console.error('Error updating mailbox:', updateError)
      return NextResponse.json({ error: 'Failed to update mailbox' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      mailbox: {
        id: mailbox?.id,
        email: mailbox?.email,
        firstName: mailbox?.first_name,
        lastName: mailbox?.last_name,
        status: mailbox?.status,
        sendingQuota: mailbox?.sending_quota,
        warmupEnabled: mailbox?.warmup_enabled,
        warmupStage: mailbox?.warmup_stage,
      },
    })
  } catch (error) {
    console.error('Mailbox update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/mailboxes/[id] - Delete a mailbox
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify mailbox belongs to organization
    const { data: existingMailbox, error: fetchError } = await supabase
      .from('mailboxes')
      .select('*, domains!inner(organization_id)')
      .eq('id', id)
      .eq('domains.organization_id', profile.organization_id)
      .single() as {
        data: (MailboxRecord & { domains: { organization_id: string } }) | null
        error: Error | null
      }

    if (fetchError || !existingMailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }

    // TODO: If provider is google_workspace or microsoft_365, delete via API

    // Delete mailbox record
    const { error: deleteError } = await supabase
      .from('mailboxes')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting mailbox:', deleteError)
      return NextResponse.json({ error: 'Failed to delete mailbox' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Mailbox delete error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
