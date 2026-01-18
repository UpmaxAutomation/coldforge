// API Middleware - Authentication, Rate Limiting, Error Handling
import { NextRequest, NextResponse } from 'next/server';
import { validateAPIKey, hasPermission, recordAPIKeyUsage } from './keys';
import { validateAccessToken, hasScope } from './oauth';
import {
  checkAllRateLimits,
  getRateLimitConfig,
  getRateLimitHeaders,
  RATE_LIMIT_TIERS,
} from './rate-limit';
import type {
  APIKey,
  APIKeyPermission,
  OAuthAccessToken,
  OAuthScope,
  RateLimitResult,
  APIError,
  APIVersion,
  CURRENT_API_VERSION,
} from './types';

// API Context passed to handlers
export interface APIContext {
  apiKey?: APIKey;
  oauthToken?: OAuthAccessToken;
  workspaceId: string;
  userId?: string;
  version: APIVersion;
  requestId: string;
}

// API Handler type
export type APIHandler = (
  request: NextRequest,
  context: APIContext
) => Promise<NextResponse>;

// Middleware options
export interface MiddlewareOptions {
  requiredPermission?: APIKeyPermission;
  requiredScope?: OAuthScope;
  allowApiKey?: boolean;
  allowOAuth?: boolean;
  rateLimit?: boolean;
  logRequest?: boolean;
  requireWorkspace?: boolean;
}

const DEFAULT_OPTIONS: MiddlewareOptions = {
  allowApiKey: true,
  allowOAuth: true,
  rateLimit: true,
  logRequest: true,
  requireWorkspace: true,
};

// Generate request ID
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// Parse API version from header or query
function parseAPIVersion(request: NextRequest): APIVersion {
  const headerVersion = request.headers.get('X-API-Version');
  const queryVersion = request.nextUrl.searchParams.get('api_version');
  const version = headerVersion || queryVersion || '2025-01-01';

  // Validate version
  const validVersions = ['2024-01-01', '2024-06-01', '2025-01-01'];
  return validVersions.includes(version) ? (version as APIVersion) : '2025-01-01';
}

// Get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

// Create error response
export function createErrorResponse(
  error: APIError,
  status: number,
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  );
}

// Create success response
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { data },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  );
}

// Paginated response
export function createPaginatedResponse<T>(
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    nextCursor?: string;
    prevCursor?: string;
  },
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    {
      data,
      pagination: {
        ...pagination,
        totalPages: Math.ceil(pagination.total / pagination.limit),
      },
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  );
}

// API Key authentication
async function authenticateAPIKey(
  authHeader: string
): Promise<{ key: APIKey | null; error?: string }> {
  // Expect: Bearer cf_live_xxx or just cf_live_xxx
  let token = authHeader;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token.startsWith('cf_live_')) {
    return { key: null, error: 'Invalid API key format' };
  }

  return validateAPIKey(token);
}

// OAuth authentication
async function authenticateOAuth(
  authHeader: string
): Promise<{ token: OAuthAccessToken | null; error?: string }> {
  // Expect: Bearer cf_at_xxx
  let accessToken = authHeader;
  if (authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.slice(7);
  }

  if (!accessToken.startsWith('cf_at_')) {
    return { token: null, error: 'Invalid access token format' };
  }

  return validateAccessToken(accessToken);
}

