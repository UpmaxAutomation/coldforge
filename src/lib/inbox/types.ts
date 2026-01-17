/**
 * Unified Inbox Types
 *
 * Common types for syncing messages from multiple email providers
 * into a unified inbox format.
 */

// Provider types for email accounts
export type EmailProvider = 'google' | 'microsoft' | 'smtp'

// Sync status for tracking progress
export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'error'

// Message direction
export type MessageDirection = 'inbound' | 'outbound'

/**
 * Unified message format from any provider
 */
export interface InboxMessage {
  // Unique identifiers
  id: string
  externalId: string // Provider-specific message ID (Gmail ID, Microsoft ID, etc.)
  threadExternalId: string // Provider-specific thread/conversation ID

  // Account info
  accountId: string
  organizationId: string
  provider: EmailProvider

  // Message headers
  messageId: string // RFC 2822 Message-ID header
  inReplyTo: string | null
  references: string[]

  // Addresses
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
  replyTo: EmailAddress | null

  // Content
  subject: string
  bodyText: string
  bodyHtml: string | null
  snippet: string // Preview text (first ~200 chars)

  // Attachments info
  hasAttachments: boolean
  attachments: AttachmentInfo[]

  // Status
  isRead: boolean
  isStarred: boolean
  labels: string[]
  direction: MessageDirection

  // Timestamps
  date: Date
  receivedAt: Date
  internalDate: Date // Provider's internal timestamp

  // Headers (for debugging/advanced use)
  rawHeaders: Record<string, string>
}

/**
 * Email address with optional display name
 */
export interface EmailAddress {
  email: string
  name: string | null
}

/**
 * Attachment metadata
 */
export interface AttachmentInfo {
  id: string
  filename: string
  mimeType: string
  size: number
}

/**
 * Sync state tracking for incremental sync
 */
export interface SyncState {
  accountId: string
  lastSyncAt: Date | null
  lastHistoryId: string | null // Gmail-specific
  lastDeltaLink: string | null // Microsoft-specific
  lastUid: number | null // IMAP-specific
  syncCursor: string | null // Generic cursor for pagination
  status: SyncStatus
  errorMessage: string | null
  errorCount: number
  messagesTotal: number
  messagesSynced: number
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean
  accountId: string
  messagesAdded: number
  messagesUpdated: number
  threadsCreated: number
  threadsUpdated: number
  errors: SyncError[]
  syncDuration: number
  newSyncState: Partial<SyncState>
}

/**
 * Error during sync
 */
export interface SyncError {
  messageId?: string
  error: string
  code?: string
  retryable: boolean
}

/**
 * Options for sync operations
 */
export interface SyncOptions {
  // Time-based filtering
  since?: Date
  maxResults?: number

  // Incremental sync
  fullSync?: boolean // If true, ignore sync state and do full sync

  // Query filters (provider-specific)
  query?: string
  labels?: string[]

  // Processing options
  batchSize?: number
  skipDuplicates?: boolean
}

/**
 * Account credentials needed for sync
 */
export interface AccountCredentials {
  accountId: string
  organizationId?: string
  provider: EmailProvider
  email: string

  // OAuth tokens (Google/Microsoft)
  accessToken?: string
  refreshToken?: string
  tokenExpiresAt?: Date

  // SMTP/IMAP credentials
  imapHost?: string
  imapPort?: number
  imapUser?: string
  imapPassword?: string
  imapSecure?: boolean
}

/**
 * Provider-specific raw message types
 */
export interface GmailRawMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  historyId?: string
  internalDate?: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
    body?: { data?: string; size?: number }
    parts?: GmailMessagePart[]
    mimeType?: string
    filename?: string
  }
  sizeEstimate?: number
  raw?: string
}

export interface GmailMessagePart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: Array<{ name: string; value: string }>
  body?: { attachmentId?: string; data?: string; size?: number }
  parts?: GmailMessagePart[]
}

export interface MicrosoftRawMessage {
  id: string
  conversationId: string
  conversationIndex: string
  receivedDateTime: string
  sentDateTime: string
  hasAttachments: boolean
  internetMessageId: string
  subject: string
  bodyPreview: string
  isRead: boolean
  isDraft: boolean
  flag?: { flagStatus: string }
  from?: {
    emailAddress: { address: string; name?: string }
  }
  toRecipients?: Array<{
    emailAddress: { address: string; name?: string }
  }>
  ccRecipients?: Array<{
    emailAddress: { address: string; name?: string }
  }>
  bccRecipients?: Array<{
    emailAddress: { address: string; name?: string }
  }>
  replyTo?: Array<{
    emailAddress: { address: string; name?: string }
  }>
  body?: {
    contentType: 'text' | 'html'
    content: string
  }
  internetMessageHeaders?: Array<{
    name: string
    value: string
  }>
  attachments?: Array<{
    id: string
    name: string
    contentType: string
    size: number
  }>
}

