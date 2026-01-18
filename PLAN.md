# Phase 14: Domain Auto-Purchase System

**Goal**: One-click bulk domain registration with automatic DNS configuration
**Deliverable**: User can buy 10 domains and have full DNS (SPF/DKIM/DMARC) ready in <5 minutes

---

## Tasks

### Task 14.1: Cloudflare Registrar API Integration
```xml
<task type="auto">
  <name>Cloudflare Registrar API Integration</name>
  <files>
    src/lib/cloudflare/registrar.ts
    src/lib/cloudflare/types.ts
    src/lib/cloudflare/index.ts
  </files>
  <action>
    1. Create Cloudflare API client with authentication
    2. Implement domain availability check
    3. Implement domain purchase workflow
    4. Implement domain listing/management
    5. Add retry logic and error handling
  </action>
  <verify>
    - API client initializes with credentials
    - Can check domain availability
    - TypeScript types complete
  </verify>
  <done>Cloudflare registrar API client functional</done>
</task>
```

### Task 14.2: Bulk Domain Search UI
```xml
<task type="auto">
  <name>Bulk Domain Search UI</name>
  <files>
    src/app/(dashboard)/domains/search/page.tsx
    src/components/domains/domain-search.tsx
    src/components/domains/domain-results.tsx
  </files>
  <action>
    1. Create search page with bulk input (10+ domains)
    2. Real-time availability checking
    3. Price display per domain
    4. TLD selection (.com, .io, .co, etc.)
    5. Add to cart functionality
  </action>
  <verify>
    - Can search 10 domains simultaneously
    - Shows availability and pricing
    - Responsive design
  </verify>
  <done>Bulk domain search UI complete</done>
</task>
```

### Task 14.3: Auto-Purchase Workflow with Stripe
```xml
<task type="auto">
  <name>Domain Purchase Workflow</name>
  <files>
    src/app/api/domains/purchase/route.ts
    src/lib/stripe/domain-checkout.ts
    src/components/domains/checkout-modal.tsx
  </files>
  <action>
    1. Create Stripe checkout session for domains
    2. Handle successful payment webhook
    3. Trigger domain registration on payment
    4. Store domain in database with org association
    5. Error handling for failed purchases
  </action>
  <verify>
    - Stripe checkout works
    - Domain registered after payment
    - Webhook handling robust
  </verify>
  <done>Domain purchase with Stripe complete</done>
</task>
```

### Task 14.4: Auto SPF Record Creation
```xml
<task type="auto">
  <name>Auto SPF Record Setup</name>
  <files>
    src/lib/cloudflare/dns.ts
    src/lib/dns/spf.ts
  </files>
  <action>
    1. Create Cloudflare DNS API client
    2. Generate SPF record for cold email
    3. Auto-create TXT record on domain purchase
    4. Include Mailgun/SES IPs in SPF
    5. SPF validation after creation
  </action>
  <verify>
    - SPF record created automatically
    - Record validates correctly
    - Includes all sending IPs
  </verify>
  <done>Auto SPF setup complete</done>
</task>
```

### Task 14.5: DKIM Key Generation + DNS Record
```xml
<task type="auto">
  <name>DKIM Key Generation</name>
  <files>
    src/lib/dns/dkim.ts
    src/lib/crypto/dkim-keys.ts
  </files>
  <action>
    1. Generate RSA 2048-bit DKIM key pair
    2. Store private key encrypted in database
    3. Create DNS TXT record with public key
    4. Support multiple selectors
    5. Key rotation scheduling
  </action>
  <verify>
    - DKIM keys generated correctly
    - DNS record created
    - Private key securely stored
  </verify>
  <done>DKIM auto-generation complete</done>
</task>
```

### Task 14.6: DMARC Policy Auto-Setup
```xml
<task type="auto">
  <name>DMARC Policy Setup</name>
  <files>
    src/lib/dns/dmarc.ts
  </files>
  <action>
    1. Generate DMARC record (p=none initially)
    2. Create _dmarc TXT record
    3. Configure aggregate report email
    4. Option to upgrade to p=quarantine/reject
    5. DMARC validation check
  </action>
  <verify>
    - DMARC record created
    - Policy starts at p=none (safe)
    - RUA reports configured
  </verify>
  <done>DMARC auto-setup complete</done>
</task>
```

### Task 14.7: Domain Health Monitoring Dashboard
```xml
<task type="auto">
  <name>Domain Health Dashboard</name>
  <files>
    src/app/(dashboard)/domains/[id]/health/page.tsx
    src/components/domains/health-card.tsx
    src/lib/dns/health-check.ts
  </files>
  <action>
    1. DNS propagation checker
    2. SPF/DKIM/DMARC validation
    3. Blacklist checking
    4. MX record verification
    5. Health score calculation (0-100)
    6. Auto-refresh every hour
  </action>
  <verify>
    - Health dashboard shows all checks
    - Score accurately reflects status
    - Issues highlighted with fixes
  </verify>
  <done>Domain health monitoring complete</done>
</task>
```

### Task 14.8: Domain Age Tracking
```xml
<task type="auto">
  <name>Domain Age Tracking</name>
  <files>
    src/lib/domains/age-tracker.ts
    src/components/domains/age-badge.tsx
  </files>
  <action>
    1. Track domain registration date
    2. Calculate age in days
    3. Warning for domains < 30 days
    4. "Safe to send" indicator at 30+ days
    5. Age-based sending recommendations
  </action>
  <verify>
    - Age calculated correctly
    - Warnings shown for new domains
    - Recommendations accurate
  </verify>
  <done>Domain age tracking complete</done>
</task>
```

---

## Database Migrations Required

```sql
-- New tables for Phase 14
CREATE TABLE domain_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  domain TEXT NOT NULL UNIQUE,
  registrar TEXT DEFAULT 'cloudflare',
  registration_date TIMESTAMPTZ DEFAULT NOW(),
  expiry_date TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT true,
  purchase_price DECIMAL(10,2),
  stripe_payment_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE domain_dns_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID REFERENCES domain_purchases(id),
  record_type TEXT NOT NULL, -- SPF, DKIM, DMARC, MX
  record_name TEXT NOT NULL,
  record_value TEXT NOT NULL,
  cloudflare_id TEXT,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE domain_health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID REFERENCES domain_purchases(id),
  check_type TEXT NOT NULL,
  status TEXT NOT NULL, -- pass, fail, warning
  details JSONB,
  health_score INTEGER,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dkim_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID REFERENCES domain_purchases(id),
  selector TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  public_key TEXT NOT NULL,
  algorithm TEXT DEFAULT 'rsa-sha256',
  key_size INTEGER DEFAULT 2048,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rotated_at TIMESTAMPTZ
);
```

---

## Environment Variables Needed

```env
# Cloudflare
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_ZONE_ID=xxx  # For DNS

# Stripe (for domain purchases)
STRIPE_SECRET_KEY=xxx
STRIPE_WEBHOOK_SECRET=xxx
STRIPE_DOMAIN_PRICE_ID=xxx
```

---

## Success Criteria

- [ ] Can search 10+ domains at once
- [ ] Domain purchased via Stripe in <30 seconds
- [ ] SPF record created automatically
- [ ] DKIM keys generated and DNS record created
- [ ] DMARC policy set up automatically
- [ ] Health dashboard shows all DNS status
- [ ] Domain age tracked with warnings
- [ ] Total time from purchase to ready: <5 minutes

---

*Phase 14 Plan - Domain Auto-Purchase System*
*Created: 2026-01-17*
*Estimated: 1 week*
