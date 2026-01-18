-- Migration: 010_smtp_infrastructure.sql
-- Description: SMTP infrastructure for email sending, routing, and queue management

-- SMTP provider configurations
CREATE TABLE IF NOT EXISTS smtp_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Provider identity
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN (
    'aws_ses', 'sendgrid', 'postmark', 'mailgun', 'sparkpost',
    'smtp_relay', 'google_workspace', 'microsoft_365', 'custom'
  )),

  -- SMTP credentials (encrypted)
  host TEXT,
  port INTEGER DEFAULT 587,
  username_encrypted TEXT,
  password_encrypted TEXT,

  -- API credentials (for API-based providers)
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,

  -- Provider-specific config
  region TEXT, -- AWS region, etc.
  endpoint TEXT, -- Custom endpoint
  config JSONB DEFAULT '{}'::JSONB,

  -- Rate limiting
  max_per_second INTEGER DEFAULT 10,
  max_per_minute INTEGER DEFAULT 100,
  max_per_hour INTEGER DEFAULT 1000,
  max_per_day INTEGER DEFAULT 10000,
  current_hour_count INTEGER DEFAULT 0,
  current_day_count INTEGER DEFAULT 0,
  last_hour_reset TIMESTAMPTZ DEFAULT NOW(),
  last_day_reset TIMESTAMPTZ DEFAULT NOW(),

  -- Health tracking
  is_active BOOLEAN DEFAULT true,
  is_healthy BOOLEAN DEFAULT true,
  last_health_check TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  error_rate_24h DECIMAL(5,2) DEFAULT 0,

  -- Stats
  emails_sent_total BIGINT DEFAULT 0,
  emails_bounced_total BIGINT DEFAULT 0,
  emails_complained_total BIGINT DEFAULT 0,

  -- Priority for failover (lower = higher priority)
  priority INTEGER DEFAULT 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, name)
);

-- Email sending queue
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Campaign/sequence reference
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  sequence_id UUID,
  sequence_step INTEGER,

  -- Sender
  from_mailbox_id UUID REFERENCES provisioned_mailboxes(id) ON DELETE CASCADE,
  from_email TEXT NOT NULL,
  from_name TEXT,
  reply_to TEXT,

  -- Recipient
  to_email TEXT NOT NULL,
  to_name TEXT,
  lead_id UUID, -- Reference to leads table if applicable

  -- Content
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,

  -- Headers
  custom_headers JSONB DEFAULT '{}'::JSONB,
  tracking_id TEXT, -- For open/click tracking

  -- Attachments (stored references)
  attachments JSONB DEFAULT '[]'::JSONB,

  -- Routing
  smtp_provider_id UUID REFERENCES smtp_providers(id) ON DELETE SET NULL,
  assigned_ip TEXT,

  -- Scheduling
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  send_window_start TIME,
  send_window_end TIME,
  timezone TEXT DEFAULT 'UTC',

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'scheduled', 'processing', 'sent',
    'delivered', 'bounced', 'failed', 'cancelled'
  )),
  priority INTEGER DEFAULT 5, -- 1=highest, 10=lowest

  -- Retry handling
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  retry_after_error TEXT,

  -- Results
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  message_id TEXT, -- Provider's message ID

  -- Error tracking
  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email events (opens, clicks, bounces, etc.)
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Reference
  email_queue_id UUID REFERENCES email_queue(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  message_id TEXT,
  tracking_id TEXT,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'sent', 'delivered', 'opened', 'clicked', 'bounced',
    'complained', 'unsubscribed', 'blocked', 'deferred'
  )),

  -- Recipient
  recipient_email TEXT NOT NULL,
  lead_id UUID,

  -- Event data
  event_data JSONB DEFAULT '{}'::JSONB,

  -- For clicks
  clicked_url TEXT,

  -- For bounces
  bounce_type TEXT CHECK (bounce_type IN ('hard', 'soft', 'transient')),
  bounce_subtype TEXT,

  -- Metadata
  user_agent TEXT,
  ip_address INET,
  geo_country TEXT,
  geo_city TEXT,
  device_type TEXT,

  -- Timestamps
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bounce and complaint tracking
CREATE TABLE IF NOT EXISTS email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE, -- NULL for global

  email TEXT NOT NULL,

  -- Suppression reason
  reason TEXT NOT NULL CHECK (reason IN (
    'hard_bounce', 'soft_bounce', 'complaint', 'unsubscribe',
    'spam_trap', 'invalid', 'role_based', 'manual'
  )),

  -- Details
  source TEXT, -- Which provider reported
  original_event_id UUID,
  notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ, -- For temporary suppressions

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Can be global (workspace_id NULL) or workspace-specific
  UNIQUE(workspace_id, email)
);

