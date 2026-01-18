import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyBounce } from '@/lib/deliverability'
import crypto from 'crypto'

// POST /api/webhooks/email-events - Webhook for email provider events
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature using HMAC-SHA256
    const signature = request.headers.get('x-webhook-signature')
    const timestamp = request.headers.get('x-webhook-timestamp')
    const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET

    // Get raw body for signature verification
    const rawBody = await request.clone().text()

    // Require signature verification in production
    const requireVerification = process.env.NODE_ENV === 'production' ||
      process.env.VERIFY_EMAIL_WEBHOOKS === 'true'

    if (requireVerification && webhookSecret) {
      if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
      }

      // Verify timestamp is recent (within 5 minutes) to prevent replay attacks
      if (timestamp) {
        const timestampAge = Math.abs(Date.now() - parseInt(timestamp, 10))
        if (timestampAge > 5 * 60 * 1000) {
          return NextResponse.json({ error: 'Timestamp expired' }, { status: 401 })
        }
      }

      // Compute expected signature
      const signPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signPayload)
        .digest('hex')

      // Use timing-safe comparison
      try {
        const sigBuffer = Buffer.from(signature)
        const expectedBuffer = Buffer.from(expectedSignature)
        if (sigBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }
      } catch {
        return NextResponse.json({ error: 'Invalid signature format' }, { status: 401 })
      }
    } else if (webhookSecret && !signature && process.env.NODE_ENV === 'development') {
      console.warn('Webhook received without signature in development mode')
    }

    // Parse the body (we already have it from signature verification)
    const body = JSON.parse(rawBody)
    const { eventType, messageId, email: _email, bounceDetails, timestamp: eventTimestamp, provider: _provider } = body

    if (!eventType || !messageId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()

    // Find the email job by message ID
    const { data: job } = await supabase
      .from('email_jobs')
      .select('id, organization_id, campaign_id, lead_id, mailbox_id')
      .eq('message_id', messageId)
      .single()

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
          await supabase
            .from('leads')
            .update({
              status: 'bounced',
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.lead_id)
        }

        // Update campaign stats
        await supabase.rpc('increment_campaign_stat', {
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
        await supabase
          .from('leads')
          .update({
            status: 'unsubscribed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.lead_id)

        // Increment spam complaints on mailbox (for reputation tracking)
        await supabase.rpc('increment_mailbox_spam_complaints', {
          p_mailbox_id: job.mailbox_id,
        })
        break

      case 'delivered':
        eventData = {
          deliveredAt: eventTimestamp || new Date().toISOString(),
        }
        break

      case 'unsubscribe':
      case 'unsubscribed':
        normalizedEventType = 'unsubscribed'

        // Mark lead as unsubscribed
        await supabase
          .from('leads')
          .update({
            status: 'unsubscribed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.lead_id)

        // Update campaign stats
        await supabase.rpc('increment_campaign_stat', {
          p_campaign_id: job.campaign_id,
          p_stat: 'unsubscribed',
        })
        break

      default:
        // Unknown event type, still record it
        eventData = { rawEvent: body }
    }

    // Record the event
    const adminClient = createAdminClient();
    await adminClient
      .from('email_events')
      .insert({
        organization_id: job.organization_id,
        campaign_id: job.campaign_id,
        lead_id: job.lead_id,
        mailbox_id: job.mailbox_id,
        message_id: messageId,
        event_type: normalizedEventType as 'sent' | 'delivered' | 'bounced' | 'soft_bounced' | 'opened' | 'clicked' | 'complained' | 'unsubscribed' | 'deferred',
        event_data: eventData,
        recipient_email: '', // Will be filled from job lookup if needed
        occurred_at: eventTimestamp || new Date().toISOString(),
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
