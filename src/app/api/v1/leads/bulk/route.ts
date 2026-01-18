// Public API: Bulk Lead Operations
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  withAPIMiddleware,
  createSuccessResponse,
  createErrorResponse,
  validateRequestBody,
  type APIContext,
} from '@/lib/api/middleware';

// POST /api/v1/leads/bulk - Bulk create leads
export const POST = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { data: body, error: validationError } = await validateRequestBody<{
      leads: Array<{
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
      }>;
      campaignId?: string;
      skipDuplicates?: boolean;
    }>(request, (data) => {
      const d = data as Record<string, unknown>;
      if (!Array.isArray(d.leads)) {
        return { valid: false, errors: ['leads must be an array'] };
      }
      if (d.leads.length === 0) {
        return { valid: false, errors: ['leads array cannot be empty'] };
      }
      if (d.leads.length > 1000) {
        return { valid: false, errors: ['maximum 1000 leads per request'] };
      }

      // Validate each lead has email
      const invalidLeads = d.leads.filter(
        (l: Record<string, unknown>) =>
          !l.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email as string)
      );
      if (invalidLeads.length > 0) {
        return {
          valid: false,
          errors: [`${invalidLeads.length} leads have invalid or missing email`],
        };
      }

      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    const supabase = await createClient();
    const skipDuplicates = body!.skipDuplicates !== false;

    // Get existing emails to check duplicates
    const emails = body!.leads.map((l) => l.email.toLowerCase());
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('email')
      .eq('workspace_id', context.workspaceId)
      .in('email', emails);

    const existingEmails = new Set(
      (existingLeads || []).map((l) => l.email.toLowerCase())
    );

    // Filter or mark duplicates
    const leadsToInsert: Record<string, unknown>[] = [];
    const duplicates: string[] = [];
    const errors: Array<{ email: string; error: string }> = [];

    for (const lead of body!.leads) {
      const emailLower = lead.email.toLowerCase();

      if (existingEmails.has(emailLower)) {
        duplicates.push(lead.email);
        if (!skipDuplicates) {
          errors.push({ email: lead.email, error: 'duplicate' });
        }
        continue;
      }

      // Check for duplicates within the batch
      if (leadsToInsert.some((l) => (l.email as string).toLowerCase() === emailLower)) {
        duplicates.push(lead.email);
        continue;
      }

      leadsToInsert.push({
        workspace_id: context.workspaceId,
        email: lead.email,
        first_name: lead.firstName,
        last_name: lead.lastName,
        company: lead.company,
        title: lead.title,
        phone: lead.phone,
        linkedin_url: lead.linkedinUrl,
        website: lead.website,
        tags: lead.tags || [],
        custom_fields: lead.customFields || {},
        campaign_id: body!.campaignId,
        status: 'new',
      });
    }

    // Insert leads in batches of 100
    const inserted: string[] = [];
    const batchSize = 100;

    // Use admin client for inserts to bypass RLS
    const adminClient = createAdminClient();
    for (let i = 0; i < leadsToInsert.length; i += batchSize) {
      const batch = leadsToInsert.slice(i, i + batchSize);

      const { data, error } = await adminClient
        .from('leads')
        .insert(batch)
        .select('id, email');

      if (error) {
        // Add to errors
        batch.forEach((l) => {
          errors.push({ email: l.email as string, error: error.message });
        });
      } else {
        inserted.push(...(data || []).map((l) => l.id));
      }
    }

    return createSuccessResponse({
      summary: {
        total: body!.leads.length,
        inserted: inserted.length,
        duplicates: duplicates.length,
        errors: errors.length,
      },
      inserted,
      duplicates,
      errors: errors.length > 0 ? errors : undefined,
    });
  },
  { requiredPermission: 'leads:write' }
);

