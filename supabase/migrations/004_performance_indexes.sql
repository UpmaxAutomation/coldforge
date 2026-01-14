-- Performance Indexes for InstantScale
-- Created: 2026-01-13
-- Purpose: Optimize frequently-used queries for better application performance
--
-- Note: Some basic indexes already exist in 001_initial_schema.sql
-- This migration adds composite indexes and partial indexes for common query patterns

-- ============================================================================
-- CAMPAIGNS TABLE INDEXES
-- Optimizes: Dashboard listings, campaign filtering, status-based queries
-- ============================================================================

-- Composite index for filtering campaigns by organization and status
-- Common query: "Show all active campaigns for my organization"
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status
  ON campaigns(organization_id, status);

-- Composite index for chronological campaign listings per organization
-- Common query: "Show recent campaigns" (dashboard, campaign list)
CREATE INDEX IF NOT EXISTS idx_campaigns_org_created
  ON campaigns(organization_id, created_at DESC);

-- Partial index for active/paused campaigns (most frequently queried statuses)
-- Reduces index size by excluding draft/completed/archived campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_active_statuses
  ON campaigns(status)
  WHERE status IN ('active', 'paused');

-- ============================================================================
-- LEADS TABLE INDEXES (High Volume)
-- Optimizes: Lead lookups, campaign assignment, status filtering
-- ============================================================================

-- Note: idx_leads_email already exists in 001_initial_schema.sql

-- Lead status filtering (unsubscribed, bounced checks)
CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads(status);

-- Composite index for campaign-specific lead status queries
-- Common query: "Show all active leads in campaign X"
CREATE INDEX IF NOT EXISTS idx_leads_org_status
  ON leads(organization_id, status);

-- Validation status for email verification workflows
CREATE INDEX IF NOT EXISTS idx_leads_validation
  ON leads(validation_status)
  WHERE validation_status IS NOT NULL;

-- ============================================================================
-- EMAIL ACCOUNTS TABLE INDEXES
-- Optimizes: Account selection, warmup processing, health monitoring
-- ============================================================================

-- Note: idx_email_accounts_org already exists in 001_initial_schema.sql

-- Account status filtering (for selecting available accounts)
CREATE INDEX IF NOT EXISTS idx_email_accounts_status
  ON email_accounts(status);

-- Composite index for organization accounts by status
-- Common query: "Get all active email accounts for sending"
CREATE INDEX IF NOT EXISTS idx_email_accounts_org_status
  ON email_accounts(organization_id, status);

-- Partial index for accounts with warmup enabled
-- Optimizes warmup scheduler queries
CREATE INDEX IF NOT EXISTS idx_email_accounts_warmup_enabled
  ON email_accounts(warmup_enabled, warmup_progress)
  WHERE warmup_enabled = true;

-- Health score index for identifying problematic accounts
CREATE INDEX IF NOT EXISTS idx_email_accounts_health
  ON email_accounts(health_score)
  WHERE health_score < 80;

-- ============================================================================
-- SENT EMAILS TABLE INDEXES (High Volume, Analytics)
-- Optimizes: Email tracking, analytics queries, campaign reporting
-- ============================================================================

-- Note: idx_sent_emails_campaign already exists in 001_initial_schema.sql

-- Email account activity tracking
CREATE INDEX IF NOT EXISTS idx_sent_emails_account
  ON sent_emails(email_account_id);

-- Chronological email listings
CREATE INDEX IF NOT EXISTS idx_sent_emails_sent_at
  ON sent_emails(sent_at DESC);

-- Composite index for campaign analytics with date range
-- Common query: "Show emails sent in campaign X during date range"
CREATE INDEX IF NOT EXISTS idx_sent_emails_campaign_date
  ON sent_emails(campaign_id, sent_at DESC);

-- Email status for delivery tracking
CREATE INDEX IF NOT EXISTS idx_sent_emails_status
  ON sent_emails(status);

-- Message ID lookup (for webhook processing, reply matching)
CREATE INDEX IF NOT EXISTS idx_sent_emails_message_id
  ON sent_emails(message_id)
  WHERE message_id IS NOT NULL;

-- Lead tracking (for lead-level email history)
CREATE INDEX IF NOT EXISTS idx_sent_emails_lead
  ON sent_emails(lead_id)
  WHERE lead_id IS NOT NULL;

-- ============================================================================
-- REPLIES TABLE INDEXES (Unified Inbox)
-- Optimizes: Inbox queries, unread counts, thread grouping
-- ============================================================================

