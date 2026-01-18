# ColdForge - Complete Cold Email Infrastructure Platform

## Vision

Build the **#1 All-in-One Cold Email Platform** combining:
- **Instantly.ai features** (campaigns, sequences, analytics)
- **Mailscale infrastructure** (bulk mailbox generation, domain automation)
- **AI-native differentiation** (Claude-powered everything)

**Target**: Replace 3 tools with 1 → Instantly + Mailscale + Warmup Inbox

---

## Current State (January 2026)

### Completed (Phases 1-13)
- ✅ Core platform (auth, multi-tenancy, campaigns, leads)
- ✅ Email account management + domain DNS
- ✅ Unified inbox (Unibox)
- ✅ Campaign builder with sequences
- ✅ Analytics & reporting
- ✅ **Phase 13.1**: Spintax variation engine
- ✅ **Phase 13.2**: AI email writer (Claude)
- ✅ **Phase 13.3**: Comprehensive warmup system
  - Pool manager with ESP matching
  - Slow ramp controller (+1/day)
  - AI-powered reply generation
  - Headless browser engagement
  - Google Postmaster Tools integration
  - Central orchestrator with BullMQ
- ✅ **Phase 13.4**: Content spam checker

### Remaining to Match Mailscale
- ❌ Bulk domain registration (auto-purchase)
- ❌ Auto DNS provisioning (SPF/DKIM/DMARC)
- ❌ Bulk mailbox generation (50+ in 60 seconds)
- ❌ Email infrastructure (SMTP sending)
- ❌ IP pool management
- ❌ Blacklist monitoring & recovery
- ❌ Stripe billing system
- ❌ External integrations (Instantly, Smartlead API)

---

## Infrastructure Strategy Decision

### Option A: Third-Party APIs (Recommended for Speed)
```
Pros:
├── Faster to market (weeks vs months)
├── No SMTP infrastructure maintenance
├── Leverages existing IP reputation
├── Lower operational complexity
└── Focus on features, not ops

Providers:
├── Mailgun/Amazon SES → SMTP sending
├── MailSlurp → Programmatic inbox creation
├── Cloudflare → Domain registration
└── Google Workspace API → Gmail mailboxes

Cons:
├── Higher per-email costs
├── Less control over deliverability
└── Provider dependency
```

### Option B: Self-Hosted Infrastructure (Maximum Control)
```
Pros:
├── Full control over IPs and reputation
├── Lower cost at scale
├── No provider limitations
└── Competitive moat

Components:
├── Zone-MTA/Haraka → SMTP server
├── Dovecot → IMAP server
├── Clean IP blocks → $300-800/mo
└── Multiple server locations

Cons:
├── 2-3 months setup time
├── IP warmup takes weeks
├── DevOps expertise required
└── Higher operational burden
```

### Option C: Hybrid (Best of Both) ★ RECOMMENDED
```
Phase 1: Start with APIs
├── Use Mailgun for SMTP
├── Use MailSlurp for test inboxes
├── Use Google Workspace for production mailboxes
└── Launch fast, validate market

Phase 2: Add Self-Hosted Layer
├── Build SMTP infrastructure gradually
├── Offer as "premium" tier
├── Migrate high-volume users
└── Maintain API as fallback
```

---

## Target Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    ColdForge Platform                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Campaign   │  │   Warmup    │  │   Inbox     │          │
│  │   Engine    │  │   Engine    │  │   (Unibox)  │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│  ┌──────┴────────────────┴────────────────┴──────┐          │
│  │              Sending Infrastructure            │          │
│  ├────────────────────────────────────────────────┤          │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐        │          │
│  │  │ Mailgun │  │ AWS SES │  │ Custom  │        │          │
│  │  │  SMTP   │  │  SMTP   │  │  SMTP   │        │          │
│  │  └────┬────┘  └────┬────┘  └────┬────┘        │          │
│  │       └───────────┬┴───────────┘              │          │
│  │           Smart Router (cost/deliverability)   │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  ┌────────────────────────────────────────────────┐          │
│  │              Mailbox Infrastructure            │          │
│  ├────────────────────────────────────────────────┤          │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │          │
│  │  │ Google   │  │ Microsoft│  │ MailSlurp│     │          │
│  │  │Workspace │  │   365    │  │  Custom  │     │          │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘     │          │
│  │       └───────────┬─┴────────────┘            │          │
│  │          Unified Credential Store (encrypted)  │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  ┌────────────────────────────────────────────────┐          │
│  │              Domain Infrastructure             │          │
│  ├────────────────────────────────────────────────┤          │
│  │  Cloudflare Registrar → Auto DNS → Health     │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Success Metrics

| Metric | Now | 30 Days | 90 Days |
|--------|-----|---------|---------|
| Mailbox generation time | N/A | <60 sec for 50 | <30 sec for 100 |
| Domain setup time | Manual | <5 min auto | <2 min auto |
| Primary inbox rate | ~70% | >80% | >90% |
| Warmup pool size | 0 | 1,000 | 10,000 |
| Active paying users | 0 | 50 | 500 |
| MRR | $0 | $2,500 | $25,000 |

---

## Tech Stack

```
Frontend:
├── Next.js 16 + TypeScript
├── Tailwind CSS + shadcn/ui
├── React Query for data fetching
└── Recharts for analytics

Backend:
├── Next.js API Routes
├── Supabase PostgreSQL + RLS
├── Redis + BullMQ for queues
├── Supabase Auth

Infrastructure APIs:
├── Cloudflare (domains, DNS)
├── Mailgun/SES (SMTP)
├── Google Workspace (mailboxes)
├── MailSlurp (test inboxes)

AI:
├── Claude claude-sonnet-4-20250514 (email writing)
├── Claude (spam analysis)
└── Claude (reply generation)

Monitoring:
├── Sentry (errors)
├── Pino (logging)
├── Google Postmaster Tools
└── Custom dashboards
```

---

## Competitive Advantages

1. **AI-Native**: Claude powers every feature (writing, warmup, analysis)
2. **All-in-One**: No need for Instantly + Mailscale + Warmup Inbox
3. **Speed**: 50+ mailboxes in 60 seconds
4. **Deliverability**: >90% primary inbox with comprehensive warmup
5. **Infrastructure Included**: Domains and mailboxes built-in

---

## Business Model

```
┌─────────────────────────────────────────────────────────────┐
│                     Pricing Tiers                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  STARTER          GROWTH           AGENCY       ENTERPRISE  │
│  $79/mo           $149/mo          $349/mo      Custom      │
│                                                             │
│  15 mailboxes     50 mailboxes     200 mailboxes  Unlimited │
│  3 domains        10 domains       50 domains    Unlimited  │
│  5k emails/mo     25k emails/mo    100k emails   Unlimited  │
│  Basic warmup     Full warmup      Priority      Dedicated  │
│  AI writer        AI writer        API access    White-label│
│                   A/B testing      Integrations  Custom dev │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Add-ons:
├── Extra mailbox: $2/mo
├── Extra domain: $3/mo
├── Dedicated IP: $50/mo
├── API access: $99/mo
└── White-label: $500/mo setup + $200/mo
```

---

*ColdForge PROJECT.md - v1.0*
*Created: 2026-01-17*
*Strategy: Hybrid Infrastructure (API first, self-hosted later)*
