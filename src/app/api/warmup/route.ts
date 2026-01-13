import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createWarmupManager,
  aggregateWarmupStats,
  type WarmupStats,
  type WarmupMailbox,
} from '@/lib/warmup'

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

// GET /api/warmup - Get warmup overview and stats
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get all warmup-enabled mailboxes
    const { data: mailboxes, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('*, domains!inner(organization_id)')
      .eq('domains.organization_id', profile.organization_id)
      .eq('warmup_enabled', true) as {
        data: Array<MailboxRecord & { domains: { organization_id: string } }> | null
        error: Error | null
      }

    if (mailboxError) {
      console.error('Error fetching mailboxes:', mailboxError)
      return NextResponse.json({ error: 'Failed to fetch mailboxes' }, { status: 500 })
    }

    // Get warmup stats for each mailbox
    const warmupManager = createWarmupManager()
    const stats: WarmupStats[] = []

    for (const mailbox of mailboxes || []) {
      // In a real implementation, these would come from the database
      const sentCount = 0 // Would query warmup_emails table
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

      stats.push(
        warmupManager.getStats(
          mailboxData,
          sentCount,
          receivedCount,
          repliedCount,
          todaySent,
          todayReceived,
          todayReplied
        )
      )
    }

    const aggregated = aggregateWarmupStats(stats)

    return NextResponse.json({
      overview: aggregated,
      mailboxes: stats.map(s => ({
        mailboxId: s.mailboxId,
        email: s.email,
        stage: s.stage,
        progress: s.warmupProgress,
        replyRate: s.replyRate,
        deliverabilityScore: s.deliverabilityScore,
        isHealthy: s.isHealthy,
        sentToday: s.sentToday,
        issues: s.issues,
      })),
      config: warmupManager.getConfig(),
    })
  } catch (error) {
    console.error('Warmup API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/warmup - Enable/disable warmup or update config
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, mailboxIds, config } = body

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    switch (action) {
      case 'enable': {
        if (!mailboxIds || !Array.isArray(mailboxIds)) {
          return NextResponse.json({ error: 'Mailbox IDs required' }, { status: 400 })
        }

        // Enable warmup for specified mailboxes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('mailboxes') as any)
          .update({
            warmup_enabled: true,
            warmup_stage: 1,
            warmup_days_in_stage: 0,
            updated_at: new Date().toISOString(),
          })
          .in('id', mailboxIds)

        if (error) {
          console.error('Error enabling warmup:', error)
          return NextResponse.json({ error: 'Failed to enable warmup' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: `Warmup enabled for ${mailboxIds.length} mailboxes`,
        })
      }

      case 'disable': {
        if (!mailboxIds || !Array.isArray(mailboxIds)) {
          return NextResponse.json({ error: 'Mailbox IDs required' }, { status: 400 })
        }

        // Disable warmup for specified mailboxes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('mailboxes') as any)
          .update({
            warmup_enabled: false,
            updated_at: new Date().toISOString(),
          })
          .in('id', mailboxIds)

        if (error) {
          console.error('Error disabling warmup:', error)
          return NextResponse.json({ error: 'Failed to disable warmup' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: `Warmup disabled for ${mailboxIds.length} mailboxes`,
        })
      }

      case 'update_config': {
        // Update organization warmup config
        // This would be stored in organization_settings or similar
        // For now, just validate and return success
        if (!config) {
          return NextResponse.json({ error: 'Config required' }, { status: 400 })
        }

        return NextResponse.json({
          success: true,
          message: 'Warmup configuration updated',
          config,
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Warmup POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
