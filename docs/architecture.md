# InstantScale Architecture

## Overview

InstantScale is a Next.js 16 application with Supabase backend, designed as a multi-tenant SaaS platform for cold email outreach at scale (10,000-100,000 emails/day per tenant).

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Next.js API Routes |
| **Database** | Supabase (PostgreSQL with RLS) |
| **Auth** | Supabase Auth |
| **Queue** | Redis + BullMQ |
| **Email Sending** | Nodemailer (SMTP) |
| **Email Receiving** | IMAPFlow (IMAP) |
| **Billing** | Stripe |
| **Logging** | Pino |

## Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── accounts/             # Email account management
│   │   ├── campaigns/            # Campaign CRUD & execution
│   │   ├── domains/              # Domain management
│   │   ├── leads/                # Lead management
│   │   ├── warmup/               # Warmup engine APIs
│   │   ├── billing/              # Stripe webhooks
│   │   └── health/               # Health checks
│   ├── (auth)/                   # Auth pages (login, register)
│   └── (dashboard)/              # Protected dashboard pages
├── components/                   # React components
│   └── ui/                       # shadcn/ui components
├── lib/                          # Core libraries (92 files)
│   ├── supabase/                 # Database client & middleware
│   ├── sending/                  # Email sending engine
│   │   ├── sender.ts             # Core email sender
│   │   ├── scheduler.ts          # Timezone-aware scheduling
│   │   ├── rotation.ts           # Account rotation logic
│   │   └── queue.ts              # Send queue management
│   ├── warmup/                   # Warmup system
│   │   ├── engine.ts             # Warmup orchestration
│   │   ├── scheduler.ts          # Warmup scheduling
│   │   ├── reputation.ts         # Reputation scoring
│   │   ├── analytics.ts          # Warmup metrics
│   │   └── templates.ts          # Warmup email templates
│   ├── deliverability/           # Deliverability engine
│   │   ├── spam-analyzer.ts      # AI spam prediction
│   │   ├── bounce-handler.ts     # Bounce classification
│   │   └── health.ts             # DNS health monitoring
│   ├── queue/                    # Job queue system
│   │   ├── processors/           # BullMQ job processors
│   │   │   ├── email.ts          # Email send processor
│   │   │   ├── warmup.ts         # Warmup processor
│   │   │   └── campaign.ts       # Campaign processor
│   │   └── workers.ts            # Worker management
│   ├── registrars/               # Domain registrar integrations
│   │   ├── cloudflare.ts         # Cloudflare Registrar API
│   │   ├── namecheap.ts          # Namecheap API
│   │   └── porkbun.ts            # Porkbun API
│   ├── mailbox-providers/        # Mailbox provisioning
│   │   ├── google-workspace.ts   # Google Admin SDK
│   │   └── microsoft-365.ts      # Microsoft Graph API
│   ├── domains/                  # Domain management
│   │   ├── purchase.ts           # Domain purchase orchestration
│   │   ├── dns-config.ts         # DNS record management
│   │   └── health.ts             # Domain health monitoring
│   ├── billing/                  # Stripe integration
│   │   ├── stripe.ts             # Stripe client
│   │   └── usage.ts              # Usage metering
│   ├── circuit-breaker/          # External service resilience
│   ├── cache/                    # In-memory caching
│   ├── rate-limit/               # Rate limiting middleware
│   ├── logger/                   # Structured logging (Pino)
│   ├── security/                 # CSP, CSRF protection
│   ├── audit/                    # Audit logging
│   ├── errors/                   # Error handling
│   ├── retry/                    # Retry strategies
│   └── validation/               # Input validation (Zod)
└── types/                        # TypeScript types
```

## Core Systems

### 1. Email Sending Engine

```
┌─────────────────────────────────────────────────────────────┐
│                    Campaign Scheduler                        │
│  (Timezone-aware, business hours, random delays)            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Send Queue (BullMQ)                       │
│  (Priority queuing, retry logic, dead letter queue)         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Account Rotation                           │
│  (Load balancing, daily limits, health-based selection)     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Email Sender                              │
│  (SMTP transport, OAuth tokens, credential encryption)      │
└─────────────────────────────────────────────────────────────┘
```

### 2. Warmup System

```
┌─────────────────────────────────────────────────────────────┐
│                   Warmup Engine                              │
│  - Hybrid warmup (self-warmup between owned accounts)       │
│  - Gradual volume increase algorithm                        │
│  - Engagement simulation (opens, clicks, replies)           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 Reputation Scoring                           │
│  - Per-account health scores                                │
│  - Bounce rate monitoring                                   │
│  - Engagement metrics                                       │
└─────────────────────────────────────────────────────────────┘
```

### 3. Deliverability System

```
┌─────────────────────────────────────────────────────────────┐
│                  Spam Analyzer                               │
│  - AI-powered spam prediction before sending                │
│  - Content variation suggestions                            │
│  - ISP-specific strategy recommendations                    │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                Bounce Handler                                │
│  - Hard/soft/block classification                           │
│  - Automatic list cleaning                                  │
│  - Engagement-based throttling                              │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              DNS Health Monitor                              │
│  - SPF/DKIM/DMARC validation                                │
│  - Blacklist checking                                       │
│  - Real-time propagation monitoring                         │
└─────────────────────────────────────────────────────────────┘
```

### 4. Infrastructure Automation

```
┌─────────────────────────────────────────────────────────────┐
│              Domain Purchase Orchestration                   │
│                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │  Cloudflare  │  │  Namecheap   │  │   Porkbun    │     │
│   │  (at-cost)   │  │ (competitive)│  │  (budget)    │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                DNS Configuration                             │
│  - Auto SPF/DKIM/DMARC/BIMI setup                          │
│  - Cloudflare DNS primary (fast propagation)               │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Mailbox Provisioning                            │
│                                                             │
│   ┌──────────────────────┐  ┌──────────────────────┐       │
│   │  Google Workspace    │  │  Microsoft 365       │       │
│   │  (Admin SDK)         │  │  (Graph API)         │       │
│   └──────────────────────┘  └──────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Multi-Tenancy with Row-Level Security