-- Note: idx_replies_org and idx_replies_email_account exist in 001_initial_schema.sql

-- Partial index for unread replies (badge counts, inbox filtering)
-- Common query: "Count unread replies for my organization"
CREATE INDEX IF NOT EXISTS idx_replies_unread
  ON replies(organization_id, received_at DESC)
  WHERE is_read = false;

-- Category filtering for inbox management
CREATE INDEX IF NOT EXISTS idx_replies_category
  ON replies(category);

-- Message threading (for conversation view)
CREATE INDEX IF NOT EXISTS idx_replies_in_reply_to
  ON replies(in_reply_to)
  WHERE in_reply_to IS NOT NULL;

-- Chronological inbox view
CREATE INDEX IF NOT EXISTS idx_replies_received_at
  ON replies(organization_id, received_at DESC);

-- ============================================================================
-- DOMAINS TABLE INDEXES
-- Optimizes: Domain health monitoring, DNS configuration status
-- ============================================================================

-- Note: idx_domains_org already exists in 001_initial_schema.sql

-- Health status filtering (for alerts, monitoring dashboards)
CREATE INDEX IF NOT EXISTS idx_domains_health_status
  ON domains(health_status);

-- DNS configuration status (for setup wizards, bulk operations)
CREATE INDEX IF NOT EXISTS idx_domains_dns_config
  ON domains(organization_id, spf_configured, dkim_configured, dmarc_configured);

-- Expiring domains alert
CREATE INDEX IF NOT EXISTS idx_domains_expires
  ON domains(expires_at)
  WHERE expires_at IS NOT NULL;

-- ============================================================================
-- WARMUP EMAILS TABLE INDEXES
-- Optimizes: Warmup scheduling, progress tracking
-- ============================================================================

-- Account-based warmup history
CREATE INDEX IF NOT EXISTS idx_warmup_emails_from_account
  ON warmup_emails(from_account_id);

CREATE INDEX IF NOT EXISTS idx_warmup_emails_to_account
  ON warmup_emails(to_account_id);

-- Warmup activity timeline
CREATE INDEX IF NOT EXISTS idx_warmup_emails_sent_at
  ON warmup_emails(sent_at DESC);

-- Status tracking for warmup analytics
CREATE INDEX IF NOT EXISTS idx_warmup_emails_status
  ON warmup_emails(status);

-- ============================================================================
-- CAMPAIGN SEQUENCES TABLE INDEXES
-- Optimizes: Sequence step lookups, campaign editing
-- ============================================================================

-- Note: idx_campaign_sequences_campaign already exists in 001_initial_schema.sql

-- Step ordering within campaigns
CREATE INDEX IF NOT EXISTS idx_campaign_sequences_order
  ON campaign_sequences(campaign_id, step_number);

-- ============================================================================
-- CAMPAIGN LEADS TABLE INDEXES (Junction Table)
-- Optimizes: Send queue processing, lead progress tracking
-- ============================================================================

-- Note: idx_campaign_leads_campaign and idx_campaign_leads_lead exist in 001_initial_schema.sql

-- Send queue optimization (find leads ready to receive next email)
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_send
  ON campaign_leads(next_send_at)
  WHERE status IN ('pending', 'in_progress') AND next_send_at IS NOT NULL;

-- Status-based filtering
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status
  ON campaign_leads(status);

-- Composite for campaign progress queries
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_status
  ON campaign_leads(campaign_id, status);

-- ============================================================================
-- LEAD LISTS TABLE INDEXES
-- Optimizes: List management, lead organization
-- ============================================================================

-- Organization-based list retrieval
CREATE INDEX IF NOT EXISTS idx_lead_lists_org
  ON lead_lists(organization_id);

-- Chronological list ordering
CREATE INDEX IF NOT EXISTS idx_lead_lists_org_created
  ON lead_lists(organization_id, created_at DESC);

-- ============================================================================
-- USERS TABLE INDEXES
-- Optimizes: User lookup, organization membership
-- ============================================================================

-- User role filtering (for permission checks)
CREATE INDEX IF NOT EXISTS idx_users_org_role
  ON users(organization_id, role);

-- Email lookup (for authentication, invitations)
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

-- ============================================================================
-- ORGANIZATIONS TABLE INDEXES
-- Optimizes: Tenant lookup, billing queries
-- ============================================================================

-- Stripe customer lookup (for webhook processing)
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Plan-based filtering (for feature gating, analytics)
CREATE INDEX IF NOT EXISTS idx_organizations_plan
  ON organizations(plan);
