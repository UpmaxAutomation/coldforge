-- Warmup Pool Schema
-- Comprehensive email warmup system for maximum inbox deliverability

-- Warmup pool accounts (our network)
CREATE TABLE warmup_pool_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'yahoo', 'smtp')),
  pool_tier TEXT NOT NULL DEFAULT 'standard' CHECK (pool_tier IN ('basic', 'standard', 'premium')),

  -- Credentials (encrypted)
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  encrypted_password TEXT NOT NULL,

  -- Account metadata
  account_age_days INTEGER NOT NULL DEFAULT 0,
  domain TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,

  -- Health metrics
  total_sends INTEGER NOT NULL DEFAULT 0,
  total_receives INTEGER NOT NULL DEFAULT 0,
  spam_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  bounce_rate NUMERIC(5,4) NOT NULL DEFAULT 0,

  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Warmup sessions (active warmup campaigns for user accounts)
CREATE TABLE warmup_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Configuration
  daily_limit INTEGER NOT NULL DEFAULT 10,
  current_day INTEGER NOT NULL DEFAULT 1,
  target_daily_limit INTEGER NOT NULL DEFAULT 40,
  ramp_rate INTEGER NOT NULL DEFAULT 1, -- emails per day increase

  -- Settings
  read_emulation BOOLEAN NOT NULL DEFAULT true,
  reply_rate NUMERIC(3,2) NOT NULL DEFAULT 0.40, -- 40% reply rate
  spam_rescue BOOLEAN NOT NULL DEFAULT true,
  open_delay_min INTEGER NOT NULL DEFAULT 300, -- 5 min minimum before open
  open_delay_max INTEGER NOT NULL DEFAULT 7200, -- 2 hr max before open

  -- Pool assignment
  pool_tier TEXT NOT NULL DEFAULT 'standard' CHECK (pool_tier IN ('basic', 'standard', 'premium')),

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  pause_reason TEXT,

  -- Metrics
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_received INTEGER NOT NULL DEFAULT 0,
  total_opened INTEGER NOT NULL DEFAULT 0,
  total_replied INTEGER NOT NULL DEFAULT 0,
  total_rescued_from_spam INTEGER NOT NULL DEFAULT 0,

  -- Tracking
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual warmup emails
CREATE TABLE warmup_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES warmup_sessions(id) ON DELETE CASCADE,

  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),

  -- Email details
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT,
  message_id TEXT UNIQUE,
  thread_id TEXT,

  -- Pool account used
  pool_account_id UUID REFERENCES warmup_pool_accounts(id),

  -- Engagement tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  read_duration_seconds INTEGER, -- How long email was "read"
  replied_at TIMESTAMPTZ,
  reply_message_id TEXT,

  -- Spam rescue
  landed_in_spam BOOLEAN NOT NULL DEFAULT false,
  rescued_from_spam BOOLEAN NOT NULL DEFAULT false,
  rescued_at TIMESTAMPTZ,

  -- Placement tracking
  inbox_placement TEXT CHECK (inbox_placement IN ('primary', 'promotions', 'updates', 'social', 'spam', 'unknown')),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'replied', 'failed')),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sender reputation tracking per domain/IP
CREATE TABLE sender_reputation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identifier
  type TEXT NOT NULL CHECK (type IN ('domain', 'ip', 'email')),
  identifier TEXT NOT NULL, -- domain, IP address, or email

  -- Google Postmaster metrics
  reputation_score TEXT CHECK (reputation_score IN ('bad', 'low', 'medium', 'high')),
  spam_rate NUMERIC(5,4),
  user_reported_spam_rate NUMERIC(5,4),
  ip_reputation TEXT,
  domain_reputation TEXT,

  -- Authentication
  spf_success_rate NUMERIC(5,4),
  dkim_success_rate NUMERIC(5,4),
  dmarc_success_rate NUMERIC(5,4),

  -- Delivery metrics
  delivery_error_rate NUMERIC(5,4),
  inbox_placement_rate NUMERIC(5,4),
  primary_inbox_rate NUMERIC(5,4),

  -- Warmup specific
  warmup_phase TEXT CHECK (warmup_phase IN ('cold', 'warming', 'warm', 'hot')),
  warmup_started_at TIMESTAMPTZ,
  warmup_completed_at TIMESTAMPTZ,

  -- Volume tracking
  volume_last_7_days INTEGER DEFAULT 0,
  volume_last_30_days INTEGER DEFAULT 0,

  -- Alerts
  last_alert_at TIMESTAMPTZ,
  alert_count INTEGER NOT NULL DEFAULT 0,

  -- Tracking
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(organization_id, type, identifier)
);

