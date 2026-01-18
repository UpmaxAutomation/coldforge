-- Migration: 015_api.sql
-- Description: Public API infrastructure - API keys, OAuth, webhooks, logs
-- Created: 2025-01-17

-- =====================================================
-- ENUMS
-- =====================================================

-- API key status
CREATE TYPE api_key_status AS ENUM ('active', 'revoked', 'expired');

-- OAuth grant types
CREATE TYPE oauth_grant_type AS ENUM ('authorization_code', 'refresh_token', 'client_credentials');

-- Webhook delivery status
CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'delivered', 'failed');

-- =====================================================
-- API KEYS TABLE
-- =====================================================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL, -- First 16 chars for identification
  key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of permission strings
  status api_key_status NOT NULL DEFAULT 'active',
  rate_limit INTEGER NOT NULL DEFAULT 60, -- Requests per minute
  last_used_at TIMESTAMPTZ,
  last_used_ip VARCHAR(45), -- IPv6 max length
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_status ON api_keys(status);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_workspace_policy ON api_keys
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- OAUTH CLIENTS TABLE
-- =====================================================

CREATE TABLE oauth_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  client_id VARCHAR(64) NOT NULL UNIQUE,
  client_secret_hash VARCHAR(64) NOT NULL,
  redirect_uris JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_grant_types JSONB NOT NULL DEFAULT '["authorization_code", "refresh_token"]'::jsonb,
  is_confidential BOOLEAN NOT NULL DEFAULT true,
  logo_url VARCHAR(500),
  homepage_url VARCHAR(500),
  privacy_policy_url VARCHAR(500),
  terms_of_service_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_oauth_clients_workspace ON oauth_clients(workspace_id);
CREATE INDEX idx_oauth_clients_client_id ON oauth_clients(client_id);

-- RLS
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY oauth_clients_workspace_policy ON oauth_clients
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- OAUTH AUTHORIZATION CODES TABLE
-- =====================================================

CREATE TABLE oauth_authorization_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id VARCHAR(64) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code VARCHAR(255) NOT NULL UNIQUE,
  code_challenge VARCHAR(255),
  code_challenge_method VARCHAR(10), -- 'plain' or 'S256'
  scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  redirect_uri VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_oauth_auth_codes_code ON oauth_authorization_codes(code);
CREATE INDEX idx_oauth_auth_codes_expires ON oauth_authorization_codes(expires_at);

-- Auto-cleanup expired codes
CREATE INDEX idx_oauth_auth_codes_cleanup ON oauth_authorization_codes(expires_at)
  WHERE expires_at < NOW();

-- =====================================================
-- OAUTH ACCESS TOKENS TABLE
-- =====================================================

CREATE TABLE oauth_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id VARCHAR(64) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  access_token VARCHAR(255) NOT NULL UNIQUE,
  refresh_token VARCHAR(255) UNIQUE,
  scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_oauth_tokens_access ON oauth_access_tokens(access_token);
CREATE INDEX idx_oauth_tokens_refresh ON oauth_access_tokens(refresh_token);
CREATE INDEX idx_oauth_tokens_client ON oauth_access_tokens(client_id);
CREATE INDEX idx_oauth_tokens_user ON oauth_access_tokens(user_id);
CREATE INDEX idx_oauth_tokens_expires ON oauth_access_tokens(expires_at);

-- =====================================================
-- DEVELOPER WEBHOOKS TABLE
-- =====================================================

CREATE TABLE developer_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  secret VARCHAR(100) NOT NULL, -- For signature verification
  events JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of event types
  is_active BOOLEAN NOT NULL DEFAULT true,
  version VARCHAR(20) NOT NULL DEFAULT '2025-01-01',
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_developer_webhooks_workspace ON developer_webhooks(workspace_id);
CREATE INDEX idx_developer_webhooks_active ON developer_webhooks(is_active);
CREATE INDEX idx_developer_webhooks_events ON developer_webhooks USING GIN(events);

-- RLS
ALTER TABLE developer_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY developer_webhooks_workspace_policy ON developer_webhooks
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- WEBHOOK DELIVERY QUEUE TABLE
-- =====================================================

CREATE TABLE webhook_delivery_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES developer_webhooks(id) ON DELETE CASCADE,
  payload_id VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status webhook_delivery_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(webhook_id, payload_id)
);

