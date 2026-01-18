-- IP & Reputation Management
-- Tables and functions for IP pool management, reputation scoring, and blacklist monitoring

-- Blacklist providers for monitoring
CREATE TABLE IF NOT EXISTS blacklist_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  check_url TEXT NOT NULL,
  check_type TEXT NOT NULL DEFAULT 'dns', -- dns, http, api
  priority INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common blacklist providers
INSERT INTO blacklist_providers (name, check_url, check_type, priority) VALUES
  ('Spamhaus ZEN', 'zen.spamhaus.org', 'dns', 1),
  ('Spamcop', 'bl.spamcop.net', 'dns', 2),
  ('Barracuda', 'b.barracudacentral.org', 'dns', 3),
  ('SORBS', 'dnsbl.sorbs.net', 'dns', 4),
  ('SpamRats', 'noptr.spamrats.com', 'dns', 5),
  ('UCEPROTECT L1', 'dnsbl-1.uceprotect.net', 'dns', 6),
  ('UCEPROTECT L2', 'dnsbl-2.uceprotect.net', 'dns', 7),
  ('PSBL', 'psbl.surriel.com', 'dns', 8),
  ('Mailspike', 'bl.mailspike.net', 'dns', 9),
  ('Invaluement', 'dnsbl.invaluement.com', 'dns', 10)
ON CONFLICT DO NOTHING;

-- IP blacklist check results
CREATE TABLE IF NOT EXISTS ip_blacklist_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_id UUID REFERENCES sending_ips(id) ON DELETE CASCADE,
  ip_address INET NOT NULL,
  provider_id UUID REFERENCES blacklist_providers(id),
  is_listed BOOLEAN DEFAULT false,
  listing_reason TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  delisting_url TEXT,
  auto_delist_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blacklist_checks_ip ON ip_blacklist_checks(ip_id, checked_at DESC);
CREATE INDEX idx_blacklist_checks_listed ON ip_blacklist_checks(is_listed) WHERE is_listed = true;

-- Domain reputation tracking
CREATE TABLE IF NOT EXISTS domain_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  reputation_score NUMERIC(5,2) DEFAULT 50.00, -- 0-100 scale
  google_reputation TEXT DEFAULT 'unknown', -- low, medium, high, unknown
  microsoft_reputation TEXT DEFAULT 'unknown',
  yahoo_reputation TEXT DEFAULT 'unknown',
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_complaints INTEGER DEFAULT 0,
  bounce_rate NUMERIC(5,2) DEFAULT 0,
  complaint_rate NUMERIC(5,2) DEFAULT 0,
  open_rate NUMERIC(5,2) DEFAULT 0,
  click_rate NUMERIC(5,2) DEFAULT 0,
  inbox_placement_rate NUMERIC(5,2) DEFAULT 0,
  spf_status TEXT DEFAULT 'unknown',
  dkim_status TEXT DEFAULT 'unknown',
  dmarc_status TEXT DEFAULT 'unknown',
  last_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, domain)
);

CREATE INDEX idx_domain_reputation_workspace ON domain_reputation(workspace_id);
CREATE INDEX idx_domain_reputation_score ON domain_reputation(reputation_score);

-- Mailbox reputation tracking
CREATE TABLE IF NOT EXISTS mailbox_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reputation_score NUMERIC(5,2) DEFAULT 50.00,
  health_status TEXT DEFAULT 'good', -- good, warning, critical
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_complaints INTEGER DEFAULT 0,
  total_opens INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_replies INTEGER DEFAULT 0,
  bounce_rate NUMERIC(5,2) DEFAULT 0,
  complaint_rate NUMERIC(5,2) DEFAULT 0,
  open_rate NUMERIC(5,2) DEFAULT 0,
  click_rate NUMERIC(5,2) DEFAULT 0,
  reply_rate NUMERIC(5,2) DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  last_bounced_at TIMESTAMPTZ,
  last_complaint_at TIMESTAMPTZ,
  consecutive_bounces INTEGER DEFAULT 0,
  is_quarantined BOOLEAN DEFAULT false,
  quarantine_reason TEXT,
  quarantine_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mailbox_reputation_mailbox ON mailbox_reputation(mailbox_id);
CREATE INDEX idx_mailbox_reputation_workspace ON mailbox_reputation(workspace_id);
CREATE INDEX idx_mailbox_reputation_health ON mailbox_reputation(health_status);
CREATE INDEX idx_mailbox_reputation_quarantine ON mailbox_reputation(is_quarantined) WHERE is_quarantined = true;

