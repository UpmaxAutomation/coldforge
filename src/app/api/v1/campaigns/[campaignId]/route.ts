// Public API: Individual Campaign Operations
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  withAPIMiddleware,
  createSuccessResponse,
  createErrorResponse,
  validateRequestBody,
  type APIContext,
} from '@/lib/api/middleware';
import { triggerWebhook } from '@/lib/api/developer-webhooks';

// GET /api/v1/campaigns/:id
export const GET = withAPIMiddleware(
  async (
    request: NextRequest,
    context: APIContext
  ) => {
    const campaignId = request.nextUrl.pathname.split('/').pop();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('workspace_id', context.workspaceId)
      .single();

    if (error || !data) {
      return createErrorResponse(
        { code: 'not_found', message: 'Campaign not found' },
        404
      );
    }

    return createSuccessResponse(transformCampaign(data));
  },
  { requiredPermission: 'campaigns:read' }
);

// PUT /api/v1/campaigns/:id
export const PUT = withAPIMiddleware(
  async (
    request: NextRequest,
    context: APIContext
  ) => {
    const campaignId = request.nextUrl.pathname.split('/').pop();

    const { data: body, error: validationError } = await validateRequestBody<{
      name?: string;
      subject?: string;
      body?: string;
      mailbox_ids?: string[];
      settings?: Record<string, unknown>;
    }>(request, (data) => {
      return { valid: true, data: data as Record<string, unknown> };
    });

    if (validationError) return validationError;

    const supabase = await createClient();

    // Build update object
    const updates: Record<string, unknown> = {};
    if (body!.name) updates.name = body!.name;
    if (body!.subject !== undefined) updates.subject = body!.subject;
    if (body!.body !== undefined) updates.body = body!.body;
    if (body!.mailbox_ids) updates.mailbox_ids = body!.mailbox_ids;
    if (body!.settings) updates.settings = body!.settings;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', campaignId)
      .eq('workspace_id', context.workspaceId)
      .select()
      .single();

    if (error || !data) {
      return createErrorResponse(
        { code: 'update_failed', message: 'Failed to update campaign' },
        error ? 500 : 404
      );
    }

    // Trigger webhook
    await triggerWebhook(context.workspaceId, 'campaign.updated', {
      campaign: transformCampaign(data),
    });

    return createSuccessResponse(transformCampaign(data));
  },
  { requiredPermission: 'campaigns:write' }
);

// DELETE /api/v1/campaigns/:id
export const DELETE = withAPIMiddleware(
  async (
    request: NextRequest,
    context: APIContext
  ) => {
    const campaignId = request.nextUrl.pathname.split('/').pop();
    const supabase = await createClient();

    // Check if exists first
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('workspace_id', context.workspaceId)
      .single();

    if (!existing) {
      return createErrorResponse(
        { code: 'not_found', message: 'Campaign not found' },
        404
      );
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('workspace_id', context.workspaceId);

    if (error) {
      return createErrorResponse(
        { code: 'delete_failed', message: error.message },
        500
      );
    }

    // Trigger webhook
    await triggerWebhook(context.workspaceId, 'campaign.deleted', {
      campaignId,
    });

    return createSuccessResponse({ deleted: true }, 200);
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
