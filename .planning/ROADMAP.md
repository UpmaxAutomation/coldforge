# Roadmap: InstantScale

## Overview

Build a production-ready cold email outreach platform combining Instantly.ai campaign management with Mailscale.ai infrastructure automation. Starting from foundation through to multi-tenant SaaS with Stripe billing. The journey: setup → infrastructure automation → sending engine → deliverability → monetization.

## Domain Expertise

None (general web application patterns)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation** - Project setup, database schema, auth, UI shell
- [ ] **Phase 2: Email Accounts** - SMTP/IMAP connections, OAuth, credential encryption
- [ ] **Phase 3: Domain Automation** - Registrar APIs for auto domain purchase
- [ ] **Phase 4: DNS Automation** - Auto SPF/DKIM/DMARC/BIMI configuration
- [ ] **Phase 5: Mailbox Provisioning** - Google Workspace & Microsoft 365 automation
- [ ] **Phase 6: Warmup System** - Email warmup logic and engagement simulation
- [ ] **Phase 7: Lead Management** - CSV import/export, validation, list management
- [ ] **Phase 8: Campaign Engine** - Sequences, conditions, scheduling, variables
- [ ] **Phase 9: Sending Engine** - SMTP sending, inbox rotation, job queue
- [ ] **Phase 10: Deliverability** - AI spam analysis, content variation, throttling
- [ ] **Phase 11: Reply Management** - IMAP polling, unified inbox, auto-stop
- [ ] **Phase 12: SaaS & Billing** - Stripe subscriptions, tenant isolation, usage limits

## Phase Details

### Phase 1: Foundation
**Goal**: Working Next.js app with database, auth, and dashboard shell on localhost
**Depends on**: Nothing (first phase)
**Research**: Likely (Supabase setup, Next.js 14 patterns)
**Research topics**: Supabase RLS patterns, Next.js app router, shadcn/ui setup
**Plans**: 3 plans

Plans:
- [ ] 01-01: Next.js project setup with TypeScript, Tailwind, shadcn/ui
- [ ] 01-02: Supabase database schema and RLS policies
- [ ] 01-03: Authentication flow and dashboard layout

### Phase 2: Email Accounts
**Goal**: Users can connect and manage multiple email accounts (Google/Microsoft/SMTP)
**Depends on**: Phase 1
**Research**: Likely (OAuth flows, credential encryption)
**Research topics**: Google OAuth for Gmail, Microsoft OAuth, AES-256 encryption in Node
**Plans**: 4 plans

Plans:
- [ ] 02-01: Email accounts database schema and CRUD API
- [ ] 02-02: Google Workspace OAuth connection flow
- [ ] 02-03: Microsoft 365 OAuth connection flow
- [ ] 02-04: Generic SMTP/IMAP connection with credential encryption

### Phase 3: Domain Automation
**Goal**: Auto-purchase domains via Cloudflare, Namecheap, Porkbun APIs
**Depends on**: Phase 2
**Research**: Likely (registrar APIs)
**Research topics**: Cloudflare Registrar API, Namecheap API, Porkbun API, domain availability checking
**Plans**: 4 plans

Plans:
- [ ] 03-01: Domain management database schema and UI
- [ ] 03-02: Cloudflare Registrar integration (at-cost domains)
- [ ] 03-03: Namecheap API integration
- [ ] 03-04: Porkbun API integration

### Phase 4: DNS Automation
**Goal**: Auto-configure SPF/DKIM/DMARC/BIMI records via Cloudflare DNS
**Depends on**: Phase 3
**Research**: Likely (DNS record formats, email authentication)
**Research topics**: Cloudflare DNS API, SPF/DKIM/DMARC syntax, BIMI requirements
**Plans**: 3 plans

Plans:
- [ ] 04-01: DNS configuration database schema and health monitoring
- [ ] 04-02: Cloudflare DNS API integration for record management
- [ ] 04-03: Auto-generate and validate SPF/DKIM/DMARC/BIMI records

### Phase 5: Mailbox Provisioning
**Goal**: Auto-create mailboxes in Google Workspace and Microsoft 365
**Depends on**: Phase 4
**Research**: Likely (admin APIs)
**Research topics**: Google Workspace Admin SDK, Microsoft Graph API for user provisioning
**Plans**: 3 plans

Plans:
- [ ] 05-01: Mailbox provisioning database schema and workflow
- [ ] 05-02: Google Workspace Admin SDK integration
- [ ] 05-03: Microsoft 365 Graph API integration