-- IP rotation rules
CREATE TABLE IF NOT EXISTS ip_rotation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL, -- round_robin, weighted, failover, domain_based, recipient_based
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 10,
  config JSONB DEFAULT '{}',
  -- For weighted rotation
  ip_weights JSONB DEFAULT '{}', -- { "ip_id": weight }
  -- For domain-based
  domain_mappings JSONB DEFAULT '{}', -- { "domain": "ip_id" }
  -- For recipient-based
  recipient_patterns JSONB DEFAULT '{}', -- { "pattern": "ip_id" }
  -- Rate limits per rule
  max_per_hour INTEGER,
  max_per_day INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ip_rotation_rules_workspace ON ip_rotation_rules(workspace_id);

-- IP assignment history (for troubleshooting)
CREATE TABLE IF NOT EXISTS ip_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ip_id UUID REFERENCES sending_ips(id) ON DELETE SET NULL,
  email_queue_id UUID,
  mailbox_id UUID,
  rotation_rule_id UUID REFERENCES ip_rotation_rules(id) ON DELETE SET NULL,
  assignment_reason TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ip_assignment_history_ip ON ip_assignment_history(ip_id, assigned_at DESC);
CREATE INDEX idx_ip_assignment_history_workspace ON ip_assignment_history(workspace_id, assigned_at DESC);

-- Reputation alerts
CREATE TABLE IF NOT EXISTS reputation_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- blacklist, high_bounce, high_complaint, reputation_drop, authentication_fail
  severity TEXT NOT NULL DEFAULT 'warning', -- info, warning, critical
  entity_type TEXT NOT NULL, -- ip, domain, mailbox
  entity_id TEXT NOT NULL,
  entity_value TEXT, -- The actual IP/domain/email
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reputation_alerts_workspace ON reputation_alerts(workspace_id);
CREATE INDEX idx_reputation_alerts_unresolved ON reputation_alerts(is_resolved, severity) WHERE is_resolved = false;
CREATE INDEX idx_reputation_alerts_type ON reputation_alerts(alert_type, created_at DESC);

-- Reputation recovery tasks
CREATE TABLE IF NOT EXISTS reputation_recovery_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- ip, domain, mailbox
  entity_id TEXT NOT NULL,
  entity_value TEXT,
  recovery_type TEXT NOT NULL, -- delisting, warmup_reset, rate_reduction, quarantine
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
  priority INTEGER DEFAULT 5,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actions_taken JSONB DEFAULT '[]',
  result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recovery_tasks_workspace ON reputation_recovery_tasks(workspace_id);
CREATE INDEX idx_recovery_tasks_status ON reputation_recovery_tasks(status) WHERE status IN ('pending', 'in_progress');

-- Function to calculate reputation score
CREATE OR REPLACE FUNCTION calculate_reputation_score(
  p_delivered INTEGER,
  p_bounced INTEGER,
  p_complaints INTEGER,
  p_opens INTEGER,
  p_clicks INTEGER,
  p_replies INTEGER
) RETURNS NUMERIC AS $$
DECLARE
  v_total INTEGER;
  v_delivery_score NUMERIC;
  v_engagement_score NUMERIC;
  v_complaint_penalty NUMERIC;
  v_bounce_penalty NUMERIC;
  v_final_score NUMERIC;
BEGIN
  v_total := p_delivered + p_bounced;
  IF v_total = 0 THEN
    RETURN 50.00; -- Default score for no data
  END IF;

  -- Delivery score (40% weight) - based on delivery rate
  v_delivery_score := (p_delivered::NUMERIC / v_total) * 40;

  -- Engagement score (40% weight) - based on opens, clicks, replies
  IF p_delivered > 0 THEN
    v_engagement_score := LEAST(
      ((p_opens::NUMERIC / p_delivered) * 15) +
      ((p_clicks::NUMERIC / p_delivered) * 15) +
      ((p_replies::NUMERIC / p_delivered) * 10),
      40
    );
  ELSE
    v_engagement_score := 0;
  END IF;

  -- Complaint penalty (up to -30 points)
  IF p_delivered > 0 THEN
    v_complaint_penalty := LEAST((p_complaints::NUMERIC / p_delivered) * 1000, 30);
  ELSE
    v_complaint_penalty := 0;
  END IF;

  -- Bounce penalty (up to -20 points)
  v_bounce_penalty := LEAST((p_bounced::NUMERIC / v_total) * 100, 20);

  -- Calculate final score (base 20 + delivery + engagement - penalties)
  v_final_score := 20 + v_delivery_score + v_engagement_score - v_complaint_penalty - v_bounce_penalty;

  -- Clamp to 0-100
  RETURN GREATEST(0, LEAST(100, v_final_score));
END;
$$ LANGUAGE plpgsql;