-- Warmup schedules (planned emails for the day)
CREATE TABLE warmup_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES warmup_sessions(id) ON DELETE CASCADE,

  -- Schedule
  scheduled_date DATE NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,

  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('send', 'receive')),

  -- Partner
  pool_account_id UUID REFERENCES warmup_pool_accounts(id),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  warmup_email_id UUID REFERENCES warmup_emails(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily warmup stats (aggregated)
CREATE TABLE warmup_daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES warmup_sessions(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  day_number INTEGER NOT NULL,

  -- Volume
  emails_sent INTEGER NOT NULL DEFAULT 0,
  emails_received INTEGER NOT NULL DEFAULT 0,
  emails_scheduled INTEGER NOT NULL DEFAULT 0,

  -- Engagement
  opens INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,

  -- Issues
  spam_count INTEGER NOT NULL DEFAULT 0,
  rescued_count INTEGER NOT NULL DEFAULT 0,
  bounce_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,

  -- Rates
  open_rate NUMERIC(5,4),
  reply_rate NUMERIC(5,4),
  spam_rate NUMERIC(5,4),

  -- Health score for the day
  health_score INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(session_id, date)
);

-- Warmup templates (pre-generated content)
CREATE TABLE warmup_email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Content
  category TEXT NOT NULL CHECK (category IN ('business', 'casual', 'followup', 'question', 'thankyou')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Metadata
  word_count INTEGER NOT NULL,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'professional')),
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Usage tracking
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Warmup reply templates
CREATE TABLE warmup_reply_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Content
  body TEXT NOT NULL,

  -- Metadata
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'enthusiastic')),
  word_count INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Usage tracking
  times_used INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_warmup_pool_active ON warmup_pool_accounts(is_active, pool_tier);
CREATE INDEX idx_warmup_pool_provider ON warmup_pool_accounts(provider, is_active);
CREATE INDEX idx_warmup_pool_last_used ON warmup_pool_accounts(last_used_at NULLS FIRST) WHERE is_active = true;

CREATE INDEX idx_warmup_sessions_account ON warmup_sessions(account_id, status);
CREATE INDEX idx_warmup_sessions_org ON warmup_sessions(organization_id, status);
CREATE INDEX idx_warmup_sessions_active ON warmup_sessions(status) WHERE status = 'active';

CREATE INDEX idx_warmup_emails_session ON warmup_emails(session_id, created_at);
CREATE INDEX idx_warmup_emails_status ON warmup_emails(status, created_at);
CREATE INDEX idx_warmup_emails_spam ON warmup_emails(landed_in_spam, rescued_from_spam);

CREATE INDEX idx_sender_reputation_org ON sender_reputation(organization_id, type);
CREATE INDEX idx_sender_reputation_identifier ON sender_reputation(identifier);

CREATE INDEX idx_warmup_schedules_session ON warmup_schedules(session_id, scheduled_date, status);
CREATE INDEX idx_warmup_schedules_pending ON warmup_schedules(scheduled_time, status) WHERE status = 'pending';

CREATE INDEX idx_warmup_daily_stats_session ON warmup_daily_stats(session_id, date);

