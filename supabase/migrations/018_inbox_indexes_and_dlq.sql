-- Migration 018: Inbox Indexes and Performance Optimizations
-- Created: 2026-01-20
-- Purpose: Add missing indexes on inbox_messages table and fix email_tracking_links RLS

-- ============================================================================
-- INBOX_MESSAGES INDEXES (CRITICAL - Table was missing all indexes)
-- Prevents full table scans on every inbox query
-- ============================================================================

-- Primary index for inbox queries by account
CREATE INDEX IF NOT EXISTS idx_inbox_messages_account_date
  ON inbox_messages(email_account_id, received_at DESC);

-- Thread-based queries for conversation view
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread
  ON inbox_messages(thread_id, received_at);

-- Organization-wide inbox queries
CREATE INDEX IF NOT EXISTS idx_inbox_messages_org_date
  ON inbox_messages(organization_id, received_at DESC);

-- Unread message count optimization
CREATE INDEX IF NOT EXISTS idx_inbox_messages_unread
  ON inbox_messages(organization_id, is_read, received_at DESC)
  WHERE is_read = false;

-- Message ID lookup (for reply threading, deduplication)
CREATE INDEX IF NOT EXISTS idx_inbox_messages_message_id
  ON inbox_messages(message_id)
  WHERE message_id IS NOT NULL;

-- From email lookup (for contact matching)
CREATE INDEX IF NOT EXISTS idx_inbox_messages_from
  ON inbox_messages(from_email);

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_inbox_messages_category
  ON inbox_messages(category)
  WHERE category IS NOT NULL;

-- ============================================================================
-- THREAD_MESSAGES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_date
  ON thread_messages(thread_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_thread_messages_message_id
  ON thread_messages(message_id)
  WHERE message_id IS NOT NULL;

-- ============================================================================
-- EMAIL_TRACKING_LINKS RLS FIX
-- Previous policy was too permissive with USING (true)
-- ============================================================================

-- Drop the overly permissive policy if it exists
DROP POLICY IF EXISTS "System can manage tracking links" ON email_tracking_links;

-- Create proper RLS policy that requires organization context
CREATE POLICY "Organization can manage own tracking links"
  ON email_tracking_links
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Service role bypass for background job processing
CREATE POLICY "Service role can manage all tracking links"
  ON email_tracking_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS FOR BATCH UPDATES
-- These support the N+1 query fix in email processor
-- ============================================================================

-- Function to atomically increment sent_today count
CREATE OR REPLACE FUNCTION increment_sent_today(p_mailbox_id UUID, p_count INTEGER DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE email_accounts
  SET sent_today = COALESCE(sent_today, 0) + p_count,
      updated_at = NOW()
  WHERE id = p_mailbox_id;
END;
$$;

-- Function to atomically increment campaign sent count
CREATE OR REPLACE FUNCTION increment_campaign_sent(p_campaign_id UUID, p_count INTEGER DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns
  SET stats = jsonb_set(
    COALESCE(stats, '{}'::jsonb),
    '{sentCount}',
    to_jsonb(COALESCE((stats->>'sentCount')::integer, 0) + p_count)
  ),
  updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$;

-- Function to increment thread message count
CREATE OR REPLACE FUNCTION increment_thread_message_count(p_thread_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE threads
  SET message_count = COALESCE(message_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_thread_id;
END;
$$;

-- Function to increment campaign reply count (for reply→campaign auto-link)
CREATE OR REPLACE FUNCTION increment_campaign_replies(p_campaign_id UUID, p_count INTEGER DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns
  SET stats = jsonb_set(
    COALESCE(stats, '{}'::jsonb),
    '{replyCount}',
    to_jsonb(COALESCE((stats->>'replyCount')::integer, 0) + p_count)
  ),
  updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$;

-- ============================================================================
-- DEAD LETTER QUEUE TABLE
-- Stores failed jobs for inspection and manual retry
-- ============================================================================

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  job_data JSONB NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by TEXT,
  status TEXT NOT NULL DEFAULT 'failed' CHECK (status IN ('failed', 'retried', 'discarded'))
);

-- Indexes for DLQ
CREATE INDEX IF NOT EXISTS idx_dlq_queue_status
  ON dead_letter_queue(queue_name, status);

CREATE INDEX IF NOT EXISTS idx_dlq_failed_at
  ON dead_letter_queue(failed_at DESC);

CREATE INDEX IF NOT EXISTS idx_dlq_org
  ON dead_letter_queue(organization_id)
  WHERE organization_id IS NOT NULL;

-- RLS for dead letter queue
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizations can view own DLQ entries"
  ON dead_letter_queue
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
    OR organization_id IS NULL
  );

CREATE POLICY "Service role can manage DLQ"
  ON dead_letter_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- COMMENT DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE dead_letter_queue IS 'Stores failed background jobs for inspection, debugging, and manual retry';
COMMENT ON FUNCTION increment_sent_today IS 'Atomically increment mailbox sent_today counter to fix N+1 query issue';
COMMENT ON FUNCTION increment_campaign_sent IS 'Atomically increment campaign sent count to fix N+1 query issue';