### Phase 6: Warmup System
**Goal**: Gradual email warmup with engagement simulation
**Depends on**: Phase 2
**Research**: Likely (warmup strategies, provider APIs)
**Research topics**: Email warmup algorithms, warmup provider APIs (Instantly Warmup, Warmup Inbox)
**Plans**: 3 plans

Plans:
- [ ] 06-01: Warmup configuration and progress tracking
- [ ] 06-02: Self-warmup engine (send between owned accounts)
- [ ] 06-03: Warmup provider API integration

### Phase 7: Lead Management
**Goal**: Import, validate, organize, and export leads
**Depends on**: Phase 1
**Research**: Likely (email validation APIs)
**Research topics**: ZeroBounce API, NeverBounce API, CSV parsing best practices
**Plans**: 3 plans

Plans:
- [ ] 07-01: Lead lists and leads database schema with UI
- [ ] 07-02: CSV import/export with validation
- [ ] 07-03: Email validation API integration (ZeroBounce/NeverBounce)

### Phase 8: Campaign Engine
**Goal**: Multi-step email sequences with conditions and scheduling
**Depends on**: Phase 7
**Research**: Unlikely (standard application patterns)
**Plans**: 4 plans

Plans:
- [ ] 08-01: Campaign and sequence database schema
- [ ] 08-02: Campaign builder UI with sequence editor
- [ ] 08-03: Conditional logic engine (if not opened, if not replied, etc.)
- [ ] 08-04: Variable substitution and template system

### Phase 9: Sending Engine
**Goal**: Reliable email sending with inbox rotation and smart scheduling
**Depends on**: Phase 8, Phase 2
**Research**: Likely (job queue patterns, SMTP libraries)
**Research topics**: BullMQ patterns, Nodemailer advanced usage, inbox rotation algorithms
**Plans**: 4 plans

Plans:
- [ ] 09-01: Redis + BullMQ job queue setup
- [ ] 09-02: SMTP sending service with Nodemailer
- [ ] 09-03: Inbox rotation and daily limit enforcement
- [ ] 09-04: Smart scheduling (timezone-aware, business hours, random delays)

### Phase 10: Deliverability
**Goal**: AI spam analysis, content variation, ISP-specific optimization
**Depends on**: Phase 9
**Research**: Likely (Claude API, spam filter patterns)
**Research topics**: Claude API for content analysis, Gmail/Yahoo/Outlook spam patterns, content spinning
**Plans**: 4 plans

Plans:
- [ ] 10-01: AI spam score prediction using Claude API
- [ ] 10-02: Content variation generation (anti-pattern detection)
- [ ] 10-03: ISP-specific sending strategies
- [ ] 10-04: Engagement-based throttling and reputation tracking

### Phase 11: Reply Management
**Goal**: Unified inbox for replies with auto-sequence stop
**Depends on**: Phase 9
**Research**: Likely (IMAP libraries, parsing)
**Research topics**: IMAP libraries for Node.js, email parsing, reply detection algorithms
**Plans**: 3 plans

Plans:
- [ ] 11-01: IMAP polling service for reply detection
- [ ] 11-02: Unified inbox UI with reply management
- [ ] 11-03: Auto-stop sequences on reply, reply categorization

### Phase 12: SaaS & Billing
**Goal**: Multi-tenant with Stripe subscriptions and usage limits
**Depends on**: All previous phases
**Research**: Likely (Stripe API)
**Research topics**: Stripe Subscriptions API, tiered pricing, usage metering, webhook handling
**Plans**: 4 plans

Plans:
- [ ] 12-01: Subscription plans and pricing configuration
- [ ] 12-02: Stripe integration (checkout, webhooks, portal)
- [ ] 12-03: Usage metering and limit enforcement
- [ ] 12-04: Tenant isolation and admin dashboard

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → ... → 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/3 | Not started | - |
| 2. Email Accounts | 0/4 | Not started | - |
| 3. Domain Automation | 0/4 | Not started | - |
| 4. DNS Automation | 0/3 | Not started | - |
| 5. Mailbox Provisioning | 0/3 | Not started | - |
| 6. Warmup System | 0/3 | Not started | - |
| 7. Lead Management | 0/3 | Not started | - |
| 8. Campaign Engine | 0/4 | Not started | - |
| 9. Sending Engine | 0/4 | Not started | - |
| 10. Deliverability | 0/4 | Not started | - |
| 11. Reply Management | 0/3 | Not started | - |
| 12. SaaS & Billing | 0/4 | Not started | - |

**Total: 42 plans across 12 phases**
