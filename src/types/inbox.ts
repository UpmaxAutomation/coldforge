/**
 * Unified Inbox Types
 * InstantScale Cold Email Platform
 *
 * Type definitions for the Unified Inbox feature, including
 * database types, API request/response types, and UI state types.
 */

// ============================================================================
// ENUM TYPES
// ============================================================================

/**
 * Direction of the email message
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Read/reply status of the message
 */
export type MessageStatus = 'unread' | 'read' | 'replied' | 'archived';

/**
 * AI-powered categorization of lead responses
 */
export type LeadCategory =
  | 'interested'      // Lead expressed interest
  | 'not_interested'  // Lead declined
  | 'maybe'           // Lead is undecided/needs more info
  | 'out_of_office'   // Auto-reply: out of office
  | 'auto_reply'      // Other auto-replies (vacation, etc.)
  | 'bounced'         // Email bounced
  | 'uncategorized';  // Not yet categorized

// ============================================================================
// DATABASE TYPES
// ============================================================================

/**
 * Database row type for inbox_messages table
 */
export interface InboxMessage {
  id: string;
  organization_id: string;
  email_account_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  message_id: string;
  thread_id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  lead_category: LeadCategory;
  category_confidence: number | null;
  labels: string[];
  is_starred: boolean;
  received_at: string;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Insert type for creating new inbox messages
 */
export interface InboxMessageInsert {
  id?: string;
  organization_id: string;
  email_account_id: string;
  campaign_id?: string | null;
  lead_id?: string | null;
  message_id: string;
  thread_id: string;
  from_email: string;
  from_name?: string | null;
  to_email: string;
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  snippet?: string | null;
  direction?: MessageDirection;
  status?: MessageStatus;
  lead_category?: LeadCategory;
  category_confidence?: number | null;
  labels?: string[];
  is_starred?: boolean;
  received_at: string;
  synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Update type for modifying existing inbox messages
 */
export interface InboxMessageUpdate {
  id?: string;
  organization_id?: string;
  email_account_id?: string;
  campaign_id?: string | null;
  lead_id?: string | null;
  message_id?: string;
  thread_id?: string;
  from_email?: string;
  from_name?: string | null;
  to_email?: string;
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  snippet?: string | null;
  direction?: MessageDirection;
  status?: MessageStatus;
  lead_category?: LeadCategory;
  category_confidence?: number | null;
  labels?: string[];
  is_starred?: boolean;
  received_at?: string;
  synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// ENRICHED/JOINED TYPES
// ============================================================================

/**
 * Inbox message with related entities (for UI display)
 */
export interface InboxMessageWithRelations extends InboxMessage {
  email_account?: {
    id: string;
    email: string;
    display_name: string | null;
    provider: 'google' | 'microsoft' | 'smtp';
  };
  campaign?: {
    id: string;
    name: string;
    status: string;
  } | null;
  lead?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    title: string | null;
  } | null;
}

/**
 * Conversation thread (grouped messages)
 */
export interface InboxThread {
  thread_id: string;
  messages: InboxMessage[];
  latest_message: InboxMessage;
  message_count: number;
  unread_count: number;
  participants: string[];
  lead?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Query parameters for listing inbox messages
 */
export interface InboxQueryParams {
  email_account_id?: string;
  campaign_id?: string;
  lead_id?: string;
  status?: MessageStatus | MessageStatus[];
  direction?: MessageDirection;
  lead_category?: LeadCategory | LeadCategory[];
  is_starred?: boolean;
  labels?: string[];
  search?: string;
  thread_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  per_page?: number;
  sort_by?: 'received_at' | 'updated_at' | 'from_email' | 'subject';
  sort_order?: 'asc' | 'desc';
}

/**
 * Paginated response for inbox messages
 */
export interface InboxMessageListResponse {
  data: InboxMessageWithRelations[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_more: boolean;
  };
}

/**
 * Bulk action request
 */
export interface InboxBulkActionRequest {
  message_ids: string[];
  action:
    | { type: 'mark_read' }
    | { type: 'mark_unread' }
    | { type: 'archive' }
    | { type: 'unarchive' }
    | { type: 'star' }
    | { type: 'unstar' }
    | { type: 'add_label'; label: string }
    | { type: 'remove_label'; label: string }
    | { type: 'categorize'; category: LeadCategory };
}

/**
 * Sync status for email accounts
 */
export interface InboxSyncStatus {
  email_account_id: string;
  last_sync_at: string | null;
  is_syncing: boolean;
  messages_synced: number;
  sync_error: string | null;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Inbox filter state (for UI)
 */
export interface InboxFilters {
  emailAccounts: string[];
  campaigns: string[];
  statuses: MessageStatus[];
  directions: MessageDirection[];
  categories: LeadCategory[];
  isStarred: boolean | null;
  labels: string[];
  searchQuery: string;
  dateRange: {
    from: Date | null;
    to: Date | null;
  } | null;
}

/**
 * Inbox view mode
 */
export type InboxViewMode = 'list' | 'thread' | 'split';

/**
 * Sort options for inbox
 */
export interface InboxSortOption {
  field: 'received_at' | 'from_email' | 'subject';
  direction: 'asc' | 'desc';
  label: string;
}

/**
 * Inbox statistics for dashboard
 */
export interface InboxStats {
  total_messages: number;
  unread_count: number;
  today_count: number;
  by_category: Record<LeadCategory, number>;
  by_status: Record<MessageStatus, number>;
  by_email_account: Array<{
    email_account_id: string;
    email: string;
    count: number;
    unread: number;
  }>;
}

// ============================================================================
// HELPER CONSTANTS
// ============================================================================

/**
 * Default values for inbox filters
 */
export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  emailAccounts: [],
  campaigns: [],
  statuses: [],
  directions: [],
  categories: [],
  isStarred: null,
  labels: [],
  searchQuery: '',
  dateRange: null,
};

/**
 * Available sort options
 */
export const INBOX_SORT_OPTIONS: InboxSortOption[] = [
  { field: 'received_at', direction: 'desc', label: 'Newest first' },
  { field: 'received_at', direction: 'asc', label: 'Oldest first' },
  { field: 'from_email', direction: 'asc', label: 'Sender A-Z' },
  { field: 'from_email', direction: 'desc', label: 'Sender Z-A' },
  { field: 'subject', direction: 'asc', label: 'Subject A-Z' },
];

/**
 * Category display configuration
 */
export const LEAD_CATEGORY_CONFIG: Record<LeadCategory, {
  label: string;
  color: string;
  description: string;
}> = {
  interested: {
    label: 'Interested',
    color: 'green',
    description: 'Lead expressed interest in your offer',
  },
  not_interested: {
    label: 'Not Interested',
    color: 'red',
    description: 'Lead declined or asked to be removed',
  },
  maybe: {
    label: 'Maybe',
    color: 'yellow',
    description: 'Lead needs more information or time',
  },
  out_of_office: {
    label: 'Out of Office',
    color: 'gray',
    description: 'Automatic out-of-office reply',
  },
  auto_reply: {
    label: 'Auto Reply',
    color: 'gray',
    description: 'Other automatic responses',
  },
  bounced: {
    label: 'Bounced',
    color: 'red',
    description: 'Email could not be delivered',
  },
  uncategorized: {
    label: 'Uncategorized',
    color: 'slate',
    description: 'Not yet analyzed',
  },
};

/**
 * Status display configuration
 */
export const MESSAGE_STATUS_CONFIG: Record<MessageStatus, {
  label: string;
  color: string;
}> = {
  unread: { label: 'Unread', color: 'blue' },
  read: { label: 'Read', color: 'slate' },
  replied: { label: 'Replied', color: 'green' },
  archived: { label: 'Archived', color: 'gray' },
};
