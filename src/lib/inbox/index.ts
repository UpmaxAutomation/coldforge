/**
 * Inbox Module - Unified Email Syncing & AI-powered Lead Categorization
 *
 * Exports all inbox-related functionality including:
 * - Message syncing from Google, Microsoft, and SMTP/IMAP
 * - Message parsing and thread extraction
 * - Message categorization with Claude API
 * - Batch processing with queue system
 * - Type definitions and constants
 *
 * @example
 * // Sync all accounts for an organization
 * import { syncAllAccounts } from '@/lib/inbox'
 * const results = await syncAllAccounts(organizationId)
 *
 * @example
 * // Schedule recurring sync
 * import { setupOrgRecurringSync, SYNC_INTERVALS } from '@/lib/inbox'
 * await setupOrgRecurringSync(organizationId, 'NORMAL')
 *
 * @example
 * // Parse and normalize messages
 * import { normalizeMessage, extractThreads } from '@/lib/inbox'
 * const normalized = normalizeMessage(rawMessage)
 * const threads = extractThreads(messages)
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core inbox types
  EmailProvider,
  SyncStatus,
  MessageDirection,
  InboxMessage,
  EmailAddress,
  AttachmentInfo,
  SyncState,
  SyncResult,
  SyncError,
  SyncOptions,
  AccountCredentials,
  SyncProvider,
  // Raw message types
  GmailRawMessage,
  GmailMessagePart,
  MicrosoftRawMessage,
  ImapRawMessage,
  ImapBodyStructure,
  // Categorization types
  MessageCategory,
  MessageSentiment,
  CategoryResult,
  BatchCategorizeResult,
  CategorizationQueueItem,
  CategorizationInput,
} from './types'

// Constants
export { CATEGORY_METADATA, CONFIDENCE_THRESHOLDS } from './types'

// =============================================================================
// Sync Service
// =============================================================================

// Main sync service
export {
  syncAccount,
  syncAllAccounts,
  getOrganizationSyncStatus,
  forceFullResync,
} from './sync'

// Scheduler
export {
  getSyncQueue,
  startSyncWorker,
  stopSyncWorker,
  scheduleAccountSync,
  scheduleOrgSync,
  setupRecurringSync,
  removeRecurringSync,
  setupOrgRecurringSync,
  getSyncJobStatus,
  pauseAllSyncs,
  resumeAllSyncs,
  cleanupOldJobs,
  getSyncStats,
  triggerImmediateSync,
  SYNC_INTERVALS,
} from './sync-scheduler'

// =============================================================================
// Parser Utilities
// =============================================================================

export {
  normalizeMessage,
  extractThreadId,
  extractThreads,
  parseEmailContent,
  stripHtmlToText,
  parseEmailAddress,
  parseEmailAddresses,
  isDuplicateMessage,
  mergeMessageUpdates,
  getParticipantDisplayName,
  calculateThreadMetrics,
  type NormalizedMessage,
  type ThreadGroup,
} from './parser'

// =============================================================================
// Providers (for direct access if needed)
// =============================================================================

export {
  gmailSyncProvider,
  microsoftSyncProvider,
  imapSyncProvider,
} from './providers'

// =============================================================================
// Categorization Service
// =============================================================================

export {
  categorizeMessage,
  categorizeMessages,
  getConfidenceLevel,
  shouldAutoApply,
} from './categorization'

// Batch processing
export {
  CATEGORIZATION_QUEUE,
  JOB_TYPES,
  queueCategorizationJob,
  queueBatchCategorization,
  queueThreadRecategorization,
  startCategorizationWorker,
  getCategorizationQueueStats,
  getRecentCategorizationJobs,
  retryFailedJobs,
  cleanOldJobs,
  closeCategorizationQueue,
  getCategorizationQueue,
} from './batch-categorize'

// Batch job types (for workers and type checking)
export type {
  SingleCategorizationJob,
  BatchCategorizationJob,
  RecategorizeThreadJob,
  CategorizationJob,
} from './batch-categorize'

// Prompts (for testing/debugging)
export {
  CATEGORIZATION_SYSTEM_PROMPT,
  CATEGORIZATION_EXAMPLES,
  buildCategorizationPrompt,
  buildSystemPromptWithExamples,
} from './prompts'