// DELETE /api/v1/leads/bulk - Bulk delete leads
export const DELETE = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { data: body, error: validationError } = await validateRequestBody<{
      leadIds?: string[];
      filter?: {
        campaignId?: string;
        status?: string;
        tag?: string;
      };
    }>(request, (data) => {
      const d = data as Record<string, unknown>;
      if (!d.leadIds && !d.filter) {
        return { valid: false, errors: ['Either leadIds or filter is required'] };
      }
      if (d.leadIds && !Array.isArray(d.leadIds)) {
        return { valid: false, errors: ['leadIds must be an array'] };
      }
      if (Array.isArray(d.leadIds) && d.leadIds.length > 1000) {
        return { valid: false, errors: ['maximum 1000 leads per request'] };
      }
      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    const supabase = await createClient();

    if (body!.leadIds) {
      // Delete specific leads
      const { error, count } = await supabase
        .from('leads')
        .delete()
        .eq('workspace_id', context.workspaceId)
        .in('id', body!.leadIds);

      if (error) {
        return createErrorResponse(
          { code: 'delete_failed', message: error.message },
          500
        );
      }

      return createSuccessResponse({ deleted: count || 0 });
    }

    // Delete by filter
    let query = supabase
      .from('leads')
      .delete()
      .eq('workspace_id', context.workspaceId);

    if (body!.filter?.campaignId) {
      query = query.eq('campaign_id', body!.filter.campaignId);
    }
    if (body!.filter?.status) {
      query = query.eq('status', body!.filter.status);
    }
    if (body!.filter?.tag) {
      query = query.contains('tags', [body!.filter.tag]);
    }

    const { error, count } = await query;

    if (error) {
      return createErrorResponse(
        { code: 'delete_failed', message: error.message },
        500
      );
    }

    return createSuccessResponse({ deleted: count || 0 });
  },
  { requiredPermission: 'leads:write' }
);

// PATCH /api/v1/leads/bulk - Bulk update leads
export const PATCH = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { data: body, error: validationError } = await validateRequestBody<{
      leadIds: string[];
      updates: {
        status?: string;
        tags?: string[];
        addTags?: string[];
        removeTags?: string[];
        campaignId?: string;
        customFields?: Record<string, unknown>;
      };
    }>(request, (data) => {
      const d = data as Record<string, unknown>;
      if (!Array.isArray(d.leadIds) || d.leadIds.length === 0) {
        return { valid: false, errors: ['leadIds is required'] };
      }
      if (!d.updates || typeof d.updates !== 'object') {
        return { valid: false, errors: ['updates is required'] };
      }
      if (d.leadIds.length > 1000) {
        return { valid: false, errors: ['maximum 1000 leads per request'] };
      }
      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    const supabase = await createClient();
    const updates = body!.updates;

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.campaignId !== undefined) updateData.campaign_id = updates.campaignId;
    if (updates.customFields !== undefined) updateData.custom_fields = updates.customFields;

    // Handle tag additions/removals
    if (updates.addTags || updates.removeTags) {
      // Get current leads to modify tags
      const { data: leads } = await supabase
        .from('leads')
        .select('id, tags')
        .eq('workspace_id', context.workspaceId)
        .in('id', body!.leadIds);

      if (leads) {
        for (const lead of leads) {
          let tags = lead.tags || [];

          if (updates.addTags) {
            tags = [...new Set([...tags, ...updates.addTags])];
          }

          if (updates.removeTags) {
            tags = tags.filter((t: string) => !updates.removeTags!.includes(t));
          }

          await supabase
            .from('leads')
            .update({ tags })
            .eq('id', lead.id);
        }
      }

      // If only tag operations, return success
      if (Object.keys(updateData).length === 0) {
        return createSuccessResponse({ updated: leads?.length || 0 });
      }
    }

    // Apply other updates
    if (Object.keys(updateData).length > 0) {
      const { error, count } = await supabase
        .from('leads')
        .update(updateData)
        .eq('workspace_id', context.workspaceId)
        .in('id', body!.leadIds);

      if (error) {
        return createErrorResponse(
          { code: 'update_failed', message: error.message },
          500
        );
      }

      return createSuccessResponse({ updated: count || 0 });
    }

    return createSuccessResponse({ updated: 0 });
  },
  { requiredPermission: 'leads:write' }
);