-- Indexes
CREATE INDEX idx_webhook_queue_status ON webhook_delivery_queue(status);
CREATE INDEX idx_webhook_queue_next_attempt ON webhook_delivery_queue(next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX idx_webhook_queue_webhook ON webhook_delivery_queue(webhook_id);

-- =====================================================
-- WEBHOOK DELIVERY ATTEMPTS TABLE
-- =====================================================

CREATE TABLE webhook_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES developer_webhooks(id) ON DELETE CASCADE,
  payload_id VARCHAR(50) NOT NULL,
  attempt INTEGER NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  error TEXT,
  duration INTEGER NOT NULL, -- milliseconds
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_webhook_attempts_webhook ON webhook_delivery_attempts(webhook_id);
CREATE INDEX idx_webhook_attempts_payload ON webhook_delivery_attempts(payload_id);
CREATE INDEX idx_webhook_attempts_created ON webhook_delivery_attempts(created_at);

-- =====================================================
-- API LOGS TABLE
-- =====================================================

CREATE TABLE api_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  oauth_token_id UUID REFERENCES oauth_access_tokens(id) ON DELETE SET NULL,
  request_id VARCHAR(50) NOT NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  query_params JSONB,
  request_body JSONB,
  status_code INTEGER NOT NULL,
  response_body JSONB,
  duration INTEGER NOT NULL, -- milliseconds
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  error_code VARCHAR(50),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX idx_api_logs_workspace ON api_logs(workspace_id);
CREATE INDEX idx_api_logs_api_key ON api_logs(api_key_id);
CREATE INDEX idx_api_logs_created ON api_logs(created_at);
CREATE INDEX idx_api_logs_status ON api_logs(status_code);
CREATE INDEX idx_api_logs_path ON api_logs(path);
CREATE INDEX idx_api_logs_request_id ON api_logs(request_id);

-- Partition by month for large datasets (optional - comment out if not needed)
-- CREATE INDEX idx_api_logs_partition ON api_logs(created_at, workspace_id);

-- RLS (read-only for users, full access for service role)
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_logs_read_policy ON api_logs
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to auto-expire API keys
CREATE OR REPLACE FUNCTION expire_api_keys()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE api_keys
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired authorization codes
CREATE OR REPLACE FUNCTION cleanup_expired_auth_codes()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_authorization_codes
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired access tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_access_tokens
  WHERE expires_at < NOW()
    AND (refresh_expires_at IS NULL OR refresh_expires_at < NOW());

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old API logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_api_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_logs
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old webhook delivery attempts (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_attempts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_delivery_attempts
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get API key usage statistics
CREATE OR REPLACE FUNCTION get_api_key_stats(
  p_api_key_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_requests BIGINT,
  successful_requests BIGINT,
  failed_requests BIGINT,
  avg_duration NUMERIC,
  requests_by_day JSONB,
  top_endpoints JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(
      NOW() - (p_days || ' days')::INTERVAL,
      NOW(),
      '1 day'::INTERVAL
    )::DATE as date
  ),
  daily_stats AS (
    SELECT
      DATE(created_at) as date,
      COUNT(*) as count
    FROM api_logs
    WHERE api_key_id = p_api_key_id
      AND created_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE(created_at)
  ),
  endpoint_stats AS (
    SELECT
      path,
      COUNT(*) as count
    FROM api_logs
    WHERE api_key_id = p_api_key_id
      AND created_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY path
    ORDER BY count DESC
    LIMIT 10
  )
  SELECT
    COALESCE(SUM(CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END), 0) as total_requests,
    COALESCE(SUM(CASE WHEN l.status_code >= 200 AND l.status_code < 300 THEN 1 ELSE 0 END), 0) as successful_requests,
    COALESCE(SUM(CASE WHEN l.status_code >= 400 THEN 1 ELSE 0 END), 0) as failed_requests,
    COALESCE(AVG(l.duration), 0) as avg_duration,
    (
      SELECT jsonb_object_agg(d.date, COALESCE(ds.count, 0))
      FROM date_range d
      LEFT JOIN daily_stats ds ON d.date = ds.date
    ) as requests_by_day,
    (
      SELECT jsonb_agg(jsonb_build_object('endpoint', es.path, 'count', es.count))
      FROM endpoint_stats es
    ) as top_endpoints
  FROM api_logs l
  WHERE l.api_key_id = p_api_key_id
    AND l.created_at > NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment webhook failure count
CREATE OR REPLACE FUNCTION increment_webhook_failures(p_webhook_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE developer_webhooks
  SET
    failure_count = failure_count + 1,
    last_failure_at = NOW(),
    -- Auto-disable after 10 consecutive failures
    is_active = CASE WHEN failure_count >= 9 THEN false ELSE is_active END,
    updated_at = NOW()
  WHERE id = p_webhook_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset webhook failure count on success
CREATE OR REPLACE FUNCTION reset_webhook_failures(p_webhook_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE developer_webhooks
  SET
    failure_count = 0,
    last_success_at = NOW(),
    last_triggered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_webhook_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated at triggers
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_clients_updated_at
  BEFORE UPDATE ON oauth_clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_developer_webhooks_updated_at
  BEFORE UPDATE ON developer_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_queue_updated_at
  BEFORE UPDATE ON webhook_delivery_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- GRANTS (for service role access)
-- =====================================================

-- Service role needs full access for API operations
GRANT ALL ON api_keys TO service_role;
GRANT ALL ON oauth_clients TO service_role;
GRANT ALL ON oauth_authorization_codes TO service_role;
GRANT ALL ON oauth_access_tokens TO service_role;
GRANT ALL ON developer_webhooks TO service_role;
GRANT ALL ON webhook_delivery_queue TO service_role;
GRANT ALL ON webhook_delivery_attempts TO service_role;
GRANT ALL ON api_logs TO service_role;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE api_keys IS 'Developer API keys for programmatic access';
COMMENT ON TABLE oauth_clients IS 'OAuth 2.0 application registrations';
COMMENT ON TABLE oauth_authorization_codes IS 'Short-lived authorization codes for OAuth flow';
COMMENT ON TABLE oauth_access_tokens IS 'OAuth 2.0 access and refresh tokens';
COMMENT ON TABLE developer_webhooks IS 'Webhook endpoints registered by developers';
COMMENT ON TABLE webhook_delivery_queue IS 'Queue for pending webhook deliveries';
COMMENT ON TABLE webhook_delivery_attempts IS 'History of webhook delivery attempts';
COMMENT ON TABLE api_logs IS 'Audit log of all API requests';
