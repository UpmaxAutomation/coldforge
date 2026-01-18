-- Migration: Domain Infrastructure for Auto-Purchase System
-- Phase 14: Domain Auto-Purchase System
-- Created: 2026-01-17

-- Domain purchases table
CREATE TABLE IF NOT EXISTS domain_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  tld TEXT NOT NULL,
  registrar TEXT DEFAULT 'cloudflare',
  cloudflare_domain_id TEXT,
  registration_date TIMESTAMPTZ DEFAULT NOW(),
  expiry_date TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT true,
  purchase_price DECIMAL(10,2),
  renewal_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  stripe_payment_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'transferred', 'cancelled')),
  nameservers JSONB DEFAULT '[]'::jsonb,
  whois_privacy BOOLEAN DEFAULT true,
  locked BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain)
);

-- DNS records table
CREATE TABLE IF NOT EXISTS domain_dns_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domain_purchases(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SPF', 'DKIM', 'DMARC', 'NS')),
  record_name TEXT NOT NULL,
  record_value TEXT NOT NULL,
  ttl INTEGER DEFAULT 3600,
  priority INTEGER, -- For MX records
  cloudflare_record_id TEXT,
  proxied BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DKIM keys table (encrypted storage)
CREATE TABLE IF NOT EXISTS dkim_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domain_purchases(id) ON DELETE CASCADE,
  selector TEXT NOT NULL DEFAULT 'coldforge',
  private_key_encrypted TEXT NOT NULL,
  public_key TEXT NOT NULL,
  algorithm TEXT DEFAULT 'rsa-sha256',
  key_size INTEGER DEFAULT 2048,
  dns_record_id UUID REFERENCES domain_dns_records(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE(domain_id, selector)
);

-- Domain health checks table
CREATE TABLE IF NOT EXISTS domain_health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domain_purchases(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL CHECK (check_type IN ('dns_propagation', 'spf', 'dkim', 'dmarc', 'mx', 'blacklist', 'ssl', 'nameservers')),
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'warning', 'pending')),
  score INTEGER CHECK (score >= 0 AND score <= 100),
  details JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Domain health summary (materialized for dashboard)
CREATE TABLE IF NOT EXISTS domain_health_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domain_purchases(id) ON DELETE CASCADE,
  overall_score INTEGER DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  spf_status TEXT DEFAULT 'pending',
  dkim_status TEXT DEFAULT 'pending',
  dmarc_status TEXT DEFAULT 'pending',
  mx_status TEXT DEFAULT 'pending',
  blacklist_status TEXT DEFAULT 'pending',
  dns_propagated BOOLEAN DEFAULT false,
  ready_to_send BOOLEAN DEFAULT false,
  issues JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  last_full_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain_id)
);

-- Domain age tracking view
CREATE OR REPLACE VIEW domain_age_view AS
SELECT
  dp.id,
  dp.domain,
  dp.organization_id,
  dp.registration_date,
  dp.status,
  EXTRACT(DAY FROM (NOW() - dp.registration_date))::INTEGER as age_days,
  CASE
    WHEN EXTRACT(DAY FROM (NOW() - dp.registration_date)) < 14 THEN 'critical'
    WHEN EXTRACT(DAY FROM (NOW() - dp.registration_date)) < 30 THEN 'warning'
    ELSE 'safe'
  END as age_status,
  CASE
    WHEN EXTRACT(DAY FROM (NOW() - dp.registration_date)) < 14 THEN 'Domain is too new. Wait at least 14 days before sending.'
    WHEN EXTRACT(DAY FROM (NOW() - dp.registration_date)) < 30 THEN 'Domain is relatively new. Proceed with caution and low volume.'
    ELSE 'Domain age is sufficient for cold outreach.'
  END as age_recommendation,
  dhs.overall_score as health_score,
  dhs.ready_to_send
