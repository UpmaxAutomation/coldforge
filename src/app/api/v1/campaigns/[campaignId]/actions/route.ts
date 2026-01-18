// Public API: Campaign Actions (start, pause, resume)
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

// POST /api/v1/campaigns/:id/actions
export const POST = withAPIMiddleware(
  async (
    request: NextRequest,
    context: APIContext
  ) => {
    const pathParts = request.nextUrl.pathname.split('/');
    const campaignId = pathParts[pathParts.indexOf('campaigns') + 1];

    const { data: body, error: validationError } = await validateRequestBody<{
      action: 'start' | 'pause' | 'resume' | 'stop';
    }>(request, (data) => {
      const d = data as Record<string, unknown>;
      const validActions = ['start', 'pause', 'resume', 'stop'];
      if (!d.action || !validActions.includes(d.action as string)) {
        return {
          valid: false,
          errors: ['action must be one of: start, pause, resume, stop'],
        };
      }
      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    const supabase = await createClient();

    // Get current campaign
    const { data: campaign, error: fetchError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('workspace_id', context.workspaceId)
      .single();

    if (fetchError || !campaign) {
      return createErrorResponse(
        { code: 'not_found', message: 'Campaign not found' },
        404
      );
    }

    // Validate state transitions
    const action = body!.action;
    const currentStatus = campaign.status;
    let newStatus: string;
    let webhookEvent: 'campaign.started' | 'campaign.paused' | 'campaign.completed';

    switch (action) {
      case 'start':
        if (currentStatus !== 'draft' && currentStatus !== 'paused') {
          return createErrorResponse(
            {
              code: 'invalid_transition',
              message: `Cannot start campaign with status: ${currentStatus}`,
            },
            400
          );
        }
        newStatus = 'active';
        webhookEvent = 'campaign.started';
        break;

      case 'pause':
        if (currentStatus !== 'active') {
          return createErrorResponse(
            {
              code: 'invalid_transition',
              message: `Cannot pause campaign with status: ${currentStatus}`,
            },
            400
          );
        }
        newStatus = 'paused';
        webhookEvent = 'campaign.paused';
        break;

      case 'resume':
        if (currentStatus !== 'paused') {
          return createErrorResponse(
            {
              code: 'invalid_transition',
              message: `Cannot resume campaign with status: ${currentStatus}`,
            },
            400
          );
        }
        newStatus = 'active';
        webhookEvent = 'campaign.started';
        break;

      case 'stop':
        if (currentStatus !== 'active' && currentStatus !== 'paused') {
          return createErrorResponse(
            {
              code: 'invalid_transition',
              message: `Cannot stop campaign with status: ${currentStatus}`,
            },
            400
          );
        }
        newStatus = 'completed';
        webhookEvent = 'campaign.completed';
        break;

      default:
        return createErrorResponse(
          { code: 'invalid_action', message: 'Unknown action' },
          400
        );
    }

    // Update campaign
    const updateData: Record<string, unknown> = {
      status: newStatus,
    };

    if (action === 'start' && currentStatus === 'draft') {
      updateData.started_at = new Date().toISOString();
    }

    if (action === 'stop') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: updated, error: updateError } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId)
      .select()
      .single();

    if (updateError) {
      return createErrorResponse(
        { code: 'update_failed', message: updateError.message },
        500
      );
    }

    // Trigger webhook
    await triggerWebhook(context.workspaceId, webhookEvent, {
      campaign: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        previousStatus: currentStatus,
      },
    });

    return createSuccessResponse({
      id: updated.id,
      status: updated.status,
      previousStatus: currentStatus,
      action,
    });
  },
  { requiredPermission: 'campaigns:write' }
);
