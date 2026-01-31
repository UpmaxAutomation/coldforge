---
name: warmup
description: Email warmup system to build sender reputation before campaigns. Use when preparing new mailboxes, maintaining domain health, or recovering from deliverability issues.
scripts:
  - execution/warmup_account.py
  - execution/warmup_monitor.py
---

# Email Warmup

## Purpose
Systematically warm up new email accounts by sending and receiving emails with warmup networks to establish positive sender reputation.

## Prerequisites
- Mailbox created and configured (see `mailbox_setup.md`)
- Warmup network access (Instantly, Warmup Inbox, etc.)
- IMAP access enabled

## Inputs
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Email address to warm up |
| warmup_pool | string | No | Pool to join (default: "general") |
| daily_limit | int | No | Max warmup emails/day (default: 40) |
| duration_days | int | No | Warmup period (default: 14) |

## Process Steps

### 1. Warmup Network Registration
- Register account with warmup service
- Join appropriate warmup pool
- Configure sending preferences

### 2. Warmup Schedule Configuration
```
Day-by-Day Ramp-Up:
├── Days 1-3: 5 emails/day, 100% reply rate
├── Days 4-7: 15 emails/day, 80% reply rate
├── Days 8-14: 30 emails/day, 60% reply rate
├── Days 15-21: 40 emails/day, 40% reply rate
└── Days 22+: Maintain 20-30 emails/day
```

### 3. Interaction Patterns
- Send emails at human-like intervals
- Receive replies from warmup network
- Mark emails as important/starred
- Move from spam to inbox (critical!)
- Reply to threads naturally

### 4. Reputation Monitoring
```
Metrics to Track:
├── Inbox placement rate (target: >95%)
├── Spam folder rate (target: <5%)
├── Bounce rate (target: <1%)
├── Reply rate from warmup
└── Sender score trend
```

### 5. Health Checks
- Daily deliverability test
- Weekly sender score check
- Blacklist monitoring
- Google Postmaster Tools review

## Outputs
- Warmup progress report
- Deliverability metrics
- Sender score history
- Ready-to-send confirmation

## API Usage

### Python
```python
from execution.warmup_account import start_warmup, check_status
from execution.warmup_monitor import get_deliverability_report

# Start warmup
warmup = start_warmup(
    email="john@acmeleads.com",
    daily_limit=40,
    duration_days=14
)

# Check status
status = check_status(email="john@acmeleads.com")
print(f"Day {status['day']}: {status['inbox_rate']}% inbox placement")

# Get full report
report = get_deliverability_report(email="john@acmeleads.com")
```

### CLI
```bash
# Start warmup
python execution/warmup_account.py \
  --email john@acmeleads.com \
  --daily-limit 40 \
  --days 14

# Monitor warmup
python execution/warmup_monitor.py \
  --email john@acmeleads.com \
  --report
```

## Warmup Best Practices

### Do's
- Start slow and increase gradually
- Maintain consistent sending patterns
- Keep warmup running during campaigns
- Monitor metrics daily
- React quickly to deliverability drops

### Don'ts
- Don't rush the warmup period
- Don't stop warmup cold turkey
- Don't ignore spam placement
- Don't use same IP for warmup and sending
- Don't exceed recommended daily limits

## Deliverability Signals

| Signal | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Inbox Rate | >95% | 80-95% | <80% |
| Spam Rate | <2% | 2-10% | >10% |
| Bounce Rate | <0.5% | 0.5-2% | >2% |
| Reply Rate | >5% | 2-5% | <2% |

## Edge Cases
- Account suspended: Stop warmup, investigate cause
- High spam rate: Reduce volume, check content
- Blacklisted IP: Switch sending IP, request delisting

## Self-Annealing Notes
_Auto-updated learnings:_