-- Function to update mailbox reputation
CREATE OR REPLACE FUNCTION update_mailbox_reputation(
  p_mailbox_id UUID,
  p_event_type TEXT
) RETURNS void AS $$
BEGIN
  -- Create or update mailbox reputation record
  INSERT INTO mailbox_reputation (mailbox_id, email, workspace_id)
  SELECT
    pm.id,
    pm.email,
    pm.workspace_id
  FROM provisioned_mailboxes pm
  WHERE pm.id = p_mailbox_id
  ON CONFLICT (mailbox_id)
  DO UPDATE SET updated_at = NOW();

  -- Update counters based on event type
  UPDATE mailbox_reputation
  SET
    total_sent = total_sent + CASE WHEN p_event_type = 'sent' THEN 1 ELSE 0 END,
    total_delivered = total_delivered + CASE WHEN p_event_type = 'delivered' THEN 1 ELSE 0 END,
    total_bounced = total_bounced + CASE WHEN p_event_type = 'bounced' THEN 1 ELSE 0 END,
    total_complaints = total_complaints + CASE WHEN p_event_type = 'complained' THEN 1 ELSE 0 END,
    total_opens = total_opens + CASE WHEN p_event_type = 'opened' THEN 1 ELSE 0 END,
    total_clicks = total_clicks + CASE WHEN p_event_type = 'clicked' THEN 1 ELSE 0 END,
    total_replies = total_replies + CASE WHEN p_event_type = 'replied' THEN 1 ELSE 0 END,
    last_sent_at = CASE WHEN p_event_type = 'sent' THEN NOW() ELSE last_sent_at END,
    last_bounced_at = CASE WHEN p_event_type = 'bounced' THEN NOW() ELSE last_bounced_at END,
    last_complaint_at = CASE WHEN p_event_type = 'complained' THEN NOW() ELSE last_complaint_at END,
    consecutive_bounces = CASE
      WHEN p_event_type = 'bounced' THEN consecutive_bounces + 1
      WHEN p_event_type = 'delivered' THEN 0
      ELSE consecutive_bounces
    END,
    updated_at = NOW()
  WHERE mailbox_id = p_mailbox_id;

  -- Recalculate scores
  UPDATE mailbox_reputation
  SET
    bounce_rate = CASE WHEN total_sent > 0 THEN (total_bounced::NUMERIC / total_sent) * 100 ELSE 0 END,
    complaint_rate = CASE WHEN total_delivered > 0 THEN (total_complaints::NUMERIC / total_delivered) * 100 ELSE 0 END,
    open_rate = CASE WHEN total_delivered > 0 THEN (total_opens::NUMERIC / total_delivered) * 100 ELSE 0 END,
    click_rate = CASE WHEN total_delivered > 0 THEN (total_clicks::NUMERIC / total_delivered) * 100 ELSE 0 END,
    reply_rate = CASE WHEN total_delivered > 0 THEN (total_replies::NUMERIC / total_delivered) * 100 ELSE 0 END,
    reputation_score = calculate_reputation_score(
      total_delivered, total_bounced, total_complaints,
      total_opens, total_clicks, total_replies
    ),
    health_status = CASE
      WHEN consecutive_bounces >= 5 OR (total_sent > 100 AND bounce_rate > 10) THEN 'critical'
      WHEN consecutive_bounces >= 3 OR (total_sent > 50 AND bounce_rate > 5) THEN 'warning'
      ELSE 'good'
    END
  WHERE mailbox_id = p_mailbox_id;

  -- Auto-quarantine if critical
  UPDATE mailbox_reputation
  SET
    is_quarantined = true,
    quarantine_reason = 'High bounce rate or consecutive bounces',
    quarantine_until = NOW() + INTERVAL '24 hours'
  WHERE mailbox_id = p_mailbox_id
    AND health_status = 'critical'
    AND is_quarantined = false;
END;
$$ LANGUAGE plpgsql;

