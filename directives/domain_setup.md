---
name: domain-setup
description: Automated domain purchase and DNS configuration for cold email infrastructure. Use when setting up new sending domains, configuring SPF/DKIM/DMARC, or provisioning bulk domains.
scripts:
  - execution/purchase_domain.py
  - execution/setup_dns.py
---

# Domain Setup

## Purpose
Automate the end-to-end process of purchasing domains and configuring DNS records for cold email deliverability.

## Prerequisites
- Namecheap API credentials in `config/namecheap.json`
- Cloudflare API token in `config/cloudflare.json`
- Budget approved for domain purchases

## Inputs
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| base_domain | string | Yes | Primary domain pattern (e.g., "acmeleads") |
| tlds | list | No | TLDs to purchase (default: [".com", ".io", ".co"]) |
| quantity | int | No | Number of domains to purchase (default: 3) |
| provider | string | No | Registrar (default: "namecheap") |

## Process Steps

### 1. Domain Selection
- Generate domain name variations
- Check availability via Namecheap API
- Filter by price and TLD preference
- Present options or auto-select cheapest

### 2. Domain Purchase
- Submit purchase order via API
- Enable auto-renew
- Enable WHOIS privacy
- Store domain credentials

### 3. DNS Transfer to Cloudflare
- Add domain to Cloudflare
- Update nameservers at registrar
- Wait for propagation (up to 24h)

### 4. DNS Record Configuration
```
Required Records:
├── SPF: "v=spf1 include:_spf.google.com ~all"
├── DKIM: Google Workspace or custom selector
├── DMARC: "v=DMARC1; p=none; rua=mailto:dmarc@domain.com"
├── MX: For receiving replies
└── BIMI: Optional brand indicator
```

### 5. Verification
- Test SPF lookup
- Verify DKIM signature
- Check DMARC policy
- Confirm MX records resolve

## Outputs
- Domain registration confirmation
- DNS records configured
- Verification report
- Entry in domains database table

## API Usage

### Python
```python
from execution.purchase_domain import purchase_domains
from execution.setup_dns import configure_dns

# Purchase domains
domains = purchase_domains(
    base_domain="acmeleads",
    tlds=[".com", ".io"],
    quantity=2
)

# Configure DNS for each
for domain in domains:
    configure_dns(
        domain=domain,
        email_provider="google_workspace",
        enable_dmarc=True
    )
```

### CLI
```bash
# Purchase domains
python execution/purchase_domain.py --base acmeleads --tlds com,io --qty 2

# Setup DNS
python execution/setup_dns.py --domain acmeleads.com --provider google
```

## Timing Expectations
- Domain purchase: 1-5 minutes
- Nameserver propagation: 1-24 hours
- DNS record propagation: 5-60 minutes
- Full setup: Allow 24-48 hours before sending

## Edge Cases
- Domain unavailable: Try alternative TLDs or variations
- Nameserver update fails: Manual intervention required
- Cloudflare zone creation fails: Check API token permissions

## Self-Annealing Notes
_Auto-updated learnings:_
