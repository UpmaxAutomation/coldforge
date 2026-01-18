// External Integrations Module

// Types
export * from './types';

// Core Management
export {
  getIntegration,
  getWorkspaceIntegrations,
  createIntegration,
  updateIntegration,
  connectIntegration,
  disconnectIntegration,
  deleteIntegration,
  testIntegration,
  getIntegrationCredentials,
  refreshOAuthTokens,
  updateFieldMappings,
  updateLastSync,
} from './manager';

// Webhooks
export {
  getWebhook,
  getWorkspaceWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  regenerateWebhookSecret,
  triggerWebhook,
  processWebhookDelivery,
  retryFailedDeliveries,
  getWebhookDeliveries,
  verifyWebhookSignature,
} from './webhooks';

// Provider-specific exports
export * as HubSpot from './providers/hubspot';
export * as Slack from './providers/slack';
export * as GoogleSheets from './providers/google-sheets';
export * as Automation from './providers/zapier';
