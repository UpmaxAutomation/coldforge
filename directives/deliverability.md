---
name: deliverability
description: Email deliverability monitoring and optimization. Use when diagnosing inbox placement issues, improving sender reputation, or auditing email infrastructure.
scripts:
  - execution/check_deliverability.py
  - execution/deliverability_audit.py
---

# Deliverability Management

## Purpose
Monitor, diagnose, and optimize email deliverability to maximize inbox placement rates across all sending infrastructure.

## Prerequisites
- Active sending domains
- Google Postmaster Tools access
- Deliverability testing service (GlockApps, Mail-Tester)

## Inputs
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| domain | string | Yes | Domain to audit |
| test_email | string | No | Seed email for testing |
| depth | string | No | "quick", "standard", "deep" |

## Process Steps

### 1. Technical Setup Audit
```
DNS Check:
├── SPF Record
│   ├── Valid syntax
│   ├── All IPs included
│   └── Not exceeding 10 lookups
├── DKIM Record
│   ├── Selector present
│   ├── Key valid
│   └── Alignment check
├── DMARC Record
│   ├── Policy set
│   ├── Reporting configured
│   └── Alignment mode
└── BIMI (Optional)
    ├── VMC certificate
    └── Logo SVG
```

### 2. Reputation Analysis
```
Reputation Sources:
├── Google Postmaster Tools
│   ├── Domain reputation
│   ├── IP reputation
│   └── Spam rate
├── Microsoft SNDS
│   ├── Complaint rate
│   └── Trap hits
├── Sender Score
│   └── 0-100 rating
└── Blacklist Check
    ├── Spamhaus
    ├── Barracuda
    └── SORBS
```

### 3. Inbox Placement Test
```
Test Providers:
├── Gmail (Personal)
├── Gmail (Workspace)
├── Outlook.com
├── Office 365
├── Yahoo
├── iCloud
└── Corporate filters
```

### 4. Content Analysis
```
Content Checks:
├── Spam trigger words
├── Link reputation
├── Image/text ratio
├── HTML validation
├── Unsubscribe link
└── Physical address
```

### 5. Sending Pattern Review
```
Pattern Analysis:
├── Volume consistency
├── Time distribution
├── Bounce handling
├── Complaint processing
└── Engagement rates
```

## Outputs
- Deliverability score (0-100)
- Issue list with severity
- Remediation recommendations
- Historical trend charts

## API Usage

### Python
```python
from execution.check_deliverability import DeliverabilityChecker
from execution.deliverability_audit import full_audit

# Quick check
checker = DeliverabilityChecker(domain="acmeleads.com")
score = checker.quick_check()
print(f"Score: {score}/100")

# Full audit
audit = full_audit(
    domain="acmeleads.com",
    test_email="test@seed.com",
    depth="deep"
)
print(audit.report())
```

### CLI
```bash
# Quick check
python execution/check_deliverability.py \
  --domain acmeleads.com \
  --quick

# Full audit
python execution/deliverability_audit.py \
  --domain acmeleads.com \
  --depth deep \
  --report
```

## Deliverability Score Components

| Component | Weight | Good | Warning | Critical |
|-----------|--------|------|---------|----------|
| SPF/DKIM/DMARC | 25% | All pass | 1 missing | 2+ missing |
| Sender Reputation | 25% | >80 | 60-80 | <60 |
| Inbox Placement | 30% | >95% | 80-95% | <80% |
| Blacklist Status | 20% | Clear | 1 minor | Major list |

## Common Issues & Fixes

### Low Inbox Placement
```
Causes:
├── Poor sender reputation
├── Spammy content
├── Inconsistent sending
└── List quality issues

Fixes:
├── Reduce volume temporarily
├── Clean email list
├── Improve engagement
└── Warm up slowly
```

### High Bounce Rate
```
Causes:
├── Outdated email list
├── Invalid email syntax
├── Aggressive scraping
└── No verification

Fixes:
├── Verify before sending
├── Remove hard bounces immediately
├── Use double opt-in
└── Regular list hygiene
```

### Blacklisted
```
Steps:
├── Identify which blacklist
├── Stop all sending
├── Fix root cause
├── Request delisting
└── Monitor closely
```

## Monitoring Schedule

| Check | Frequency | Tool |
|-------|-----------|------|
| DNS records | Weekly | Internal |
| Sender score | Daily | SenderScore.org |
| Blacklists | Daily | MXToolbox |
| Inbox placement | Before campaigns | GlockApps |
| Google Postmaster | Daily | GPT Dashboard |

## Edge Cases
- Sudden reputation drop: Investigate recent changes
- Intermittent delivery: Check IP rotation
- Provider-specific issues: Test each separately

## Self-Annealing Notes
_Auto-updated learnings:_
