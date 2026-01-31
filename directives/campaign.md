---
name: campaign
description: Cold email campaign creation and management. Use when launching outreach campaigns, A/B testing sequences, or managing sending schedules.
scripts:
  - execution/send_campaign.py
  - execution/campaign_analytics.py
---

# Campaign Management

## Purpose
Create, manage, and optimize cold email campaigns with intelligent sending, personalization, and A/B testing.

## Prerequisites
- Warmed up mailboxes (see `warmup.md`)
- Lead list prepared and validated
- Email sequences written
- Sending schedule defined

## Inputs
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| campaign_name | string | Yes | Campaign identifier |
| leads_csv | string | Yes | Path to leads file |
| sequence | list | Yes | Email sequence (subject, body) |
| mailboxes | list | Yes | Sending accounts to use |
| daily_limit | int | No | Emails per day per mailbox |
| schedule | dict | No | Sending hours and days |

## Process Steps

### 1. Lead Import & Validation
```
Lead Processing:
├── Import from CSV/integration
├── Validate email format
├── Check against blocklist
├── Verify with SMTP (optional)
├── Dedupe against existing campaigns
└── Enrich with personalization data
```

### 2. Sequence Configuration
```
Email Sequence Example:
├── Email 1 (Day 0): Introduction
├── Email 2 (Day 3): Value proposition
├── Email 3 (Day 7): Case study
├── Email 4 (Day 10): Soft ask
└── Email 5 (Day 14): Break-up email
```

### 3. Sending Schedule
```yaml
schedule:
  timezone: "America/New_York"
  days: ["Monday", "Tuesday", "Wednesday", "Thursday"]
  hours:
    start: "09:00"
    end: "17:00"
  exclude_holidays: true
  random_delay_minutes: 15
```

### 4. Campaign Launch
- Distribute leads across mailboxes
- Queue emails with timing
- Apply personalization
- Track open/click/reply

### 5. Optimization
- Monitor bounce rates
- Pause low-performing mailboxes
- A/B test subject lines
- Adjust sending velocity

## Outputs
- Campaign dashboard
- Daily sending reports
- Reply notifications
- Analytics export

## API Usage

### Python
```python
from execution.send_campaign import Campaign
from execution.campaign_analytics import get_metrics

# Create campaign
campaign = Campaign(
    name="Q1 Cabinet Outreach",
    leads_csv="leads/cabinets_texas.csv",
    mailboxes=["john@acme.com", "jane@acme.com"],
    daily_limit=50
)

# Add sequence
campaign.add_email(
    subject="Quick question about {{company_name}}",
    body="Hi {{first_name}},\n\n...",
    delay_days=0
)
campaign.add_email(
    subject="Re: Quick question",
    body="Following up...",
    delay_days=3
)

# Launch
campaign.start()

# Get metrics
metrics = get_metrics(campaign_id=campaign.id)
print(f"Open rate: {metrics['open_rate']}%")
```

### CLI
```bash
# Create campaign
python execution/send_campaign.py \
  --name "Q1 Outreach" \
  --leads leads.csv \
  --sequence sequence.json \
  --mailboxes mailboxes.json

# Check analytics
python execution/campaign_analytics.py \
  --campaign-id abc123 \
  --report
```

## Personalization Variables

| Variable | Description | Example |
|----------|-------------|---------|
| {{first_name}} | Lead's first name | John |
| {{company_name}} | Company name | ACME Corp |
| {{industry}} | Industry vertical | Cabinet Manufacturing |
| {{city}} | Location | Austin |
| {{custom_1}} | Custom field | Specific pain point |

## Sending Limits by Domain Age

| Domain Age | Daily Limit | Hourly Max |
|------------|-------------|------------|
| 0-2 weeks | 20-30 | 5 |
| 2-4 weeks | 50-75 | 10 |
| 1-2 months | 100-150 | 20 |
| 2+ months | 200-300 | 30 |

## A/B Testing

```yaml
ab_test:
  type: "subject_line"
  variants:
    - "Quick question about {{company_name}}"
    - "Idea for {{company_name}}'s marketing"
    - "{{first_name}}, saw your website"
  split: 33  # percentage each
  winner_metric: "reply_rate"
  min_sample: 100
```

## Edge Cases
- High bounce rate: Pause campaign, clean list
- Spam complaints: Stop immediately, investigate
- Mailbox suspended: Remove from rotation, replace

## Self-Annealing Notes
_Auto-updated learnings:_
