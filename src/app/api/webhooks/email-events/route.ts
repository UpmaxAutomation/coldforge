import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyBounce } from '@/lib/deliverability'

// POST /api/webhooks/email-events - Webhook for email provider events
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature (provider-specific)
    const signature = request.headers.get('x-webhook-signature')
    const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET

    // In production, verify signature matches
    // For now, just check if secret is configured and signature exists
    if (webhookSecret && !signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    const body = await request.json()
    const { eventType, messageId, email: _email, bounceDetails, timestamp, provider: _provider } = body

    if (!eventType || !messageId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()

    // Find the email job by message ID
    const { data: job } = await supabase
      .from('email_jobs')
      .select('id, organization_id, campaign_id, lead_id, mailbox_id')
      .eq('message_id', messageId)
      .single() as {
        data: {
          id: string
          organization_id: string
          campaign_id: string
          lead_id: string
          mailbox_id: string
        } | null
      }

    if (!job) {
      // Message not found, might be from a different system
      console.warn(`Email event for unknown message: ${messageId}`)
      return NextResponse.json({ received: true, processed: false })
    }

    // Map event type from provider format
    let normalizedEventType: string = eventType.toLowerCase()
    let eventData: Record<string, unknown> = {}

    switch (normalizedEventType) {
      case 'bounce':
      case 'bounced':
      case 'hard_bounce':
      case 'soft_bounce':
        const bounce = classifyBounce(
          bounceDetails?.code,
          bounceDetails?.message || eventType
        )
        normalizedEventType = bounce.type === 'hard' ? 'bounced' : 'soft_bounced'
        eventData = {
          bounceType: bounce.type,
          bounceCategory: bounce.category,
          bounceCode: bounce.code,
          bounceMessage: bounce.message,
        }

        // Update lead status for hard bounces
        if (bounce.type === 'hard') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('leads') as any)
            .update({
              status: 'bounced',
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.lead_id)
        }

        // Update campaign stats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)('increment_campaign_stat', {
          p_campaign_id: job.campaign_id,
          p_stat: 'bounced',
        })
        break

      case 'complaint':
      case 'complained':
      case 'spam':
      case 'spam_report':
        normalizedEventType = 'complained'
        eventData = {
          complaintType: bounceDetails?.type || 'abuse',
          feedbackId: bounceDetails?.feedbackId,
        }

        // Mark lead as unsubscribed on spam complaint
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('leads') as any)
          .update({
            status: 'unsubscribed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.lead_id)

        // Increment spam complaints on mailbox (for reputation tracking)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)('increment_mailbox_spam_complaints', {
          p_mailbox_id: job.mailbox_id,
        })
        break

      case 'delivered':
        eventData = {
          deliveredAt: timestamp || new Date().toISOString(),
        }
        break

      case 'unsubscribe':
      case 'unsubscribed':
        normalizedEventType = 'unsubscribed'

        // Mark lead as unsubscribed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('leads') as any)
          .update({
            status: 'unsubscribed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.lead_id)

        // Update campaign stats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)('increment_campaign_stat', {
          p_campaign_id: job.campaign_id,
          p_stat: 'unsubscribed',
        })
        break

      default:
        // Unknown event type, still record it
        eventData = { rawEvent: body }
    }

    // Record the event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('email_events') as any)
      .insert({
        organization_id: job.organization_id,
        campaign_id: job.campaign_id,
        lead_id: job.lead_id,
        mailbox_id: job.mailbox_id,
        message_id: messageId,
        event_type: normalizedEventType,
        event_data: eventData,
        timestamp: timestamp || new Date().toISOString(),
      })

    return NextResponse.json({
      received: true,
      processed: true,
      eventType: normalizedEventType,
    })
  } catch (error) {
    console.error('Email webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
