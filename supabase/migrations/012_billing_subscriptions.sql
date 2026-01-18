-- Billing & Subscriptions Migration
-- Stripe integration, subscription management, usage metering, invoices

-- Subscription Plans
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  stripe_price_id VARCHAR(255),
  stripe_product_id VARCHAR(255),
  billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly, yearly
  price_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',

  -- Feature limits
  max_mailboxes INTEGER,
  max_domains INTEGER,
  max_leads_per_month INTEGER,
  max_emails_per_day INTEGER,
  max_campaigns INTEGER,
  max_team_members INTEGER,
  max_workspaces INTEGER,

  -- Feature flags
  has_api_access BOOLEAN DEFAULT false,
  has_webhook_access BOOLEAN DEFAULT false,
  has_white_label BOOLEAN DEFAULT false,
  has_priority_support BOOLEAN DEFAULT false,
  has_dedicated_ip BOOLEAN DEFAULT false,
  has_custom_domain BOOLEAN DEFAULT false,
  has_advanced_analytics BOOLEAN DEFAULT false,
  has_ab_testing BOOLEAN DEFAULT false,
  has_crm_integration BOOLEAN DEFAULT false,
  has_zapier_integration BOOLEAN DEFAULT false,

  -- Display
  is_popular BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace Subscriptions
CREATE TABLE workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),

  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, past_due, canceled, paused, trialing
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,

  -- Trial
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,

  -- Addons and overrides
  addon_mailboxes INTEGER DEFAULT 0,
  addon_domains INTEGER DEFAULT 0,
  addon_emails INTEGER DEFAULT 0,
  custom_limits JSONB DEFAULT '{}',

  -- Billing info
  billing_email VARCHAR(255),
  billing_name VARCHAR(255),
  billing_address JSONB,
  tax_id VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id)
);

-- Stripe Customers (linked to users or workspaces)
CREATE TABLE stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255),
  name VARCHAR(255),
  default_payment_method_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT customer_entity_check CHECK (
    (user_id IS NOT NULL AND workspace_id IS NULL) OR
    (user_id IS NULL AND workspace_id IS NOT NULL)
  )
);

-- Payment Methods
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_payment_method_id VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL, -- card, bank_account, etc.
  is_default BOOLEAN DEFAULT false,

  -- Card details (if card)
  card_brand VARCHAR(50),
  card_last4 VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,

  -- Bank details (if bank)
  bank_name VARCHAR(255),
  bank_last4 VARCHAR(4),

  billing_details JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES workspace_subscriptions(id),
  stripe_invoice_id VARCHAR(255) UNIQUE,

  invoice_number VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, open, paid, void, uncollectible

  -- Amounts
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  discount_cents INTEGER DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  amount_paid_cents INTEGER DEFAULT 0,
  amount_due_cents INTEGER DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',

  -- Dates
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Period
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- URLs
  hosted_invoice_url TEXT,
  invoice_pdf_url TEXT,

  -- Details
  description TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice Line Items
CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stripe_line_item_id VARCHAR(255),

  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_amount_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',

  -- Period
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- Metadata
  price_id VARCHAR(255),
  product_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage Records (for metered billing)
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES workspace_subscriptions(id),

  metric_type VARCHAR(100) NOT NULL, -- emails_sent, leads_created, api_calls, etc.
  quantity INTEGER NOT NULL DEFAULT 1,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Stripe usage record
  stripe_usage_record_id VARCHAR(255),

  -- Aggregation period
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage Summaries (aggregated daily/monthly)
CREATE TABLE usage_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  period_type VARCHAR(20) NOT NULL, -- daily, monthly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Metrics
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  leads_created INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  campaigns_sent INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,

  -- Limits tracking
  mailboxes_used INTEGER DEFAULT 0,
  domains_used INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, period_type, period_start)
);

-- Coupons
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  stripe_coupon_id VARCHAR(255),

  name VARCHAR(255),
  description TEXT,

  -- Discount
  discount_type VARCHAR(20) NOT NULL, -- percent, amount
  discount_percent DECIMAL(5,2),
  discount_amount_cents INTEGER,
  currency VARCHAR(3) DEFAULT 'usd',

  -- Limits
  max_redemptions INTEGER,
  times_redeemed INTEGER DEFAULT 0,

  -- Duration
  duration VARCHAR(20) NOT NULL DEFAULT 'once', -- once, repeating, forever
  duration_in_months INTEGER,

  -- Validity
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,

  -- Restrictions
  applies_to_plans UUID[], -- NULL means all plans
  min_amount_cents INTEGER,
  first_time_only BOOLEAN DEFAULT false,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coupon Redemptions
