-- External Integrations Schema
-- Migration: 013_integrations.sql

-- Integration providers enum
CREATE TYPE integration_provider AS ENUM (
  'hubspot',
  'salesforce',
  'pipedrive',
  'zoho',
  'slack',
  'zapier',
  'make',
  'n8n',
  'webhook',
  'google_sheets',
  'airtable',
  'notion'
);

-- Integration types enum
CREATE TYPE integration_type AS ENUM (
  'crm',
  'notification',
  'automation',
  'spreadsheet',
  'webhook'
);

-- Integration status enum
CREATE TYPE integration_status AS ENUM (
  'pending',
  'connected',
  'disconnected',
  'error',
  'expired'
);

-- Sync direction enum
CREATE TYPE sync_direction AS ENUM (
  'inbound',
  'outbound',
  'bidirectional'
);

-- Webhook event types
CREATE TYPE webhook_event_type AS ENUM (
  'lead.created',
  'lead.updated',
  'lead.deleted',
  'lead.status_changed',
  'campaign.started',
  'campaign.paused',
  'campaign.completed',
  'email.sent',
  'email.opened',
  'email.clicked',
  'email.replied',
  'email.bounced',
  'email.unsubscribed',
  'sequence.completed',
  'sequence.step_completed',
  'mailbox.health_changed',
  'mailbox.warmup_completed',
  'all'
);

-- Webhook delivery status
CREATE TYPE webhook_delivery_status AS ENUM (
  'pending',
  'success',
  'failed'
);

-- ============================================
-- Integrations Table
-- ============================================
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Provider details
  provider integration_provider NOT NULL,
  type integration_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  status integration_status NOT NULL DEFAULT 'pending',

  -- Configuration
  config JSONB DEFAULT '{}',
  encrypted_credentials TEXT,

  -- Sync settings
  sync_settings JSONB,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(workspace_id, provider, name)
);

-- ============================================
-- OAuth States Table (for OAuth flow)
-- ============================================
CREATE TABLE oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,

  -- OAuth state
  state VARCHAR(255) NOT NULL UNIQUE,
  code_verifier VARCHAR(255),
  redirect_uri TEXT,
  scopes TEXT[],

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Webhooks Table
-- ============================================
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,

  -- Webhook details
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(255) NOT NULL,

  -- Events
  events webhook_event_type[] NOT NULL DEFAULT '{all}',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  headers JSONB DEFAULT '{}',
  retry_policy JSONB DEFAULT '{"maxRetries": 3, "retryDelayMs": 5000, "backoffMultiplier": 2}',

  -- Stats
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Webhook Deliveries Table
-- ============================================
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

  -- Delivery details
  event webhook_event_type NOT NULL,
  payload JSONB NOT NULL,

  -- Status
  status webhook_delivery_status NOT NULL DEFAULT 'pending',
  status_code INTEGER,
  response TEXT,

  -- Retry info
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Sync Jobs Table
-- ============================================
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Job details
  direction sync_direction NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',

  -- Progress
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Results
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,

  -- Errors
  errors JSONB DEFAULT '[]',

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Field Mappings Table
-- ============================================
CREATE TABLE field_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Mapping details
  source_field VARCHAR(255) NOT NULL,
  target_field VARCHAR(255) NOT NULL,
  transform VARCHAR(50),
  is_required BOOLEAN NOT NULL DEFAULT false,
  default_value TEXT,

  -- Order
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(integration_id, source_field, target_field)
);

-- ============================================
-- Integration Logs Table
-- ============================================
CREATE TABLE integration_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Log details
  action VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  message TEXT,
  details JSONB,

  -- Context
  sync_job_id UUID REFERENCES sync_jobs(id) ON DELETE SET NULL,
  record_id VARCHAR(255),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

-- Integrations indexes
CREATE INDEX idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_integrations_status ON integrations(status);
CREATE INDEX idx_integrations_type ON integrations(type);

-- OAuth states indexes
CREATE INDEX idx_oauth_states_state ON oauth_states(state);
CREATE INDEX idx_oauth_states_workspace ON oauth_states(workspace_id);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

-- Webhooks indexes
CREATE INDEX idx_webhooks_workspace ON webhooks(workspace_id);
CREATE INDEX idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);

-- Webhook deliveries indexes
CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);