FROM domain_purchases dp
LEFT JOIN domain_health_summary dhs ON dp.id = dhs.domain_id;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_domain_purchases_org ON domain_purchases(organization_id);
CREATE INDEX IF NOT EXISTS idx_domain_purchases_status ON domain_purchases(status);
CREATE INDEX IF NOT EXISTS idx_domain_purchases_domain ON domain_purchases(domain);
CREATE INDEX IF NOT EXISTS idx_domain_dns_records_domain ON domain_dns_records(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_dns_records_type ON domain_dns_records(record_type);
CREATE INDEX IF NOT EXISTS idx_dkim_keys_domain ON dkim_keys(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_health_checks_domain ON domain_health_checks(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_health_checks_type ON domain_health_checks(check_type);

-- RLS Policies
ALTER TABLE domain_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_dns_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE dkim_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_health_summary ENABLE ROW LEVEL SECURITY;

-- Domain purchases policies
CREATE POLICY "Users can view their org domains" ON domain_purchases
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert domains" ON domain_purchases
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update domains" ON domain_purchases
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- DNS records policies
CREATE POLICY "Users can view their domain DNS" ON domain_dns_records
  FOR SELECT USING (
    domain_id IN (
      SELECT id FROM domain_purchases WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can manage DNS records" ON domain_dns_records
  FOR ALL USING (true);

-- DKIM keys policies (restricted - only admins)
CREATE POLICY "Admins can view DKIM keys" ON dkim_keys
  FOR SELECT USING (
    domain_id IN (
      SELECT id FROM domain_purchases WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "System can manage DKIM keys" ON dkim_keys
  FOR ALL USING (true);

-- Health checks policies
CREATE POLICY "Users can view domain health" ON domain_health_checks
  FOR SELECT USING (
    domain_id IN (
      SELECT id FROM domain_purchases WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can manage health checks" ON domain_health_checks
  FOR ALL USING (true);

-- Health summary policies
CREATE POLICY "Users can view health summary" ON domain_health_summary
  FOR SELECT USING (
    domain_id IN (
      SELECT id FROM domain_purchases WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can manage health summary" ON domain_health_summary
  FOR ALL USING (true);

-- Function to update domain health summary
CREATE OR REPLACE FUNCTION update_domain_health_summary()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO domain_health_summary (domain_id)
  VALUES (NEW.id)
  ON CONFLICT (domain_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create health summary on domain creation
DROP TRIGGER IF EXISTS trigger_create_health_summary ON domain_purchases;
CREATE TRIGGER trigger_create_health_summary
  AFTER INSERT ON domain_purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_domain_health_summary();

-- Function to calculate overall health score
CREATE OR REPLACE FUNCTION calculate_domain_health_score(p_domain_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_spf_ok BOOLEAN := false;
  v_dkim_ok BOOLEAN := false;
  v_dmarc_ok BOOLEAN := false;
  v_mx_ok BOOLEAN := false;
  v_blacklist_ok BOOLEAN := true;
  v_age_days INTEGER;
BEGIN
  -- Check SPF
  SELECT verified INTO v_spf_ok
  FROM domain_dns_records
  WHERE domain_id = p_domain_id AND record_type = 'SPF'
  ORDER BY created_at DESC LIMIT 1;

  IF v_spf_ok THEN v_score := v_score + 25; END IF;

  -- Check DKIM
  SELECT EXISTS(
    SELECT 1 FROM dkim_keys dk
    JOIN domain_dns_records ddr ON dk.dns_record_id = ddr.id
    WHERE dk.domain_id = p_domain_id AND dk.active = true AND ddr.verified = true
  ) INTO v_dkim_ok;

  IF v_dkim_ok THEN v_score := v_score + 25; END IF;

  -- Check DMARC
  SELECT verified INTO v_dmarc_ok
  FROM domain_dns_records
  WHERE domain_id = p_domain_id AND record_type = 'DMARC'
  ORDER BY created_at DESC LIMIT 1;

  IF v_dmarc_ok THEN v_score := v_score + 20; END IF;

  -- Check MX
  SELECT verified INTO v_mx_ok
  FROM domain_dns_records
  WHERE domain_id = p_domain_id AND record_type = 'MX'
  ORDER BY created_at DESC LIMIT 1;

  IF v_mx_ok THEN v_score := v_score + 10; END IF;

  -- Check blacklist status
  SELECT NOT EXISTS(
    SELECT 1 FROM domain_health_checks
    WHERE domain_id = p_domain_id
    AND check_type = 'blacklist'
    AND status = 'fail'
    AND checked_at > NOW() - INTERVAL '24 hours'
  ) INTO v_blacklist_ok;

  IF v_blacklist_ok THEN v_score := v_score + 10; END IF;

  -- Age bonus
  SELECT EXTRACT(DAY FROM (NOW() - registration_date))::INTEGER
  INTO v_age_days
  FROM domain_purchases WHERE id = p_domain_id;

  IF v_age_days >= 30 THEN
    v_score := v_score + 10;
  ELSIF v_age_days >= 14 THEN
    v_score := v_score + 5;
  END IF;

  RETURN LEAST(v_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_domain_purchases_updated_at
  BEFORE UPDATE ON domain_purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domain_dns_records_updated_at
  BEFORE UPDATE ON domain_dns_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domain_health_summary_updated_at
  BEFORE UPDATE ON domain_health_summary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
