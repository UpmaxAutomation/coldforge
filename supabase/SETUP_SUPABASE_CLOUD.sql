-- ============================================
-- InstantScale Database Setup
-- Copy and paste this ENTIRE file into Supabase SQL Editor
-- ============================================

-- PART 1: SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations (tenants)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'agency')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  avatar_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Accounts
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'smtp')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'warming')),
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_username TEXT,
  smtp_password_encrypted TEXT,
  imap_host TEXT,
  imap_port INTEGER,
  oauth_tokens_encrypted JSONB,
  daily_limit INTEGER DEFAULT 50,
  sent_today INTEGER DEFAULT 0,
  warmup_enabled BOOLEAN DEFAULT false,
  warmup_progress INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 100,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Domains
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  registrar TEXT CHECK (registrar IN ('cloudflare', 'namecheap', 'porkbun', 'manual')),
  registrar_domain_id TEXT,
  dns_provider TEXT DEFAULT 'cloudflare',
  dns_zone_id TEXT,
  spf_configured BOOLEAN DEFAULT false,
  dkim_configured BOOLEAN DEFAULT false,
  dkim_selector TEXT,
  dkim_private_key_encrypted TEXT,
  dmarc_configured BOOLEAN DEFAULT false,
  bimi_configured BOOLEAN DEFAULT false,
  health_status TEXT DEFAULT 'pending' CHECK (health_status IN ('healthy', 'warning', 'error', 'pending')),
  last_health_check TIMESTAMPTZ,
  auto_purchased BOOLEAN DEFAULT false,
  purchase_price DECIMAL(10,2),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead Lists
CREATE TABLE lead_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  lead_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  list_id UUID REFERENCES lead_lists(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  title TEXT,
  phone TEXT,
  linkedin_url TEXT,
  custom_fields JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained')),
  validation_status TEXT CHECK (validation_status IN ('valid', 'invalid', 'risky', 'unknown')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  settings JSONB DEFAULT '{
    "timezone": "America/New_York",
    "send_days": ["mon", "tue", "wed", "thu", "fri"],
    "send_hours_start": 9,
    "send_hours_end": 17,
    "daily_limit": 100,
    "min_delay_minutes": 60,
    "max_delay_minutes": 180
  }',
  stats JSONB DEFAULT '{
    "sent": 0,
    "opened": 0,
    "clicked": 0,
    "replied": 0,
    "bounced": 0
  }',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Sequences (email steps)
CREATE TABLE campaign_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  delay_days INTEGER DEFAULT 1,
  delay_hours INTEGER DEFAULT 0,
  condition_type TEXT DEFAULT 'always' CHECK (condition_type IN ('always', 'not_opened', 'not_replied', 'not_clicked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Leads (junction table)
CREATE TABLE campaign_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'replied', 'bounced', 'unsubscribed')),
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, lead_id)
);

-- Sent Emails (for tracking)
CREATE TABLE sent_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_lead_id UUID REFERENCES campaign_leads(id) ON DELETE SET NULL,
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'complained')),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_type TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Replies (unified inbox)
CREATE TABLE replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  sent_email_id UUID REFERENCES sent_emails(id) ON DELETE SET NULL,
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  category TEXT DEFAULT 'uncategorized' CHECK (category IN ('interested', 'not_interested', 'out_of_office', 'unsubscribe', 'uncategorized')),
  is_read BOOLEAN DEFAULT false,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Warmup Emails
CREATE TABLE warmup_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  to_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  message_id TEXT,
  subject TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'replied')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX idx_email_accounts_org ON email_accounts(organization_id);
