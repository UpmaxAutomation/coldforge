-- White-Label & Agency System
-- Migration: 016_whitelabel.sql

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE agency_plan AS ENUM ('starter', 'professional', 'enterprise', 'custom');
CREATE TYPE agency_status AS ENUM ('active', 'suspended', 'trial', 'canceled');
CREATE TYPE sub_account_status AS ENUM ('active', 'suspended', 'trial', 'canceled');
CREATE TYPE custom_domain_type AS ENUM ('app', 'email', 'tracking');
CREATE TYPE custom_domain_status AS ENUM ('pending', 'verified', 'failed', 'expired');
CREATE TYPE ssl_status AS ENUM ('pending', 'active', 'failed', 'expired');
CREATE TYPE agency_role AS ENUM ('owner', 'admin', 'manager', 'support', 'billing');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE commission_status AS ENUM ('pending', 'processing', 'paid', 'canceled');
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============================================================================
-- AGENCIES TABLE
-- ============================================================================

CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan agency_plan NOT NULL DEFAULT 'starter',
  status agency_status NOT NULL DEFAULT 'active',
  settings JSONB NOT NULL DEFAULT '{
    "allowSubAccountCreation": true,
    "maxSubAccounts": 5,
    "allowCustomDomains": false,
    "allowWhitelabeling": false,
    "enableReselling": false,
    "defaultMailboxQuota": 5,
    "defaultLeadQuota": 10000,
    "defaultCampaignQuota": 5,
    "billingModel": "per-seat",
    "trialDays": 14,
    "autoSuspendOnOverage": false
  }'::jsonb,
  branding JSONB NOT NULL DEFAULT '{
    "primaryColor": "#2563eb",
    "secondaryColor": "#1e40af",
    "accentColor": "#3b82f6",
    "companyName": "ColdForge"
  }'::jsonb,
  limits JSONB NOT NULL DEFAULT '{
    "maxSubAccounts": 5,
    "maxUsersPerSubAccount": 3,
    "maxMailboxes": 25,
    "maxLeads": 50000,
    "maxCampaigns": 25,
    "maxEmailsPerMonth": 50000,
    "maxApiRequests": 10000,
    "maxStorageGb": 5,
    "maxCustomDomains": 1
  }'::jsonb,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agencies_owner ON agencies(owner_id);
CREATE INDEX idx_agencies_slug ON agencies(slug);
CREATE INDEX idx_agencies_status ON agencies(status);
CREATE INDEX idx_agencies_plan ON agencies(plan);

-- ============================================================================
-- SUB-ACCOUNTS TABLE
-- ============================================================================

CREATE TABLE sub_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status sub_account_status NOT NULL DEFAULT 'active',
  settings JSONB NOT NULL DEFAULT '{
    "allowExternalUsers": false,
    "requireApproval": true,
    "showAgencyBranding": true,
    "notificationEmails": [],
    "timezone": "UTC",
    "language": "en"
  }'::jsonb,
  limits JSONB NOT NULL DEFAULT '{
    "maxUsers": 5,
    "maxMailboxes": 5,
    "maxLeads": 10000,
    "maxCampaigns": 5,
    "maxEmailsPerMonth": 10000,
    "maxTemplates": 50,
    "maxSequences": 20
  }'::jsonb,
  usage JSONB NOT NULL DEFAULT '{
    "users": 0,
    "mailboxes": 0,
    "leads": 0,
    "campaigns": 0,
    "emailsSentThisMonth": 0,
    "templates": 0,
    "sequences": 0,
    "storageUsedMb": 0
  }'::jsonb,
  billing_override JSONB DEFAULT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id, slug)
);

CREATE INDEX idx_sub_accounts_agency ON sub_accounts(agency_id);
CREATE INDEX idx_sub_accounts_owner ON sub_accounts(owner_id);
CREATE INDEX idx_sub_accounts_status ON sub_accounts(status);

-- ============================================================================
-- AGENCY MEMBERS TABLE
-- ============================================================================

CREATE TABLE agency_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role agency_role NOT NULL DEFAULT 'support',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  sub_account_access TEXT NOT NULL DEFAULT 'none' CHECK (sub_account_access IN ('all', 'assigned', 'none')),
  assigned_sub_accounts UUID[] DEFAULT '{}',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id, user_id)
);