export interface ImapRawMessage {
  uid: number
  modseq?: bigint
  flags: Set<string>
  envelope: {
    date?: Date
    subject?: string
    from?: Array<{ name?: string; address?: string }>
    sender?: Array<{ name?: string; address?: string }>
    replyTo?: Array<{ name?: string; address?: string }>
    to?: Array<{ name?: string; address?: string }>
    cc?: Array<{ name?: string; address?: string }>
    bcc?: Array<{ name?: string; address?: string }>
    inReplyTo?: string
    messageId?: string
  }
  bodyStructure?: ImapBodyStructure
  source?: Buffer
}

export interface ImapBodyStructure {
  type?: string
  subtype?: string
  parameters?: Record<string, string>
  id?: string
  description?: string
  encoding?: string
  size?: number
  childNodes?: ImapBodyStructure[]
  disposition?: string
  dispositionParameters?: Record<string, string>
}

/**
 * Interface for sync providers
 */
export interface SyncProvider {
  readonly providerName: EmailProvider

  /**
   * Fetch messages from the provider
   */
  fetchMessages(
    credentials: AccountCredentials,
    syncState: SyncState | null,
    options: SyncOptions
  ): Promise<{
    messages: InboxMessage[]
    newSyncState: Partial<SyncState>
    hasMore: boolean
  }>

  /**
   * Fetch a single message by ID
   */
  fetchMessage(
    credentials: AccountCredentials,
    messageId: string
  ): Promise<InboxMessage | null>

  /**
   * Validate credentials
   */
  validateCredentials(credentials: AccountCredentials): Promise<boolean>
}

// ============================================================================
// AI Categorization Types
// ============================================================================

/**
 * Categories for AI-powered email classification
 */
export type MessageCategory =
  | 'interested'
  | 'not_interested'
  | 'maybe'
  | 'out_of_office'
  | 'auto_reply'
  | 'bounced'
  | 'uncategorized'

/**
 * Sentiment analysis result
 */
export type MessageSentiment = 'positive' | 'neutral' | 'negative'

/**
 * Result from AI categorization
 */
export interface CategoryResult {
  category: MessageCategory
  confidence: number // 0-1
  sentiment: MessageSentiment
  reasoning?: string
  signals: string[]
}

/**
 * Batch categorization result for multiple messages
 */
export interface BatchCategorizeResult {
  messageId: string
  result: CategoryResult
  error?: string
}

/**
 * Queue item for background categorization processing
 */
export interface CategorizationQueueItem {
  id: string
  messageId: string
  organizationId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: CategoryResult
  error?: string
  attempts: number
  maxAttempts: number
  createdAt: Date
  processedAt?: Date
}

/**
 * Category metadata for UI display
 */
export const CATEGORY_METADATA: Record<MessageCategory, {
  label: string
  description: string
  color: string
  icon: string
  priority: number
}> = {
  interested: {
    label: 'Interested',
    description: 'Positive response, wants to learn more or schedule a call',
    color: 'green',
    icon: 'ThumbsUp',
    priority: 1,
  },
  not_interested: {
    label: 'Not Interested',
    description: 'Explicit rejection or negative response',
    color: 'red',
    icon: 'ThumbsDown',
    priority: 2,
  },
  maybe: {
    label: 'Maybe',
    description: 'Neutral response, timing issue, or asks to follow up later',
    color: 'yellow',
    icon: 'HelpCircle',
    priority: 3,
  },
  out_of_office: {
    label: 'Out of Office',
    description: 'Auto-reply about being away or on vacation',
    color: 'blue',
    icon: 'Calendar',
    priority: 4,
  },
  auto_reply: {
    label: 'Auto Reply',
    description: 'Generic automated response (not OOO)',
    color: 'gray',
    icon: 'Bot',
    priority: 5,
  },
  bounced: {
    label: 'Bounced',
    description: 'Delivery failure or invalid email address',
    color: 'orange',
    icon: 'AlertTriangle',
    priority: 6,
  },
  uncategorized: {
    label: 'Uncategorized',
    description: 'Could not determine category',
    color: 'slate',
    icon: 'Circle',
    priority: 7,
  },
}

/**
 * Confidence thresholds for categorization
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.65,
  LOW: 0.45,
} as const

/**
 * Simplified message format for categorization input
 */
export interface CategorizationInput {
  id: string
  from: string
  fromName?: string | null
  subject: string
  bodyText: string
}