CREATE INDEX idx_domains_org ON domains(organization_id);
CREATE INDEX idx_leads_org ON leads(organization_id);
CREATE INDEX idx_leads_list ON leads(list_id);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_campaigns_org ON campaigns(organization_id);
CREATE INDEX idx_campaign_sequences_campaign ON campaign_sequences(campaign_id);
CREATE INDEX idx_campaign_leads_campaign ON campaign_leads(campaign_id);
CREATE INDEX idx_campaign_leads_lead ON campaign_leads(lead_id);
CREATE INDEX idx_sent_emails_org ON sent_emails(organization_id);
CREATE INDEX idx_sent_emails_campaign ON sent_emails(campaign_id);
CREATE INDEX idx_replies_org ON replies(organization_id);
CREATE INDEX idx_replies_email_account ON replies(email_account_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_email_accounts_updated_at BEFORE UPDATE ON email_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_lead_lists_updated_at BEFORE UPDATE ON lead_lists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaign_sequences_updated_at BEFORE UPDATE ON campaign_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PART 2: ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_emails ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's organization ID
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to check if user is admin/owner
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Organizations policies
CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT USING (id = get_user_org_id());

CREATE POLICY "Owners can update their organization" ON organizations
  FOR UPDATE USING (
    id = get_user_org_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
  );

-- Allow creating organizations during signup
CREATE POLICY "Anyone can create organization" ON organizations
  FOR INSERT WITH CHECK (true);

-- Users policies
CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (organization_id = get_user_org_id() OR id = auth.uid());

CREATE POLICY "Users can update themselves" ON users
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Anyone can create user profile" ON users
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can delete org users" ON users
  FOR DELETE USING (
    organization_id = get_user_org_id() AND is_org_admin() AND id != auth.uid()
  );

-- Email accounts policies
CREATE POLICY "Users can view org email accounts" ON email_accounts
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert email accounts" ON email_accounts
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update email accounts" ON email_accounts
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "Users can delete email accounts" ON email_accounts
  FOR DELETE USING (organization_id = get_user_org_id());

-- Domains policies
CREATE POLICY "Users can view org domains" ON domains
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert domains" ON domains
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update domains" ON domains
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "Users can delete domains" ON domains
  FOR DELETE USING (organization_id = get_user_org_id());

-- Lead lists policies
CREATE POLICY "Users can view org lead lists" ON lead_lists
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert lead lists" ON lead_lists
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update lead lists" ON lead_lists
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "Users can delete lead lists" ON lead_lists
  FOR DELETE USING (organization_id = get_user_org_id());

-- Leads policies
CREATE POLICY "Users can view org leads" ON leads
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert leads" ON leads
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update leads" ON leads
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "Users can delete leads" ON leads
  FOR DELETE USING (organization_id = get_user_org_id());

-- Campaigns policies
CREATE POLICY "Users can view org campaigns" ON campaigns
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert campaigns" ON campaigns
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update campaigns" ON campaigns
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "Users can delete campaigns" ON campaigns
  FOR DELETE USING (organization_id = get_user_org_id());

-- Campaign sequences policies
CREATE POLICY "Users can view campaign sequences" ON campaign_sequences
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_sequences.campaign_id
      AND campaigns.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can insert campaign sequences" ON campaign_sequences
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_sequences.campaign_id
      AND campaigns.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can update campaign sequences" ON campaign_sequences
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_sequences.campaign_id
      AND campaigns.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can delete campaign sequences" ON campaign_sequences
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_sequences.campaign_id
      AND campaigns.organization_id = get_user_org_id()
    )
  );

-- Campaign leads policies
CREATE POLICY "Users can view campaign leads" ON campaign_leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_leads.campaign_id
      AND campaigns.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can insert campaign leads" ON campaign_leads
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_leads.campaign_id
      AND campaigns.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can update campaign leads" ON campaign_leads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_leads.campaign_id
      AND campaigns.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can delete campaign leads" ON campaign_leads
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_leads.campaign_id
      AND campaigns.organization_id = get_user_org_id()
    )
  );

-- Sent emails policies
CREATE POLICY "Users can view org sent emails" ON sent_emails
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert sent emails" ON sent_emails
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- Replies policies
CREATE POLICY "Users can view org replies" ON replies
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can update replies" ON replies
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert replies" ON replies
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- Warmup emails - users can view their accounts' warmup emails
CREATE POLICY "Users can view warmup emails" ON warmup_emails
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM email_accounts
      WHERE (email_accounts.id = warmup_emails.from_account_id
             OR email_accounts.id = warmup_emails.to_account_id)
      AND email_accounts.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can insert warmup emails" ON warmup_emails
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM email_accounts
      WHERE email_accounts.id = warmup_emails.from_account_id
      AND email_accounts.organization_id = get_user_org_id()
    )
  );

-- ============================================
-- SETUP COMPLETE!
-- ============================================
