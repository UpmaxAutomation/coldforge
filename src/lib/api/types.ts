// Public API Types

// API Key Types
export type APIKeyPermission =
  | 'campaigns:read'
  | 'campaigns:write'
  | 'leads:read'
  | 'leads:write'
  | 'mailboxes:read'
  | 'mailboxes:write'
  | 'analytics:read'
  | 'webhooks:read'
  | 'webhooks:write'
  | 'sequences:read'
  | 'sequences:write'
  | 'templates:read'
  | 'templates:write';

export type APIKeyStatus = 'active' | 'revoked' | 'expired';

export interface APIKey {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string; // First 8 characters for identification
  keyHash: string; // SHA-256 hash of full key
  permissions: APIKeyPermission[];
  status: APIKeyStatus;
  lastUsedAt?: Date;
  lastUsedIp?: string;
  expiresAt?: Date;
  rateLimit: number; // Requests per minute
  createdAt: Date;
  createdBy: string;
}

export interface APIKeyWithSecret extends APIKey {
  secretKey: string; // Only returned on creation
}

// OAuth2 Types
export type OAuthGrantType = 'authorization_code' | 'refresh_token' | 'client_credentials';
export type OAuthScope =
  | 'read'
  | 'write'
  | 'campaigns'
  | 'leads'
  | 'mailboxes'
  | 'analytics'
  | 'webhooks';

export interface OAuthClient {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  clientId: string;
  clientSecretHash: string;
  redirectUris: string[];
  allowedScopes: OAuthScope[];
  allowedGrantTypes: OAuthGrantType[];
  isConfidential: boolean; // True for server-side apps
  logoUrl?: string;
  homepageUrl?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthAuthorizationCode {
  id: string;
  clientId: string;
  userId: string;
  workspaceId: string;
  code: string;
  codeChallenge?: string; // For PKCE
  codeChallengeMethod?: 'plain' | 'S256';
  scope: OAuthScope[];
  redirectUri: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface OAuthAccessToken {
  id: string;
  clientId: string;
  userId: string;
  workspaceId: string;
  accessToken: string;
  refreshToken?: string;
  scope: OAuthScope[];
  expiresAt: Date;
  refreshExpiresAt?: Date;
  createdAt: Date;
}

// Rate Limiting Types
export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number; // Max requests in 1 second
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds until rate limit resets
}

export interface RateLimitEntry {
  key: string;
  count: number;
  windowStart: Date;
  windowEnd: Date;
}

// API Request/Response Types
export interface APIRequest {
  id: string;
  apiKeyId?: string;
  oauthTokenId?: string;
  method: string;
  path: string;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  ipAddress: string;
  userAgent?: string;
  timestamp: Date;
}

export interface APIResponse {
  requestId: string;
  statusCode: number;
  body?: unknown;
  headers?: Record<string, string>;
  duration: number; // ms
  timestamp: Date;
}

export interface APILog {
  id: string;
  workspaceId: string;
  apiKeyId?: string;
  oauthTokenId?: string;
  request: APIRequest;
  response: APIResponse;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  createdAt: Date;
}

// Developer Webhook Types
export interface DeveloperWebhook {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  secret: string; // For signature verification
  events: DeveloperWebhookEvent[];
  isActive: boolean;
  version: string; // API version
  createdAt: Date;
  updatedAt: Date;
}

export type DeveloperWebhookEvent =
  // Campaign events
  | 'campaign.created'
  | 'campaign.updated'
  | 'campaign.started'
  | 'campaign.paused'
  | 'campaign.completed'
  | 'campaign.deleted'
  // Lead events
  | 'lead.created'
  | 'lead.updated'
  | 'lead.deleted'
  | 'lead.status_changed'
  // Email events
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.replied'
  | 'email.bounced'
  | 'email.unsubscribed'
  // Mailbox events
  | 'mailbox.connected'
  | 'mailbox.disconnected'
  | 'mailbox.health_changed'
  // Sequence events
  | 'sequence.completed'
  | 'sequence.stopped';

export interface WebhookPayload<T = unknown> {
  id: string;
  event: DeveloperWebhookEvent;
  apiVersion: string;
  timestamp: string;
  workspaceId: string;
  data: T;
}

export interface WebhookDeliveryAttempt {
  id: string;
  webhookId: string;
  payloadId: string;
  attempt: number;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  duration: number; // ms
  createdAt: Date;
}

// API Error Types
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  documentationUrl?: string;
}

export const API_ERROR_CODES = {
  // Authentication errors
  INVALID_API_KEY: 'invalid_api_key',
  EXPIRED_API_KEY: 'expired_api_key',
  REVOKED_API_KEY: 'revoked_api_key',
  INVALID_TOKEN: 'invalid_token',
  EXPIRED_TOKEN: 'expired_token',
  INSUFFICIENT_SCOPE: 'insufficient_scope',

  // Authorization errors
  FORBIDDEN: 'forbidden',
  WORKSPACE_ACCESS_DENIED: 'workspace_access_denied',
  RESOURCE_ACCESS_DENIED: 'resource_access_denied',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  QUOTA_EXCEEDED: 'quota_exceeded',

  // Validation errors
  VALIDATION_ERROR: 'validation_error',
  INVALID_REQUEST: 'invalid_request',
  MISSING_REQUIRED_FIELD: 'missing_required_field',
  INVALID_FIELD_VALUE: 'invalid_field_value',

  // Resource errors
  RESOURCE_NOT_FOUND: 'resource_not_found',
  RESOURCE_ALREADY_EXISTS: 'resource_already_exists',
  RESOURCE_CONFLICT: 'resource_conflict',

  // Server errors
  INTERNAL_ERROR: 'internal_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  TIMEOUT: 'timeout',
} as const;

// Pagination Types
export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

// API Version
export const API_VERSIONS = ['2024-01-01', '2024-06-01', '2025-01-01'] as const;
export type APIVersion = typeof API_VERSIONS[number];
export const CURRENT_API_VERSION: APIVersion = '2025-01-01';

// SDK Types (for client generation)
export interface SDKConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
  version?: APIVersion;
  timeout?: number;
  retries?: number;
}

export interface SDKResponse<T> {
  data: T;
  headers: Record<string, string>;
  status: number;
  rateLimit: {
    remaining: number;
    limit: number;
    reset: Date;
  };
}
