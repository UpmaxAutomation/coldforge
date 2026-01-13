-- Row Level Security Policies for InstantScale
-- Ensures tenant isolation

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

-- Users policies
CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can update themselves" ON users
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admins can insert org users" ON users
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id() AND is_org_admin()
  );

CREATE POLICY "Admins can delete org users" ON users
  FOR DELETE USING (
    organization_id = get_user_org_id() AND is_org_admin() AND id != auth.uid()
  );

-- Email accounts policies
CREATE POLICY "Users can view org email accounts" ON email_accounts
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Admins can insert email accounts" ON email_accounts
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id() AND is_org_admin()
  );

CREATE POLICY "Admins can update email accounts" ON email_accounts
  FOR UPDATE USING (
    organization_id = get_user_org_id() AND is_org_admin()
  );

CREATE POLICY "Admins can delete email accounts" ON email_accounts
  FOR DELETE USING (
    organization_id = get_user_org_id() AND is_org_admin()
  );

-- Domains policies
CREATE POLICY "Users can view org domains" ON domains
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Admins can insert domains" ON domains
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id() AND is_org_admin()
  );

CREATE POLICY "Admins can update domains" ON domains
  FOR UPDATE USING (
    organization_id = get_user_org_id() AND is_org_admin()
  );

CREATE POLICY "Admins can delete domains" ON domains
  FOR DELETE USING (
    organization_id = get_user_org_id() AND is_org_admin()
  );

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

CREATE POLICY "System can insert sent emails" ON sent_emails
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- Replies policies
CREATE POLICY "Users can view org replies" ON replies
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Users can update replies" ON replies
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "System can insert replies" ON replies
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- Warmup emails - service role only, users can view
CREATE POLICY "Users can view warmup emails" ON warmup_emails
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM email_accounts
      WHERE (email_accounts.id = warmup_emails.from_account_id
             OR email_accounts.id = warmup_emails.to_account_id)
      AND email_accounts.organization_id = get_user_org_id()
    )
  );