-- SMTP connection pool status
CREATE TABLE IF NOT EXISTS smtp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES smtp_providers(id) ON DELETE CASCADE,

  -- Connection details
  connection_id TEXT NOT NULL,
  server_id TEXT, -- Worker/server identifier

  -- Status
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'error', 'closed')),
  is_authenticated BOOLEAN DEFAULT false,

  -- Usage
  emails_sent INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Health
  last_error TEXT,
  error_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(provider_id, connection_id)
);

-- Sending IP pools
CREATE TABLE IF NOT EXISTS ip_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  -- Pool type
  pool_type TEXT DEFAULT 'shared' CHECK (pool_type IN ('dedicated', 'shared', 'warmup')),

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, name)
);

-- Individual IPs in pools
CREATE TABLE IF NOT EXISTS sending_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES ip_pools(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES smtp_providers(id) ON DELETE SET NULL,

  -- IP details
  ip_address INET NOT NULL UNIQUE,
  hostname TEXT,

  -- Reputation
  reputation_score INTEGER DEFAULT 100, -- 0-100
  warmup_status TEXT DEFAULT 'cold' CHECK (warmup_status IN ('cold', 'warming', 'warm', 'hot')),
  warmup_started_at TIMESTAMPTZ,
  warmup_completed_at TIMESTAMPTZ,

  -- Sending limits based on warmup
  current_daily_limit INTEGER DEFAULT 50,
  target_daily_limit INTEGER DEFAULT 10000,
  emails_sent_today INTEGER DEFAULT 0,

  -- Blacklist status
  is_blacklisted BOOLEAN DEFAULT false,
  blacklist_sources TEXT[] DEFAULT ARRAY[]::TEXT[],
  last_blacklist_check TIMESTAMPTZ,

  -- Stats
  total_sent BIGINT DEFAULT 0,
  total_bounced BIGINT DEFAULT 0,
  total_complained BIGINT DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email warmup schedule
CREATE TABLE IF NOT EXISTS warmup_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference (mailbox or IP)
  mailbox_id UUID REFERENCES provisioned_mailboxes(id) ON DELETE CASCADE,
  ip_id UUID REFERENCES sending_ips(id) ON DELETE CASCADE,

  -- Must have either mailbox or IP
  CONSTRAINT warmup_target CHECK (
    (mailbox_id IS NOT NULL AND ip_id IS NULL) OR
    (mailbox_id IS NULL AND ip_id IS NOT NULL)
  ),

  -- Schedule
  day_number INTEGER NOT NULL, -- Day of warmup (1, 2, 3...)
  target_volume INTEGER NOT NULL, -- Emails to send this day
  actual_volume INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  scheduled_date DATE,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Warmup email pool (for sending warmup emails)
CREATE TABLE IF NOT EXISTS warmup_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The mailbox participating in warmup
  mailbox_id UUID NOT NULL REFERENCES provisioned_mailboxes(id) ON DELETE CASCADE,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Participation tracking
  emails_sent_today INTEGER DEFAULT 0,
  emails_received_today INTEGER DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  last_received_at TIMESTAMPTZ,

  -- Quality metrics
  reply_rate DECIMAL(5,2) DEFAULT 0,
  engagement_score INTEGER DEFAULT 50, -- 0-100

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(mailbox_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_smtp_providers_workspace ON smtp_providers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_smtp_providers_active ON smtp_providers(is_active, is_healthy);

CREATE INDEX IF NOT EXISTS idx_email_queue_workspace ON email_queue(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_processing ON email_queue(status, priority, scheduled_at) WHERE status IN ('pending', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_email_queue_campaign ON email_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_mailbox ON email_queue(from_mailbox_id);

CREATE INDEX IF NOT EXISTS idx_email_events_workspace ON email_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_events_queue ON email_events(email_queue_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON email_events(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_events_tracking ON email_events(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred ON email_events(occurred_at);

CREATE INDEX IF NOT EXISTS idx_suppressions_email ON email_suppressions(email);
CREATE INDEX IF NOT EXISTS idx_suppressions_workspace ON email_suppressions(workspace_id) WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sending_ips_pool ON sending_ips(pool_id);
CREATE INDEX IF NOT EXISTS idx_sending_ips_active ON sending_ips(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sending_ips_warmup ON sending_ips(warmup_status);

CREATE INDEX IF NOT EXISTS idx_warmup_schedules_mailbox ON warmup_schedules(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_warmup_schedules_ip ON warmup_schedules(ip_id);
CREATE INDEX IF NOT EXISTS idx_warmup_schedules_date ON warmup_schedules(scheduled_date);

CREATE INDEX IF NOT EXISTS idx_warmup_pool_active ON warmup_pool(is_active) WHERE is_active = true;

-- RLS Policies
ALTER TABLE smtp_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE sending_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_pool ENABLE ROW LEVEL SECURITY;

-- SMTP providers policies
CREATE POLICY "Users can view their workspace SMTP providers"
  ON smtp_providers FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage SMTP providers"
  ON smtp_providers FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Email queue policies
CREATE POLICY "Users can view their workspace email queue"
  ON email_queue FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their workspace email queue"
  ON email_queue FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
  ));

-- Email events policies
CREATE POLICY "Users can view their workspace email events"
  ON email_events FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- Suppressions policies (view global + workspace-specific)
CREATE POLICY "Users can view suppressions"
  ON email_suppressions FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage workspace suppressions"
  ON email_suppressions FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- IP pools policies
CREATE POLICY "Users can view their workspace IP pools"
  ON ip_pools FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage IP pools"
  ON ip_pools FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Sending IPs policies (through pool)
CREATE POLICY "Users can view sending IPs"
  ON sending_ips FOR SELECT
  USING (pool_id IN (
    SELECT id FROM ip_pools WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  ));

-- Warmup policies
CREATE POLICY "Users can view warmup schedules"
  ON warmup_schedules FOR SELECT
  USING (
    mailbox_id IN (
      SELECT id FROM provisioned_mailboxes WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
    OR
    ip_id IN (
      SELECT id FROM sending_ips WHERE pool_id IN (
        SELECT id FROM ip_pools WHERE workspace_id IN (
          SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can view warmup pool"
  ON warmup_pool FOR SELECT
  USING (mailbox_id IN (
    SELECT id FROM provisioned_mailboxes WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  ));

-- Function to check suppression
CREATE OR REPLACE FUNCTION is_email_suppressed(
  p_email TEXT,
  p_workspace_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM email_suppressions
    WHERE email = LOWER(p_email)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (workspace_id IS NULL OR workspace_id = p_workspace_id)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update provider rate limits
CREATE OR REPLACE FUNCTION reset_provider_rate_limits()
RETURNS void AS $$
BEGIN
  -- Reset hourly counts
  UPDATE smtp_providers
  SET current_hour_count = 0,
      last_hour_reset = NOW()
  WHERE last_hour_reset < NOW() - INTERVAL '1 hour';

  -- Reset daily counts
  UPDATE smtp_providers
  SET current_day_count = 0,
      last_day_reset = NOW()
  WHERE last_day_reset < NOW() - INTERVAL '1 day';

  -- Reset IP daily counts
  UPDATE sending_ips
  SET emails_sent_today = 0
  WHERE DATE(last_used_at) < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to get next available provider
CREATE OR REPLACE FUNCTION get_next_smtp_provider(
  p_workspace_id UUID,
  p_priority_type TEXT DEFAULT 'round_robin'
) RETURNS UUID AS $$
DECLARE
  v_provider_id UUID;
BEGIN
  SELECT id INTO v_provider_id
  FROM smtp_providers
  WHERE workspace_id = p_workspace_id
    AND is_active = true
    AND is_healthy = true
    AND current_hour_count < max_per_hour
    AND current_day_count < max_per_day
  ORDER BY
    CASE WHEN p_priority_type = 'priority' THEN priority END ASC,
    CASE WHEN p_priority_type = 'round_robin' THEN current_hour_count END ASC,
    CASE WHEN p_priority_type = 'least_errors' THEN error_rate_24h END ASC
  LIMIT 1;

  RETURN v_provider_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update provider stats
CREATE OR REPLACE FUNCTION update_provider_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
    UPDATE smtp_providers
    SET emails_sent_total = emails_sent_total + 1,
        current_hour_count = current_hour_count + 1,
        current_day_count = current_day_count + 1
    WHERE id = NEW.smtp_provider_id;
  ELSIF NEW.status = 'bounced' THEN
    UPDATE smtp_providers
    SET emails_bounced_total = emails_bounced_total + 1
    WHERE id = NEW.smtp_provider_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_provider_stats
  AFTER UPDATE ON email_queue
  FOR EACH ROW
  WHEN (NEW.status != OLD.status)
  EXECUTE FUNCTION update_provider_stats();

-- Trigger to update mailbox sent counts
CREATE OR REPLACE FUNCTION update_mailbox_sent_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
    UPDATE provisioned_mailboxes
    SET emails_sent_today = emails_sent_today + 1,
        emails_sent_total = emails_sent_total + 1,
        last_sent_at = NOW()
    WHERE id = NEW.from_mailbox_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_mailbox_sent_counts
  AFTER UPDATE ON email_queue
  FOR EACH ROW
  WHEN (NEW.status = 'sent' AND OLD.status != 'sent')
  EXECUTE FUNCTION update_mailbox_sent_counts();

-- Trigger for updated_at
CREATE TRIGGER trigger_smtp_providers_updated_at
  BEFORE UPDATE ON smtp_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_mailbox_updated_at();

CREATE TRIGGER trigger_email_queue_updated_at
  BEFORE UPDATE ON email_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_mailbox_updated_at();
