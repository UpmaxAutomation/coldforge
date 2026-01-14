# InstantScale API Guide

## Overview

The InstantScale API provides programmatic access to manage campaigns, leads, email accounts, and analytics.

**Base URL**: `https://your-domain.com/api`

## Authentication

All API requests require authentication using an API key.

### Getting Your API Key

1. Go to **Settings** > **API Keys**
2. Click **Generate New Key**
3. Copy and securely store your key

### Using Your API Key

Include the API key in the `Authorization` header:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-domain.com/api/campaigns
```

## Endpoints

### Campaigns

#### List Campaigns

```bash
GET /api/campaigns
```

**Response:**
```json
{
  "campaigns": [
    {
      "id": "camp_123",
      "name": "Q1 Outreach",
      "status": "active",
      "created_at": "2024-01-15T10:00:00Z",
      "stats": {
        "sent": 1500,
        "opened": 450,
        "replied": 75
      }
    }
  ]
}
```

#### Get Campaign Details

```bash
GET /api/campaigns/:id
```

#### Create Campaign

```bash
POST /api/campaigns
Content-Type: application/json

{
  "name": "New Campaign",
  "steps": [
    {
      "subject": "Introduction to {{company}}",
      "body": "Hi {{first_name}},\n\nI wanted to reach out...",
      "delay_days": 0
    },
    {
      "subject": "Following up",
      "body": "Hi {{first_name}},\n\nJust wanted to follow up...",
      "delay_days": 3
    }
  ],
  "account_ids": ["acc_123", "acc_456"],
  "settings": {
    "daily_limit": 100,
    "send_time_start": "09:00",
    "send_time_end": "17:00",
    "timezone": "America/New_York"
  }
}
```

#### Update Campaign

```bash
PATCH /api/campaigns/:id
Content-Type: application/json

{
  "name": "Updated Campaign Name",
  "status": "paused"
}
```

#### Delete Campaign

```bash
DELETE /api/campaigns/:id
```

### Leads

#### List Leads

```bash
GET /api/leads?page=1&limit=50
```

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 100)
- `status` - Filter by status (active, bounced, unsubscribed)
- `campaign_id` - Filter by campaign

#### Create Lead

```bash
POST /api/leads
Content-Type: application/json

{
  "email": "john@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "company": "Acme Inc",
  "custom_fields": {
    "industry": "Technology",
    "role": "CEO"
  }
}
```

#### Bulk Import Leads

```bash
POST /api/leads/bulk
Content-Type: application/json

{
  "leads": [
    {
      "email": "lead1@example.com",
      "first_name": "Jane"
    },
    {
      "email": "lead2@example.com",
      "first_name": "Bob"
    }
  ],
  "campaign_id": "camp_123"
}
```

#### Update Lead

```bash
PATCH /api/leads/:id
Content-Type: application/json

{
  "first_name": "Johnny",
  "status": "unsubscribed"
}
```

#### Delete Lead

```bash
DELETE /api/leads/:id
```

### Email Accounts

#### List Accounts

```bash
GET /api/accounts
```

#### Add Account

```bash
POST /api/accounts
Content-Type: application/json

{
  "email": "outreach@yourdomain.com",
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_username": "outreach@yourdomain.com",
  "smtp_password": "app_password_here",
  "daily_limit": 100
}
```

#### Test Account Connection

```bash
POST /api/accounts/:id/test
```

#### Enable/Disable Warmup

```bash
POST /api/accounts/:id/warmup
Content-Type: application/json

{
  "enabled": true,
  "daily_increase": 5,
  "max_daily": 100
}
```

### Warmup

#### Get Warmup Stats

```bash
GET /api/warmup/:accountId/stats
```

**Response:**
```json
{
  "account_id": "acc_123",
  "current_daily_limit": 45,
  "emails_sent_today": 32,
  "warmup_day": 9,
  "reputation_score": 85,
  "history": [
    {
      "date": "2024-01-15",
      "sent": 30,
      "received": 28,
      "opened": 25
    }
  ]
}
```

### Analytics

#### Campaign Analytics

```bash
GET /api/analytics/campaigns/:id
```

**Response:**
```json
{
  "campaign_id": "camp_123",
  "period": "30d",
  "metrics": {
    "total_sent": 5000,
    "total_delivered": 4850,
    "total_opened": 1455,
    "total_clicked": 320,
    "total_replied": 250,
    "total_bounced": 150,
    "open_rate": 30.0,
    "reply_rate": 5.15,
    "bounce_rate": 3.0
  },
  "daily_breakdown": [
    {
      "date": "2024-01-15",
      "sent": 100,
      "opened": 30,
      "replied": 5
    }
  ]
}
```

#### Account Analytics

```bash
GET /api/analytics/accounts/:id
```

## Webhooks

Configure webhooks to receive real-time notifications.

### Supported Events

- `email.sent` - Email successfully sent
- `email.opened` - Email opened by recipient
- `email.clicked` - Link clicked in email
- `email.replied` - Reply received
- `email.bounced` - Email bounced
- `lead.unsubscribed` - Lead unsubscribed

### Webhook Payload

```json
{
  "event": "email.opened",
  "timestamp": "2024-01-15T14:30:00Z",
  "data": {
    "email_id": "eml_123",
    "campaign_id": "camp_123",
    "lead_id": "lead_456",
    "lead_email": "recipient@example.com"
  }
}
```

### Register Webhook

```bash
POST /api/webhooks
Content-Type: application/json

{
  "url": "https://your-app.com/webhook",
  "events": ["email.opened", "email.replied"],
  "secret": "your_webhook_secret"
}
```

## Rate Limits

- **Standard**: 100 requests per minute
- **Bulk operations**: 10 requests per minute

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705332000
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": {
      "field": "email",
      "value": "invalid-email"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

## SDKs

### Node.js

```javascript
import { InstantScale } from '@instantscale/sdk';

const client = new InstantScale('YOUR_API_KEY');

// Create campaign
const campaign = await client.campaigns.create({
  name: 'My Campaign',
  steps: [
    { subject: 'Hello', body: 'Hi there!', delay_days: 0 }
  ]
});

// Add leads
await client.leads.bulkCreate({
  leads: [{ email: 'test@example.com' }],
  campaignId: campaign.id
});
```

### Python

```python
from instantscale import InstantScale

client = InstantScale('YOUR_API_KEY')

# Create campaign
campaign = client.campaigns.create(
    name='My Campaign',
    steps=[
        {'subject': 'Hello', 'body': 'Hi there!', 'delay_days': 0}
    ]
)

# Add leads
client.leads.bulk_create(
    leads=[{'email': 'test@example.com'}],
    campaign_id=campaign.id
)
```

## Support

For API support, contact api-support@instantscale.io or visit /api/docs for interactive documentation.
