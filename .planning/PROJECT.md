# ColdForge - Cold Email Outreach Platform

## What This Is

A full-featured cold email outreach platform combining Instantly.ai's campaign management with Mailscale.ai's infrastructure automation. Multi-tenant SaaS for agencies and power users who need to send 10,000-100,000 emails/day with maximum deliverability against modern AI spam filters (Gmail RETVec, Yahoo AI, Microsoft Defender).

## Core Value

**Automated infrastructure + intelligent sending = inbox placement at scale.**

If everything else fails, the email sending engine with smart deliverability must work perfectly. Users can manually set up domains and accounts, but emails must land in inboxes.

## Requirements

### Validated

(None yet — ship to validate)

### Active

#### Infrastructure Automation (Mailscale-style)
- [ ] Auto domain purchase via Namecheap API
- [ ] Auto domain purchase via Cloudflare Registrar API (at-cost pricing)
- [ ] Auto domain purchase via Porkbun API (budget option)
- [ ] Auto DNS setup via Cloudflare DNS API (SPF/DKIM/DMARC/BIMI)
- [ ] Auto DNS setup via Namecheap DNS API (fallback)
- [ ] Auto mailbox creation (Google Workspace Admin SDK)
- [ ] Auto mailbox creation (Microsoft 365 Graph API)
- [ ] Custom SMTP server setup support
- [ ] Domain health monitoring (DNS propagation, record validation)

#### Email Account Management
- [ ] Connect Google Workspace accounts (OAuth)
- [ ] Connect Microsoft 365 accounts (OAuth)
- [ ] Connect any SMTP/IMAP accounts (generic)
- [ ] Per-account daily sending limits
- [ ] Account health monitoring dashboard
- [ ] Credential encryption (AES-256-CBC)

#### Email Warmup System
- [ ] Hybrid warmup (self-warmup between owned accounts)
- [ ] Warmup provider integration (API)
- [ ] Gradual volume increase algorithm
- [ ] Engagement simulation (opens, clicks, replies)
- [ ] Warmup progress tracking per account

#### Campaign Engine
- [ ] Multi-step email sequences with delays
- [ ] Conditional logic (if not opened, if not replied, etc.)
- [ ] Variable substitution ({{firstName}}, {{company}}, etc.)
- [ ] Inbox rotation across multiple sending accounts
- [ ] Timezone-aware scheduling
- [ ] Business hours sending
- [ ] Random delay variation (human-like patterns)

#### Deliverability System
- [ ] AI spam score prediction before sending (LLM analysis)
- [ ] Content variation generation (avoid pattern detection)
- [ ] ISP-specific sending strategies (Gmail vs Yahoo vs Outlook)
- [ ] Real-time DNS health monitoring
- [ ] Blacklist checking integration
- [ ] Bounce classification (hard/soft/block)
- [ ] Automatic list cleaning on bounces
- [ ] Engagement-based throttling

#### Reply Management
- [ ] IMAP polling for reply detection
- [ ] Auto-stop sequence on reply
- [ ] Unified inbox for all replies
- [ ] Reply categorization (interested, not interested, OOO)

#### Lead Management
- [ ] Lead list organization
- [ ] CSV import with validation
- [ ] CSV export
- [ ] Email validation integration
- [ ] Deduplication logic
- [ ] Bulk operations (tag, delete, export)

#### Analytics (Basic)
- [ ] Sent/Opened/Clicked/Replied/Bounced counts
- [ ] Per-campaign stats
- [ ] Per-account health scores
- [ ] Open/click tracking pixels

#### Multi-Tenant SaaS
- [ ] User authentication
- [ ] Tiered subscription plans (Starter/Pro/Agency)
- [ ] Stripe billing integration
- [ ] Usage metering
- [ ] Tenant data isolation (RLS)

#### Compliance
- [ ] Unsubscribe link in every email
- [ ] Unsubscribe page handling
- [ ] CAN-SPAM compliance
- [ ] GDPR data export/deletion

### Out of Scope (v1)

- AI email writing/copywriting — Focus on sending, not generating content
- CRM integrations (Salesforce, HubSpot) — Later phase
- Lead enrichment (Apollo, Hunter) — Later phase
- Fancy analytics dashboard — Basic stats only for v1
- GoHighLevel integration — Later phase
- ClickUp integration — Later phase
- n8n integration — Later phase
- Mobile app — Web-first

## Context

### Competitive Landscape
- **Instantly.ai**: Strong campaign management, good deliverability, no infrastructure automation
- **Mailscale.ai**: Great infrastructure automation, domain/mailbox provisioning
- **Smartlead**: Similar to Instantly, focused on agencies
- **Lemlist**: More personalization focused

### Target Users
1. Cold email agencies sending for multiple clients
2. Sales teams doing outbound at scale
3. Individual power users running multiple domains

### Technical Decisions Made
- **Email Providers**: All three (Google OAuth, Microsoft OAuth, generic SMTP)
- **Domain Registrars**: Multi-provider support
  - Cloudflare Registrar (at-cost domains, best DNS)
  - Namecheap (competitive pricing, good API)
  - Porkbun (budget option, developer-friendly)
- **DNS Management**: Cloudflare DNS primary (fast propagation, API-first)
- **Warmup Strategy**: Hybrid (self-warmup + provider integration)
- **Reply Handling**: Full unified inbox (not just detection)
- **Billing Model**: Tiered plans (not usage-based)

### Existing Technical Spec
Previous planning session produced:
- 13-table database schema (Drizzle ORM)
- 7-layer deliverability strategy
- Complete API specifications
- 16-week implementation roadmap

## Constraints

- **Scale**: Must handle 10,000-100,000 emails/day per tenant
- **Deliverability**: Must achieve >90% inbox placement on Gmail/Yahoo/Outlook
- **Security**: All credentials encrypted at rest, OAuth where possible
- **Compliance**: CAN-SPAM and GDPR compliant from day one

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Multi-registrar (Cloudflare/Namecheap/Porkbun) | User choice, price flexibility, redundancy | — Pending |
| Cloudflare DNS primary | Fastest propagation, best API, free tier | — Pending |
| Google + Microsoft + SMTP | Maximum compatibility for users | — Pending |
| Hybrid warmup | Balance between control and reliability | — Pending |
| Tiered billing | Simpler than usage-based, predictable revenue | — Pending |
| Unified inbox for replies | Key differentiator, better UX | — Pending |
| LLM spam analysis | Pre-send deliverability prediction | — Pending |

## Tech Stack (Recommended)

```
Frontend:     Next.js 14 + TypeScript + Tailwind + shadcn/ui
Backend:      FastAPI (Python) or Next.js API routes
Database:     PostgreSQL (Supabase with RLS)
Queue:        Redis + BullMQ (scheduled sends)
Email:        Nodemailer (SMTP) + IMAP libraries
DNS:          Cloudflare API (primary), Namecheap API (fallback)
Domains:      Cloudflare Registrar, Namecheap, Porkbun APIs
Mailbox:      Google Workspace Admin SDK, Microsoft Graph API
Auth:         Supabase Auth or NextAuth
Billing:      Stripe
AI:           Claude API for spam analysis
Validation:   ZeroBounce or NeverBounce API
```

---
*Last updated: 2026-01-12 after initialization*
