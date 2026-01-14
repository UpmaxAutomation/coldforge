import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  autoCategorize,
  type ReplyCategory,
  type ReplySentiment,
  type ReplyStatus,
} from '@/lib/replies'
import { listRepliesQuerySchema, createReplySchema } from '@/lib/schemas'
import { validateRequest, validateQuery } from '@/lib/validation'
import { getRepliesWithContext, getInboxStats } from '@/lib/db/queries'

// GET /api/replies - List replies (inbox)
// Optimized: Uses single query with joins instead of multiple queries
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

    // Validate query parameters
    const queryValidation = validateQuery(request, listRepliesQuerySchema)
    if (!queryValidation.success) return queryValidation.error

    const { page, limit, campaignId, mailboxId, category, sentiment, status, search } = queryValidation.data

    // Use optimized queries in parallel
    const [repliesResult, inboxStats] = await Promise.all([
      getRepliesWithContext(profile.organization_id, {
        page,
        limit,
        campaignId,
        mailboxId,
        category: category as ReplyCategory | undefined,
        sentiment: sentiment as ReplySentiment | undefined,
        status: status as ReplyStatus | undefined,
        search,
      }),
      getInboxStats(profile.organization_id),
    ])

    if (repliesResult.error) {
      throw repliesResult.error
    }

    return NextResponse.json({
      replies: (repliesResult.data || []).map(r => ({
        id: r.id,
        organizationId: r.organization_id,
        campaignId: r.campaign_id,
        leadId: r.lead_id,
        mailboxId: r.mailbox_id,
        threadId: r.thread_id,
        messageId: r.message_id,
        inReplyTo: r.in_reply_to,
        from: r.from_email,
        fromName: r.from_name,
        to: r.to_email,
        subject: r.subject,
        bodyText: r.body_text,
        bodyHtml: r.body_html,
        category: r.category,
        sentiment: r.sentiment,
        status: r.status,
        isAutoDetected: r.is_auto_detected,
        snoozedUntil: r.snoozed_until,
        receivedAt: r.received_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        // Include joined data
        lead: r.lead,
        campaign: r.campaign,
      })),
      pagination: {
        page,
        limit,
        total: repliesResult.count || 0,
        totalPages: Math.ceil((repliesResult.count || 0) / limit),
      },
      stats: {
        total: inboxStats.total,
        unread: inboxStats.unread,
        interested: inboxStats.interested,
        notInterested: inboxStats.notInterested,
        outOfOffice: inboxStats.outOfOffice,
        meetingRequests: inboxStats.meetingRequests,
        needsReply: inboxStats.needsReply,
        todayReceived: 0 // Would need separate query with date filter
      },
    })
  } catch (error) {
    console.error('List replies error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/replies - Create reply (from webhook/email receive)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Validate request body
    const validation = await validateRequest(request, createReplySchema)
    if (!validation.success) return validation.error

    const {
      organizationId,
      campaignId,
      leadId,
      mailboxId,
      threadId,
      messageId,
      inReplyTo,
      from,
      fromName,
      to,
      subject,
      bodyText,
      bodyHtml,
      receivedAt,
    } = validation.data

    // Auto-categorize the reply
    const categorization = autoCategorize(subject, bodyText)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reply, error } = await (supabase.from('replies') as any)
      .insert({
        organization_id: organizationId,
        campaign_id: campaignId,
        lead_id: leadId,
        mailbox_id: mailboxId,
        thread_id: threadId,
        message_id: messageId,
        in_reply_to: inReplyTo,
        from_email: from,
        from_name: fromName,
        to_email: to,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        category: categorization.category,
        sentiment: categorization.sentiment,
        status: 'unread',
        is_auto_detected: true,
        received_at: receivedAt || new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // Update or create thread
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads') as any)
      .upsert({
        id: threadId,
        organization_id: organizationId,
        campaign_id: campaignId,
        lead_id: leadId,
        mailbox_id: mailboxId,
        subject: subject.replace(/^(re|fwd?|fw):\s*/gi, '').trim(),
        participant_email: from,
        participant_name: fromName,
        last_message_at: receivedAt || new Date().toISOString(),
        category: categorization.category,
        sentiment: categorization.sentiment,
        status: 'active',
      }, {
        onConflict: 'id',
      })

    // Increment thread message count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)('increment_thread_message_count', {
      p_thread_id: threadId,
    })

    // Update lead status if interested
    if (leadId && categorization.category === 'interested') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('leads') as any)
        .update({
          status: 'interested',
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
    }

    // Handle unsubscribe requests
    if (leadId && categorization.category === 'unsubscribe') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('leads') as any)
        .update({
          status: 'unsubscribed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
    }

    return NextResponse.json({
      reply,
      categorization,
    }, { status: 201 })
  } catch (error) {
    console.error('Create reply error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
