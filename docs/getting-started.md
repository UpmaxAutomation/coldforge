# Getting Started with InstantScale

## Quick Start

1. **Create an account** - Sign up at /register
2. **Add email accounts** - Connect your SMTP accounts
3. **Import leads** - Upload CSV or add manually
4. **Create a campaign** - Set up email sequences
5. **Start sending** - Launch your campaign

## Features

- **Email Warmup**: Gradually increase sending volume
- **Campaign Management**: Multi-step email sequences
- **Lead Management**: Import and organize contacts
- **Analytics**: Track opens, replies, bounces
- **Domain Management**: Auto-configure DNS

## API Access

Get your API key from Settings > API Keys.
See /api/docs for full API documentation.

## System Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Valid email accounts with SMTP access
- DNS access for domain verification (optional)

## Account Setup

### 1. Registration

Navigate to `/register` and create your account with:
- Email address
- Password (minimum 8 characters)
- Organization name (optional)

### 2. Email Account Configuration

Add your first email account:
1. Go to **Accounts** > **Add Account**
2. Enter your SMTP credentials:
   - SMTP Host (e.g., smtp.gmail.com)
   - SMTP Port (usually 587 or 465)
   - Username
   - Password or App Password
3. Test the connection
4. Save the account

### 3. Warmup Setup

Enable warmup for new accounts:
1. Select the account from **Accounts**
2. Click **Enable Warmup**
3. Configure warmup settings:
   - Daily increase rate
   - Maximum daily emails
   - Warmup duration

### 4. Lead Import

Import your contacts:
1. Go to **Leads** > **Import**
2. Upload CSV file with columns:
   - email (required)
   - first_name
   - last_name
   - company
   - custom fields
3. Map columns and import

### 5. Campaign Creation

Create your first campaign:
1. Go to **Campaigns** > **New Campaign**
2. Add email steps with:
   - Subject line
   - Email body (supports variables)
   - Delay between steps
3. Select sending accounts
4. Add leads to campaign
5. Review and launch

## Support

- Documentation: /docs
- API Reference: /api/docs
- Email: support@instantscale.io