CREATE INDEX idx_agency_members_agency ON agency_members(agency_id);
CREATE INDEX idx_agency_members_user ON agency_members(user_id);
CREATE INDEX idx_agency_members_role ON agency_members(role);

-- ============================================================================
-- AGENCY INVITATIONS TABLE
-- ============================================================================

CREATE TABLE agency_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role agency_role NOT NULL DEFAULT 'support',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  sub_account_access TEXT NOT NULL DEFAULT 'none',
  assigned_sub_accounts UUID[] DEFAULT '{}',
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status invitation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agency_invitations_agency ON agency_invitations(agency_id);
CREATE INDEX idx_agency_invitations_email ON agency_invitations(email);
CREATE INDEX idx_agency_invitations_token ON agency_invitations(token);
CREATE INDEX idx_agency_invitations_status ON agency_invitations(status);

-- ============================================================================
-- SUB-ACCOUNT INVITATIONS TABLE
-- ============================================================================

CREATE TABLE sub_account_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_account_id UUID NOT NULL REFERENCES sub_accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status invitation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_account_invitations_sub_account ON sub_account_invitations(sub_account_id);
CREATE INDEX idx_sub_account_invitations_email ON sub_account_invitations(email);
CREATE INDEX idx_sub_account_invitations_token ON sub_account_invitations(token);

-- ============================================================================
-- CUSTOM DOMAINS TABLE
-- ============================================================================

CREATE TABLE custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  type custom_domain_type NOT NULL,
  status custom_domain_status NOT NULL DEFAULT 'pending',
  verification JSONB NOT NULL DEFAULT '{
    "method": "dns-txt",
    "token": "",
    "record": "",
    "value": "",
    "attempts": 0
  }'::jsonb,
  ssl_status ssl_status NOT NULL DEFAULT 'pending',
  settings JSONB NOT NULL DEFAULT '{
    "forceHttps": true,
    "redirectWww": true
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (agency_id IS NOT NULL OR workspace_id IS NOT NULL)
);

CREATE INDEX idx_custom_domains_agency ON custom_domains(agency_id);
CREATE INDEX idx_custom_domains_workspace ON custom_domains(workspace_id);
CREATE INDEX idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX idx_custom_domains_status ON custom_domains(status);
CREATE INDEX idx_custom_domains_type ON custom_domains(type);

-- ============================================================================
-- WHITE-LABEL EMAIL CONFIGS TABLE
-- ============================================================================

CREATE TABLE whitelabel_email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to TEXT,
  domain TEXT,
  dkim_selector TEXT,
  dkim_private_key TEXT,
  templates JSONB DEFAULT '{}',
  footer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whitelabel_email_configs_agency ON whitelabel_email_configs(agency_id);

-- ============================================================================
-- RESELLER CONFIGS TABLE
-- ============================================================================

CREATE TABLE reseller_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  markup NUMERIC NOT NULL DEFAULT 20 CHECK (markup >= 0 AND markup <= 100),
  custom_pricing JSONB DEFAULT '[]',
  commission_rate NUMERIC DEFAULT NULL CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)),
  payout_method TEXT CHECK (payout_method IN ('stripe', 'paypal', 'wire')),
  payout_details JSONB DEFAULT '{}',
  min_payout_amount NUMERIC NOT NULL DEFAULT 100,
  auto_payouts BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reseller_configs_agency ON reseller_configs(agency_id);

-- ============================================================================
-- RESELLER COMMISSIONS TABLE
-- ============================================================================

CREATE TABLE reseller_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  sub_account_id UUID NOT NULL REFERENCES sub_accounts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  period TEXT NOT NULL, -- YYYY-MM format
  description TEXT,
  status commission_status NOT NULL DEFAULT 'pending',
  payout_id UUID,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reseller_commissions_agency ON reseller_commissions(agency_id);
CREATE INDEX idx_reseller_commissions_sub_account ON reseller_commissions(sub_account_id);
CREATE INDEX idx_reseller_commissions_status ON reseller_commissions(status);
CREATE INDEX idx_reseller_commissions_period ON reseller_commissions(period);

-- ============================================================================
-- RESELLER PAYOUTS TABLE
-- ============================================================================

CREATE TABLE reseller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT NOT NULL,
  status payout_status NOT NULL DEFAULT 'pending',
  commission_ids UUID[] NOT NULL DEFAULT '{}',
  transaction_id TEXT,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reseller_payouts_agency ON reseller_payouts(agency_id);