// Main API middleware wrapper
export function withAPIMiddleware(
  handler: APIHandler,
  options: MiddlewareOptions = {}
): (request: NextRequest) => Promise<NextResponse> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const clientIP = getClientIP(request);
    const version = parseAPIVersion(request);

    // Add request ID to response headers
    const responseHeaders: Record<string, string> = {
      'X-Request-ID': requestId,
      'X-API-Version': version,
    };

    try {
      // Get authorization header
      const authHeader = request.headers.get('Authorization');

      if (!authHeader) {
        return createErrorResponse(
          {
            code: 'missing_authorization',
            message: 'Authorization header is required',
            documentationUrl: 'https://docs.coldforge.io/api/authentication',
          },
          401,
          responseHeaders
        );
      }

      let apiKey: APIKey | undefined;
      let oauthToken: OAuthAccessToken | undefined;
      let workspaceId: string | undefined;
      let userId: string | undefined;
      let rateLimitIdentifier: string;

      // Try API Key authentication
      if (opts.allowApiKey && authHeader.includes('cf_live_')) {
        const { key, error } = await authenticateAPIKey(authHeader);

        if (error) {
          return createErrorResponse(
            {
              code: 'invalid_api_key',
              message: error,
              documentationUrl: 'https://docs.coldforge.io/api/authentication',
            },
            401,
            responseHeaders
          );
        }

        if (key) {
          apiKey = key;
          workspaceId = key.workspaceId;
          rateLimitIdentifier = key.id;

          // Check permission if required
          if (opts.requiredPermission && !hasPermission(key, opts.requiredPermission)) {
            return createErrorResponse(
              {
                code: 'insufficient_permissions',
                message: `API key lacks required permission: ${opts.requiredPermission}`,
                documentationUrl: 'https://docs.coldforge.io/api/permissions',
              },
              403,
              responseHeaders
            );
          }

          // Record usage
          await recordAPIKeyUsage(key.id, clientIP);
        }
      }

      // Try OAuth authentication
      if (!apiKey && opts.allowOAuth && authHeader.includes('cf_at_')) {
        const { token, error } = await authenticateOAuth(authHeader);

        if (error) {
          return createErrorResponse(
            {
              code: 'invalid_token',
              message: error,
              documentationUrl: 'https://docs.coldforge.io/api/oauth',
            },
            401,
            responseHeaders
          );
        }

        if (token) {
          oauthToken = token;
          workspaceId = token.workspaceId;
          userId = token.userId;
          rateLimitIdentifier = token.id;

          // Check scope if required
          if (opts.requiredScope && !hasScope(token.scope, opts.requiredScope)) {
            return createErrorResponse(
              {
                code: 'insufficient_scope',
                message: `Token lacks required scope: ${opts.requiredScope}`,
                documentationUrl: 'https://docs.coldforge.io/api/oauth#scopes',
              },
              403,
              responseHeaders
            );
          }
        }
      }

      // Check if authenticated
      if (!apiKey && !oauthToken) {
        return createErrorResponse(
          {
            code: 'authentication_failed',
            message: 'Valid API key or OAuth token required',
            documentationUrl: 'https://docs.coldforge.io/api/authentication',
          },
          401,
          responseHeaders
        );
      }

      // Check workspace requirement
      if (opts.requireWorkspace && !workspaceId) {
        return createErrorResponse(
          {
            code: 'workspace_required',
            message: 'A workspace context is required for this operation',
          },
          400,
          responseHeaders
        );
      }

      // Rate limiting
      if (opts.rateLimit) {
        const rateLimitConfig = apiKey
          ? await getRateLimitConfig(apiKey.id)
          : RATE_LIMIT_TIERS.starter; // Default for OAuth

        const rateLimitResult = await checkAllRateLimits(
          rateLimitIdentifier!,
          rateLimitConfig
        );

        // Add rate limit headers
        const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
        Object.assign(responseHeaders, rateLimitHeaders);

        if (!rateLimitResult.allowed) {
          return createErrorResponse(
            {
              code: 'rate_limit_exceeded',
              message: 'Rate limit exceeded. Please retry after the reset time.',
              details: {
                remaining: rateLimitResult.remaining,
                resetAt: rateLimitResult.resetAt.toISOString(),
                retryAfter: rateLimitResult.retryAfter,
              },
              documentationUrl: 'https://docs.coldforge.io/api/rate-limits',
            },
            429,
            responseHeaders
          );
        }
      }

      // Build context
      const context: APIContext = {
        apiKey,
        oauthToken,
        workspaceId: workspaceId!,
        userId,
        version,
        requestId,
      };

      // Execute handler
      const response = await handler(request, context);

      // Add response headers
      const headers = new Headers(response.headers);
      Object.entries(responseHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      // Log request if enabled
      if (opts.logRequest) {
        const duration = Date.now() - startTime;
        await logAPIRequest({
          requestId,
          workspaceId: workspaceId!,
          apiKeyId: apiKey?.id,
          oauthTokenId: oauthToken?.id,
          method: request.method,
          path: request.nextUrl.pathname,
          statusCode: response.status,
          duration,
          clientIP,
          userAgent: request.headers.get('user-agent') || undefined,
        });
      }

      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error('API middleware error:', error);

      const duration = Date.now() - startTime;

      return createErrorResponse(
        {
          code: 'internal_error',
          message: 'An internal error occurred',
        },
        500,
        {
          ...responseHeaders,
          'X-Response-Time': `${duration}ms`,
        }
      );
    }
  };
}

// Log API request
async function logAPIRequest(log: {
  requestId: string;
  workspaceId: string;
  apiKeyId?: string;
  oauthTokenId?: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  clientIP: string;
  userAgent?: string;
}): Promise<void> {
  try {
    // Import dynamically to avoid circular deps
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    await supabase.from('api_logs').insert({
      workspace_id: log.workspaceId,
      api_key_id: log.apiKeyId,
      oauth_token_id: log.oauthTokenId,
      request_id: log.requestId,
      method: log.method,
      path: log.path,
      status_code: log.statusCode,
      duration: log.duration,
      ip_address: log.clientIP,
      user_agent: log.userAgent,
    });
  } catch (error) {
    // Don't fail request if logging fails
    console.error('Failed to log API request:', error);
  }
}

// Convenience middleware for common patterns
export const requireRead = (permission: APIKeyPermission) =>
  withAPIMiddleware.bind(null, { requiredPermission: permission });

export const requireWrite = (permission: APIKeyPermission) =>
  withAPIMiddleware.bind(null, {
    requiredPermission: permission,
    logRequest: true,
  });

// Validate request body against schema
export async function validateRequestBody<T>(
  request: NextRequest,
  validator: (data: unknown) => { valid: boolean; errors?: string[]; data?: T }
): Promise<{ data: T | null; error?: NextResponse }> {
  try {
    const body = await request.json();
    const result = validator(body);

    if (!result.valid) {
      return {
        data: null,
        error: createErrorResponse(
          {
            code: 'validation_error',
            message: 'Request body validation failed',
            details: { errors: result.errors },
          },
          400
        ),
      };
    }

    return { data: result.data as T };
  } catch {
    return {
      data: null,
      error: createErrorResponse(
        {
          code: 'invalid_json',
          message: 'Request body must be valid JSON',
        },
        400
      ),
    };
  }
}

// Parse pagination params
export function parsePaginationParams(request: NextRequest): {
  page: number;
  limit: number;
  cursor?: string;
} {
  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const cursor = searchParams.get('cursor') || undefined;

  return { page, limit, cursor };
}

// Parse date range params
export function parseDateRangeParams(request: NextRequest): {
  startDate?: Date;
  endDate?: Date;
} {
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  return {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };
}

// Parse sort params
export function parseSortParams(
  request: NextRequest,
  allowedFields: string[] = ['created_at']
): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  const searchParams = request.nextUrl.searchParams;
  const sortBy = searchParams.get('sort_by') || 'created_at';
  const sortOrder = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';

  // Validate sort field
  const validSortBy = allowedFields.includes(sortBy) ? sortBy : 'created_at';

  return { sortBy: validSortBy, sortOrder };
}
