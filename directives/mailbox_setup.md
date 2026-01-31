---
name: mailbox-setup
description: Create email accounts on Google Workspace or Microsoft 365 for cold outreach. Use when provisioning new mailboxes, setting up aliases, or configuring sending accounts.
scripts:
  - execution/create_mailbox.py
  - execution/configure_smtp.py
---

# Mailbox Setup

## Purpose
Automate email account creation and SMTP/IMAP configuration for cold email sending infrastructure.

## Prerequisites
- Domain already configured (see `domain_setup.md`)
- Google Workspace Admin API credentials in `config/google_workspace.json`
- Or Microsoft 365 credentials in `config/microsoft.json`

## Inputs
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| domain | string | Yes | Domain to create mailbox on |
| first_name | string | Yes | First name for account |
| last_name | string | Yes | Last name for account |
| provider | string | No | "google" or "microsoft" (default: "google") |
| password | string | No | Auto-generated if not provided |

## Process Steps

### 1. Account Creation
- Connect to Google Admin or Microsoft Graph API
- Create user account with standard naming
- Generate secure password
- Assign appropriate license

### 2. Profile Configuration
```
Account Setup:
├── Display name: {First} {Last}
├── Email: {first}.{last}@{domain}
├── Profile photo: Professional headshot
├── Signature: Standard company template
├── Timezone: Based on target region
└── Language: English (US)
```

### 3. SMTP/IMAP Configuration
- Enable IMAP access
- Generate app-specific password (if 2FA enabled)
- Test SMTP connection
- Test IMAP connection

### 4. Security Settings
- Enable 2FA (optional for sending accounts)
- Configure recovery options
- Set password policy
- Enable suspicious login alerts

### 5. Integration
- Add to Instantly/Mailscale
- Configure sending limits
- Set daily quota
- Enable tracking

## Outputs
- Mailbox credentials (stored securely)
- SMTP/IMAP configuration
- Integration confirmation
- Entry in mailboxes database table

## API Usage

### Python
```python
from execution.create_mailbox import create_mailbox
from execution.configure_smtp import test_connection

# Create mailbox
mailbox = create_mailbox(
    domain="acmeleads.com",
    first_name="John",
    last_name="Smith",
    provider="google"
)

# Test connectivity
smtp_ok = test_connection(
    email=mailbox["email"],
    password=mailbox["password"],
    protocol="smtp"
)
```

### CLI
```bash
# Create single mailbox
python execution/create_mailbox.py \
  --domain acmeleads.com \
  --first John \
  --last Smith \
  --provider google

# Bulk create from CSV
python execution/create_mailbox.py \
  --csv mailboxes.csv \
  --provider google
```

## Naming Conventions
| Pattern | Example | Use Case |
|---------|---------|----------|
| first.last | john.smith@ | Professional |
| f.last | j.smith@ | Short form |
| first | john@ | Casual |
| firstl | johns@ | Alternative |

## Daily Sending Limits (New Accounts)
| Day | Google | Microsoft |
|-----|--------|-----------|
| 1-7 | 5-10 | 5-10 |
| 8-14 | 20-30 | 20-30 |
| 15-21 | 50-75 | 50-75 |
| 22-30 | 100-150 | 100-150 |
| 30+ | 200-500 | 200-500 |

## Edge Cases
- License limit reached: Purchase additional licenses
- Domain not verified: Complete domain verification first
- API rate limited: Implement backoff and retry

## Self-Annealing Notes
_Auto-updated learnings:_