-- Function to get next available IP based on rotation rules
CREATE OR REPLACE FUNCTION get_next_sending_ip(
  p_workspace_id UUID,
  p_domain TEXT DEFAULT NULL,
  p_recipient_domain TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_ip_id UUID;
  v_rule RECORD;
  v_weights JSONB;
  v_total_weight INTEGER;
  v_random INTEGER;
  v_running_weight INTEGER;
BEGIN
  -- First check for active rotation rules
  FOR v_rule IN
    SELECT * FROM ip_rotation_rules
    WHERE workspace_id = p_workspace_id
      AND is_active = true
    ORDER BY priority ASC
  LOOP
    CASE v_rule.rule_type
      WHEN 'domain_based' THEN
        IF p_domain IS NOT NULL AND v_rule.domain_mappings ? p_domain THEN
          v_ip_id := (v_rule.domain_mappings ->> p_domain)::UUID;
          IF EXISTS (SELECT 1 FROM sending_ips WHERE id = v_ip_id AND is_active = true AND is_healthy = true) THEN
            RETURN v_ip_id;
          END IF;
        END IF;

      WHEN 'recipient_based' THEN
        -- Check recipient patterns
        SELECT (v_rule.recipient_patterns ->> key)::UUID INTO v_ip_id
        FROM jsonb_object_keys(v_rule.recipient_patterns) key
        WHERE p_recipient_domain LIKE REPLACE(key, '*', '%')
        LIMIT 1;

        IF v_ip_id IS NOT NULL AND EXISTS (SELECT 1 FROM sending_ips WHERE id = v_ip_id AND is_active = true AND is_healthy = true) THEN
          RETURN v_ip_id;
        END IF;

      WHEN 'weighted' THEN
        v_weights := v_rule.ip_weights;
        v_total_weight := 0;

        -- Calculate total weight of available IPs
        SELECT COALESCE(SUM((v_weights ->> id::TEXT)::INTEGER), 0)
        INTO v_total_weight
        FROM sending_ips
        WHERE id::TEXT IN (SELECT jsonb_object_keys(v_weights))
          AND is_active = true
          AND is_healthy = true
          AND pool_id IN (SELECT id FROM ip_pools WHERE workspace_id = p_workspace_id);

        IF v_total_weight > 0 THEN
          v_random := floor(random() * v_total_weight)::INTEGER;
          v_running_weight := 0;

          FOR v_ip_id IN
            SELECT si.id
            FROM sending_ips si
            WHERE si.id::TEXT IN (SELECT jsonb_object_keys(v_weights))
              AND si.is_active = true
              AND si.is_healthy = true
              AND si.pool_id IN (SELECT id FROM ip_pools WHERE workspace_id = p_workspace_id)
          LOOP
            v_running_weight := v_running_weight + (v_weights ->> v_ip_id::TEXT)::INTEGER;
            IF v_running_weight > v_random THEN
              RETURN v_ip_id;
            END IF;
          END LOOP;
        END IF;

      WHEN 'failover' THEN
        -- Get first healthy IP in priority order
        SELECT si.id INTO v_ip_id
        FROM sending_ips si
        JOIN ip_pools ip ON si.pool_id = ip.id
        WHERE ip.workspace_id = p_workspace_id
          AND si.is_active = true
          AND si.is_healthy = true
        ORDER BY si.priority ASC
        LIMIT 1;

        IF v_ip_id IS NOT NULL THEN
          RETURN v_ip_id;
        END IF;

      ELSE
        -- round_robin (default)
        SELECT si.id INTO v_ip_id
        FROM sending_ips si
        JOIN ip_pools ip ON si.pool_id = ip.id
        WHERE ip.workspace_id = p_workspace_id
          AND si.is_active = true
          AND si.is_healthy = true
        ORDER BY si.last_used_at ASC NULLS FIRST
        LIMIT 1;

        IF v_ip_id IS NOT NULL THEN
          -- Update last used
          UPDATE sending_ips SET last_used_at = NOW() WHERE id = v_ip_id;
          RETURN v_ip_id;
        END IF;
    END CASE;
  END LOOP;

  -- Fallback: Get any available IP (round robin)
  SELECT si.id INTO v_ip_id
  FROM sending_ips si
  JOIN ip_pools ip ON si.pool_id = ip.id
  WHERE ip.workspace_id = p_workspace_id
    AND si.is_active = true
    AND si.is_healthy = true
  ORDER BY si.last_used_at ASC NULLS FIRST
  LIMIT 1;

  IF v_ip_id IS NOT NULL THEN
    UPDATE sending_ips SET last_used_at = NOW() WHERE id = v_ip_id;
  END IF;

  RETURN v_ip_id;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE blacklist_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_blacklist_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailbox_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_rotation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_recovery_tasks ENABLE ROW LEVEL SECURITY;

-- Blacklist providers are public read
CREATE POLICY "Blacklist providers readable by all" ON blacklist_providers
  FOR SELECT USING (true);

-- Domain reputation
CREATE POLICY "Domain reputation viewable by workspace members" ON domain_reputation
  FOR SELECT USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Domain reputation manageable by workspace admins" ON domain_reputation
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );

-- Mailbox reputation
CREATE POLICY "Mailbox reputation viewable by workspace members" ON mailbox_reputation
  FOR SELECT USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Mailbox reputation manageable by workspace admins" ON mailbox_reputation
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );

-- IP rotation rules
CREATE POLICY "IP rotation rules viewable by workspace members" ON ip_rotation_rules
  FOR SELECT USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "IP rotation rules manageable by workspace admins" ON ip_rotation_rules
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );

-- Reputation alerts
CREATE POLICY "Reputation alerts viewable by workspace members" ON reputation_alerts
  FOR SELECT USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Reputation alerts manageable by workspace admins" ON reputation_alerts
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );

-- Recovery tasks
CREATE POLICY "Recovery tasks viewable by workspace members" ON reputation_recovery_tasks
  FOR SELECT USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Recovery tasks manageable by workspace admins" ON reputation_recovery_tasks
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );
