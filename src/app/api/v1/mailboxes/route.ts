// Public API: Mailboxes
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  withAPIMiddleware,
  createSuccessResponse,
  createErrorResponse,
  createPaginatedResponse,
  parsePaginationParams,
  parseSortParams,
  type APIContext,
} from '@/lib/api/middleware';

// GET /api/v1/mailboxes - List mailboxes
export const GET = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const supabase = await createClient();
    const { page, limit } = parsePaginationParams(request);
    const { sortBy, sortOrder } = parseSortParams(request, [
      'created_at',
      'email',
      'status',
      'daily_limit',
    ]);

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const provider = searchParams.get('provider');
    const search = searchParams.get('search');

    // Build query
    let query = supabase
      .from('mailboxes')
      .select('*', { count: 'exact' })
      .eq('workspace_id', context.workspaceId);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (provider) {
      query = query.eq('provider', provider);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,sender_name.ilike.%${search}%`);
    }

    // Apply sorting and pagination
    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return createErrorResponse(
        { code: 'query_failed', message: error.message },
        500
      );
    }

    const mailboxes = (data || []).map(transformMailbox);

    return createPaginatedResponse(mailboxes, {
      page,
      limit,
      total: count || 0,
      hasMore: (count || 0) > page * limit,
    });
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
    // Never expose: access_token, refresh_token, smtp_password
  };
}
