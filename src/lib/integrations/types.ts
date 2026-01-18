// External Integration Types

export type IntegrationType =
  | 'crm'
  | 'email'
  | 'webhook'
  | 'spreadsheet'
  | 'communication'
  | 'automation'
  | 'analytics';

export type IntegrationProvider =
  // CRMs
  | 'hubspot'
  | 'salesforce'
  | 'pipedrive'
  | 'zoho'
  | 'close'
  // Communication
  | 'slack'
  | 'discord'
  | 'teams'
  // Automation
  | 'zapier'
  | 'make'
  | 'n8n'
  // Spreadsheets
  | 'google_sheets'
  | 'airtable'
  // Custom
  | 'webhook'
  | 'api';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export type SyncDirection = 'push' | 'pull' | 'bidirectional';

export interface Integration {
  id: string;
  workspaceId: string;
  provider: IntegrationProvider;
  type: IntegrationType;
  name: string;
  status: IntegrationStatus;
  config: IntegrationConfig;
  credentials?: IntegrationCredentials;
  syncSettings?: SyncSettings;
  lastSyncAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationConfig {
  // Provider-specific configuration
  [key: string]: unknown;
}

export interface IntegrationCredentials {
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  apiSecret?: string;
  expiresAt?: Date;
  scope?: string[];
  metadata?: Record<string, unknown>;
}

export interface SyncSettings {
  direction: SyncDirection;
  frequency: 'realtime' | 'hourly' | 'daily' | 'manual';
  fieldMappings: FieldMapping[];
  filters?: SyncFilter[];
  autoSync: boolean;
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: FieldTransform;
}

export type FieldTransform =
  | 'none'
  | 'lowercase'
  | 'uppercase'
  | 'trim'
  | 'date_format'
  | 'number_format'
  | 'custom';

export interface SyncFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'exists' | 'not_exists';
  value: unknown;
}

// Webhook Types
export interface Webhook {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  isActive: boolean;
  headers?: Record<string, string>;
  retryPolicy: RetryPolicy;
  lastTriggeredAt?: Date;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookEvent =
  // Lead events
  | 'lead.created'
  | 'lead.updated'
  | 'lead.deleted'
  | 'lead.status_changed'
  // Campaign events
  | 'campaign.created'
  | 'campaign.started'
  | 'campaign.paused'
  | 'campaign.completed'
  // Email events
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.replied'
  | 'email.bounced'
  | 'email.unsubscribed'
  // Sequence events
  | 'sequence.started'
  | 'sequence.completed'
  | 'sequence.step_completed'
  // Mailbox events
  | 'mailbox.connected'
  | 'mailbox.disconnected'
  | 'mailbox.error'
  // General
  | 'all';

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  statusCode?: number;
  response?: string;
  attempts: number;
  nextRetryAt?: Date;
  createdAt: Date;
  deliveredAt?: Date;
}

// OAuth Types
export interface OAuthConfig {
  provider: IntegrationProvider;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

export interface OAuthState {
  workspaceId: string;
  provider: IntegrationProvider;
  returnUrl?: string;
  timestamp: number;
}

// Sync Types
export interface SyncJob {
  id: string;
  integrationId: string;
  workspaceId: string;
  type: 'full' | 'incremental';
  status: 'pending' | 'running' | 'completed' | 'failed';
  direction: SyncDirection;
  recordsProcessed: number;
  recordsFailed: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
}

export interface SyncResult {
  success: boolean;
  recordsCreated: number;
  recordsUpdated: number;
  recordsDeleted: number;
  recordsFailed: number;
  errors: SyncError[];
}

export interface SyncError {
  recordId?: string;
  field?: string;
  message: string;
  code: string;
}

// CRM-specific Types
export interface CRMContact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  title?: string;
  customFields?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CRMDeal {
  id: string;
  name: string;
  value?: number;
  currency?: string;
  stage?: string;
  contactId?: string;
  ownerId?: string;
  customFields?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

// Provider Capabilities
export interface ProviderCapabilities {
  oauth: boolean;
  apiKey: boolean;
  webhook: boolean;
  realTimeSync: boolean;
  bidirectionalSync: boolean;
  customFields: boolean;
  bulkOperations: boolean;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay?: number;
  };
}

export const PROVIDER_CAPABILITIES: Record<IntegrationProvider, ProviderCapabilities> = {
  hubspot: {
    oauth: true,
    apiKey: true,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: true,
    rateLimit: { requestsPerMinute: 100 },
  },
  salesforce: {
    oauth: true,
    apiKey: false,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: true,
    rateLimit: { requestsPerMinute: 100, requestsPerDay: 15000 },
  },
  pipedrive: {
    oauth: true,
    apiKey: true,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: false,
    rateLimit: { requestsPerMinute: 100 },
  },
  zoho: {
    oauth: true,
    apiKey: false,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: true,
    rateLimit: { requestsPerMinute: 100 },
  },
  close: {
    oauth: false,
    apiKey: true,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: false,
    rateLimit: { requestsPerMinute: 60 },
  },
  slack: {
    oauth: true,
    apiKey: false,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: false,
    customFields: false,
    bulkOperations: false,
    rateLimit: { requestsPerMinute: 50 },
  },
  discord: {
    oauth: true,
    apiKey: false,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: false,
    customFields: false,
    bulkOperations: false,
    rateLimit: { requestsPerMinute: 50 },
  },
  teams: {
    oauth: true,
    apiKey: false,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: false,
    customFields: false,
    bulkOperations: false,
    rateLimit: { requestsPerMinute: 60 },
  },
  zapier: {
    oauth: false,
    apiKey: true,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: false,
  },
  make: {
    oauth: false,
    apiKey: true,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: false,
  },
  n8n: {
    oauth: false,
    apiKey: true,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: false,
  },
  google_sheets: {
    oauth: true,
    apiKey: false,
    webhook: false,
    realTimeSync: false,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: true,
    rateLimit: { requestsPerMinute: 60 },
  },
  airtable: {
    oauth: true,
    apiKey: true,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: true,
    rateLimit: { requestsPerMinute: 5 },
  },
  webhook: {
    oauth: false,
    apiKey: false,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: false,
    customFields: true,
    bulkOperations: false,
  },
  api: {
    oauth: false,
    apiKey: true,
    webhook: true,
    realTimeSync: true,
    bidirectionalSync: true,
    customFields: true,
    bulkOperations: true,
  },
};