CREATE TABLE coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  subscription_id UUID REFERENCES workspace_subscriptions(id),

  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  discount_applied_cents INTEGER,

  UNIQUE(coupon_id, workspace_id)
);

-- Credits (for prepaid/pay-as-you-go)
CREATE TABLE credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  credit_type VARCHAR(50) NOT NULL, -- email, sms, api_call
  amount INTEGER NOT NULL,
  remaining INTEGER NOT NULL,

  -- Purchase info
  purchase_price_cents INTEGER,
  stripe_payment_intent_id VARCHAR(255),

  -- Validity
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,

  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit Transactions
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credit_id UUID REFERENCES credits(id),

  transaction_type VARCHAR(50) NOT NULL, -- purchase, usage, refund, adjustment, expiration
  credit_type VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL, -- positive for additions, negative for deductions

  balance_before INTEGER,
  balance_after INTEGER,

  description TEXT,
  reference_type VARCHAR(50), -- email, campaign, api_call
  reference_id VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing Events (webhook events)
CREATE TABLE billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE,
  event_type VARCHAR(100) NOT NULL,

  workspace_id UUID REFERENCES workspaces(id),
  subscription_id UUID REFERENCES workspace_subscriptions(id),
  invoice_id UUID REFERENCES invoices(id),

  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active);
