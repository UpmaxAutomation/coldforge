import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type ReplyCategory, type ReplySentiment, type ReplyStatus } from '@/lib/replies'

interface ThreadMessage {
  id: string
  thread_id: string
  direction: 'inbound' | 'outbound'
  message_id: string
  from_email: string
  from_name: string | null
  to_email: string
  subject: string
  body_text: string
  body_html: string | null
  sent_at: string
  created_at: string
}

interface Reply {
  id: string
  thread_id: string
  message_id: string
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
  received_at: string
}

// GET /api/inbox/[id] - Get full thread with all messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Get thread with all related data
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .select(`
        *,
        leads:lead_id (id, email, first_name, last_name, company, title, phone, linkedin_url, status, custom_fields),
        campaigns:campaign_id (id, name, status),
        mailboxes:mailbox_id (id, email, first_name, last_name)
      `)
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single() as {
        data: {
          id: string
          organization_id: string
          campaign_id: string | null
          lead_id: string | null
          mailbox_id: string
          subject: string
          participant_email: string
          participant_name: string | null
          message_count: number
          last_message_at: string
          status: 'active' | 'resolved' | 'archived'
          category: ReplyCategory
          sentiment: ReplySentiment
          assigned_to: string | null
          created_at: string
          updated_at: string
          leads: {
            id: string
            email: string
            first_name: string | null
            last_name: string | null
            company: string | null
            title: string | null
            phone: string | null
            linkedin_url: string | null
            status: string
            custom_fields: Record<string, unknown>
          } | null
          campaigns: { id: string; name: string; status: string } | null
          mailboxes: { id: string; email: string; first_name: string | null; last_name: string | null } | null
        } | null
        error: Error | null
      }

    if (threadError || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Get thread messages
    const { data: messages } = await supabase
      .from('thread_messages')
      .select('*')
      .eq('thread_id', id)
      .order('sent_at', { ascending: true }) as {
        data: ThreadMessage[] | null
      }

    // Get replies for this thread
    const { data: replies } = await supabase
      .from('replies')
      .select('*')
      .eq('thread_id', id)
      .eq('organization_id', profile.organization_id)
      .order('received_at', { ascending: true }) as {
        data: Reply[] | null
      }

    // Mark unread replies as read
    const unreadReplyIds = replies?.filter(r => r.status === 'unread').map(r => r.id) || []
    if (unreadReplyIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('replies') as any)
        .update({ status: 'read', updated_at: new Date().toISOString() })
        .in('id', unreadReplyIds)
    }

    // Combine messages and replies into a unified thread timeline
    const timeline = [
      ...(messages?.map(m => ({
        id: m.id,
        type: 'message' as const,
        direction: m.direction,
        messageId: m.message_id,
        from: m.from_email,
        fromName: m.from_name,
        to: m.to_email,
        subject: m.subject,
        bodyText: m.body_text,
        bodyHtml: m.body_html,
        timestamp: m.sent_at,
        category: null,
        sentiment: null,
        status: null,
        isAutoDetected: false,
      })) || []),
      ...(replies?.map(r => ({
        id: r.id,
        type: 'reply' as const,
        direction: 'inbound' as const,
        messageId: r.message_id,
        from: r.from_email,
        fromName: r.from_name,
        to: r.to_email,
        subject: r.subject,
        bodyText: r.body_text,
        bodyHtml: r.body_html,
        timestamp: r.received_at,
        category: r.category,
        sentiment: r.sentiment,
        status: r.status === 'unread' ? 'read' : r.status, // Updated status
        isAutoDetected: r.is_auto_detected,
      })) || []),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Get previous/next thread for navigation
    const { data: adjacentThreads } = await supabase
      .from('threads')
      .select('id, last_message_at')
      .eq('organization_id', profile.organization_id)
      .neq('status', 'archived')
      .order('last_message_at', { ascending: false }) as {
        data: Array<{ id: string; last_message_at: string }> | null
      }

    const currentIndex = adjacentThreads?.findIndex(t => t.id === id) ?? -1
    const prevThread = currentIndex > 0 ? adjacentThreads?.[currentIndex - 1]?.id : null
    const nextThread = currentIndex < (adjacentThreads?.length ?? 0) - 1 ? adjacentThreads?.[currentIndex + 1]?.id : null

    return NextResponse.json({
      thread: {
        id: thread.id,
        organizationId: thread.organization_id,
        campaignId: thread.campaign_id,
        leadId: thread.lead_id,
        mailboxId: thread.mailbox_id,
        subject: thread.subject,
        participantEmail: thread.participant_email,
        participantName: thread.participant_name,
        messageCount: thread.message_count,
        lastMessageAt: thread.last_message_at,
        status: thread.status,
        category: thread.category,
        sentiment: thread.sentiment,
        assignedTo: thread.assigned_to,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
      },
      lead: thread.leads ? {
        id: thread.leads.id,
        email: thread.leads.email,
        firstName: thread.leads.first_name,
        lastName: thread.leads.last_name,
        company: thread.leads.company,
        title: thread.leads.title,
        phone: thread.leads.phone,
        linkedinUrl: thread.leads.linkedin_url,
        status: thread.leads.status,
        customFields: thread.leads.custom_fields,
      } : null,
      campaign: thread.campaigns ? {
        id: thread.campaigns.id,
        name: thread.campaigns.name,
        status: thread.campaigns.status,
      } : null,
      mailbox: thread.mailboxes ? {
        id: thread.mailboxes.id,
        email: thread.mailboxes.email,
        firstName: thread.mailboxes.first_name,
        lastName: thread.mailboxes.last_name,
      } : null,
      timeline,
      navigation: {
        prev: prevThread,
        next: nextThread,
        currentIndex: currentIndex + 1,
        total: adjacentThreads?.length || 0,
      },
    })
  } catch (error) {
    console.error('Get thread error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/inbox/[id] - Update thread (category, status, sentiment)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Verify thread belongs to organization
    const { data: existing } = await supabase
      .from('threads')
      .select('id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { id: string } | null }

    if (!existing) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    const body = await request.json()
    const { category, sentiment, status, assignedTo } = body

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (category !== undefined) updates.category = category
    if (sentiment !== undefined) updates.sentiment = sentiment
    if (status !== undefined) updates.status = status
    if (assignedTo !== undefined) updates.assigned_to = assignedTo

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: thread, error } = await (supabase.from('threads') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    // Also update all replies in thread if category/sentiment changed
    if (category !== undefined || sentiment !== undefined) {
      const replyUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        is_auto_detected: false,
      }
      if (category !== undefined) replyUpdates.category = category
      if (sentiment !== undefined) replyUpdates.sentiment = sentiment

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('replies') as any)
        .update(replyUpdates)
        .eq('thread_id', id)
    }

    return NextResponse.json({ thread })
  } catch (error) {
    console.error('Update thread error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