-- Functions for incrementing counters
CREATE OR REPLACE FUNCTION increment_warmup_sent(p_session_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE warmup_sessions
  SET
    total_sent = total_sent + 1,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_warmup_received(p_session_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE warmup_sessions
  SET
    total_received = total_received + 1,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_warmup_opened(p_session_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE warmup_sessions
  SET
    total_opened = total_opened + 1,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_warmup_replied(p_session_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE warmup_sessions
  SET
    total_replied = total_replied + 1,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_warmup_rescued(p_session_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE warmup_sessions
  SET
    total_rescued_from_spam = total_rescued_from_spam + 1,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate warmup health score
CREATE OR REPLACE FUNCTION calculate_warmup_health_score(p_session_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_health_score INTEGER := 100;
  v_spam_rate NUMERIC;
  v_open_rate NUMERIC;
  v_reply_rate NUMERIC;
  v_session RECORD;
BEGIN
  SELECT * INTO v_session
  FROM warmup_sessions
  WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate rates from last 7 days
  SELECT
    COALESCE(SUM(CASE WHEN landed_in_spam THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0), 0),
    COALESCE(SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0), 0),
    COALESCE(SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0), 0)
  INTO v_spam_rate, v_open_rate, v_reply_rate
  FROM warmup_emails
  WHERE session_id = p_session_id
    AND created_at > now() - INTERVAL '7 days';

  -- Deduct for spam rate (major penalty)
  IF v_spam_rate > 0.003 THEN
    v_health_score := v_health_score - 30;
  END IF;
  IF v_spam_rate > 0.01 THEN
    v_health_score := v_health_score - 20;
  END IF;

  -- Deduct for low open rate
  IF v_open_rate < 0.5 THEN
    v_health_score := v_health_score - 20;
  END IF;

  -- Deduct for low reply rate
  IF v_reply_rate < 0.2 THEN
    v_health_score := v_health_score - 10;
  END IF;

  -- Bonus for consistent activity
  IF v_session.current_day > 7 AND v_spam_rate < 0.001 THEN
    v_health_score := v_health_score + 10;
  END IF;

  RETURN GREATEST(0, LEAST(100, v_health_score));
END;
$$ LANGUAGE plpgsql;

-- Update account warmup status when session changes
CREATE OR REPLACE FUNCTION update_account_warmup_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE email_accounts
    SET
      warmup_enabled = true,
      status = 'warming',
      warmup_progress = LEAST(100, (NEW.current_day::NUMERIC / 30 * 100)::INTEGER),
      updated_at = now()
    WHERE id = NEW.account_id;
  ELSIF NEW.status IN ('completed', 'paused', 'failed') THEN
    UPDATE email_accounts
    SET
      warmup_enabled = CASE WHEN NEW.status = 'paused' THEN true ELSE false END,
      status = CASE WHEN NEW.status = 'completed' THEN 'active' ELSE 'paused' END,
      warmup_progress = CASE WHEN NEW.status = 'completed' THEN 100 ELSE warmup_progress END,
      updated_at = now()
    WHERE id = NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER warmup_session_status_change
AFTER INSERT OR UPDATE OF status ON warmup_sessions
FOR EACH ROW
EXECUTE FUNCTION update_account_warmup_status();

-- RLS Policies
ALTER TABLE warmup_pool_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_reply_templates ENABLE ROW LEVEL SECURITY;

-- Pool accounts are internal - service role only
CREATE POLICY "Pool accounts are internal"
  ON warmup_pool_accounts
  FOR ALL
  TO service_role
  USING (true);

-- Warmup sessions - org-based
CREATE POLICY "Users can view their org warmup sessions"
  ON warmup_sessions FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their org warmup sessions"
  ON warmup_sessions FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Warmup emails
CREATE POLICY "Users can view their warmup emails"
  ON warmup_emails FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM warmup_sessions
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Sender reputation
CREATE POLICY "Users can view their org reputation"
  ON sender_reputation FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their org reputation"
  ON sender_reputation FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Warmup schedules
CREATE POLICY "Users can view their warmup schedules"
  ON warmup_schedules FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM warmup_sessions
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Daily stats
CREATE POLICY "Users can view their daily stats"
  ON warmup_daily_stats FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM warmup_sessions
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Templates are public (read-only for users)
CREATE POLICY "Anyone can read email templates"
  ON warmup_email_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Anyone can read reply templates"
  ON warmup_reply_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Insert some starter warmup templates
INSERT INTO warmup_email_templates (category, subject, body, word_count, sentiment) VALUES
('business', 'Quick follow-up', 'Hi there,

Just wanted to check in and see how things are going on your end. Let me know if you have any updates.

Best,
{{sender_name}}', 28, 'professional'),
('business', 'Touching base', 'Hey,

Hope this week is treating you well! Wanted to touch base and see if there''s anything I can help with.

Cheers,
{{sender_name}}', 27, 'professional'),
('casual', 'Quick question', 'Hi!

Hope you''re doing great. Quick question - do you have a moment to chat this week?

Thanks!
{{sender_name}}', 21, 'positive'),
('casual', 'Thinking of you', 'Hey there!

Just wanted to say hi and hope everything is going well. Let''s catch up soon!

Best,
{{sender_name}}', 22, 'positive'),
('followup', 'Following up on our chat', 'Hi,

Following up on our conversation from last week. Any updates on your end?

Looking forward to hearing back!
{{sender_name}}', 21, 'professional'),
('question', 'Quick thought', 'Hey,

Had a quick thought I wanted to run by you. Do you have a few minutes this week to connect?

Thanks!
{{sender_name}}', 25, 'neutral'),
('thankyou', 'Thanks again!', 'Hi there,

Just wanted to say thanks again for taking the time. Really appreciated it!

Best,
{{sender_name}}', 19, 'positive');

-- Insert some reply templates
INSERT INTO warmup_reply_templates (body, sentiment, word_count) VALUES
('Thanks for reaching out! I''ll take a look and get back to you.', 'positive', 12),
('Hey! Thanks for the message. Hope you''re having a great week!', 'enthusiastic', 12),
('Got it, thanks! I''ll review and let you know.', 'positive', 9),
('Thanks! I appreciate you thinking of me.', 'positive', 7),
('Great to hear from you! I''ll check this out.', 'enthusiastic', 9),
('Thanks for sharing. This looks interesting!', 'positive', 6),
('Hi! Thanks for the update. Sounds good to me.', 'positive', 9),
('Perfect, thanks for letting me know!', 'positive', 6);

COMMENT ON TABLE warmup_pool_accounts IS 'Network of accounts used for email warmup exchanges';
COMMENT ON TABLE warmup_sessions IS 'Active warmup campaigns for user email accounts';
COMMENT ON TABLE warmup_emails IS 'Individual warmup emails sent and received';
COMMENT ON TABLE sender_reputation IS 'Reputation tracking from Google Postmaster Tools and internal metrics';
COMMENT ON TABLE warmup_schedules IS 'Scheduled warmup emails for the day';
COMMENT ON TABLE warmup_daily_stats IS 'Aggregated daily statistics for warmup sessions';