All database tables use Supabase RLS policies to ensure tenant data isolation:

```sql
-- Example RLS policy
CREATE POLICY "Users can only access their own data"
ON campaigns
FOR ALL
USING (user_id = auth.uid());
```

### Circuit Breakers for External Services

External API calls (registrars, mailbox providers, SMTP) are wrapped in circuit breakers to prevent cascade failures:

```typescript
// lib/circuit-breaker/services.ts
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000,
});
```

### In-Memory Caching with TTL

Query results and computed values are cached with TTL to reduce database load:

```typescript
// lib/cache/queries.ts
const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
```

### Structured Logging with Pino

All logs are structured JSON for easy aggregation and analysis:

```typescript
// lib/logger/index.ts
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: { /* ... */ }
});
```

### Credential Encryption

All email credentials are encrypted at rest using AES-256-CBC:

```typescript
// lib/encryption.ts
export function encrypt(text: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  // ...
}
```

## Data Flow

### Campaign Execution Flow

```
1. User creates campaign with leads and sequence steps
2. Scheduler calculates send times (timezone, business hours)
3. Jobs added to BullMQ send queue
4. Worker picks job, rotates to healthy account
5. Email sent via SMTP with tracking pixels
6. Results stored in database
7. Sequence advances or stops based on engagement
```

### Warmup Flow

```
1. New account enrolled in warmup program
2. Scheduler generates daily warmup schedule
3. Warmup emails sent between owned accounts
4. Engagement simulated (opens, clicks, replies)
5. Volume gradually increased based on reputation
6. Analytics tracked and displayed in dashboard
```

## Security Measures

- **Authentication**: Supabase Auth with OAuth support
- **Authorization**: Row-Level Security on all tables
- **Rate Limiting**: Per-endpoint limits via Redis
- **CSRF Protection**: Token-based CSRF middleware
- **CSP Headers**: Strict Content Security Policy
- **Audit Logging**: All sensitive operations logged
- **Encryption**: AES-256-CBC for credentials

## Scalability Considerations

- **Horizontal Scaling**: Stateless API routes, external Redis/Postgres
- **Queue Distribution**: BullMQ workers can scale independently
- **Database**: Supabase handles connection pooling and scaling
- **Caching**: In-memory cache reduces database load
- **Rate Limiting**: Protects against abuse and ensures fair usage
