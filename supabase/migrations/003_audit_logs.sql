-- Audit logs table for security-sensitive operations
-- This migration creates the audit_logs table for tracking user actions

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their org's audit logs
CREATE POLICY "Users can read org audit logs"
  ON audit_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE id = auth.uid()
    )
  );

-- RLS Policy: Allow insert from authenticated users (for their own actions)
CREATE POLICY "Users can create audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

-- Service role can always insert (for server-side logging)
-- This is handled automatically by Supabase service role

-- Comment on table for documentation
COMMENT ON TABLE audit_logs IS 'Stores security audit trail for sensitive operations';
COMMENT ON COLUMN audit_logs.action IS 'Type of action: create, read, update, delete, login, logout, api_key_create, api_key_revoke, etc.';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource: user, organization, campaign, lead, email_account, domain, mailbox, api_key, webhook, settings';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN audit_logs.details IS 'Additional context about the action';
COMMENT ON COLUMN audit_logs.ip_address IS 'IP address of the request';
COMMENT ON COLUMN audit_logs.user_agent IS 'User agent string of the client';
