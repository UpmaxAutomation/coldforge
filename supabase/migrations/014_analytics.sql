-- Analytics and A/B Testing Schema
-- Migration: 014_analytics.sql

-- ============================================
-- ENUMS
-- ============================================

-- Analytics event types
CREATE TYPE analytics_event_type AS ENUM (
  -- Email events
  'email_sent',
  'email_delivered',
  'email_opened',
  'email_clicked',
  'email_replied',
  'email_bounced',
  'email_unsubscribed',
  'email_marked_spam',
  -- Campaign events
  'campaign_started',
  'campaign_paused',
  'campaign_resumed',
  'campaign_completed',
  'campaign_archived',
  -- Lead events
  'lead_created',
  'lead_imported',
  'lead_exported',
  'lead_status_changed',
  'lead_tagged',
  'lead_contacted',
  -- Sequence events
  'sequence_started',
  'sequence_step_completed',
  'sequence_completed',
  'sequence_stopped',
  -- Mailbox events
  'mailbox_connected',
  'mailbox_disconnected',
  'mailbox_warmup_started',
  'mailbox_warmup_completed',
  'mailbox_health_changed',
  -- User events
  'user_login',
  'user_signup',
  'workspace_created',
  'team_member_added'
);

-- A/B test status
CREATE TYPE ab_test_status AS ENUM (
  'draft',
  'running',
  'paused',
  'completed',
  'archived'
);

-- A/B test types
CREATE TYPE ab_test_type AS ENUM (
  'subject',
  'body',
  'sender',
  'timing'
);

-- Winning metric
CREATE TYPE ab_winning_metric AS ENUM (
  'opens',
  'clicks',
  'replies'
);

-- Report types
CREATE TYPE report_type AS ENUM (
  'campaign_performance',
  'email_deliverability',
  'lead_engagement',
  'mailbox_health',
  'ab_test_results',
  'team_activity',
  'workspace_overview'
);

-- Export formats
CREATE TYPE export_format AS ENUM (
  'csv',
  'xlsx',
  'json',
  'pdf'
);

-- Export status
CREATE TYPE export_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- ============================================
-- TABLES
-- ============================================

-- Analytics Events
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type analytics_event_type NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Context references
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  mailbox_id UUID REFERENCES mailboxes(id) ON DELETE SET NULL,
  sequence_id UUID,
  email_id UUID,

  -- Additional data
  metadata JSONB DEFAULT '{}',

  -- Tracking info
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(20),
  browser VARCHAR(50),
  os VARCHAR(50),
  country VARCHAR(2),
  city VARCHAR(100),

  -- Indexing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioning analytics_events by month for performance
-- Note: Uncomment for production with high volume
-- CREATE TABLE analytics_events_y2024m01 PARTITION OF analytics_events
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- A/B Tests
CREATE TABLE ab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status ab_test_status NOT NULL DEFAULT 'draft',

  -- Test configuration
  test_type ab_test_type NOT NULL,
  winning_metric ab_winning_metric NOT NULL DEFAULT 'opens',
  confidence_level DECIMAL(3,2) NOT NULL DEFAULT 0.95,

  -- Auto-selection
  auto_select_winner BOOLEAN DEFAULT true,
  minimum_sample_size INTEGER DEFAULT 100,

  -- Winner
  winning_variant_id UUID,
  winner_determined_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- A/B Test Variants
CREATE TABLE ab_test_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type ab_test_type NOT NULL,

  -- Variant content
  content JSONB NOT NULL DEFAULT '{}',
  -- subject: { subject: "..." }
  -- body: { body: "..." }
  -- sender: { senderName: "...", senderEmail: "..." }
  -- timing: { sendTime: "09:00" }

  -- Weight (percentage of traffic)
  weight INTEGER NOT NULL DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),

  -- Stats
  sent INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email tracking links (for click tracking)
CREATE TABLE email_tracking_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email_id UUID NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Original and tracking URLs
  original_url TEXT NOT NULL,
  tracking_url TEXT NOT NULL UNIQUE,

  -- Click stats
  click_count INTEGER DEFAULT 0,
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,

  -- Metadata
  link_position INTEGER, -- Position in email
  link_text TEXT, -- Anchor text

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email opens (for unique open tracking)
CREATE TABLE email_opens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email_id UUID NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Tracking info
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(20),
  browser VARCHAR(50),
  os VARCHAR(50),
  country VARCHAR(2),
  city VARCHAR(100),

  -- Is this the first open?
  is_first_open BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled Reports