CREATE INDEX idx_workspace_subscriptions_workspace ON workspace_subscriptions(workspace_id);
CREATE INDEX idx_workspace_subscriptions_stripe ON workspace_subscriptions(stripe_subscription_id);
CREATE INDEX idx_workspace_subscriptions_status ON workspace_subscriptions(status);
CREATE INDEX idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);
CREATE INDEX idx_stripe_customers_user ON stripe_customers(user_id);
CREATE INDEX idx_stripe_customers_workspace ON stripe_customers(workspace_id);
CREATE INDEX idx_payment_methods_customer ON payment_methods(stripe_customer_id);
CREATE INDEX idx_invoices_workspace ON invoices(workspace_id);
CREATE INDEX idx_invoices_stripe ON invoices(stripe_invoice_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoice_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX idx_usage_records_workspace ON usage_records(workspace_id);
CREATE INDEX idx_usage_records_metric ON usage_records(metric_type);
CREATE INDEX idx_usage_records_timestamp ON usage_records(timestamp);
CREATE INDEX idx_usage_summaries_workspace ON usage_summaries(workspace_id);
CREATE INDEX idx_usage_summaries_period ON usage_summaries(period_type, period_start);
CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_active ON coupons(is_active);
CREATE INDEX idx_credits_workspace ON credits(workspace_id);
CREATE INDEX idx_credit_transactions_workspace ON credit_transactions(workspace_id);
CREATE INDEX idx_billing_events_stripe ON billing_events(stripe_event_id);
CREATE INDEX idx_billing_events_type ON billing_events(event_type);

-- RLS Policies
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Plans are public (read)
CREATE POLICY "subscription_plans_read" ON subscription_plans
  FOR SELECT USING (is_active = true);

-- Workspace subscriptions
CREATE POLICY "workspace_subscriptions_read" ON workspace_subscriptions
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_subscriptions_write" ON workspace_subscriptions
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Stripe customers
CREATE POLICY "stripe_customers_read" ON stripe_customers
  FOR SELECT USING (
    user_id = auth.uid() OR
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Payment methods (via customer)
CREATE POLICY "payment_methods_read" ON payment_methods
  FOR SELECT USING (
    stripe_customer_id IN (
      SELECT stripe_customer_id FROM stripe_customers
      WHERE user_id = auth.uid() OR workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- Invoices
CREATE POLICY "invoices_read" ON invoices
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Invoice line items
CREATE POLICY "invoice_items_read" ON invoice_line_items
  FOR SELECT USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- Usage records
CREATE POLICY "usage_records_read" ON usage_records
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Usage summaries
CREATE POLICY "usage_summaries_read" ON usage_summaries
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Coupons (public read for active)
CREATE POLICY "coupons_read" ON coupons
  FOR SELECT USING (is_active = true);

-- Coupon redemptions
CREATE POLICY "coupon_redemptions_read" ON coupon_redemptions
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Credits
CREATE POLICY "credits_read" ON credits
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Credit transactions
CREATE POLICY "credit_transactions_read" ON credit_transactions
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Function to track usage
CREATE OR REPLACE FUNCTION record_usage(
  p_workspace_id UUID,
  p_metric_type VARCHAR,
  p_quantity INTEGER DEFAULT 1
)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_records (workspace_id, metric_type, quantity, timestamp)
  VALUES (p_workspace_id, p_metric_type, p_quantity, NOW());

  -- Update daily summary
  INSERT INTO usage_summaries (
    workspace_id, period_type, period_start, period_end,
    emails_sent, leads_created, campaigns_sent, api_calls
  )
  VALUES (
    p_workspace_id, 'daily', CURRENT_DATE, CURRENT_DATE,
    CASE WHEN p_metric_type = 'emails_sent' THEN p_quantity ELSE 0 END,
    CASE WHEN p_metric_type = 'leads_created' THEN p_quantity ELSE 0 END,
    CASE WHEN p_metric_type = 'campaigns_sent' THEN p_quantity ELSE 0 END,
    CASE WHEN p_metric_type = 'api_calls' THEN p_quantity ELSE 0 END
  )
  ON CONFLICT (workspace_id, period_type, period_start)
  DO UPDATE SET
    emails_sent = usage_summaries.emails_sent +
      CASE WHEN p_metric_type = 'emails_sent' THEN p_quantity ELSE 0 END,
    leads_created = usage_summaries.leads_created +
      CASE WHEN p_metric_type = 'leads_created' THEN p_quantity ELSE 0 END,
    campaigns_sent = usage_summaries.campaigns_sent +
      CASE WHEN p_metric_type = 'campaigns_sent' THEN p_quantity ELSE 0 END,
    api_calls = usage_summaries.api_calls +
      CASE WHEN p_metric_type = 'api_calls' THEN p_quantity ELSE 0 END,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_workspace_id UUID,
  p_limit_type VARCHAR
)
RETURNS JSONB AS $$
DECLARE
  v_subscription workspace_subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
  v_current_usage INTEGER;
  v_limit INTEGER;
  v_result JSONB;
BEGIN
  -- Get subscription and plan
  SELECT ws.*, sp.* INTO v_subscription, v_plan
  FROM workspace_subscriptions ws
  JOIN subscription_plans sp ON ws.plan_id = sp.id
  WHERE ws.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_subscription');
  END IF;

  -- Check subscription status
  IF v_subscription.status NOT IN ('active', 'trialing') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'subscription_inactive');
  END IF;

  -- Get limit and current usage based on type
  CASE p_limit_type
    WHEN 'mailboxes' THEN
      v_limit := COALESCE((v_subscription.custom_limits->>'max_mailboxes')::INTEGER,
                          v_plan.max_mailboxes) + v_subscription.addon_mailboxes;
      SELECT COUNT(*) INTO v_current_usage FROM mailboxes WHERE workspace_id = p_workspace_id AND status = 'active';
    WHEN 'domains' THEN
      v_limit := COALESCE((v_subscription.custom_limits->>'max_domains')::INTEGER,
                          v_plan.max_domains) + v_subscription.addon_domains;
      SELECT COUNT(*) INTO v_current_usage FROM domains WHERE workspace_id = p_workspace_id AND status != 'deleted';
    WHEN 'emails_per_day' THEN
      v_limit := COALESCE((v_subscription.custom_limits->>'max_emails_per_day')::INTEGER,
                          v_plan.max_emails_per_day) + v_subscription.addon_emails;
      SELECT COALESCE(emails_sent, 0) INTO v_current_usage
      FROM usage_summaries
      WHERE workspace_id = p_workspace_id AND period_type = 'daily' AND period_start = CURRENT_DATE;
    WHEN 'leads_per_month' THEN
      v_limit := COALESCE((v_subscription.custom_limits->>'max_leads_per_month')::INTEGER,
                          v_plan.max_leads_per_month);
      SELECT COALESCE(SUM(leads_created), 0) INTO v_current_usage
      FROM usage_summaries
      WHERE workspace_id = p_workspace_id
        AND period_type = 'daily'
        AND period_start >= DATE_TRUNC('month', CURRENT_DATE);
    ELSE
      RETURN jsonb_build_object('allowed', true, 'reason', 'unknown_limit_type');
  END CASE;

  IF v_limit IS NULL THEN
    -- Unlimited
    RETURN jsonb_build_object('allowed', true, 'current', v_current_usage, 'limit', null);
  END IF;

  IF v_current_usage >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'current', v_current_usage,
      'limit', v_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current', v_current_usage,
    'limit', v_limit,
    'remaining', v_limit - v_current_usage
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to use credits
CREATE OR REPLACE FUNCTION use_credits(
  p_workspace_id UUID,
  p_credit_type VARCHAR,
  p_amount INTEGER,
  p_reference_type VARCHAR DEFAULT NULL,
  p_reference_id VARCHAR DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_credit credits%ROWTYPE;
  v_remaining INTEGER;
  v_used INTEGER := 0;
BEGIN
  -- Get available credits
  FOR v_credit IN
    SELECT * FROM credits
    WHERE workspace_id = p_workspace_id
      AND credit_type = p_credit_type
      AND is_active = true
      AND remaining > 0
      AND (valid_until IS NULL OR valid_until > NOW())
    ORDER BY valid_until NULLS LAST, created_at
  LOOP
    v_remaining := LEAST(v_credit.remaining, p_amount - v_used);

    UPDATE credits SET remaining = remaining - v_remaining, updated_at = NOW()
    WHERE id = v_credit.id;

    INSERT INTO credit_transactions (
      workspace_id, credit_id, transaction_type, credit_type,
      amount, balance_before, balance_after,
      reference_type, reference_id
    ) VALUES (
      p_workspace_id, v_credit.id, 'usage', p_credit_type,
      -v_remaining, v_credit.remaining, v_credit.remaining - v_remaining,
      p_reference_type, p_reference_id
    );

    v_used := v_used + v_remaining;

    IF v_used >= p_amount THEN
      EXIT;
    END IF;
  END LOOP;

  IF v_used < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_credits',
      'requested', p_amount,
      'available', v_used
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'used', v_used
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default plans
INSERT INTO subscription_plans (
  name, description, billing_period, price_cents,
  max_mailboxes, max_domains, max_leads_per_month, max_emails_per_day,
  max_campaigns, max_team_members, max_workspaces,
  has_api_access, has_webhook_access, has_advanced_analytics, has_ab_testing,
  has_crm_integration, has_zapier_integration,
  is_popular, sort_order
) VALUES
  ('Free', 'Get started with email outreach', 'monthly', 0,
   1, 1, 100, 50, 1, 1, 1,
   false, false, false, false, false, false,
   false, 1),

  ('Starter', 'Perfect for small teams', 'monthly', 2900,
   5, 3, 1000, 500, 5, 3, 1,
   true, true, false, false, true, false,
   false, 2),

  ('Growth', 'Scale your outreach', 'monthly', 7900,
   25, 10, 10000, 2500, 25, 10, 3,
   true, true, true, true, true, true,
   true, 3),

  ('Business', 'For growing businesses', 'monthly', 14900,
   100, 50, 50000, 10000, 100, 25, 10,
   true, true, true, true, true, true,
   false, 4),

  ('Enterprise', 'Custom solution for large teams', 'monthly', 0, -- Custom pricing
   NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   true, true, true, true, true, true,
   false, 5);

-- Yearly plans (20% discount)
INSERT INTO subscription_plans (
  name, description, billing_period, price_cents,
  max_mailboxes, max_domains, max_leads_per_month, max_emails_per_day,
  max_campaigns, max_team_members, max_workspaces,
  has_api_access, has_webhook_access, has_advanced_analytics, has_ab_testing,
  has_crm_integration, has_zapier_integration,
  is_popular, sort_order
) VALUES
  ('Starter Yearly', 'Perfect for small teams (20% off)', 'yearly', 27840,
   5, 3, 1000, 500, 5, 3, 1,
   true, true, false, false, true, false,
   false, 6),

  ('Growth Yearly', 'Scale your outreach (20% off)', 'yearly', 75840,
   25, 10, 10000, 2500, 25, 10, 3,
   true, true, true, true, true, true,
   false, 7),

  ('Business Yearly', 'For growing businesses (20% off)', 'yearly', 143040,
   100, 50, 50000, 10000, 100, 25, 10,
   true, true, true, true, true, true,
   false, 8);
