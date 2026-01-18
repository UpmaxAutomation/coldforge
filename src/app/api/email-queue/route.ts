// Email Queue API
// Manage email queue - list, view, cancel, retry

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getQueueStats,
  cancelQueuedEmails,
  retryFailedEmails,
} from '@/lib/smtp/queue';

// GET /api/email-queue - List queued emails
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const status = searchParams.get('status');
    const campaignId = searchParams.get('campaignId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from('email_queue')
      .select(`
        id,
        campaign_id,
        sequence_id,
        sequence_step,
        from_email,
        from_name,
        to_email,
        to_name,
        subject,
        status,
        priority,
        attempts,
        max_attempts,
        scheduled_at,
        sent_at,
        delivered_at,
        error_code,
        error_message,
        created_at
      `, { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('scheduled_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    const { data: emails, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
    }

    // Get stats
    const stats = await getQueueStats(workspaceId);

    // Transform to camelCase
    const transformedEmails = (emails || []).map((e) => ({
      id: e.id,
      campaignId: e.campaign_id,
      sequenceId: e.sequence_id,
      sequenceStep: e.sequence_step,
      fromEmail: e.from_email,
      fromName: e.from_name,
      toEmail: e.to_email,
      toName: e.to_name,
      subject: e.subject,
      status: e.status,
      priority: e.priority,
      attempts: e.attempts,
      maxAttempts: e.max_attempts,
      scheduledAt: e.scheduled_at,
      sentAt: e.sent_at,
      deliveredAt: e.delivered_at,
      errorCode: e.error_code,
      errorMessage: e.error_message,
      createdAt: e.created_at,
    }));

    return NextResponse.json({
      emails: transformedEmails,
      stats,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Get email queue error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email queue' },
      { status: 500 }
    );
  }
}

// POST /api/email-queue - Queue an email
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      workspaceId,
      campaignId,
      sequenceId,
      sequenceStep,
      fromMailboxId,
      fromEmail,
      fromName,
      replyTo,
      toEmail,
      toName,
      leadId,
      subject,
      bodyHtml,
      bodyText,
      customHeaders,
      trackingId,
      smtpProviderId,
      scheduledAt,
      sendWindowStart,
      sendWindowEnd,
      timezone,
      priority,
    } = body;

    if (!workspaceId || !fromEmail || !toEmail || !subject || !bodyHtml) {
      return NextResponse.json(
        { error: 'workspaceId, fromEmail, toEmail, subject, and bodyHtml are required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Use admin client for INSERT to bypass RLS
    const adminClient = createAdminClient();

    // Queue the email
    const { data, error } = await adminClient
      .from('email_queue')
      .insert({
        workspace_id: workspaceId,
        campaign_id: campaignId,
        sequence_id: sequenceId,
        sequence_step: sequenceStep,
        from_mailbox_id: fromMailboxId,
        from_email: fromEmail,
        from_name: fromName,
        reply_to: replyTo,
        to_email: toEmail,
        to_name: toName,
        lead_id: leadId,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        custom_headers: customHeaders || {},
        tracking_id: trackingId,
        smtp_provider_id: smtpProviderId,
        scheduled_at: scheduledAt || new Date().toISOString(),
        send_window_start: sendWindowStart,
        send_window_end: sendWindowEnd,
        timezone: timezone || 'UTC',
        status: 'pending',
        priority: priority || 5,
        attempts: 0,
        max_attempts: 3,
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to queue email' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      queueId: data.id,
    });
  } catch (error) {
    console.error('Queue email error:', error);
    return NextResponse.json(
      { error: 'Failed to queue email' },
      { status: 500 }
    );
  }
}

// PATCH /api/email-queue - Bulk operations (cancel, retry)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, action, queueIds } = body;

    if (!workspaceId || !action) {
      return NextResponse.json(
        { error: 'workspaceId and action are required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let result: { affected: number };

    switch (action) {
      case 'cancel':
        if (!queueIds || !Array.isArray(queueIds)) {
          return NextResponse.json(
            { error: 'queueIds array required for cancel action' },
            { status: 400 }
          );
        }
        const cancelResult = await cancelQueuedEmails(queueIds, workspaceId);
        result = { affected: cancelResult.cancelled };
        break;

      case 'retry':
        const retryResult = await retryFailedEmails(workspaceId);
        result = { affected: retryResult.retried };
        break;

      case 'cancelAll':
        const { data: cancelledData } = await supabase
          .from('email_queue')
          .update({ status: 'cancelled' })
          .eq('workspace_id', workspaceId)
          .in('status', ['pending', 'scheduled'])
          .select('id');
        result = { affected: cancelledData?.length || 0 };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: cancel, retry, or cancelAll' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      action,
      affected: result.affected,
    });
  } catch (error) {
    console.error('Queue action error:', error);
    return NextResponse.json(
      { error: 'Failed to perform queue action' },
      { status: 500 }
    );
  }
}
