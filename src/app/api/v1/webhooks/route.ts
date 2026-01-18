// Public API: Webhooks Management
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  withAPIMiddleware,
  createSuccessResponse,
  createErrorResponse,
  createPaginatedResponse,
  validateRequestBody,
  parsePaginationParams,
  type APIContext,
} from '@/lib/api/middleware';
import {
  createDeveloperWebhook,
  listDeveloperWebhooks,
  type DeveloperWebhookEvent,
} from '@/lib/api/developer-webhooks';

// Valid webhook events
const VALID_EVENTS: DeveloperWebhookEvent[] = [
  'campaign.created',
  'campaign.updated',
  'campaign.started',
  'campaign.paused',
  'campaign.completed',
  'campaign.deleted',
  'lead.created',
  'lead.updated',
  'lead.deleted',
  'lead.status_changed',
  'email.sent',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.replied',
  'email.bounced',
  'email.unsubscribed',
  'mailbox.connected',
  'mailbox.disconnected',
  'mailbox.health_changed',
  'sequence.completed',
  'sequence.stopped',
];

// GET /api/v1/webhooks - List webhooks
export const GET = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { page, limit } = parsePaginationParams(request);

    const webhooks = await listDeveloperWebhooks(context.workspaceId);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedWebhooks = webhooks.slice(startIndex, startIndex + limit);

    return createPaginatedResponse(
      paginatedWebhooks.map(transformWebhook),
      {
        page,
        limit,
        total: webhooks.length,
        hasMore: webhooks.length > page * limit,
      }
    );
  },
  { requiredPermission: 'webhooks:read' }
);

// POST /api/v1/webhooks - Create webhook
export const POST = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { data: body, error: validationError } = await validateRequestBody<{
      name: string;
      url: string;
      events: DeveloperWebhookEvent[];
    }>(request, (data) => {
      const d = data as Record<string, unknown>;

      if (!d.name || typeof d.name !== 'string') {
        return { valid: false, errors: ['name is required'] };
      }

      if (!d.url || typeof d.url !== 'string') {
        return { valid: false, errors: ['url is required'] };
      }

      // Validate URL format
      try {
        const url = new URL(d.url as string);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return { valid: false, errors: ['url must be http or https'] };
        }
      } catch {
        return { valid: false, errors: ['url is invalid'] };
      }

      if (!Array.isArray(d.events) || d.events.length === 0) {
        return { valid: false, errors: ['events must be a non-empty array'] };
      }

      // Validate events
      const invalidEvents = (d.events as string[]).filter(
        (e) => !VALID_EVENTS.includes(e as DeveloperWebhookEvent)
      );
      if (invalidEvents.length > 0) {
        return {
          valid: false,
          errors: [`Invalid events: ${invalidEvents.join(', ')}`],
        };
      }

      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    try {
      const webhook = await createDeveloperWebhook(context.workspaceId, {
        name: body!.name,
        url: body!.url,
        events: body!.events,
      });

      return createSuccessResponse(transformWebhookWithSecret(webhook), 201);
    } catch (error) {
      return createErrorResponse(
        {
          code: 'create_failed',
          message: error instanceof Error ? error.message : 'Failed to create webhook',
        },
        500
      );
    }
  },
  { requiredPermission: 'webhooks:write' }
);

// Transform webhook (without secret)
function transformWebhook(webhook: {
  id: string;
  name: string;
  url: string;
  events: DeveloperWebhookEvent[];
  isActive: boolean;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    isActive: webhook.isActive,
    version: webhook.version,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

// Transform webhook with secret (only on creation)
function transformWebhookWithSecret(webhook: {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: DeveloperWebhookEvent[];
  isActive: boolean;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...transformWebhook(webhook),
    secret: webhook.secret, // Only exposed on creation
  };
}
