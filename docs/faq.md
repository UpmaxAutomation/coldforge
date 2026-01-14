# Frequently Asked Questions

## Getting Started

### How do I create an account?

Navigate to `/register` and sign up with your email address and a secure password. You'll receive a confirmation email to verify your account.

### What email providers are supported?

InstantScale works with any email provider that supports SMTP:
- Gmail / Google Workspace
- Microsoft 365 / Outlook
- Yahoo Mail
- Zoho Mail
- Custom SMTP servers
- Any IMAP/SMTP compatible provider

### Do I need a custom domain?

While not required, using a custom domain is highly recommended for:
- Better deliverability
- Professional appearance
- Improved sender reputation
- Avoiding sending limits on personal accounts

## Email Accounts

### How do I connect my Gmail account?

1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. In InstantScale, add account with:
   - SMTP Host: `smtp.gmail.com`
   - SMTP Port: `587`
   - Username: Your full Gmail address
   - Password: The App Password (not your regular password)

### How many email accounts can I connect?

There's no limit to the number of accounts you can connect. For best results:
- Use multiple accounts to distribute sending volume
- Enable warmup on new accounts
- Monitor reputation scores

### Why is my email account showing as disconnected?

Common causes:
1. **Password changed** - Update credentials in settings
2. **App password revoked** - Generate a new one
3. **2FA disabled** - Re-enable and create new app password
4. **Account locked** - Check for security alerts from provider

## Email Warmup

### What is email warmup?

Email warmup gradually increases your sending volume to build sender reputation with email providers. New accounts or dormant accounts need warmup to avoid being flagged as spam.

### How long does warmup take?

Typically 2-4 weeks to reach full sending capacity:
- Week 1: 5-20 emails/day
- Week 2: 20-50 emails/day
- Week 3: 50-100 emails/day
- Week 4+: Full capacity

### Can I skip warmup?

Not recommended. Sending high volumes from a new account will likely result in:
- Emails going to spam
- Account suspension
- Domain blacklisting
- Poor campaign performance

### How does the warmup network work?

InstantScale's warmup network:
1. Sends emails between real accounts
2. Opens and engages with emails
3. Marks emails as important
4. Replies to conversations
5. Moves emails from spam to inbox

## Campaigns

### How do I personalize emails?

Use variables in your email templates:
- `{{first_name}}` - Recipient's first name
- `{{last_name}}` - Recipient's last name
- `{{company}}` - Company name
- `{{email}}` - Email address
- `{{custom_field}}` - Any custom field

Example:
```
Hi {{first_name}},

I noticed {{company}} has been expanding...
```

### What's the best sending time?

Generally, Tuesday-Thursday between 9 AM - 11 AM recipient's local time performs best. Tips:
- Avoid Mondays (inbox overload)
- Avoid Fridays (weekend mode)
- Test different times for your audience

### How do I handle bounces?

InstantScale automatically:
1. Detects bounced emails
2. Marks leads as bounced
3. Stops sending to bounced addresses
4. Updates account reputation scores

Hard bounces (invalid addresses) are permanently excluded. Soft bounces (temporary issues) are retried.

### Can I A/B test emails?

Yes! Create multiple versions:
1. In campaign settings, enable A/B testing
2. Create variant subjects or bodies
3. Set test percentage (e.g., 20% of leads)
4. System automatically selects winner

## Leads

### What file formats can I import?

- CSV (Comma Separated Values)
- Excel (.xlsx, .xls)
- JSON

Required column: `email`
Optional: `first_name`, `last_name`, `company`, plus custom fields

### How do I handle duplicates?

During import:
- **Skip duplicates** - Ignore leads already in system
- **Update existing** - Overwrite with new data
- **Allow duplicates** - Create separate entries

### What happens when someone unsubscribes?

When a lead unsubscribes:
1. They're marked as unsubscribed
2. All active campaigns stop sending
3. They won't receive future emails
4. You can't re-add them to campaigns

### Can I segment my leads?

Yes, create segments based on:
- Custom fields
- Campaign activity
- Engagement level
- Date added
- Status

## Deliverability

### Why are my emails going to spam?

Common reasons:
1. **Low sender reputation** - Enable warmup
2. **Spammy content** - Avoid spam trigger words
3. **Missing authentication** - Set up SPF, DKIM, DMARC
4. **High bounce rate** - Clean your list
5. **Too many links/images** - Keep it simple

### How do I improve deliverability?

1. **Warm up accounts** before sending campaigns
2. **Authenticate domain** with SPF, DKIM, DMARC
3. **Clean your list** - Remove bounces and invalids
4. **Personalize content** - Avoid generic templates
5. **Respect limits** - Don't exceed daily quotas
6. **Monitor reputation** - Check dashboard regularly

### What's a good open rate?

Varies by industry, but benchmarks:
- Cold outreach: 15-25%
- Warm leads: 25-40%
- Existing customers: 40-60%

Focus on reply rate for outreach success.

## Technical

### What are SPF, DKIM, and DMARC?

**SPF** (Sender Policy Framework): Specifies which servers can send email for your domain.

**DKIM** (DomainKeys Identified Mail): Adds a digital signature to verify email authenticity.

**DMARC** (Domain-based Message Authentication): Tells receiving servers how to handle failed authentication.

### How do I set up DNS records?

Go to **Settings** > **Domains** > **Add Domain**:
1. Enter your domain
2. Copy the DNS records provided
3. Add them to your DNS provider
4. Click verify

Records needed:
- SPF: TXT record
- DKIM: TXT record
- DMARC: TXT record (optional but recommended)

### Is there an API?

Yes! Full REST API available. See [API Guide](/docs/api-guide.md) for documentation.

Get your API key at **Settings** > **API Keys**.

### Can I integrate with my CRM?

Yes, through:
1. **Webhooks** - Real-time event notifications
2. **API** - Direct integration
3. **Zapier** - No-code automation (coming soon)

## Billing & Plans

### What plans are available?

Check current pricing at **Settings** > **Billing** or contact sales@instantscale.io for enterprise options.

### Is there a free trial?

Yes, new accounts get a 14-day free trial with full features.

### How do I cancel my subscription?

Go to **Settings** > **Billing** > **Cancel Subscription**. Your data will be retained for 30 days.

## Support

### How do I get help?

1. **Documentation** - /docs
2. **API Reference** - /api/docs
3. **Email Support** - support@instantscale.io
4. **Live Chat** - Available in-app during business hours

### What are the support hours?

- Standard: Monday-Friday, 9 AM - 6 PM EST
- Enterprise: 24/7 priority support

### Is there a community?

Join our community:
- Discord: discord.gg/instantscale
- Twitter: @instantscale

## Security

### How is my data protected?

- All data encrypted at rest (AES-256)
- TLS 1.3 encryption in transit
- SOC 2 Type II compliance (in progress)
- Regular security audits
- No third-party data sharing

### Can I enable 2FA?

Yes! Go to **Settings** > **Security** > **Enable Two-Factor Authentication**.

Supported methods:
- Authenticator app (recommended)
- SMS (backup)

### Where is data stored?

Data is stored in secure cloud infrastructure:
- Primary: AWS US-East
- Backups: Multiple regions
- GDPR compliant data handling
