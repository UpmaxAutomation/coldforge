// Public API: Individual Lead Operations
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

// GET /api/v1/leads/:id
export const GET = withAPIMiddleware(
  async (
    request: NextRequest,
    context: APIContext
  ) => {
    const leadId = request.nextUrl.pathname.split('/').pop();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('workspace_id', context.workspaceId)
      .single();

    if (error || !data) {
      return createErrorResponse(
        { code: 'not_found', message: 'Lead not found' },
        404
      );
    }

    return createSuccessResponse(transformLead(data));
  },
  { requiredPermission: 'leads:read' }
);

// PUT /api/v1/leads/:id
export const PUT = withAPIMiddleware(
  async (
    request: NextRequest,
    context: APIContext
  ) => {
    const leadId = request.nextUrl.pathname.split('/').pop();

    const { data: body, error: validationError } = await validateRequestBody<{
      email?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      title?: string;
      phone?: string;
      linkedinUrl?: string;
      website?: string;
      status?: string;
      tags?: string[];
      customFields?: Record<string, unknown>;
    }>(request, (data) => {
      const d = data as Record<string, unknown>;
      if (d.email && typeof d.email === 'string') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
          return { valid: false, errors: ['invalid email format'] };
        }
      }
      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    const supabase = await createClient();

    // Get current lead for comparison
    const { data: currentLead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('workspace_id', context.workspaceId)
      .single();

    if (!currentLead) {
      return createErrorResponse(
        { code: 'not_found', message: 'Lead not found' },
        404
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (body!.email !== undefined) updates.email = body!.email;
    if (body!.firstName !== undefined) updates.first_name = body!.firstName;
    if (body!.lastName !== undefined) updates.last_name = body!.lastName;
    if (body!.company !== undefined) updates.company = body!.company;
    if (body!.title !== undefined) updates.title = body!.title;
    if (body!.phone !== undefined) updates.phone = body!.phone;
    if (body!.linkedinUrl !== undefined) updates.linkedin_url = body!.linkedinUrl;
    if (body!.website !== undefined) updates.website = body!.website;
    if (body!.status !== undefined) updates.status = body!.status;
    if (body!.tags !== undefined) updates.tags = body!.tags;
    if (body!.customFields !== undefined) updates.custom_fields = body!.customFields;

    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .eq('workspace_id', context.workspaceId)
      .select()
      .single();

    if (error) {
      return createErrorResponse(
        { code: 'update_failed', message: error.message },
        500
      );
    }

    // Trigger webhooks
    await triggerWebhook(context.workspaceId, 'lead.updated', {
      lead: transformLead(data),
    });

    // Check if status changed
    if (body!.status && body!.status !== currentLead.status) {
      await triggerWebhook(context.workspaceId, 'lead.status_changed', {
        lead: { id: data.id, email: data.email },
        previousStatus: currentLead.status,
        newStatus: body!.status,
      });
    }

    return createSuccessResponse(transformLead(data));
  },
  { requiredPermission: 'leads:write' }
);

// DELETE /api/v1/leads/:id
export const DELETE = withAPIMiddleware(
  async (
    request: NextRequest,
    context: APIContext
  ) => {
    const leadId = request.nextUrl.pathname.split('/').pop();
    const supabase = await createClient();

    // Check if exists
    const { data: existing } = await supabase
      .from('leads')
      .select('id, email')
      .eq('id', leadId)
      .eq('workspace_id', context.workspaceId)
      .single();

    if (!existing) {
      return createErrorResponse(
        { code: 'not_found', message: 'Lead not found' },
        404
      );
    }

    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('workspace_id', context.workspaceId);

    if (error) {
      return createErrorResponse(
        { code: 'delete_failed', message: error.message },
        500
      );
    }

    // Trigger webhook
    await triggerWebhook(context.workspaceId, 'lead.deleted', {
      leadId,
      email: existing.email,
    });

    return createSuccessResponse({ deleted: true });
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
