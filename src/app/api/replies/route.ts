import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  autoCategorize,
  type ReplyCategory,
  type ReplySentiment,
  type ReplyStatus,
} from '@/lib/replies'

interface ReplyRow {
  id: string
  organization_id: string
  campaign_id: string | null
  lead_id: string | null
  mailbox_id: string
  thread_id: string
  message_id: string
  in_reply_to: string | null
  from_email: string
  from_name: string | null
  to_email: string
  subject: string
  body_text: string
  body_html: string | null
  category: ReplyCategory
  sentiment: ReplySentiment
  status: ReplyStatus
  is_auto_detected: boolean
  snoozed_until: string | null
  received_at: string
  created_at: string
  updated_at: string
}

// GET /api/replies - List replies (inbox)
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

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const campaignId = searchParams.get('campaignId')
    const mailboxId = searchParams.get('mailboxId')
    const category = searchParams.get('category') as ReplyCategory | null
    const sentiment = searchParams.get('sentiment') as ReplySentiment | null
    const status = searchParams.get('status') as ReplyStatus | null
    const search = searchParams.get('search')

    // Build query
    let query = supabase
      .from('replies')
      .select('*', { count: 'exact' })
      .eq('organization_id', profile.organization_id)
      .order('received_at', { ascending: false })

    // Apply filters
    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }
    if (mailboxId) {
      query = query.eq('mailbox_id', mailboxId)
    }
    if (category) {
      query = query.eq('category', category)
    }
    if (sentiment) {
      query = query.eq('sentiment', sentiment)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.or(`subject.ilike.%${search}%,body_text.ilike.%${search}%,from_email.ilike.%${search}%`)
    }

    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data: replies, error, count } = await query as {
      data: ReplyRow[] | null
      error: Error | null
      count: number | null
    }

    if (error) {
      throw error
    }

    // Get inbox stats
    const { data: stats } = await supabase
      .from('replies')
      .select('status, category', { count: 'exact' })
      .eq('organization_id', profile.organization_id) as {
        data: Array<{ status: ReplyStatus; category: ReplyCategory }> | null
      }

    const inboxStats = {
      total: stats?.length || 0,
      unread: stats?.filter(r => r.status === 'unread').length || 0,
      interested: stats?.filter(r => r.category === 'interested').length || 0,
      notInterested: stats?.filter(r => r.category === 'not_interested').length || 0,
      outOfOffice: stats?.filter(r => r.category === 'out_of_office').length || 0,
      meetingRequests: stats?.filter(r => r.category === 'meeting_request').length || 0,
      needsReply: stats?.filter(r => r.status === 'read' && r.category === 'interested').length || 0,
      todayReceived: 0 // Would need separate query with date filter
    }

    return NextResponse.json({
      replies: replies?.map(r => ({
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
      })) || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      stats: inboxStats,
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
    const body = await request.json()

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
    } = body

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
