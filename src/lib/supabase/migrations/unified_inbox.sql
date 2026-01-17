-- ============================================================================
-- Unified Inbox Schema Migration
-- InstantScale Cold Email Platform
--
-- This migration creates the inbox_messages table for the Unified Inbox feature,
-- which consolidates all inbound and outbound email communications in one place.
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Message direction enum: tracks whether message is incoming or outgoing
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

-- Message status enum: tracks the read/reply state of messages
CREATE TYPE message_status AS ENUM ('unread', 'read', 'replied', 'archived');

-- Lead category enum: AI-powered categorization of lead responses
CREATE TYPE lead_category AS ENUM (
  'interested',      -- Lead expressed interest
  'not_interested',  -- Lead declined
  'maybe',           -- Lead is undecided/needs more info
  'out_of_office',   -- Auto-reply: out of office
  'auto_reply',      -- Other auto-replies (vacation, etc.)
  'bounced',         -- Email bounced
  'uncategorized'    -- Not yet categorized
);

-- ============================================================================
-- MAIN TABLE: inbox_messages
-- ============================================================================

CREATE TABLE inbox_messages (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Organization (tenant) reference - required for multi-tenancy
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Email account that sent/received this message
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,

  -- Campaign reference (nullable - not all messages are from campaigns)
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Lead reference (nullable - might be unknown sender)
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Provider's unique message identifier (e.g., Gmail's message ID)
  -- UNIQUE constraint ensures no duplicate syncs
  message_id TEXT NOT NULL,

  -- Thread ID for grouping conversations (provider's thread ID)
  thread_id TEXT NOT NULL,

  -- Sender information
  from_email TEXT NOT NULL,
  from_name TEXT,

  -- Recipient email address
  to_email TEXT NOT NULL,

  -- Email content
  subject TEXT,
  body_text TEXT,
  body_html TEXT,

  -- Short preview snippet for list views (first ~200 chars)
  snippet TEXT,

  -- Message direction and status
  direction message_direction NOT NULL DEFAULT 'inbound',
  status message_status NOT NULL DEFAULT 'unread',

  -- AI-powered lead categorization
  lead_category lead_category NOT NULL DEFAULT 'uncategorized',
  category_confidence FLOAT CHECK (category_confidence >= 0 AND category_confidence <= 1),

  -- User-defined labels (e.g., ['urgent', 'follow-up', 'hot-lead'])
  labels TEXT[] DEFAULT '{}',

  -- Star/flag for important messages
  is_starred BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL,      -- When the email was received/sent
  synced_at TIMESTAMPTZ DEFAULT NOW(),   -- When we synced this message
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure message_id is unique per organization to prevent duplicate syncs
  -- (same message_id might exist across different orgs if they share an email thread)
  CONSTRAINT inbox_messages_org_message_unique UNIQUE (organization_id, message_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary query patterns: filter by organization
CREATE INDEX idx_inbox_messages_org_id
  ON inbox_messages(organization_id);

-- Filter messages by email account (common in unified inbox view)
CREATE INDEX idx_inbox_messages_email_account
  ON inbox_messages(email_account_id);

-- Group messages by thread (conversation view)
CREATE INDEX idx_inbox_messages_thread
  ON inbox_messages(organization_id, thread_id);

-- Sort by received date (most common sort order)
CREATE INDEX idx_inbox_messages_received_at
  ON inbox_messages(organization_id, received_at DESC);

-- Filter by status (e.g., show unread only)
CREATE INDEX idx_inbox_messages_status
  ON inbox_messages(organization_id, status);

-- Filter by lead category (e.g., show all interested leads)
CREATE INDEX idx_inbox_messages_lead_category
  ON inbox_messages(organization_id, lead_category);

-- Filter by direction (inbound vs outbound views)
CREATE INDEX idx_inbox_messages_direction
  ON inbox_messages(organization_id, direction);

-- Starred messages quick access
CREATE INDEX idx_inbox_messages_starred
  ON inbox_messages(organization_id, is_starred)
  WHERE is_starred = true;

-- Campaign-specific messages
CREATE INDEX idx_inbox_messages_campaign
  ON inbox_messages(campaign_id)
  WHERE campaign_id IS NOT NULL;

-- Lead-specific messages
CREATE INDEX idx_inbox_messages_lead
  ON inbox_messages(lead_id)
  WHERE lead_id IS NOT NULL;

-- Composite index for common dashboard query:
-- "Show me unread inbound messages, sorted by date"
CREATE INDEX idx_inbox_messages_dashboard
  ON inbox_messages(organization_id, status, direction, received_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view messages from their organization
CREATE POLICY "Users can view org inbox messages"
  ON inbox_messages
  FOR SELECT
  USING (organization_id = get_user_org_id());

-- Policy: Users can insert messages (for sync operations)
CREATE POLICY "Users can insert inbox messages"
  ON inbox_messages
  FOR INSERT
  WITH CHECK (organization_id = get_user_org_id());

-- Policy: Users can update messages (mark as read, add labels, etc.)
CREATE POLICY "Users can update inbox messages"
  ON inbox_messages
  FOR UPDATE
  USING (organization_id = get_user_org_id());

-- Policy: Users can delete messages (archive/cleanup)
CREATE POLICY "Users can delete inbox messages"
  ON inbox_messages
  FOR DELETE
  USING (organization_id = get_user_org_id());

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to auto-update the updated_at timestamp
CREATE TRIGGER update_inbox_messages_updated_at
  BEFORE UPDATE ON inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE inbox_messages IS
  'Unified inbox storing all inbound and outbound email messages for the organization';

COMMENT ON COLUMN inbox_messages.message_id IS
  'Provider-specific unique message identifier (e.g., Gmail Message-ID header)';

COMMENT ON COLUMN inbox_messages.thread_id IS
  'Provider-specific thread identifier for grouping related messages';

COMMENT ON COLUMN inbox_messages.lead_category IS
  'AI-powered categorization of the lead''s response intent';

COMMENT ON COLUMN inbox_messages.category_confidence IS
  'Confidence score (0-1) of the AI categorization';

COMMENT ON COLUMN inbox_messages.snippet IS
  'Short preview text for list views, typically first 100-200 characters';

COMMENT ON COLUMN inbox_messages.labels IS
  'User-defined labels/tags for organizing messages';

COMMENT ON COLUMN inbox_messages.synced_at IS
  'Timestamp when this message was synced from the email provider';
