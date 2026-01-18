-- Migration: 009_mailbox_provisioning.sql
-- Description: Mailbox provisioning infrastructure for Google Workspace and Microsoft 365

-- Email provider configurations
CREATE TABLE IF NOT EXISTS email_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'custom')),
  config_name TEXT NOT NULL,

  -- OAuth credentials (encrypted)
  oauth_credentials_encrypted TEXT,

  -- API credentials (for service accounts)
  service_account_key_encrypted TEXT,

  -- Provider-specific settings
  domain TEXT NOT NULL,
  admin_email TEXT,
  customer_id TEXT, -- Google customer ID or Microsoft tenant ID

  -- Status
  is_active BOOLEAN DEFAULT true,
  verified_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,

  -- Limits
  mailbox_limit INTEGER DEFAULT 100,
  mailboxes_created INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, domain, provider)
);

-- Provisioned mailboxes
CREATE TABLE IF NOT EXISTS provisioned_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_config_id UUID NOT NULL REFERENCES email_provider_configs(id) ON DELETE CASCADE,
  domain_id UUID REFERENCES domain_purchases(id) ON DELETE SET NULL,

  -- Mailbox details
  email_address TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,

  -- Provider IDs
  provider_user_id TEXT, -- Google user ID or Microsoft user ID

  -- Credentials (encrypted)
  password_encrypted TEXT,
  recovery_email TEXT,
  recovery_phone TEXT,

  -- Profile
  profile_photo_url TEXT,
  signature_html TEXT,
  signature_plain TEXT,

  -- Aliases
  aliases TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'creating', 'active', 'suspended', 'deleted', 'error')),
  error_message TEXT,

  -- Warmup status
  warmup_status TEXT DEFAULT 'not_started' CHECK (warmup_status IN ('not_started', 'in_progress', 'completed', 'paused')),
  warmup_started_at TIMESTAMPTZ,
  warmup_completed_at TIMESTAMPTZ,

  -- Usage tracking
  emails_sent_today INTEGER DEFAULT 0,
  emails_sent_total INTEGER DEFAULT 0,
  last_sent_at TIMESTAMPTZ,

  -- Dates
  provisioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mailbox provisioning queue
CREATE TABLE IF NOT EXISTS mailbox_provisioning_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_config_id UUID NOT NULL REFERENCES email_provider_configs(id) ON DELETE CASCADE,

  -- Mailbox to create
  email_address TEXT NOT NULL,
  display_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  password TEXT, -- Will be encrypted after creation

  -- Options
  generate_aliases BOOLEAN DEFAULT true,
  alias_count INTEGER DEFAULT 2,
  set_profile_photo BOOLEAN DEFAULT true,
  set_signature BOOLEAN DEFAULT true,
  start_warmup BOOLEAN DEFAULT true,

  -- Queue status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority INTEGER DEFAULT 5, -- 1=highest, 10=lowest
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,

  -- Result
  provisioned_mailbox_id UUID REFERENCES provisioned_mailboxes(id),

  -- Timing
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Signature templates
CREATE TABLE IF NOT EXISTS signature_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  -- Template content
  html_template TEXT NOT NULL,
  plain_template TEXT NOT NULL,

  -- Variables supported
  variables JSONB DEFAULT '["firstName", "lastName", "email", "phone", "title", "company", "website"]'::JSONB,

  -- Default values
  default_values JSONB DEFAULT '{}'::JSONB,

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profile photos pool
CREATE TABLE IF NOT EXISTS profile_photos_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE, -- NULL for system defaults

  -- Photo details
  photo_url TEXT NOT NULL,
  photo_storage_path TEXT, -- If stored in our storage

  -- Classification
  gender TEXT CHECK (gender IN ('male', 'female', 'neutral')),
  style TEXT DEFAULT 'professional' CHECK (style IN ('professional', 'casual', 'creative')),

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Name generation patterns
CREATE TABLE IF NOT EXISTS name_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE, -- NULL for system defaults

  -- Pattern type
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('first_name', 'last_name', 'alias_prefix', 'alias_suffix')),

  -- Pattern value
  value TEXT NOT NULL,

  -- Classification
  gender TEXT CHECK (gender IN ('male', 'female', 'neutral')),
  region TEXT DEFAULT 'us', -- us, uk, generic

  -- Usage
  frequency_score INTEGER DEFAULT 5, -- 1-10, higher = more common
  times_used INTEGER DEFAULT 0,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bulk provisioning jobs
