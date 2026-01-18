// Public API: Leads
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
import { triggerWebhook } from '@/lib/api/developer-webhooks';

// GET /api/v1/leads - List leads
export const GET = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const supabase = await createClient();
    const { page, limit } = parsePaginationParams(request);
    const { sortBy, sortOrder } = parseSortParams(request, [
      'created_at',
      'email',
      'status',
      'last_contacted_at',
    ]);

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const campaignId = searchParams.get('campaign_id');
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');

    // Build query
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('workspace_id', context.workspaceId);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`);
    }

    if (tag) {
      query = query.contains('tags', [tag]);
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

    const leads = (data || []).map(transformLead);

    return createPaginatedResponse(leads, {
      page,
      limit,
      total: count || 0,
      hasMore: (count || 0) > page * limit,
    });
  },
  { requiredPermission: 'leads:read' }
);

// POST /api/v1/leads - Create lead
export const POST = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { data: body, error: validationError } = await validateRequestBody<{
      email: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      title?: string;
      phone?: string;
      linkedinUrl?: string;
      website?: string;
      tags?: string[];
      customFields?: Record<string, unknown>;
      campaignId?: string;
    }>(request, (data) => {
      const d = data as Record<string, unknown>;
      if (!d.email || typeof d.email !== 'string') {
        return { valid: false, errors: ['email is required'] };
      }
      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email as string)) {
        return { valid: false, errors: ['invalid email format'] };
      }
      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    const supabase = await createClient();

    // Check for duplicate
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('workspace_id', context.workspaceId)
      .eq('email', body!.email)
      .single();

    if (existing) {
      return createErrorResponse(
        {
          code: 'duplicate',
          message: 'Lead with this email already exists',
          details: { existingId: existing.id },
        },
        409
      );
    }

    // Use admin client for insert to bypass RLS
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('leads')
      .insert({
        workspace_id: context.workspaceId,
        email: body!.email,
        first_name: body!.firstName,
        last_name: body!.lastName,
        company: body!.company,
        title: body!.title,
        phone: body!.phone,
        linkedin_url: body!.linkedinUrl,
        website: body!.website,
        tags: body!.tags || [],
        custom_fields: body!.customFields || {},
        campaign_id: body!.campaignId,
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      return createErrorResponse(
        { code: 'create_failed', message: error.message },
        500
      );
    }

    // Trigger webhook
    await triggerWebhook(context.workspaceId, 'lead.created', {
      lead: transformLead(data),
    });

    return createSuccessResponse(transformLead(data), 201);
  },
  { requiredPermission: 'leads:write' }
);

// Transform DB row to API format
function transformLead(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    title: row.title,
    phone: row.phone,
    linkedinUrl: row.linkedin_url,
    website: row.website,
    status: row.status,
    tags: row.tags,
    customFields: row.custom_fields,
    campaignId: row.campaign_id,
    emailsSent: row.emails_sent || 0,
    emailsOpened: row.emails_opened || 0,
    emailsClicked: row.emails_clicked || 0,
    emailsReplied: row.emails_replied || 0,
    lastContactedAt: row.last_contacted_at,
    lastOpenedAt: row.last_opened_at,
    lastRepliedAt: row.last_replied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
