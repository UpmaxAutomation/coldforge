// Public API: Individual Mailbox Operations
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  withAPIMiddleware,
  createSuccessResponse,
  createErrorResponse,
  type APIContext,
} from '@/lib/api/middleware';

// GET /api/v1/mailboxes/:id
export const GET = withAPIMiddleware(
  async (
    request: NextRequest,
    context: APIContext
  ) => {
    const mailboxId = request.nextUrl.pathname.split('/').pop();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('id', mailboxId)
      .eq('workspace_id', context.workspaceId)
      .single();

    if (error || !data) {
      return createErrorResponse(
        { code: 'not_found', message: 'Mailbox not found' },
        404
      );
    }

    return createSuccessResponse(transformMailbox(data));
  },
  { requiredPermission: 'mailboxes:read' }
);

// Transform DB row to API format (exclude sensitive data)
function transformMailbox(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    senderName: row.sender_name,
    replyTo: row.reply_to,
    provider: row.provider,
    status: row.status,
    healthScore: row.health_score,
    warmupStatus: row.warmup_status,
    warmupProgress: row.warmup_progress,
    dailyLimit: row.daily_limit,
    sentToday: row.sent_today,
    lastSentAt: row.last_sent_at,
    lastErrorAt: row.last_error_at,
    lastError: row.last_error,
    stats: {
      totalSent: row.total_sent || 0,
      totalDelivered: row.total_delivered || 0,
      totalBounced: row.total_bounced || 0,
      bounceRate: row.bounce_rate || 0,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