CREATE TABLE IF NOT EXISTS bulk_provisioning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_config_id UUID NOT NULL REFERENCES email_provider_configs(id) ON DELETE CASCADE,

  -- Job details
  name TEXT NOT NULL,
  mailbox_count INTEGER NOT NULL,

  -- Generation settings
  settings JSONB DEFAULT '{
    "generateNames": true,
    "namePattern": "realistic",
    "generateAliases": true,
    "aliasCount": 2,
    "setProfilePhotos": true,
    "setSignatures": true,
    "signatureTemplateId": null,
    "startWarmup": true
  }'::JSONB,

  -- Progress
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  total_count INTEGER NOT NULL,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,

  -- Results
  created_mailbox_ids UUID[] DEFAULT ARRAY[]::UUID[],
  errors JSONB DEFAULT '[]'::JSONB,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_completion TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provisioned_mailboxes_workspace ON provisioned_mailboxes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_provisioned_mailboxes_status ON provisioned_mailboxes(status);
CREATE INDEX IF NOT EXISTS idx_provisioned_mailboxes_email ON provisioned_mailboxes(email_address);
CREATE INDEX IF NOT EXISTS idx_provisioned_mailboxes_warmup ON provisioned_mailboxes(warmup_status);

CREATE INDEX IF NOT EXISTS idx_provisioning_queue_workspace ON mailbox_provisioning_queue(workspace_id);
CREATE INDEX IF NOT EXISTS idx_provisioning_queue_status ON mailbox_provisioning_queue(status);
CREATE INDEX IF NOT EXISTS idx_provisioning_queue_scheduled ON mailbox_provisioning_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_provisioning_queue_priority ON mailbox_provisioning_queue(priority, scheduled_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_workspace ON bulk_provisioning_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_provisioning_jobs(status);

CREATE INDEX IF NOT EXISTS idx_provider_configs_workspace ON email_provider_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_provider_configs_domain ON email_provider_configs(domain);

-- RLS Policies
ALTER TABLE email_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provisioned_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailbox_provisioning_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_photos_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE name_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_provisioning_jobs ENABLE ROW LEVEL SECURITY;

-- Provider configs policies
CREATE POLICY "Users can view their workspace provider configs"
  ON email_provider_configs FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their workspace provider configs"
  ON email_provider_configs FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Mailboxes policies
CREATE POLICY "Users can view their workspace mailboxes"
  ON provisioned_mailboxes FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their workspace mailboxes"
  ON provisioned_mailboxes FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Queue policies
CREATE POLICY "Users can view their workspace queue"
  ON mailbox_provisioning_queue FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their workspace queue"
  ON mailbox_provisioning_queue FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Templates policies
CREATE POLICY "Users can view their workspace templates"
  ON signature_templates FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their workspace templates"
  ON signature_templates FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Photos policies (includes system defaults)
CREATE POLICY "Users can view photos"
  ON profile_photos_pool FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their workspace photos"
  ON profile_photos_pool FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Names policies (includes system defaults)
CREATE POLICY "Users can view names"
  ON name_patterns FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Bulk jobs policies
CREATE POLICY "Users can view their workspace bulk jobs"
  ON bulk_provisioning_jobs FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their workspace bulk jobs"
  ON bulk_provisioning_jobs FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_mailbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_provisioned_mailboxes_updated_at
  BEFORE UPDATE ON provisioned_mailboxes
  FOR EACH ROW
  EXECUTE FUNCTION update_mailbox_updated_at();

CREATE TRIGGER trigger_update_email_provider_configs_updated_at
  BEFORE UPDATE ON email_provider_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_mailbox_updated_at();

CREATE TRIGGER trigger_update_signature_templates_updated_at
  BEFORE UPDATE ON signature_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_mailbox_updated_at();

CREATE TRIGGER trigger_update_bulk_provisioning_jobs_updated_at
  BEFORE UPDATE ON bulk_provisioning_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_mailbox_updated_at();

-- Seed some default name patterns
INSERT INTO name_patterns (pattern_type, value, gender, region, frequency_score) VALUES
-- Common first names
('first_name', 'James', 'male', 'us', 10),
('first_name', 'Michael', 'male', 'us', 10),
('first_name', 'Robert', 'male', 'us', 9),
('first_name', 'David', 'male', 'us', 9),
('first_name', 'John', 'male', 'us', 10),
('first_name', 'William', 'male', 'us', 8),
('first_name', 'Richard', 'male', 'us', 8),
('first_name', 'Joseph', 'male', 'us', 8),
('first_name', 'Thomas', 'male', 'us', 8),
('first_name', 'Christopher', 'male', 'us', 9),
('first_name', 'Mary', 'female', 'us', 10),
('first_name', 'Patricia', 'female', 'us', 9),
('first_name', 'Jennifer', 'female', 'us', 9),
('first_name', 'Linda', 'female', 'us', 8),
('first_name', 'Elizabeth', 'female', 'us', 9),
('first_name', 'Barbara', 'female', 'us', 8),
('first_name', 'Susan', 'female', 'us', 8),
('first_name', 'Jessica', 'female', 'us', 9),
('first_name', 'Sarah', 'female', 'us', 9),
('first_name', 'Karen', 'female', 'us', 8),
-- Common last names
('last_name', 'Smith', 'neutral', 'us', 10),
('last_name', 'Johnson', 'neutral', 'us', 10),
('last_name', 'Williams', 'neutral', 'us', 9),
('last_name', 'Brown', 'neutral', 'us', 9),
('last_name', 'Jones', 'neutral', 'us', 9),
('last_name', 'Garcia', 'neutral', 'us', 9),
('last_name', 'Miller', 'neutral', 'us', 9),
('last_name', 'Davis', 'neutral', 'us', 8),
('last_name', 'Rodriguez', 'neutral', 'us', 8),
('last_name', 'Martinez', 'neutral', 'us', 8),
('last_name', 'Wilson', 'neutral', 'us', 8),
('last_name', 'Anderson', 'neutral', 'us', 8),
('last_name', 'Taylor', 'neutral', 'us', 8),
('last_name', 'Thomas', 'neutral', 'us', 8),
('last_name', 'Moore', 'neutral', 'us', 7),
-- Alias patterns
('alias_prefix', 'sales', 'neutral', 'generic', 8),
('alias_prefix', 'info', 'neutral', 'generic', 7),
('alias_prefix', 'support', 'neutral', 'generic', 6),
('alias_prefix', 'contact', 'neutral', 'generic', 5),
('alias_suffix', '.leads', 'neutral', 'generic', 7),
('alias_suffix', '.biz', 'neutral', 'generic', 6),
('alias_suffix', '.pro', 'neutral', 'generic', 5)
ON CONFLICT DO NOTHING;

-- Default signature template
INSERT INTO signature_templates (workspace_id, name, description, html_template, plain_template, is_default) VALUES
(NULL, 'Professional Simple', 'Clean professional signature',
'<div style="font-family: Arial, sans-serif; color: #333;">
  <p style="margin: 0; font-weight: bold;">{{firstName}} {{lastName}}</p>
  <p style="margin: 4px 0; color: #666;">{{title}}</p>
  <p style="margin: 4px 0; color: #666;">{{company}}</p>
  <p style="margin: 8px 0;">
    <a href="mailto:{{email}}" style="color: #0066cc; text-decoration: none;">{{email}}</a>
    {{#if phone}} | {{phone}}{{/if}}
  </p>
  {{#if website}}
  <p style="margin: 4px 0;">
    <a href="{{website}}" style="color: #0066cc; text-decoration: none;">{{website}}</a>
  </p>
  {{/if}}
</div>',
'{{firstName}} {{lastName}}
{{title}}
{{company}}
{{email}}{{#if phone}} | {{phone}}{{/if}}
{{#if website}}{{website}}{{/if}}',
true)
ON CONFLICT DO NOTHING;