CREATE INDEX idx_reseller_payouts_status ON reseller_payouts(status);

-- ============================================================================
-- AGENCY ACTIVITY LOG TABLE
-- ============================================================================

CREATE TABLE agency_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  actor_id UUID,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'api')),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agency_activity_logs_agency ON agency_activity_logs(agency_id);
CREATE INDEX idx_agency_activity_logs_actor ON agency_activity_logs(actor_id);
CREATE INDEX idx_agency_activity_logs_action ON agency_activity_logs(action);
CREATE INDEX idx_agency_activity_logs_resource ON agency_activity_logs(resource, resource_id);
CREATE INDEX idx_agency_activity_logs_created ON agency_activity_logs(created_at);

-- ============================================================================
-- AGENCY ANALYTICS TABLE
-- ============================================================================

CREATE TABLE agency_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- YYYY-MM format
  sub_account_metrics JSONB NOT NULL DEFAULT '{
    "total": 0,
    "active": 0,
    "suspended": 0,
    "new": 0,
    "churned": 0
  }'::jsonb,
  email_metrics JSONB NOT NULL DEFAULT '{
    "totalSent": 0,
    "delivered": 0,
    "opened": 0,
    "clicked": 0,
    "replied": 0,
    "bounced": 0
  }'::jsonb,
  revenue_metrics JSONB NOT NULL DEFAULT '{
    "mrr": 0,
    "arr": 0,
    "newRevenue": 0,
    "churnedRevenue": 0,
    "netRevenue": 0
  }'::jsonb,
  usage_metrics JSONB NOT NULL DEFAULT '{
    "totalMailboxes": 0,
    "totalLeads": 0,
    "totalCampaigns": 0,
    "apiRequests": 0,
    "storageUsedGb": 0
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id, period)
);

CREATE INDEX idx_agency_analytics_agency ON agency_analytics(agency_id);
CREATE INDEX idx_agency_analytics_period ON agency_analytics(period);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE whitelabel_email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_analytics ENABLE ROW LEVEL SECURITY;

-- Agencies policies
CREATE POLICY "Agency owners can manage their agency"
  ON agencies
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Agency members can view their agency"
  ON agencies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agency_members
      WHERE agency_members.agency_id = agencies.id
      AND agency_members.user_id = auth.uid()
    )
  );

-- Sub-accounts policies
CREATE POLICY "Agency owners can manage sub-accounts"
  ON sub_accounts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = sub_accounts.agency_id
      AND agencies.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = sub_accounts.agency_id
      AND agencies.owner_id = auth.uid()
    )
  );

CREATE POLICY "Agency members can view sub-accounts based on access"
  ON sub_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agency_members
      WHERE agency_members.agency_id = sub_accounts.agency_id
      AND agency_members.user_id = auth.uid()
      AND (
        agency_members.sub_account_access = 'all'
        OR (
          agency_members.sub_account_access = 'assigned'
          AND sub_accounts.id = ANY(agency_members.assigned_sub_accounts)
        )
      )
    )
  );

CREATE POLICY "Sub-account owners can manage their sub-account"
  ON sub_accounts
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Agency members policies
CREATE POLICY "Agency owners can manage members"
  ON agency_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = agency_members.agency_id
      AND agencies.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = agency_members.agency_id
      AND agencies.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own membership"
  ON agency_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Custom domains policies
CREATE POLICY "Agency owners can manage custom domains"
  ON custom_domains
  FOR ALL
  USING (
    agency_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = custom_domains.agency_id
      AND agencies.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    agency_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = custom_domains.agency_id
      AND agencies.owner_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can manage workspace domains"
  ON custom_domains
  FOR ALL
  USING (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = custom_domains.workspace_id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = custom_domains.workspace_id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin')
    )
  );

-- White-label email configs policies
CREATE POLICY "Agency owners can manage email configs"
  ON whitelabel_email_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = whitelabel_email_configs.agency_id
      AND agencies.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = whitelabel_email_configs.agency_id
      AND agencies.owner_id = auth.uid()
    )
  );

-- Reseller configs policies
CREATE POLICY "Agency owners can manage reseller config"
  ON reseller_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = reseller_configs.agency_id
      AND agencies.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = reseller_configs.agency_id
      AND agencies.owner_id = auth.uid()
    )
  );

-- Reseller commissions policies
CREATE POLICY "Agency owners can view commissions"
  ON reseller_commissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = reseller_commissions.agency_id
      AND agencies.owner_id = auth.uid()
    )
  );

-- Reseller payouts policies
CREATE POLICY "Agency owners can view payouts"
  ON reseller_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = reseller_payouts.agency_id
      AND agencies.owner_id = auth.uid()
    )
  );

-- Activity logs policies
CREATE POLICY "Agency members can view activity logs"
  ON agency_activity_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agency_members
      WHERE agency_members.agency_id = agency_activity_logs.agency_id
      AND agency_members.user_id = auth.uid()
    )
  );

-- Analytics policies
CREATE POLICY "Agency members can view analytics"
  ON agency_analytics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agency_members
      WHERE agency_members.agency_id = agency_analytics.agency_id
      AND agency_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check agency permission
CREATE OR REPLACE FUNCTION check_agency_permission(
  p_agency_id UUID,
  p_user_id UUID,
  p_permission TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_member agency_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member
  FROM agency_members
  WHERE agency_id = p_agency_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    -- Check if user is agency owner
    RETURN EXISTS (
      SELECT 1 FROM agencies
      WHERE id = p_agency_id AND owner_id = p_user_id
    );
  END IF;

  -- Owners and admins have all permissions
  IF v_member.role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Check specific permission
  RETURN p_permission = ANY(v_member.permissions);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get agency limits
CREATE OR REPLACE FUNCTION get_agency_limits(p_agency_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_agency agencies%ROWTYPE;
BEGIN
  SELECT * INTO v_agency FROM agencies WHERE id = p_agency_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_agency.limits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check sub-account limits
CREATE OR REPLACE FUNCTION check_sub_account_limit(
  p_sub_account_id UUID,
  p_resource TEXT,
  p_requested INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_sub_account sub_accounts%ROWTYPE;
  v_limit INTEGER;
  v_current INTEGER;
BEGIN
  SELECT * INTO v_sub_account FROM sub_accounts WHERE id = p_sub_account_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_limit := (v_sub_account.limits->>p_resource)::INTEGER;

  -- -1 means unlimited
  IF v_limit = -1 THEN
    RETURN TRUE;
  END IF;

  -- Get current usage
  CASE p_resource
    WHEN 'maxUsers' THEN v_current := (v_sub_account.usage->>'users')::INTEGER;
    WHEN 'maxMailboxes' THEN v_current := (v_sub_account.usage->>'mailboxes')::INTEGER;
    WHEN 'maxLeads' THEN v_current := (v_sub_account.usage->>'leads')::INTEGER;
    WHEN 'maxCampaigns' THEN v_current := (v_sub_account.usage->>'campaigns')::INTEGER;
    WHEN 'maxEmailsPerMonth' THEN v_current := (v_sub_account.usage->>'emailsSentThisMonth')::INTEGER;
    WHEN 'maxTemplates' THEN v_current := (v_sub_account.usage->>'templates')::INTEGER;
    WHEN 'maxSequences' THEN v_current := (v_sub_account.usage->>'sequences')::INTEGER;
    ELSE v_current := 0;
  END CASE;

  RETURN (v_current + p_requested) <= v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update sub-account usage
CREATE OR REPLACE FUNCTION update_sub_account_usage(
  p_sub_account_id UUID,
  p_resource TEXT,
  p_delta INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE sub_accounts
  SET
    usage = jsonb_set(
      usage,
      ARRAY[p_resource],
      to_jsonb(GREATEST(0, COALESCE((usage->>p_resource)::INTEGER, 0) + p_delta))
    ),
    updated_at = NOW()
  WHERE id = p_sub_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log agency activity
CREATE OR REPLACE FUNCTION log_agency_activity(
  p_agency_id UUID,
  p_actor_id UUID,
  p_actor_type TEXT,
  p_action TEXT,
  p_resource TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO agency_activity_logs (
    agency_id,
    actor_id,
    actor_type,
    action,
    resource,
    resource_id,
    details,
    ip_address,
    user_agent
  ) VALUES (
    p_agency_id,
    p_actor_id,
    p_actor_type,
    p_action,
    p_resource,
    p_resource_id,
    COALESCE(p_details, '{}'::jsonb),
    p_ip_address,
    p_user_agent
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate agency analytics
CREATE OR REPLACE FUNCTION calculate_agency_analytics(
  p_agency_id UUID,
  p_period TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_period TEXT;
  v_sub_account_metrics JSONB;
  v_email_metrics JSONB;
  v_usage_metrics JSONB;
BEGIN
  v_period := COALESCE(p_period, TO_CHAR(NOW(), 'YYYY-MM'));

  -- Calculate sub-account metrics
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'active', COUNT(*) FILTER (WHERE status = 'active'),
    'suspended', COUNT(*) FILTER (WHERE status = 'suspended'),
    'new', COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())),
    'churned', COUNT(*) FILTER (WHERE status = 'canceled' AND updated_at >= date_trunc('month', NOW()))
  ) INTO v_sub_account_metrics
  FROM sub_accounts
  WHERE agency_id = p_agency_id;

  -- Calculate usage metrics
  SELECT jsonb_build_object(
    'totalMailboxes', COALESCE(SUM((usage->>'mailboxes')::INTEGER), 0),
    'totalLeads', COALESCE(SUM((usage->>'leads')::INTEGER), 0),
    'totalCampaigns', COALESCE(SUM((usage->>'campaigns')::INTEGER), 0),
    'apiRequests', 0,
    'storageUsedGb', ROUND(COALESCE(SUM((usage->>'storageUsedMb')::NUMERIC), 0) / 1024, 2)
  ) INTO v_usage_metrics
  FROM sub_accounts
  WHERE agency_id = p_agency_id AND status = 'active';

  -- Insert or update analytics
  INSERT INTO agency_analytics (
    agency_id,
    period,
    sub_account_metrics,
    email_metrics,
    usage_metrics
  ) VALUES (
    p_agency_id,
    v_period,
    v_sub_account_metrics,
    '{}'::jsonb,
    v_usage_metrics
  )
  ON CONFLICT (agency_id, period) DO UPDATE SET
    sub_account_metrics = EXCLUDED.sub_account_metrics,
    usage_metrics = EXCLUDED.usage_metrics,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire agency invitations
CREATE OR REPLACE FUNCTION expire_agency_invitations() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE agency_invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire sub-account invitations
CREATE OR REPLACE FUNCTION expire_sub_account_invitations() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE sub_account_invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_whitelabel_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agencies_updated
  BEFORE UPDATE ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION update_whitelabel_timestamp();

CREATE TRIGGER trigger_sub_accounts_updated
  BEFORE UPDATE ON sub_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_whitelabel_timestamp();

CREATE TRIGGER trigger_agency_members_updated
  BEFORE UPDATE ON agency_members
  FOR EACH ROW
  EXECUTE FUNCTION update_whitelabel_timestamp();

CREATE TRIGGER trigger_custom_domains_updated
  BEFORE UPDATE ON custom_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_whitelabel_timestamp();

CREATE TRIGGER trigger_whitelabel_email_configs_updated
  BEFORE UPDATE ON whitelabel_email_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_whitelabel_timestamp();

CREATE TRIGGER trigger_reseller_configs_updated
  BEFORE UPDATE ON reseller_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_whitelabel_timestamp();

-- Log agency creation
CREATE OR REPLACE FUNCTION log_agency_creation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_agency_activity(
    NEW.id,
    NEW.owner_id,
    'user',
    'create',
    'agency',
    NEW.id,
    jsonb_build_object('name', NEW.name, 'plan', NEW.plan)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_agency_creation
  AFTER INSERT ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION log_agency_creation();

-- Log sub-account creation
CREATE OR REPLACE FUNCTION log_sub_account_creation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_agency_activity(
    NEW.agency_id,
    NEW.owner_id,
    'user',
    'create',
    'sub_account',
    NEW.id,
    jsonb_build_object('name', NEW.name, 'slug', NEW.slug)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_sub_account_creation
  AFTER INSERT ON sub_accounts
  FOR EACH ROW
  EXECUTE FUNCTION log_sub_account_creation();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- No initial data needed - agencies are created by users

COMMENT ON TABLE agencies IS 'Agencies that can manage multiple sub-accounts with white-label branding';
COMMENT ON TABLE sub_accounts IS 'Client workspaces managed by agencies';
COMMENT ON TABLE agency_members IS 'Team members within an agency with role-based access';
COMMENT ON TABLE custom_domains IS 'Custom domains for white-label branding';
COMMENT ON TABLE reseller_configs IS 'Configuration for reseller program (pricing, payouts)';
