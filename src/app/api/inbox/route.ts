import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type ReplyCategory, type ReplySentiment, type ReplyStatus } from '@/lib/replies'

interface ThreadWithLatestReply {
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
  // Joined data
  latest_reply_text?: string
  has_unread?: boolean
  lead_company?: string
  campaign_name?: string
}

// GET /api/inbox - Get inbox threads with latest reply preview
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
    const category = searchParams.get('category') as ReplyCategory | null
    const status = searchParams.get('status') as 'active' | 'resolved' | 'archived' | null
    const search = searchParams.get('search')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    // Build query for threads with joins
    let query = supabase
      .from('threads')
      .select(`
        *,
        leads:lead_id (id, email, first_name, last_name, company, title),
        campaigns:campaign_id (id, name),
        replies!replies_thread_id_fkey (id, body_text, status, received_at)
      `, { count: 'exact' })
      .eq('organization_id', profile.organization_id)
      .order('last_message_at', { ascending: false })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    } else {
      // Default: exclude archived
      query = query.neq('status', 'archived')
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`subject.ilike.%${search}%,participant_email.ilike.%${search}%,participant_name.ilike.%${search}%`)
    }

    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data: threads, error, count } = await query as {
      data: Array<ThreadWithLatestReply & {
        leads: { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null } | null
        campaigns: { id: string; name: string } | null
        replies: Array<{ id: string; body_text: string; status: ReplyStatus; received_at: string }>
      }> | null
      error: Error | null
      count: number | null
    }

    if (error) {
      throw error
    }

    // Process threads with additional info
    const processedThreads = threads?.map(thread => {
      const latestReply = thread.replies?.sort((a, b) =>
        new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
      )[0]

      const hasUnread = thread.replies?.some(r => r.status === 'unread') || false

      // Filter if unreadOnly
      if (unreadOnly && !hasUnread) {
        return null
      }

      return {
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
        // Additional computed fields
        preview: latestReply?.body_text?.slice(0, 150) || '',
        hasUnread,
        lead: thread.leads ? {
          id: thread.leads.id,
          email: thread.leads.email,
          firstName: thread.leads.first_name,
          lastName: thread.leads.last_name,
          company: thread.leads.company,
          title: thread.leads.title,
        } : null,
        campaign: thread.campaigns ? {
          id: thread.campaigns.id,
          name: thread.campaigns.name,
        } : null,
      }
    }).filter(Boolean) || []

    // Get inbox stats
    const { data: allThreads } = await supabase
      .from('threads')
      .select('category, status')
      .eq('organization_id', profile.organization_id)
      .neq('status', 'archived') as {
        data: Array<{ category: ReplyCategory; status: string }> | null
      }

    // Get unread count separately
    const { count: unreadCount } = await supabase
      .from('replies')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('status', 'unread')

    const stats = {
      total: allThreads?.length || 0,
      unread: unreadCount || 0,
      interested: allThreads?.filter(t => t.category === 'interested').length || 0,
      notInterested: allThreads?.filter(t => t.category === 'not_interested').length || 0,
      outOfOffice: allThreads?.filter(t => t.category === 'out_of_office').length || 0,
      meetingRequest: allThreads?.filter(t => t.category === 'meeting_request').length || 0,
      unsubscribe: allThreads?.filter(t => t.category === 'unsubscribe').length || 0,
      question: allThreads?.filter(t => t.category === 'question').length || 0,
    }

    return NextResponse.json({
      threads: processedThreads,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      stats,
    })
  } catch (error) {
    console.error('List inbox error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/inbox - Bulk actions on threads
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { action, threadIds, replyIds } = body as {
      action: 'mark_read' | 'mark_unread' | 'archive' | 'resolve' | 'unarchive'
      threadIds?: string[]
      replyIds?: string[]
    }

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    if (!threadIds?.length && !replyIds?.length) {
      return NextResponse.json({ error: 'Thread IDs or Reply IDs are required' }, { status: 400 })
    }

    const now = new Date().toISOString()

    switch (action) {
      case 'mark_read':
        if (replyIds?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('replies') as any)
            .update({ status: 'read', updated_at: now })
            .in('id', replyIds)
            .eq('organization_id', profile.organization_id)
        }
        if (threadIds?.length) {
          // Mark all replies in threads as read
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('replies') as any)
            .update({ status: 'read', updated_at: now })
            .in('thread_id', threadIds)
            .eq('organization_id', profile.organization_id)
            .eq('status', 'unread')
        }
        break

      case 'mark_unread':
        if (replyIds?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('replies') as any)
            .update({ status: 'unread', updated_at: now })
            .in('id', replyIds)
            .eq('organization_id', profile.organization_id)
        }
        break

      case 'archive':
        if (threadIds?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('threads') as any)
            .update({ status: 'archived', updated_at: now })
            .in('id', threadIds)
            .eq('organization_id', profile.organization_id)

          // Also archive all replies
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('replies') as any)
            .update({ status: 'archived', updated_at: now })
            .in('thread_id', threadIds)
            .eq('organization_id', profile.organization_id)
        }
        break

      case 'resolve':
        if (threadIds?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('threads') as any)
            .update({ status: 'resolved', updated_at: now })
            .in('id', threadIds)
            .eq('organization_id', profile.organization_id)
        }
        break

      case 'unarchive':
        if (threadIds?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('threads') as any)
            .update({ status: 'active', updated_at: now })
            .in('id', threadIds)
            .eq('organization_id', profile.organization_id)
        }
        break
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Bulk action error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