-- Sync jobs indexes
CREATE INDEX idx_sync_jobs_integration ON sync_jobs(integration_id);
CREATE INDEX idx_sync_jobs_workspace ON sync_jobs(workspace_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_sync_jobs_created ON sync_jobs(created_at DESC);

-- Field mappings indexes
CREATE INDEX idx_field_mappings_integration ON field_mappings(integration_id);

-- Integration logs indexes
CREATE INDEX idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX idx_integration_logs_action ON integration_logs(action);
CREATE INDEX idx_integration_logs_created ON integration_logs(created_at DESC);
CREATE INDEX idx_integration_logs_sync_job ON integration_logs(sync_job_id)
  WHERE sync_job_id IS NOT NULL;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

-- Integrations policies
CREATE POLICY "Users can view workspace integrations"
  ON integrations FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage integrations"
  ON integrations FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- OAuth states policies
CREATE POLICY "Users can view own oauth states"
  ON oauth_states FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage oauth states"
  ON oauth_states FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Webhooks policies
CREATE POLICY "Users can view workspace webhooks"
  ON webhooks FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage webhooks"
  ON webhooks FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Webhook deliveries policies (via webhook)
CREATE POLICY "Users can view webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (
    webhook_id IN (
      SELECT id FROM webhooks
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Sync jobs policies
CREATE POLICY "Users can view sync jobs"
  ON sync_jobs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage sync jobs"
  ON sync_jobs FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Field mappings policies (via integration)
CREATE POLICY "Users can view field mappings"
  ON field_mappings FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM integrations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage field mappings"
  ON field_mappings FOR ALL
  USING (
    integration_id IN (
      SELECT id FROM integrations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- Integration logs policies (via integration)
CREATE POLICY "Users can view integration logs"
  ON integration_logs FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM integrations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================
-- Updated At Triggers
-- ============================================

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_deliveries_updated_at
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_jobs_updated_at
  BEFORE UPDATE ON sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_field_mappings_updated_at
  BEFORE UPDATE ON field_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to cleanup expired oauth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_states
  WHERE expires_at < NOW()
  RETURNING COUNT(*) INTO deleted_count;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending webhook deliveries for retry
CREATE OR REPLACE FUNCTION get_pending_webhook_deliveries(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  delivery_id UUID,
  webhook_id UUID,
  webhook_url TEXT,
  webhook_secret VARCHAR,
  webhook_headers JSONB,
  event webhook_event_type,
  payload JSONB,
  attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wd.id AS delivery_id,
    wd.webhook_id,
    w.url AS webhook_url,
    w.secret AS webhook_secret,
    w.headers AS webhook_headers,
    wd.event,
    wd.payload,
    wd.attempts
  FROM webhook_deliveries wd
  JOIN webhooks w ON w.id = wd.webhook_id
  WHERE wd.status = 'pending'
    AND w.is_active = true
    AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
  ORDER BY wd.created_at
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to log integration activity
CREATE OR REPLACE FUNCTION log_integration_activity(
  p_integration_id UUID,
  p_action VARCHAR,
  p_status VARCHAR,
  p_message TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_sync_job_id UUID DEFAULT NULL,
  p_record_id VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO integration_logs (
    integration_id,
    action,
    status,
    message,
    details,
    sync_job_id,
    record_id
  ) VALUES (
    p_integration_id,
    p_action,
    p_status,
    p_message,
    p_details,
    p_sync_job_id,
    p_record_id
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get integration sync stats
CREATE OR REPLACE FUNCTION get_integration_sync_stats(
  p_integration_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_syncs BIGINT,
  successful_syncs BIGINT,
  failed_syncs BIGINT,
  total_records_synced BIGINT,
  total_errors BIGINT,
  last_sync_at TIMESTAMPTZ,
  avg_sync_duration INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_syncs,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS successful_syncs,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed_syncs,
    COALESCE(SUM(records_created + records_updated), 0)::BIGINT AS total_records_synced,
    COALESCE(SUM(records_failed), 0)::BIGINT AS total_errors,
    MAX(completed_at) AS last_sync_at,
    AVG(completed_at - started_at) AS avg_sync_duration
  FROM sync_jobs
  WHERE integration_id = p_integration_id
    AND created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE integrations IS 'External service integrations for CRM, notifications, and automation';
COMMENT ON TABLE webhooks IS 'Outgoing webhooks to notify external systems of events';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempts and status';
COMMENT ON TABLE sync_jobs IS 'Data synchronization jobs between integrations and local data';
COMMENT ON TABLE field_mappings IS 'Field mapping configurations for data sync';
COMMENT ON TABLE integration_logs IS 'Activity logs for integration operations';
