// Public API Module
// Exports all API infrastructure components

// Types
export * from './types';

// API Key Management
export {
  createAPIKey,
  getAPIKey,
  validateAPIKey,
  hasPermission,
  hasPermissions,
  listAPIKeys,
  updateAPIKey,
  revokeAPIKey,
  deleteAPIKey,
  recordAPIKeyUsage,
  regenerateAPIKey,
  getAPIKeyStats,
  PERMISSION_PRESETS,
} from './keys';

// Rate Limiting
export {
  RATE_LIMIT_TIERS,
  checkRateLimit,
  checkBurstLimit,
  checkHourlyLimit,
  checkDailyLimit,
  checkAllRateLimits,
  getRateLimitConfig,
  getRateLimitStatus,
  resetRateLimits,
  getRateLimitHeaders,
} from './rate-limit';

// OAuth2
export {
  createOAuthClient,
  getOAuthClient,
  validateOAuthClient,
  listOAuthClients,
  deleteOAuthClient,
  rotateClientSecret,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  createAccessToken,
  validateAccessToken,
  refreshAccessToken,
  revokeAccessToken,
  revokeAllClientTokens,
  hasScope,
  parseScope,
  scopeToString,
} from './oauth';

// Developer Webhooks
export {
  signWebhookPayload,
  verifyWebhookSignature,
  createDeveloperWebhook,
  getDeveloperWebhook,
  listDeveloperWebhooks,
  updateDeveloperWebhook,
  deleteDeveloperWebhook,
  rotateWebhookSecret,
  triggerWebhook,
  getWebhookDeliveries,
  retryFailedDeliveries,
  testWebhook,
} from './developer-webhooks';

// Middleware
export {
  withAPIMiddleware,
  createErrorResponse,
  createSuccessResponse,
  createPaginatedResponse,
  validateRequestBody,
  parsePaginationParams,
  parseDateRangeParams,
  parseSortParams,
  type APIContext,
  type APIHandler,
  type MiddlewareOptions,
} from './middleware';
