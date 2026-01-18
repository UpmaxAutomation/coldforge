// Public API: Campaigns
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  withAPIMiddleware,
  createSuccessResponse,
  createErrorResponse,
  createPaginatedResponse,
  validateRequestBody,
  parsePaginationParams,
  parseSortParams,
  type APIContext,
} from '@/lib/api/middleware';

// GET /api/v1/campaigns - List campaigns
export const GET = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const supabase = await createClient();
    const { page, limit } = parsePaginationParams(request);
    const { sortBy, sortOrder } = parseSortParams(request, [
      'created_at',
      'name',
      'status',
      'updated_at',
    ]);

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // Build query
    let query = supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .eq('workspace_id', context.workspaceId);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
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

    // Transform to API format
    const campaigns = (data || []).map(transformCampaign);

    return createPaginatedResponse(campaigns, {
      page,
      limit,
      total: count || 0,
      hasMore: (count || 0) > page * limit,
    });
  },
  { requiredPermission: 'campaigns:read' }
);

// POST /api/v1/campaigns - Create campaign
export const POST = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { data: body, error: validationError } = await validateRequestBody<{
      name: string;
      subject?: string;
      body?: string;
      mailbox_ids?: string[];
      settings?: Record<string, unknown>;
    }>(request, (data) => {
      const d = data as Record<string, unknown>;
      if (!d.name || typeof d.name !== 'string') {
        return { valid: false, errors: ['name is required'] };
      }
      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        workspace_id: context.workspaceId,
        name: body!.name,
        subject: body!.subject,
        body: body!.body,
        mailbox_ids: body!.mailbox_ids || [],
        settings: body!.settings || {},
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      return createErrorResponse(
        { code: 'create_failed', message: error.message },
        500
      );
    }

    return createSuccessResponse(transformCampaign(data), 201);
  },
  { requiredPermission: 'campaigns:write' }
);

// Transform DB row to API format
function transformCampaign(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    subject: row.subject,
    body: row.body,
    mailboxIds: row.mailbox_ids,
    settings: row.settings,
    stats: {
      sent: row.sent_count || 0,
      delivered: row.delivered_count || 0,
      opened: row.opened_count || 0,
      clicked: row.clicked_count || 0,
      replied: row.replied_count || 0,
      bounced: row.bounced_count || 0,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}
