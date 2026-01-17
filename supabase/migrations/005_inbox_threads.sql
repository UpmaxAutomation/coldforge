-- ============================================================================
-- Inbox Threads & Messages Schema Migration
-- InstantScale Cold Email Platform
--
-- This migration creates:
-- 1. threads table - Conversation threads for unified inbox
-- 2. thread_messages table - Individual messages within threads
-- 3. Additional columns on replies table for thread support
-- ============================================================================

-- ============================================================================
-- 1. CREATE THREADS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS threads (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization (tenant) reference - required for multi-tenancy
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Email account (mailbox) that owns this thread
  mailbox_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,

  -- Optional references
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Thread identification
  thread_external_id TEXT, -- Provider's thread ID (e.g., Gmail thread ID)

  -- Thread content
  subject TEXT NOT NULL,
  participant_email TEXT NOT NULL,
  participant_name TEXT,

  -- Thread statistics
  message_count INTEGER DEFAULT 1,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  first_message_at TIMESTAMPTZ DEFAULT NOW(),

  -- Thread state
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived', 'spam')),
  is_read BOOLEAN DEFAULT FALSE,

  -- AI categorization
  category TEXT DEFAULT 'uncategorized' CHECK (category IN (
    'interested', 'not_interested', 'maybe', 'out_of_office',
    'auto_reply', 'bounced', 'meeting_request', 'uncategorized'
  )),
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),

  -- Assignment
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for threads table
CREATE INDEX IF NOT EXISTS idx_threads_organization ON threads(organization_id);
CREATE INDEX IF NOT EXISTS idx_threads_mailbox ON threads(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_threads_campaign ON threads(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_lead ON threads(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_threads_category ON threads(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_threads_last_message ON threads(organization_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_external_id ON threads(thread_external_id) WHERE thread_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_participant ON threads(participant_email);
CREATE INDEX IF NOT EXISTS idx_threads_unread ON threads(organization_id, is_read) WHERE is_read = FALSE;

-- Unique constraint to prevent duplicate threads per external ID per mailbox
CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_mailbox_external_unique
  ON threads(mailbox_id, thread_external_id)
  WHERE thread_external_id IS NOT NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. CREATE THREAD_MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS thread_messages (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Thread reference
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,

  -- Message identification
  message_id TEXT, -- Provider's message ID
  in_reply_to TEXT, -- Parent message ID

  -- Message direction
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),

  -- Sender/recipient
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,

  -- Content
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  snippet TEXT, -- Short preview

  -- Metadata
  has_attachments BOOLEAN DEFAULT FALSE,

  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for thread_messages table
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_sent_at ON thread_messages(thread_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_messages_direction ON thread_messages(thread_id, direction);
CREATE INDEX IF NOT EXISTS idx_thread_messages_message_id ON thread_messages(message_id) WHERE message_id IS NOT NULL;

-- ============================================================================
-- 3. ADD MISSING COLUMNS TO REPLIES TABLE
-- ============================================================================

-- Add thread_id column for linking replies to threads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'replies' AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE replies ADD COLUMN thread_id UUID REFERENCES threads(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add sentiment column for AI categorization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'replies' AND column_name = 'sentiment'
  ) THEN
    ALTER TABLE replies ADD COLUMN sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative'));
  END IF;
END $$;

-- Add confidence score for categorization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'replies' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE replies ADD COLUMN confidence DECIMAL(3,2);
  END IF;
END $$;

-- Add status column for reply state (beyond is_read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'replies' AND column_name = 'status'
  ) THEN
    ALTER TABLE replies ADD COLUMN status TEXT DEFAULT 'received'
      CHECK (status IN ('received', 'unread', 'read', 'replied', 'archived', 'snoozed'));
  END IF;
END $$;

-- Add mailbox_id (reference to email_accounts for consistency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'replies' AND column_name = 'mailbox_id'
  ) THEN
    ALTER TABLE replies ADD COLUMN mailbox_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add from_name for display
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'replies' AND column_name = 'from_name'
  ) THEN
    ALTER TABLE replies ADD COLUMN from_name TEXT;
  END IF;
END $$;

-- Add is_auto_detected for automated replies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'replies' AND column_name = 'is_auto_detected'
  ) THEN
    ALTER TABLE replies ADD COLUMN is_auto_detected BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add snoozed_until for snooze functionality
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'replies' AND column_name = 'snoozed_until'
  ) THEN
    ALTER TABLE replies ADD COLUMN snoozed_until TIMESTAMPTZ;
  END IF;
END $$;

-- Create indexes for new replies columns
CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replies_mailbox ON replies(mailbox_id) WHERE mailbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replies_status ON replies(status);
CREATE INDEX IF NOT EXISTS idx_replies_sentiment ON replies(sentiment) WHERE sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replies_snoozed ON replies(snoozed_until) WHERE snoozed_until IS NOT NULL;

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on threads
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view threads from their organization
CREATE POLICY "Users can view org threads"
  ON threads
  FOR SELECT
  USING (organization_id = get_user_org_id());

-- Policy: Users can insert threads for their organization
CREATE POLICY "Users can insert threads"
  ON threads
  FOR INSERT
  WITH CHECK (organization_id = get_user_org_id());

-- Policy: Users can update threads in their organization
CREATE POLICY "Users can update threads"
  ON threads
  FOR UPDATE
  USING (organization_id = get_user_org_id());

-- Policy: Users can delete threads in their organization
CREATE POLICY "Users can delete threads"
  ON threads
  FOR DELETE
  USING (organization_id = get_user_org_id());

-- Enable RLS on thread_messages
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages in threads they can access
CREATE POLICY "Users can view thread messages"
  ON thread_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = thread_messages.thread_id
      AND threads.organization_id = get_user_org_id()
    )
  );

-- Policy: Users can insert messages to threads they can access
CREATE POLICY "Users can insert thread messages"
  ON thread_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = thread_messages.thread_id
      AND threads.organization_id = get_user_org_id()
    )
  );

