// Public API: API Key Management
// Note: This endpoint requires OAuth authentication (not API key)
import { NextRequest } from 'next/server';
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
  createAPIKey,
  listAPIKeys,
  PERMISSION_PRESETS,
  type APIKeyPermission,
} from '@/lib/api/keys';

// Valid permissions
const VALID_PERMISSIONS: APIKeyPermission[] = [
  'campaigns:read',
  'campaigns:write',
  'leads:read',
  'leads:write',
  'mailboxes:read',
  'mailboxes:write',
  'analytics:read',
  'webhooks:read',
  'webhooks:write',
  'sequences:read',
  'sequences:write',
  'templates:read',
  'templates:write',
];

// GET /api/v1/api-keys - List API keys
export const GET = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { page, limit } = parsePaginationParams(request);

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as 'active' | 'revoked' | 'expired' | undefined;

    const { keys, total } = await listAPIKeys(context.workspaceId, {
      status,
      limit,
      offset: (page - 1) * limit,
    });

    return createPaginatedResponse(
      keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions,
        status: key.status,
        rateLimit: key.rateLimit,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      })),
      {
        page,
        limit,
        total,
        hasMore: total > page * limit,
      }
    );
  },
  {
    allowApiKey: false, // Only OAuth can manage API keys
    allowOAuth: true,
    requiredScope: 'write',
  }
);

// POST /api/v1/api-keys - Create API key
export const POST = withAPIMiddleware(
  async (request: NextRequest, context: APIContext) => {
    const { data: body, error: validationError } = await validateRequestBody<{
      name: string;
      permissions?: APIKeyPermission[];
      preset?: 'readOnly' | 'standard' | 'full';
      expiresAt?: string;
      rateLimit?: number;
    }>(request, (data) => {
      const d = data as Record<string, unknown>;

      if (!d.name || typeof d.name !== 'string') {
        return { valid: false, errors: ['name is required'] };
      }

      // Validate permissions if provided
      if (d.permissions && Array.isArray(d.permissions)) {
        const invalidPerms = (d.permissions as string[]).filter(
          (p) => !VALID_PERMISSIONS.includes(p as APIKeyPermission)
        );
        if (invalidPerms.length > 0) {
          return {
            valid: false,
            errors: [`Invalid permissions: ${invalidPerms.join(', ')}`],
          };
        }
      }

      // Validate preset if provided
      if (d.preset && !['readOnly', 'standard', 'full'].includes(d.preset as string)) {
        return {
          valid: false,
          errors: ['preset must be one of: readOnly, standard, full'],
        };
      }

      // Validate rate limit
      if (d.rateLimit !== undefined) {
        const rl = d.rateLimit as number;
        if (typeof rl !== 'number' || rl < 1 || rl > 1000) {
          return {
            valid: false,
            errors: ['rateLimit must be between 1 and 1000'],
          };
        }
      }

      return { valid: true, data: d };
    });

    if (validationError) return validationError;

    // Determine permissions
    let permissions: APIKeyPermission[];
    if (body!.preset) {
      permissions = PERMISSION_PRESETS[body!.preset];
    } else if (body!.permissions) {
      permissions = body!.permissions;
    } else {
      permissions = PERMISSION_PRESETS.standard;
    }

    try {
      const key = await createAPIKey(context.workspaceId, context.userId!, {
        name: body!.name,
        permissions,
        expiresAt: body!.expiresAt ? new Date(body!.expiresAt) : undefined,
        rateLimit: body!.rateLimit,
      });

      return createSuccessResponse(
        {
          id: key.id,
          name: key.name,
          keyPrefix: key.keyPrefix,
          secretKey: key.secretKey, // Only returned on creation!
          permissions: key.permissions,
          status: key.status,
          rateLimit: key.rateLimit,
          expiresAt: key.expiresAt,
          createdAt: key.createdAt,
          message:
            'Store the secretKey securely. It will not be shown again.',
        },
        201
      );
    } catch (error) {
      return createErrorResponse(
        {
          code: 'create_failed',
          message:
            error instanceof Error ? error.message : 'Failed to create API key',
        },
        500
      );
    }
  },
  {
    allowApiKey: false, // Only OAuth can manage API keys
    allowOAuth: true,
    requiredScope: 'write',
  }
);
