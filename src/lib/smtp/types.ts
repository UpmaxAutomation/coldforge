// SMTP Types

export type SmtpProviderType =
  | 'aws_ses'
  | 'sendgrid'
  | 'postmark'
  | 'mailgun'
  | 'sparkpost'
  | 'smtp_relay'
  | 'google_workspace'
  | 'microsoft_365'
  | 'custom';

export interface SmtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  secure?: boolean;
  tls?: boolean;
}

export interface ApiCredentials {
  apiKey: string;
  apiSecret?: string;
  region?: string;
  endpoint?: string;
}

export interface SmtpProviderConfig {
  id: string;
  workspaceId: string;
  name: string;
  providerType: SmtpProviderType;
  credentials?: SmtpCredentials;
  apiCredentials?: ApiCredentials;
  config?: Record<string, unknown>;
  isActive: boolean;
  isHealthy: boolean;
  priority: number;
  rateLimits: {
    maxPerSecond: number;
    maxPerMinute: number;
    maxPerHour: number;
    maxPerDay: number;
  };
}

export interface EmailMessage {
  from: {
    email: string;
    name?: string;
  };
  to: {
    email: string;
    name?: string;
  };
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  trackingId?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
  encoding?: 'base64' | 'utf-8';
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  providerId?: string;
  error?: string;
  errorCode?: string;
  timestamp: Date;
}

export interface BulkSendResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    email: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

export interface ProviderHealth {
  providerId: string;
  isHealthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  errorRate24h: number;
  avgResponseTime: number;
}

export interface QueuedEmail {
  id: string;
  workspaceId: string;
  campaignId?: string;
  sequenceId?: string;
  sequenceStep?: number;
  fromMailboxId: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  toEmail: string;
  toName?: string;
  leadId?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  customHeaders?: Record<string, string>;
  trackingId?: string;
  attachments?: EmailAttachment[];
  smtpProviderId?: string;
  assignedIp?: string;
  scheduledAt: Date;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  timezone: string;
  status: QueueStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export type QueueStatus =
  | 'pending'
  | 'scheduled'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'cancelled';

export type EventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed'
  | 'blocked'
  | 'deferred';

export type BounceType = 'hard' | 'soft' | 'transient';

export interface EmailEvent {
  id: string;
  workspaceId: string;
  emailQueueId?: string;
  campaignId?: string;
  messageId?: string;
  trackingId?: string;
  eventType: EventType;
  recipientEmail: string;
  leadId?: string;
  eventData?: Record<string, unknown>;
  clickedUrl?: string;
  bounceType?: BounceType;
  bounceSubtype?: string;
  userAgent?: string;
  ipAddress?: string;
  geoCountry?: string;
  geoCity?: string;
  deviceType?: string;
  occurredAt: Date;
}

export type SuppressionReason =
  | 'hard_bounce'
  | 'soft_bounce'
  | 'complaint'
  | 'unsubscribe'
  | 'spam_trap'
  | 'invalid'
  | 'role_based'
  | 'manual';

export interface Suppression {
  id: string;
  workspaceId?: string;
  email: string;
  reason: SuppressionReason;
  source?: string;
  notes?: string;
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
}