-- Policy: Users can update messages in threads they can access
CREATE POLICY "Users can update thread messages"
  ON thread_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = thread_messages.thread_id
      AND threads.organization_id = get_user_org_id()
    )
  );

-- Policy: Users can delete messages in threads they can access
CREATE POLICY "Users can delete thread messages"
  ON thread_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = thread_messages.thread_id
      AND threads.organization_id = get_user_org_id()
    )
  );

-- ============================================================================
-- 5. HELPER FUNCTION: Update thread stats on message insert
-- ============================================================================

CREATE OR REPLACE FUNCTION update_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the thread's message count and last_message_at
  UPDATE threads
  SET
    message_count = message_count + 1,
    last_message_at = COALESCE(NEW.sent_at, NOW()),
    updated_at = NOW()
  WHERE id = NEW.thread_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to thread_messages
DROP TRIGGER IF EXISTS trigger_update_thread_stats ON thread_messages;
CREATE TRIGGER trigger_update_thread_stats
  AFTER INSERT ON thread_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_stats();

-- ============================================================================
-- 6. COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE threads IS
  'Conversation threads grouping related email messages for the unified inbox';

COMMENT ON COLUMN threads.mailbox_id IS
  'The email account (mailbox) that owns this thread';

COMMENT ON COLUMN threads.thread_external_id IS
  'Provider-specific thread identifier (e.g., Gmail thread ID)';

COMMENT ON COLUMN threads.category IS
  'AI-powered categorization of the lead response intent';

COMMENT ON COLUMN threads.sentiment IS
  'AI-detected sentiment of the conversation';

COMMENT ON COLUMN threads.assigned_to IS
  'User assigned to handle this thread';

COMMENT ON TABLE thread_messages IS
  'Individual messages within a conversation thread';

COMMENT ON COLUMN thread_messages.direction IS
  'Whether the message was inbound (received) or outbound (sent)';

COMMENT ON COLUMN thread_messages.snippet IS
  'Short preview text for list views';