CREATE TABLE scheduled_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Report configuration
  name VARCHAR(255) NOT NULL,
  description TEXT,
  report_type report_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  -- config: {
  --   timeRange: '30d',
  --   campaignIds: [...],
  --   metrics: [...],
  --   groupBy: 'campaign'
  -- }

  -- Schedule
  schedule_enabled BOOLEAN DEFAULT false,
  schedule_frequency VARCHAR(20), -- daily, weekly, monthly
  schedule_day INTEGER, -- Day of week (0-6) or day of month (1-31)
  schedule_time TIME, -- Time of day
  schedule_timezone VARCHAR(50) DEFAULT 'UTC',

  -- Recipients
  recipients TEXT[], -- Array of emails
  export_format export_format DEFAULT 'pdf',

  -- Run tracking
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Report Exports (history of generated reports)
CREATE TABLE report_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scheduled_report_id UUID REFERENCES scheduled_reports(id) ON DELETE SET NULL,

  -- Export details
  name VARCHAR(255) NOT NULL,
  report_type report_type NOT NULL,
  format export_format NOT NULL,
  status export_status NOT NULL DEFAULT 'pending',

  -- Configuration used
  config JSONB NOT NULL DEFAULT '{}',

  -- Result
  file_url TEXT, -- Download URL (signed)
  file_size INTEGER,
  record_count INTEGER,
  error_message TEXT,

  -- Expiration
  expires_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Dashboards
CREATE TABLE dashboards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Configuration
  is_default BOOLEAN DEFAULT false,
  layout JSONB DEFAULT '{}', -- Grid layout configuration

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Dashboard Widgets
CREATE TABLE dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,

  -- Widget configuration
  type VARCHAR(50) NOT NULL, -- metric, chart, table, list
  title VARCHAR(255) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  -- config: {
  --   metric: 'email_sent',
  --   chartType: 'line',
  --   timeRange: '7d',
  --   filters: {}
  -- }

  -- Position in dashboard
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 1,
  height INTEGER NOT NULL DEFAULT 1,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily Metrics Rollup (pre-aggregated for performance)
CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Campaign (optional)
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Email metrics
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  unique_opens INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  emails_unsubscribed INTEGER DEFAULT 0,
  emails_marked_spam INTEGER DEFAULT 0,

  -- Lead metrics
  leads_created INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  leads_responded INTEGER DEFAULT 0,

  -- Rates (pre-calculated)
  delivery_rate DECIMAL(5,2),
  open_rate DECIMAL(5,2),
  click_rate DECIMAL(5,2),
  reply_rate DECIMAL(5,2),
  bounce_rate DECIMAL(5,2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, date, campaign_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Analytics events indexes
CREATE INDEX idx_analytics_events_workspace ON analytics_events(workspace_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_timestamp ON analytics_events(timestamp DESC);
CREATE INDEX idx_analytics_events_workspace_type ON analytics_events(workspace_id, event_type);
CREATE INDEX idx_analytics_events_workspace_timestamp ON analytics_events(workspace_id, timestamp DESC);
CREATE INDEX idx_analytics_events_campaign ON analytics_events(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_analytics_events_lead ON analytics_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_analytics_events_email ON analytics_events(email_id) WHERE email_id IS NOT NULL;

-- A/B tests indexes
CREATE INDEX idx_ab_tests_workspace ON ab_tests(workspace_id);
CREATE INDEX idx_ab_tests_campaign ON ab_tests(campaign_id);
CREATE INDEX idx_ab_tests_status ON ab_tests(status);
CREATE INDEX idx_ab_test_variants_test ON ab_test_variants(test_id);

-- Tracking indexes
CREATE INDEX idx_email_tracking_links_workspace ON email_tracking_links(workspace_id);
CREATE INDEX idx_email_tracking_links_email ON email_tracking_links(email_id);
CREATE INDEX idx_email_tracking_links_url ON email_tracking_links(tracking_url);
CREATE INDEX idx_email_opens_workspace ON email_opens(workspace_id);
CREATE INDEX idx_email_opens_email ON email_opens(email_id);
CREATE INDEX idx_email_opens_email_first ON email_opens(email_id) WHERE is_first_open = true;

-- Report indexes
CREATE INDEX idx_scheduled_reports_workspace ON scheduled_reports(workspace_id);
CREATE INDEX idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE schedule_enabled = true;
CREATE INDEX idx_report_exports_workspace ON report_exports(workspace_id);
CREATE INDEX idx_report_exports_status ON report_exports(status);

-- Dashboard indexes
CREATE INDEX idx_dashboards_workspace ON dashboards(workspace_id);
CREATE INDEX idx_dashboards_default ON dashboards(workspace_id) WHERE is_default = true;
CREATE INDEX idx_dashboard_widgets_dashboard ON dashboard_widgets(dashboard_id);

-- Daily metrics indexes
CREATE INDEX idx_daily_metrics_workspace ON daily_metrics(workspace_id);
CREATE INDEX idx_daily_metrics_date ON daily_metrics(date DESC);
CREATE INDEX idx_daily_metrics_workspace_date ON daily_metrics(workspace_id, date DESC);
CREATE INDEX idx_daily_metrics_campaign ON daily_metrics(campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

-- Analytics Events policies
CREATE POLICY "Users can view workspace analytics events"
  ON analytics_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert workspace analytics events"
  ON analytics_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- A/B Tests policies
CREATE POLICY "Users can view workspace ab tests"
  ON ab_tests FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage workspace ab tests"
  ON ab_tests FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- A/B Test Variants policies
CREATE POLICY "Users can view test variants"
  ON ab_test_variants FOR SELECT
  USING (
    test_id IN (
      SELECT id FROM ab_tests WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage test variants"
  ON ab_test_variants FOR ALL
  USING (
    test_id IN (
      SELECT id FROM ab_tests WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- Email tracking links policies
CREATE POLICY "Users can view workspace tracking links"
  ON email_tracking_links FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage tracking links"
  ON email_tracking_links FOR ALL
  USING (true)
  WITH CHECK (true);

-- Email opens policies
CREATE POLICY "Users can view workspace email opens"
  ON email_opens FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert email opens"
  ON email_opens FOR INSERT
  WITH CHECK (true);

-- Scheduled Reports policies
CREATE POLICY "Users can view workspace scheduled reports"
  ON scheduled_reports FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage workspace scheduled reports"
  ON scheduled_reports FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Report Exports policies
CREATE POLICY "Users can view workspace report exports"
  ON report_exports FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create workspace report exports"
  ON report_exports FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Dashboards policies
CREATE POLICY "Users can view workspace dashboards"
  ON dashboards FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage workspace dashboards"
  ON dashboards FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Dashboard Widgets policies
CREATE POLICY "Users can view dashboard widgets"
  ON dashboard_widgets FOR SELECT
  USING (
    dashboard_id IN (
      SELECT id FROM dashboards WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Members can manage dashboard widgets"
  ON dashboard_widgets FOR ALL
  USING (
    dashboard_id IN (
      SELECT id FROM dashboards WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Daily Metrics policies
CREATE POLICY "Users can view workspace daily metrics"
  ON daily_metrics FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to increment variant stats atomically
CREATE OR REPLACE FUNCTION increment_variant_stat(
  p_variant_id UUID,
  p_column TEXT
)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'UPDATE ab_test_variants SET %I = %I + 1, updated_at = NOW() WHERE id = $1',
    p_column, p_column
  ) USING p_variant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record email open
CREATE OR REPLACE FUNCTION record_email_open(
  p_workspace_id UUID,
  p_email_id UUID,
  p_campaign_id UUID,
  p_lead_id UUID,
  p_ip_address INET,
  p_user_agent TEXT
)
RETURNS TABLE(is_first_open BOOLEAN) AS $$
DECLARE
  v_existing_count INTEGER;
  v_is_first BOOLEAN;
BEGIN
  -- Check if this is the first open
  SELECT COUNT(*) INTO v_existing_count
  FROM email_opens
  WHERE email_id = p_email_id;

  v_is_first := v_existing_count = 0;

  -- Insert the open record
  INSERT INTO email_opens (
    workspace_id, email_id, campaign_id, lead_id,
    ip_address, user_agent, is_first_open
  ) VALUES (
    p_workspace_id, p_email_id, p_campaign_id, p_lead_id,
    p_ip_address, p_user_agent, v_is_first
  );

  RETURN QUERY SELECT v_is_first;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record click and increment counter
CREATE OR REPLACE FUNCTION record_link_click(
  p_tracking_url TEXT
)
RETURNS TABLE(original_url TEXT, workspace_id UUID, email_id UUID, campaign_id UUID, lead_id UUID) AS $$
DECLARE
  v_link RECORD;
BEGIN
  -- Get and update the link
  UPDATE email_tracking_links
  SET
    click_count = click_count + 1,
    first_clicked_at = COALESCE(first_clicked_at, NOW()),
    last_clicked_at = NOW()
  WHERE tracking_url = p_tracking_url
  RETURNING
    email_tracking_links.original_url,
    email_tracking_links.workspace_id,
    email_tracking_links.email_id,
    email_tracking_links.campaign_id,
    email_tracking_links.lead_id
  INTO v_link;

  IF v_link IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_link.original_url,
    v_link.workspace_id,
    v_link.email_id,
    v_link.campaign_id,
    v_link.lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to aggregate daily metrics
CREATE OR REPLACE FUNCTION aggregate_daily_metrics(
  p_workspace_id UUID,
  p_date DATE,
  p_campaign_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_sent INTEGER;
  v_delivered INTEGER;
  v_opened INTEGER;
  v_unique_opens INTEGER;
  v_clicked INTEGER;
  v_unique_clicks INTEGER;
  v_replied INTEGER;
  v_bounced INTEGER;
  v_unsubscribed INTEGER;
  v_spam INTEGER;
BEGIN
  -- Count events for the day
  SELECT
    COUNT(*) FILTER (WHERE event_type = 'email_sent'),
    COUNT(*) FILTER (WHERE event_type = 'email_delivered'),
    COUNT(*) FILTER (WHERE event_type = 'email_opened'),
    COUNT(DISTINCT email_id) FILTER (WHERE event_type = 'email_opened'),
    COUNT(*) FILTER (WHERE event_type = 'email_clicked'),
    COUNT(DISTINCT email_id) FILTER (WHERE event_type = 'email_clicked'),
    COUNT(*) FILTER (WHERE event_type = 'email_replied'),
    COUNT(*) FILTER (WHERE event_type = 'email_bounced'),
    COUNT(*) FILTER (WHERE event_type = 'email_unsubscribed'),
    COUNT(*) FILTER (WHERE event_type = 'email_marked_spam')
  INTO
    v_sent, v_delivered, v_opened, v_unique_opens,
    v_clicked, v_unique_clicks, v_replied, v_bounced,
    v_unsubscribed, v_spam
  FROM analytics_events
  WHERE workspace_id = p_workspace_id
    AND DATE(timestamp) = p_date
    AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id);

  -- Upsert the daily metrics
  INSERT INTO daily_metrics (
    workspace_id, date, campaign_id,
    emails_sent, emails_delivered, emails_opened, unique_opens,
    emails_clicked, unique_clicks, emails_replied, emails_bounced,
    emails_unsubscribed, emails_marked_spam,
    delivery_rate, open_rate, click_rate, reply_rate, bounce_rate
  ) VALUES (
    p_workspace_id, p_date, p_campaign_id,
    v_sent, v_delivered, v_opened, v_unique_opens,
    v_clicked, v_unique_clicks, v_replied, v_bounced,
    v_unsubscribed, v_spam,
    CASE WHEN v_sent > 0 THEN (v_delivered::DECIMAL / v_sent * 100) ELSE 0 END,
    CASE WHEN v_sent > 0 THEN (v_unique_opens::DECIMAL / v_sent * 100) ELSE 0 END,
    CASE WHEN v_sent > 0 THEN (v_unique_clicks::DECIMAL / v_sent * 100) ELSE 0 END,
    CASE WHEN v_sent > 0 THEN (v_replied::DECIMAL / v_sent * 100) ELSE 0 END,
    CASE WHEN v_sent > 0 THEN (v_bounced::DECIMAL / v_sent * 100) ELSE 0 END
  )
  ON CONFLICT (workspace_id, date, campaign_id)
  DO UPDATE SET
    emails_sent = EXCLUDED.emails_sent,
    emails_delivered = EXCLUDED.emails_delivered,
    emails_opened = EXCLUDED.emails_opened,
    unique_opens = EXCLUDED.unique_opens,
    emails_clicked = EXCLUDED.emails_clicked,
    unique_clicks = EXCLUDED.unique_clicks,
    emails_replied = EXCLUDED.emails_replied,
    emails_bounced = EXCLUDED.emails_bounced,
    emails_unsubscribed = EXCLUDED.emails_unsubscribed,
    emails_marked_spam = EXCLUDED.emails_marked_spam,
    delivery_rate = EXCLUDED.delivery_rate,
    open_rate = EXCLUDED.open_rate,
    click_rate = EXCLUDED.click_rate,
    reply_rate = EXCLUDED.reply_rate,
    bounce_rate = EXCLUDED.bounce_rate,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get report next run time
CREATE OR REPLACE FUNCTION calculate_next_run_time(
  p_frequency VARCHAR(20),
  p_day INTEGER,
  p_time TIME,
  p_timezone VARCHAR(50)
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
BEGIN
  v_now := NOW() AT TIME ZONE p_timezone;

  CASE p_frequency
    WHEN 'daily' THEN
      v_next := DATE(v_now) + p_time;
      IF v_next <= v_now THEN
        v_next := v_next + INTERVAL '1 day';
      END IF;
    WHEN 'weekly' THEN
      v_next := DATE(v_now) + p_time;
      -- Adjust to correct day of week
      v_next := v_next + (p_day - EXTRACT(DOW FROM v_next))::INTEGER * INTERVAL '1 day';
      IF v_next <= v_now THEN
        v_next := v_next + INTERVAL '1 week';
      END IF;
    WHEN 'monthly' THEN
      v_next := DATE_TRUNC('month', v_now) + (p_day - 1) * INTERVAL '1 day' + p_time;
      IF v_next <= v_now THEN
        v_next := v_next + INTERVAL '1 month';
      END IF;
    ELSE
      v_next := NULL;
  END CASE;

  RETURN v_next AT TIME ZONE p_timezone;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old analytics events
CREATE OR REPLACE FUNCTION cleanup_old_analytics_events(
  p_retention_days INTEGER DEFAULT 365
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM analytics_events
  WHERE timestamp < NOW() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger for ab_tests
CREATE TRIGGER update_ab_tests_updated_at
  BEFORE UPDATE ON ab_tests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for ab_test_variants
CREATE TRIGGER update_ab_test_variants_updated_at
  BEFORE UPDATE ON ab_test_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for scheduled_reports
CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON scheduled_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for dashboards
CREATE TRIGGER update_dashboards_updated_at
  BEFORE UPDATE ON dashboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for dashboard_widgets
CREATE TRIGGER update_dashboard_widgets_updated_at
  BEFORE UPDATE ON dashboard_widgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for daily_metrics
CREATE TRIGGER update_daily_metrics_updated_at
  BEFORE UPDATE ON daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL DATA
-- ============================================

-- No initial data needed for analytics tables

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE analytics_events IS 'Raw analytics events for all workspace activities';
COMMENT ON TABLE ab_tests IS 'A/B tests for email campaigns';
COMMENT ON TABLE ab_test_variants IS 'Variants within A/B tests';
COMMENT ON TABLE email_tracking_links IS 'Tracked links in emails for click analytics';
COMMENT ON TABLE email_opens IS 'Email open events for tracking';
COMMENT ON TABLE scheduled_reports IS 'Scheduled reports configuration';
COMMENT ON TABLE report_exports IS 'Generated report exports history';
COMMENT ON TABLE dashboards IS 'Custom analytics dashboards';
COMMENT ON TABLE dashboard_widgets IS 'Widgets within dashboards';
COMMENT ON TABLE daily_metrics IS 'Pre-aggregated daily metrics for performance';
