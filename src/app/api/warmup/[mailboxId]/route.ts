import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWarmupManager, type WarmupMailbox } from '@/lib/warmup'

interface MailboxRecord {
  id: string
  email: string
  first_name: string
  last_name: string
  warmup_enabled: boolean
  warmup_stage: number
  warmup_days_in_stage: number
  emails_sent_today: number
  status: string
}

// GET /api/warmup/[mailboxId] - Get warmup stats for a specific mailbox
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mailboxId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mailboxId } = await params

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get mailbox
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('*, domains!inner(organization_id)')
      .eq('id', mailboxId)
      .eq('domains.organization_id', profile.organization_id)
      .single() as {
        data: (MailboxRecord & { domains: { organization_id: string } }) | null
        error: Error | null
      }

    if (mailboxError || !mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }

    const warmupManager = createWarmupManager()

    // In a real implementation, these would come from the database
    const sentCount = 0
    const receivedCount = 0
    const repliedCount = 0
    const todaySent = mailbox.emails_sent_today
    const todayReceived = 0
    const todayReplied = 0

    const mailboxData: WarmupMailbox = {
      id: mailbox.id,
      email: mailbox.email,
      firstName: mailbox.first_name,
      lastName: mailbox.last_name,
      warmupStage: mailbox.warmup_stage || 1,
      warmupDaysInStage: mailbox.warmup_days_in_stage || 0,
      warmupEnabled: mailbox.warmup_enabled,
      emailsSentToday: mailbox.emails_sent_today,
    }

    const stats = warmupManager.getStats(
      mailboxData,
      sentCount,
      receivedCount,
      repliedCount,
      todaySent,
      todayReceived,
      todayReplied
    )

    return NextResponse.json({
      stats,
      dailyLimit: warmupManager.getDailyLimit(mailbox.warmup_stage || 1),
      shouldAdvance: warmupManager.shouldAdvance(mailboxData, stats.replyRate),
      config: warmupManager.getConfig(),
    })
  } catch (error) {
    console.error('Warmup mailbox GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/warmup/[mailboxId] - Update warmup settings for a mailbox
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ mailboxId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mailboxId } = await params
    const body = await request.json()
    const { warmupEnabled, warmupStage, resetProgress } = body

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
      .eq('id', mailboxId)
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

    if (warmupEnabled !== undefined) {
      updates.warmup_enabled = warmupEnabled
    }

    if (warmupStage !== undefined) {
      updates.warmup_stage = warmupStage
      updates.warmup_days_in_stage = 0 // Reset days when changing stage
    }

    if (resetProgress) {
      updates.warmup_stage = 1
      updates.warmup_days_in_stage = 0
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase.from('mailboxes') as any)
      .update(updates)
      .eq('id', mailboxId)

    if (updateError) {
      console.error('Error updating warmup settings:', updateError)
      return NextResponse.json({ error: 'Failed to update warmup settings' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Warmup settings updated',
    })
  } catch (error) {
    console.error('Warmup mailbox PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
