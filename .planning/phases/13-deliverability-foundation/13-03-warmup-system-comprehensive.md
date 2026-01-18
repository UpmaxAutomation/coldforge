# Plan 13-03: Comprehensive Warmup System

## Objective
Build a production-grade warmup system that guarantees PRIMARY INBOX placement through:
- Large-scale warmup pool (self-hosted + partner integration)
- Headless browser engagement simulation
- Google Postmaster Tools integration
- Multi-tier pool management
- AI-powered reply generation
- Real-time reputation monitoring

## Why This Is Critical
> **"What percentage of our cold emails land in Gmail's PRIMARY inbox?"**
> Target: >85% primary inbox placement

Without proper warmup, ALL other features are useless. This is THE core differentiator.

## Research Summary

Based on [Instantly.ai's warmup system](https://instantly.ai/email-warmup):
- 4.2M+ accounts in warmup pool
- Private headless browser network
- Read emulation (time spent scrolling)
- Multi-tier pools (Basic/Standard/Premium)
- Slow ramp (1 email day 1, +1/day until max)

Based on [Gmail's RETVec](https://folderly.com/blog/gmail-ai-spam-content-filter):
- 38% improvement in spam detection
- Detects visual tricks and keyword stuffing
- Clean, human-like content required

Based on [Google Postmaster Tools](https://developers.google.com/workspace/gmail/postmaster):
- Real-time reputation monitoring
- Spam rate must be <0.3%
- API for automated monitoring

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     COLDFORGE WARMUP SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│  │   WARMUP     │   │   WARMUP     │   │   WARMUP     │                │
│  │   POOL       │   │   POOL       │   │   POOL       │                │
│  │  (BASIC)     │   │ (STANDARD)   │   │  (PREMIUM)   │                │
│  │  SMTP Only   │   │ Gmail+MSFT   │   │ Aged Google  │                │
│  │  10K accts   │   │ 50K accts    │   │ 5K accts     │                │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                │
│         │                  │                  │                         │
│         └──────────────────┼──────────────────┘                         │
│                            │                                            │
│                   ┌────────▼────────┐                                   │
│                   │   ENGAGEMENT    │                                   │
│                   │     ENGINE      │                                   │
│                   │                 │                                   │
│                   │ • Headless      │                                   │
│                   │   Browsers      │                                   │
│                   │ • Read Time     │                                   │
│                   │ • Scroll Sim    │                                   │
│                   │ • Spam Rescue   │                                   │
│                   │ • AI Replies    │                                   │
│                   └────────┬────────┘                                   │
│                            │                                            │
│         ┌──────────────────┼──────────────────┐                         │
│         │                  │                  │                         │
│  ┌──────▼───────┐   ┌──────▼───────┐   ┌──────▼───────┐                │
│  │   SLOW RAMP  │   │  REPUTATION  │   │  POSTMASTER  │                │
│  │  CONTROLLER  │   │   TRACKER    │   │    TOOLS     │                │
│  │              │   │              │   │              │                │
│  │ • +1/day     │   │ • Per Domain │   │ • Spam Rate  │                │
│  │ • Volume Cap │   │ • Per IP     │   │ • Auth Rate  │                │
│  │ • Auto Pause │   │ • Alerts     │   │ • Errors     │                │
│  └──────────────┘   └──────────────┘   └──────────────┘                │
│                                                                          │
│                   ┌────────────────┐                                    │
│                   │   DASHBOARD    │                                    │
│                   │                │                                    │
│                   │ • Health Score │                                    │
│                   │ • Pool Status  │                                    │
│                   │ • Reputation   │                                    │
│                   │ • Alerts       │                                    │
│                   └────────────────┘                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Task 1: Warmup Pool Database Schema

Add to existing schema - `/supabase/migrations/20260117_warmup_pool.sql`:

```sql
-- Warmup pool accounts (our network)
CREATE TABLE warmup_pool_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'yahoo', 'smtp')),
  pool_tier TEXT NOT NULL DEFAULT 'standard' CHECK (pool_tier IN ('basic', 'standard', 'premium')),

  -- Credentials (encrypted)
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  encrypted_password TEXT NOT NULL,

  -- Account metadata
  account_age_days INTEGER NOT NULL DEFAULT 0,
  domain TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,

  -- Health metrics
  total_sends INTEGER NOT NULL DEFAULT 0,
  total_receives INTEGER NOT NULL DEFAULT 0,
  spam_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  bounce_rate NUMERIC(5,4) NOT NULL DEFAULT 0,

  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Warmup sessions (active warmup campaigns)
CREATE TABLE warmup_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Configuration
  daily_limit INTEGER NOT NULL DEFAULT 10,
  current_day INTEGER NOT NULL DEFAULT 1,
  target_daily_limit INTEGER NOT NULL DEFAULT 40,
  ramp_rate INTEGER NOT NULL DEFAULT 1, -- emails per day increase

  -- Settings
  read_emulation BOOLEAN NOT NULL DEFAULT true,
  reply_rate NUMERIC(3,2) NOT NULL DEFAULT 0.40, -- 40% reply rate
  spam_rescue BOOLEAN NOT NULL DEFAULT true,
  open_delay_min INTEGER NOT NULL DEFAULT 300, -- 5 min minimum before open
  open_delay_max INTEGER NOT NULL DEFAULT 7200, -- 2 hr max before open

  -- Pool assignment
  pool_tier TEXT NOT NULL DEFAULT 'standard',

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  pause_reason TEXT,

  -- Metrics
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_received INTEGER NOT NULL DEFAULT 0,
  total_opened INTEGER NOT NULL DEFAULT 0,
  total_replied INTEGER NOT NULL DEFAULT 0,
  total_rescued_from_spam INTEGER NOT NULL DEFAULT 0,

  -- Tracking
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual warmup emails
CREATE TABLE warmup_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES warmup_sessions(id) ON DELETE CASCADE,

  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),

  -- Email details
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT,
  message_id TEXT UNIQUE,
  thread_id TEXT,

  -- Pool account used
  pool_account_id UUID REFERENCES warmup_pool_accounts(id),

  -- Engagement tracking
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  read_duration_seconds INTEGER, -- How long email was "read"
  replied_at TIMESTAMPTZ,
  reply_message_id TEXT,

  -- Spam rescue
  landed_in_spam BOOLEAN NOT NULL DEFAULT false,
  rescued_from_spam BOOLEAN NOT NULL DEFAULT false,
  rescued_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'replied', 'failed')),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reputation tracking per domain/IP
CREATE TABLE sender_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identifier
  type TEXT NOT NULL CHECK (type IN ('domain', 'ip')),
  identifier TEXT NOT NULL, -- domain or IP address

  -- Google Postmaster metrics
  reputation_score TEXT CHECK (reputation_score IN ('bad', 'low', 'medium', 'high')),
  spam_rate NUMERIC(5,4),
  user_reported_spam_rate NUMERIC(5,4),
  ip_reputation TEXT,
  domain_reputation TEXT,

  -- Authentication
  spf_success_rate NUMERIC(5,4),
  dkim_success_rate NUMERIC(5,4),
  dmarc_success_rate NUMERIC(5,4),

  -- Delivery metrics
  delivery_error_rate NUMERIC(5,4),

  -- Warmup specific
  warmup_phase TEXT CHECK (warmup_phase IN ('cold', 'warming', 'warm', 'hot')),
  warmup_started_at TIMESTAMPTZ,
  warmup_completed_at TIMESTAMPTZ,

  -- Alerts
  last_alert_at TIMESTAMPTZ,
  alert_count INTEGER NOT NULL DEFAULT 0,

  -- Tracking
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, type, identifier)
);

-- Indexes
CREATE INDEX idx_warmup_pool_active ON warmup_pool_accounts(is_active, pool_tier);
CREATE INDEX idx_warmup_pool_provider ON warmup_pool_accounts(provider, is_active);
CREATE INDEX idx_warmup_sessions_account ON warmup_sessions(account_id, status);
CREATE INDEX idx_warmup_sessions_user ON warmup_sessions(user_id, status);
CREATE INDEX idx_warmup_emails_session ON warmup_emails(session_id, created_at);
CREATE INDEX idx_warmup_emails_status ON warmup_emails(status, created_at);
CREATE INDEX idx_sender_reputation_user ON sender_reputation(user_id, type);
```

### Task 2: Warmup Pool Manager

Create `/src/lib/warmup/pool-manager.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/encryption';

export type PoolTier = 'basic' | 'standard' | 'premium';
export type Provider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';

export interface PoolAccount {
  id: string;
  email: string;
  provider: Provider;
  poolTier: PoolTier;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  password: string;
  accountAgeDays: number;
  isActive: boolean;
  spamRate: number;
  bounceRate: number;
}

export interface PoolStats {
  totalAccounts: number;
  activeAccounts: number;
  byTier: Record<PoolTier, number>;
  byProvider: Record<Provider, number>;
  avgSpamRate: number;
  avgAccountAge: number;
}

/**
 * Select optimal warmup partners for a given account
 */
export async function selectWarmupPartners(
  accountEmail: string,
  accountProvider: Provider,
  count: number = 10,
  preferredTier: PoolTier = 'standard'
): Promise<PoolAccount[]> {
  const supabase = await createClient();

  // Prioritize same provider for ESP matching
  // Gmail → Gmail, Outlook → Outlook for best deliverability
  const { data: sameProvider } = await supabase
    .from('warmup_pool_accounts')
    .select('*')
    .eq('is_active', true)
    .eq('provider', accountProvider)
    .eq('pool_tier', preferredTier)
    .neq('email', accountEmail)
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(Math.ceil(count * 0.7)); // 70% same provider

  // Fill remaining with other providers
  const { data: otherProviders } = await supabase
    .from('warmup_pool_accounts')
    .select('*')
    .eq('is_active', true)
    .eq('pool_tier', preferredTier)
    .neq('provider', accountProvider)
    .neq('email', accountEmail)
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(Math.ceil(count * 0.3)); // 30% other providers

  const allPartners = [...(sameProvider || []), ...(otherProviders || [])];

  return allPartners.slice(0, count).map(p => ({
    id: p.id,
    email: p.email,
    provider: p.provider as Provider,
    poolTier: p.pool_tier as PoolTier,
    imapHost: p.imap_host,
    imapPort: p.imap_port,
    smtpHost: p.smtp_host,
    smtpPort: p.smtp_port,
    password: decrypt(p.encrypted_password),
    accountAgeDays: p.account_age_days,
    isActive: p.is_active,
    spamRate: parseFloat(p.spam_rate),
    bounceRate: parseFloat(p.bounce_rate)
  }));
}

/**
 * Add account to warmup pool
 */
export async function addToPool(
  email: string,
  password: string,
  provider: Provider,
  imapHost: string,
  smtpHost: string,
  tier: PoolTier = 'standard'
): Promise<string> {
  const supabase = await createClient();

  const domain = email.split('@')[1];

  const { data, error } = await supabase
    .from('warmup_pool_accounts')
    .insert({
      email,
      provider,
      pool_tier: tier,
      imap_host: imapHost,
      imap_port: 993,
      smtp_host: smtpHost,
      smtp_port: 587,
      encrypted_password: encrypt(password),
      domain,
      account_age_days: 0
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Get pool statistics
 */
export async function getPoolStats(): Promise<PoolStats> {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from('warmup_pool_accounts')
    .select('pool_tier, provider, is_active, spam_rate, account_age_days');

  if (!accounts) {
    return {
      totalAccounts: 0,
      activeAccounts: 0,
      byTier: { basic: 0, standard: 0, premium: 0 },
      byProvider: { gmail: 0, outlook: 0, yahoo: 0, smtp: 0 },
      avgSpamRate: 0,
      avgAccountAge: 0
    };
  }

  const active = accounts.filter(a => a.is_active);

  const byTier = { basic: 0, standard: 0, premium: 0 };
  const byProvider = { gmail: 0, outlook: 0, yahoo: 0, smtp: 0 };

  for (const a of active) {
    byTier[a.pool_tier as PoolTier]++;
    byProvider[a.provider as Provider]++;
  }

  const avgSpamRate = active.length > 0
    ? active.reduce((sum, a) => sum + parseFloat(a.spam_rate), 0) / active.length
    : 0;

  const avgAccountAge = active.length > 0
    ? active.reduce((sum, a) => sum + a.account_age_days, 0) / active.length
    : 0;

  return {
    totalAccounts: accounts.length,
    activeAccounts: active.length,
    byTier,
    byProvider,
    avgSpamRate,
    avgAccountAge
  };
}

/**
 * Deactivate underperforming accounts
 */
export async function pruneUnhealthyAccounts(
  maxSpamRate: number = 0.02,
  maxBounceRate: number = 0.05
): Promise<number> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('warmup_pool_accounts')
    .update({ is_active: false })
    .or(`spam_rate.gt.${maxSpamRate},bounce_rate.gt.${maxBounceRate}`)
    .eq('is_active', true)
    .select('id');

  return data?.length || 0;
}

/**
 * Update account usage timestamp
 */
export async function markAccountUsed(accountId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('warmup_pool_accounts')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', accountId);
}

/**
 * Update account health metrics
 */
export async function updateAccountHealth(
  accountId: string,
  spamRate: number,
  bounceRate: number
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('warmup_pool_accounts')
    .update({
      spam_rate: spamRate,
      bounce_rate: bounceRate,
      updated_at: new Date().toISOString()
    })
    .eq('id', accountId);
}
```

### Task 3: Slow Ramp Controller

Create `/src/lib/warmup/slow-ramp.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';

export interface RampConfig {
  startingVolume: number;      // Day 1 volume (default: 1)
  dailyIncrease: number;       // Increase per day (default: 1)
  maxDailyVolume: number;      // Target max volume (default: 40)
  warmupDurationDays: number;  // Calculated based on config
}

export interface DailySchedule {
  totalEmails: number;
  sendSlots: Date[];
  receiveSlots: Date[];
}

/**
 * Calculate warmup duration based on config
 */
export function calculateWarmupDuration(config: RampConfig): number {
  return Math.ceil((config.maxDailyVolume - config.startingVolume) / config.dailyIncrease) + 1;
}

/**
 * Get volume for a specific day
 */
export function getVolumeForDay(day: number, config: RampConfig): number {
  const volume = config.startingVolume + (day - 1) * config.dailyIncrease;
  return Math.min(volume, config.maxDailyVolume);
}

/**
 * Generate daily schedule with randomized timing
 */
export function generateDailySchedule(
  day: number,
  config: RampConfig,
  timezone: string = 'America/New_York'
): DailySchedule {
  const totalEmails = getVolumeForDay(day, config);

  // Business hours: 8 AM - 6 PM (more realistic)
  const startHour = 8;
  const endHour = 18;
  const hoursInDay = endHour - startHour;

  const now = new Date();
  const today = new Date(now.toLocaleDateString('en-US', { timeZone: timezone }));

  const sendSlots: Date[] = [];
  const receiveSlots: Date[] = [];

  for (let i = 0; i < totalEmails; i++) {
    // Randomize send time within business hours
    const sendHour = startHour + Math.random() * hoursInDay;
    const sendMinute = Math.random() * 60;
    const sendTime = new Date(today);
    sendTime.setHours(Math.floor(sendHour), Math.floor(sendMinute), 0, 0);
    sendSlots.push(sendTime);

    // Receive time: 5 min to 2 hours after send
    const receiveDelayMinutes = 5 + Math.random() * 115; // 5-120 min
    const receiveTime = new Date(sendTime.getTime() + receiveDelayMinutes * 60 * 1000);
    receiveSlots.push(receiveTime);
  }

  // Sort by time
  sendSlots.sort((a, b) => a.getTime() - b.getTime());
  receiveSlots.sort((a, b) => a.getTime() - b.getTime());

  return { totalEmails, sendSlots, receiveSlots };
}

/**
 * Check if warmup should be paused based on health
 */
export async function shouldPauseWarmup(
  sessionId: string,
  maxSpamRate: number = 0.003, // 0.3%
  maxBounceRate: number = 0.02  // 2%
): Promise<{ shouldPause: boolean; reason?: string }> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('warmup_sessions')
    .select(`
      *,
      email_accounts!inner(email, domain)
    `)
    .eq('id', sessionId)
    .single();

  if (!session) {
    return { shouldPause: true, reason: 'Session not found' };
  }

  // Check recent email health
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentEmails } = await supabase
    .from('warmup_emails')
    .select('status, landed_in_spam')
    .eq('session_id', sessionId)
    .gte('created_at', oneDayAgo);

  if (!recentEmails || recentEmails.length < 10) {
    return { shouldPause: false }; // Not enough data
  }

  const spamCount = recentEmails.filter(e => e.landed_in_spam).length;
  const failedCount = recentEmails.filter(e => e.status === 'failed').length;

  const spamRate = spamCount / recentEmails.length;
  const bounceRate = failedCount / recentEmails.length;

  if (spamRate > maxSpamRate) {
    return { shouldPause: true, reason: `Spam rate ${(spamRate * 100).toFixed(2)}% exceeds ${maxSpamRate * 100}%` };
  }

  if (bounceRate > maxBounceRate) {
    return { shouldPause: true, reason: `Bounce rate ${(bounceRate * 100).toFixed(2)}% exceeds ${maxBounceRate * 100}%` };
  }

  // Check reputation
  const { data: reputation } = await supabase
    .from('sender_reputation')
    .select('reputation_score')
    .eq('identifier', session.email_accounts.domain)
    .single();

  if (reputation?.reputation_score === 'bad') {
    return { shouldPause: true, reason: 'Domain reputation is BAD' };
  }

  return { shouldPause: false };
}

/**
 * Advance warmup to next day
 */
export async function advanceWarmupDay(sessionId: string): Promise<void> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('warmup_sessions')
    .select('current_day, target_daily_limit, ramp_rate')
    .eq('id', sessionId)
    .single();

  if (!session) return;

  const newDay = session.current_day + 1;
  const newLimit = Math.min(
    session.current_day + session.ramp_rate,
    session.target_daily_limit
  );

  await supabase
    .from('warmup_sessions')
    .update({
      current_day: newDay,
      daily_limit: newLimit,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);
}

/**
 * Get recommended config based on account age
 */
export function getRecommendedConfig(accountAgeDays: number): RampConfig {
  if (accountAgeDays < 7) {
    // Brand new account - very conservative
    return {
      startingVolume: 1,
      dailyIncrease: 1,
      maxDailyVolume: 20,
      warmupDurationDays: 20
    };
  } else if (accountAgeDays < 30) {
    // Young account - moderate
    return {
      startingVolume: 2,
      dailyIncrease: 2,
      maxDailyVolume: 40,
      warmupDurationDays: 20
    };
  } else {
    // Established account - faster ramp
    return {
      startingVolume: 5,
      dailyIncrease: 3,
      maxDailyVolume: 50,
      warmupDurationDays: 15
    };
  }
}
```

### Task 4: Engagement Engine (Headless Browser Simulation)

Create `/src/lib/warmup/engagement-engine.ts`:

```typescript
import puppeteer, { Browser, Page } from 'puppeteer';
import { createClient } from '@/lib/supabase/server';

export interface EngagementAction {
  type: 'open' | 'read' | 'reply' | 'star' | 'archive' | 'spam_rescue';
  emailId: string;
  duration?: number; // seconds for read action
}

export interface EngagementResult {
  success: boolean;
  action: EngagementAction;
  error?: string;
  executedAt: Date;
}

/**
 * Gmail engagement simulator using headless browser
 */
export class GmailEngagementEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });

    this.page = await this.browser.newPage();

    // Set realistic viewport and user agent
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
  }

  async login(email: string, password: string): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');

    try {
      await this.page.goto('https://accounts.google.com/signin', {
        waitUntil: 'networkidle2'
      });

      // Enter email
      await this.page.waitForSelector('input[type="email"]');
      await this.humanType('input[type="email"]', email);
      await this.page.click('#identifierNext');

      // Wait for password field
      await this.page.waitForSelector('input[type="password"]', { visible: true });
      await this.delay(1000);

      // Enter password
      await this.humanType('input[type="password"]', password);
      await this.page.click('#passwordNext');

      // Wait for redirect to Gmail
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });

      return true;
    } catch (error) {
      console.error('Gmail login failed:', error);
      return false;
    }
  }

  /**
   * Simulate reading an email with realistic timing
   */
  async readEmail(messageId: string, readDurationSeconds: number = 30): Promise<EngagementResult> {
    if (!this.page) throw new Error('Engine not initialized');

    const action: EngagementAction = {
      type: 'read',
      emailId: messageId,
      duration: readDurationSeconds
    };

    try {
      // Navigate to email
      await this.page.goto(`https://mail.google.com/mail/u/0/#inbox/${messageId}`, {
        waitUntil: 'networkidle2'
      });

      // Simulate reading - scroll through email
      const scrollSteps = Math.ceil(readDurationSeconds / 5);
      for (let i = 0; i < scrollSteps; i++) {
        await this.page.evaluate(() => {
          window.scrollBy(0, 100 + Math.random() * 100);
        });
        await this.delay(3000 + Math.random() * 4000); // 3-7 seconds between scrolls
      }

      return { success: true, action, executedAt: new Date() };
    } catch (error) {
      return {
        success: false,
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
        executedAt: new Date()
      };
    }
  }

  /**
   * Move email from spam to inbox
   */
  async rescueFromSpam(messageId: string): Promise<EngagementResult> {
    if (!this.page) throw new Error('Engine not initialized');

    const action: EngagementAction = { type: 'spam_rescue', emailId: messageId };

    try {
      // Go to spam folder
      await this.page.goto('https://mail.google.com/mail/u/0/#spam', {
        waitUntil: 'networkidle2'
      });

      await this.delay(2000);

      // Find and click the email
      // This is simplified - real implementation would use Gmail API or more robust selectors
      await this.page.evaluate((id) => {
        const emails = document.querySelectorAll('[data-message-id]');
        for (const email of emails) {
          if (email.getAttribute('data-message-id') === id) {
            (email as HTMLElement).click();
            break;
          }
        }
      }, messageId);

      await this.delay(1000);

      // Click "Not spam" button
      await this.page.click('[aria-label="Not spam"]');

      await this.delay(1000);

      return { success: true, action, executedAt: new Date() };
    } catch (error) {
      return {
        success: false,
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
        executedAt: new Date()
      };
    }
  }

  /**
   * Star an email
   */
  async starEmail(messageId: string): Promise<EngagementResult> {
    if (!this.page) throw new Error('Engine not initialized');

    const action: EngagementAction = { type: 'star', emailId: messageId };

    try {
      await this.page.goto(`https://mail.google.com/mail/u/0/#inbox/${messageId}`, {
        waitUntil: 'networkidle2'
      });

      await this.delay(1000);

      // Click star icon
      await this.page.click('[aria-label="Not starred"]');

      return { success: true, action, executedAt: new Date() };
    } catch (error) {
      return {
        success: false,
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
        executedAt: new Date()
      };
    }
  }

  /**
   * Human-like typing with random delays
   */
  private async humanType(selector: string, text: string): Promise<void> {
    if (!this.page) return;

    await this.page.click(selector);
    for (const char of text) {
      await this.page.keyboard.type(char);
      await this.delay(50 + Math.random() * 100); // 50-150ms per character
    }
  }

  /**
   * Random delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

/**
 * Alternative: IMAP-based engagement (faster, more reliable)
 */
export async function engageViaImap(
  imapConfig: { host: string; port: number; user: string; password: string },
  messageId: string,
  actions: Array<'read' | 'star' | 'move_to_inbox'>
): Promise<EngagementResult[]> {
  const Imap = require('imap');
  const results: EngagementResult[] = [];

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: imapConfig.user,
      password: imapConfig.password,
      host: imapConfig.host,
      port: imapConfig.port,
      tls: true
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err: Error) => {
        if (err) {
          reject(err);
          return;
        }

        for (const action of actions) {
          if (action === 'read') {
            // Mark as read
            imap.addFlags(messageId, ['\\Seen'], (err: Error) => {
              results.push({
                success: !err,
                action: { type: 'read', emailId: messageId },
                error: err?.message,
                executedAt: new Date()
              });
            });
          } else if (action === 'star') {
            // Add star flag
            imap.addFlags(messageId, ['\\Flagged'], (err: Error) => {
              results.push({
                success: !err,
                action: { type: 'star', emailId: messageId },
                error: err?.message,
                executedAt: new Date()
              });
            });
          }
        }

        imap.end();
      });
    });

    imap.once('end', () => resolve(results));
    imap.once('error', reject);
    imap.connect();
  });
}
```

### Task 5: AI Reply Generator

Create `/src/lib/warmup/ai-replies.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

export interface EmailContext {
  subject: string;
  body: string;
  senderName?: string;
}

export interface GeneratedReply {
  subject: string;
  body: string;
  sentiment: 'positive' | 'neutral';
}

const REPLY_PROMPT = `You are generating a friendly, conversational reply for email warmup purposes.

RULES:
1. Keep replies SHORT (1-3 sentences)
2. Sound natural and human
3. Be positive or neutral in tone
4. Reference something specific from the original email
5. Don't ask questions that require long answers
6. Vary your style - don't use templates
7. No marketing language or promotions
8. Natural greetings (Hey, Hi, Thanks, etc.)

Examples of good replies:
- "Hey! Thanks for reaching out. That sounds interesting."
- "Hi there, appreciate the message. Hope you're having a great week!"
- "Thanks for sharing! I'll take a look."
- "Got it, thanks! Let me know if you need anything else."

Generate a single reply, nothing else.`;

export async function generateWarmupReply(context: EmailContext): Promise<GeneratedReply> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `${REPLY_PROMPT}\n\nOriginal email subject: ${context.subject}\nOriginal email body (first 200 chars): ${context.body.slice(0, 200)}\n\nGenerate a natural reply:`
      }
    ]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  const replyBody = content.text.trim();

  return {
    subject: `Re: ${context.subject}`,
    body: replyBody,
    sentiment: 'positive'
  };
}

/**
 * Generate multiple reply variations for variety
 */
export async function generateReplyVariations(
  context: EmailContext,
  count: number = 5
): Promise<GeneratedReply[]> {
  const replies: GeneratedReply[] = [];

  for (let i = 0; i < count; i++) {
    const reply = await generateWarmupReply({
      ...context,
      // Add variation instruction
      body: context.body + `\n[Variation ${i + 1} - use different wording]`
    });
    replies.push(reply);
  }

  return replies;
}

/**
 * Generate warmup email content (for sending)
 */
export async function generateWarmupEmailContent(): Promise<{ subject: string; body: string }> {
  const topics = [
    'Quick question about your work',
    'Interesting article I came across',
    'Following up on our chat',
    'Coffee next week?',
    'Quick update',
    'Thought you might find this useful',
    'Great meeting you yesterday',
    'Checking in'
  ];

  const randomTopic = topics[Math.floor(Math.random() * topics.length)];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `Generate a short, friendly email (2-4 sentences) about: "${randomTopic}"

Rules:
- Sound like a real person writing to a colleague
- Keep it casual and brief
- No marketing or promotional content
- No links
- Include a simple question or statement

Return in format:
Subject: [subject line]
Body: [email body]`
      }
    ]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  const lines = content.text.trim().split('\n');
  const subjectLine = lines.find(l => l.startsWith('Subject:'))?.replace('Subject:', '').trim() || randomTopic;
  const bodyLines = lines.filter(l => !l.startsWith('Subject:') && !l.startsWith('Body:'));
  const body = bodyLines.join('\n').trim() || 'Just wanted to check in. Hope all is well!';

  return { subject: subjectLine, body };
}
```

### Task 6: Google Postmaster Tools Integration

Create `/src/lib/warmup/postmaster-tools.ts`:

```typescript
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';

const postmaster = google.gmailpostmastertools('v1');

export interface PostmasterMetrics {
  domain: string;
  date: string;
  spamRate: number;
  userReportedSpamRate: number;
  ipReputation: string;
  domainReputation: string;
  spfSuccessRate: number;
  dkimSuccessRate: number;
  dmarcSuccessRate: number;
  deliveryErrorRate: number;
}

export interface ReputationAlert {
  domain: string;
  type: 'spam_rate' | 'reputation' | 'auth_failure';
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number | string;
  threshold: number | string;
}

/**
 * Get OAuth2 client for Postmaster Tools
 */
async function getAuthClient(userId: string) {
  const supabase = await createClient();

  const { data: integration } = await supabase
    .from('integrations')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .eq('provider', 'google_postmaster')
    .single();

  if (!integration) {
    throw new Error('Google Postmaster Tools not connected');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: integration.access_token,
    refresh_token: integration.refresh_token
  });

  return oauth2Client;
}

/**
 * Fetch traffic stats for a domain
 */
export async function fetchDomainMetrics(
  userId: string,
  domain: string,
  startDate: string,
  endDate: string
): Promise<PostmasterMetrics[]> {
  const auth = await getAuthClient(userId);

  const response = await postmaster.domains.trafficStats.list({
    auth,
    parent: `domains/${domain}`,
    'startDate.day': parseInt(startDate.split('-')[2]),
    'startDate.month': parseInt(startDate.split('-')[1]),
    'startDate.year': parseInt(startDate.split('-')[0]),
    'endDate.day': parseInt(endDate.split('-')[2]),
    'endDate.month': parseInt(endDate.split('-')[1]),
    'endDate.year': parseInt(endDate.split('-')[0])
  });

  const stats = response.data.trafficStats || [];

  return stats.map(stat => ({
    domain,
    date: stat.name?.split('/').pop() || '',
    spamRate: stat.spamRate || 0,
    userReportedSpamRate: stat.userReportedSpamRate || 0,
    ipReputation: stat.ipReputations?.[0]?.reputation || 'UNKNOWN',
    domainReputation: stat.domainReputation || 'UNKNOWN',
    spfSuccessRate: stat.spfSuccessRatio || 0,
    dkimSuccessRate: stat.dkimSuccessRatio || 0,
    dmarcSuccessRate: stat.dmarcSuccessRatio || 0,
    deliveryErrorRate: stat.deliveryErrors
      ? stat.deliveryErrors.reduce((sum, e) => sum + (e.errorRatio || 0), 0)
      : 0
  }));
}

/**
 * Check for reputation issues and generate alerts
 */
export async function checkReputationAlerts(
  userId: string,
  domain: string
): Promise<ReputationAlert[]> {
  const alerts: ReputationAlert[] = [];

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const metrics = await fetchDomainMetrics(
    userId,
    domain,
    weekAgo.toISOString().split('T')[0],
    today.toISOString().split('T')[0]
  );

  if (metrics.length === 0) return alerts;

  const latest = metrics[metrics.length - 1];

  // Check spam rate (threshold: 0.3%)
  if (latest.spamRate > 0.003) {
    alerts.push({
      domain,
      type: 'spam_rate',
      severity: latest.spamRate > 0.01 ? 'critical' : 'warning',
      message: `Spam rate is ${(latest.spamRate * 100).toFixed(2)}%, above 0.3% threshold`,
      currentValue: latest.spamRate,
      threshold: 0.003
    });
  }

  // Check domain reputation
  if (latest.domainReputation === 'BAD' || latest.domainReputation === 'LOW') {
    alerts.push({
      domain,
      type: 'reputation',
      severity: latest.domainReputation === 'BAD' ? 'critical' : 'warning',
      message: `Domain reputation is ${latest.domainReputation}`,
      currentValue: latest.domainReputation,
      threshold: 'MEDIUM'
    });
  }

  // Check authentication
  if (latest.dkimSuccessRate < 0.95) {
    alerts.push({
      domain,
      type: 'auth_failure',
      severity: latest.dkimSuccessRate < 0.8 ? 'critical' : 'warning',
      message: `DKIM success rate is ${(latest.dkimSuccessRate * 100).toFixed(1)}%`,
      currentValue: latest.dkimSuccessRate,
      threshold: 0.95
    });
  }

  return alerts;
}

/**
 * Store metrics in database for tracking
 */
export async function storeReputationMetrics(
  userId: string,
  domain: string,
  metrics: PostmasterMetrics
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('sender_reputation')
    .upsert({
      user_id: userId,
      type: 'domain',
      identifier: domain,
      reputation_score: metrics.domainReputation.toLowerCase(),
      spam_rate: metrics.spamRate,
      user_reported_spam_rate: metrics.userReportedSpamRate,
      domain_reputation: metrics.domainReputation,
      spf_success_rate: metrics.spfSuccessRate,
      dkim_success_rate: metrics.dkimSuccessRate,
      dmarc_success_rate: metrics.dmarcSuccessRate,
      delivery_error_rate: metrics.deliveryErrorRate,
      measured_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,type,identifier'
    });
}

/**
 * Get reputation history for a domain
 */
export async function getReputationHistory(
  userId: string,
  domain: string,
  days: number = 30
): Promise<PostmasterMetrics[]> {
  const today = new Date();
  const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);

  return fetchDomainMetrics(
    userId,
    domain,
    startDate.toISOString().split('T')[0],
    today.toISOString().split('T')[0]
  );
}
```

### Task 7: Warmup Orchestrator (Main Service)

Create `/src/lib/warmup/orchestrator.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { selectWarmupPartners, markAccountUsed } from './pool-manager';
import { generateDailySchedule, shouldPauseWarmup, advanceWarmupDay, getRecommendedConfig } from './slow-ramp';
import { generateWarmupReply, generateWarmupEmailContent } from './ai-replies';
import { checkReputationAlerts, storeReputationMetrics, fetchDomainMetrics } from './postmaster-tools';
import { sendEmail } from '@/lib/sending/sender';
import { Queue } from 'bullmq';

const warmupQueue = new Queue('warmup', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

export interface WarmupSessionConfig {
  accountId: string;
  userId: string;
  targetDailyLimit?: number;
  poolTier?: 'basic' | 'standard' | 'premium';
  readEmulation?: boolean;
  replyRate?: number;
  spamRescue?: boolean;
}

/**
 * Start warmup for an email account
 */
export async function startWarmup(config: WarmupSessionConfig): Promise<string> {
  const supabase = await createClient();

  // Get account details
  const { data: account } = await supabase
    .from('email_accounts')
    .select('email, domain, provider, created_at')
    .eq('id', config.accountId)
    .single();

  if (!account) throw new Error('Account not found');

  // Calculate account age
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(account.created_at).getTime()) / (24 * 60 * 60 * 1000)
  );

  // Get recommended ramp config
  const rampConfig = getRecommendedConfig(accountAgeDays);

  // Create warmup session
  const { data: session, error } = await supabase
    .from('warmup_sessions')
    .insert({
      account_id: config.accountId,
      user_id: config.userId,
      daily_limit: rampConfig.startingVolume,
      target_daily_limit: config.targetDailyLimit || rampConfig.maxDailyVolume,
      ramp_rate: rampConfig.dailyIncrease,
      pool_tier: config.poolTier || 'standard',
      read_emulation: config.readEmulation ?? true,
      reply_rate: config.replyRate ?? 0.4,
      spam_rescue: config.spamRescue ?? true,
      status: 'active',
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) throw error;

  // Schedule first day of warmup
  await scheduleWarmupDay(session.id);

  return session.id;
}

/**
 * Schedule warmup emails for the day
 */
async function scheduleWarmupDay(sessionId: string): Promise<void> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('warmup_sessions')
    .select(`
      *,
      email_accounts!inner(email, provider, imap_host, smtp_host)
    `)
    .eq('id', sessionId)
    .single();

  if (!session || session.status !== 'active') return;

  // Check if should pause
  const { shouldPause, reason } = await shouldPauseWarmup(sessionId);
  if (shouldPause) {
    await supabase
      .from('warmup_sessions')
      .update({ status: 'paused', pause_reason: reason })
      .eq('id', sessionId);
    return;
  }

  // Generate schedule
  const schedule = generateDailySchedule(session.current_day, {
    startingVolume: 1,
    dailyIncrease: session.ramp_rate,
    maxDailyVolume: session.target_daily_limit,
    warmupDurationDays: 30
  });

  // Select warmup partners
  const partners = await selectWarmupPartners(
    session.email_accounts.email,
    session.email_accounts.provider,
    schedule.totalEmails,
    session.pool_tier
  );

  // Schedule each email
  for (let i = 0; i < schedule.totalEmails; i++) {
    const partner = partners[i % partners.length];
    const sendTime = schedule.sendSlots[i];

    // Generate email content
    const content = await generateWarmupEmailContent();

    // Add to queue
    await warmupQueue.add(
      'send_warmup_email',
      {
        sessionId,
        fromEmail: session.email_accounts.email,
        toEmail: partner.email,
        subject: content.subject,
        body: content.body,
        partnerId: partner.id,
        shouldReply: Math.random() < session.reply_rate,
        readEmulation: session.read_emulation
      },
      {
        delay: sendTime.getTime() - Date.now(),
        removeOnComplete: true
      }
    );

    // Also schedule receiving emails from partners
    await warmupQueue.add(
      'receive_warmup_email',
      {
        sessionId,
        fromEmail: partner.email,
        toEmail: session.email_accounts.email,
        partnerId: partner.id
      },
      {
        delay: schedule.receiveSlots[i].getTime() - Date.now(),
        removeOnComplete: true
      }
    );
  }
}

/**
 * Process outgoing warmup email
 */
export async function processWarmupSend(job: any): Promise<void> {
  const {
    sessionId,
    fromEmail,
    toEmail,
    subject,
    body,
    partnerId
  } = job.data;

  const supabase = await createClient();

  try {
    // Send the email
    const result = await sendEmail({
      from: fromEmail,
      to: toEmail,
      subject,
      body
    });

    // Record in database
    await supabase
      .from('warmup_emails')
      .insert({
        session_id: sessionId,
        direction: 'sent',
        from_email: fromEmail,
        to_email: toEmail,
        subject,
        body_preview: body.slice(0, 200),
        message_id: result.messageId,
        pool_account_id: partnerId,
        sent_at: new Date().toISOString(),
        status: 'sent'
      });

    // Update session metrics
    await supabase.rpc('increment_warmup_sent', { session_id: sessionId });

    // Mark partner as used
    await markAccountUsed(partnerId);

  } catch (error) {
    console.error('Warmup send failed:', error);

    await supabase
      .from('warmup_emails')
      .insert({
        session_id: sessionId,
        direction: 'sent',
        from_email: fromEmail,
        to_email: toEmail,
        subject,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      });
  }
}

/**
 * Process engagement actions
 */
export async function processEngagement(job: any): Promise<void> {
  const {
    sessionId,
    emailId,
    actions, // ['read', 'star', 'reply']
    readDuration
  } = job.data;

  const supabase = await createClient();

  const { data: email } = await supabase
    .from('warmup_emails')
    .select('*, warmup_sessions!inner(*)')
    .eq('id', emailId)
    .single();

  if (!email) return;

  for (const action of actions) {
    if (action === 'read' && email.warmup_sessions.read_emulation) {
      // Mark as opened with read time
      await supabase
        .from('warmup_emails')
        .update({
          opened_at: new Date().toISOString(),
          read_duration_seconds: readDuration || 30,
          status: 'opened'
        })
        .eq('id', emailId);

      await supabase.rpc('increment_warmup_opened', { session_id: sessionId });
    }

    if (action === 'reply') {
      // Generate and send reply
      const reply = await generateWarmupReply({
        subject: email.subject,
        body: email.body_preview
      });

      // Queue the reply
      await warmupQueue.add(
        'send_warmup_reply',
        {
          sessionId,
          originalEmailId: emailId,
          toEmail: email.from_email,
          subject: reply.subject,
          body: reply.body
        },
        { delay: 5000 + Math.random() * 60000 } // 5 sec - 1 min delay
      );
    }

    if (action === 'spam_rescue' && email.landed_in_spam) {
      // Log spam rescue
      await supabase
        .from('warmup_emails')
        .update({
          rescued_from_spam: true,
          rescued_at: new Date().toISOString()
        })
        .eq('id', emailId);

      await supabase.rpc('increment_warmup_rescued', { session_id: sessionId });
    }
  }
}

/**
 * Daily warmup job - runs at 2 AM
 */
export async function dailyWarmupJob(): Promise<void> {
  const supabase = await createClient();

  // Get all active sessions
  const { data: sessions } = await supabase
    .from('warmup_sessions')
    .select('id, user_id, email_accounts!inner(domain)')
    .eq('status', 'active');

  if (!sessions) return;

  for (const session of sessions) {
    // Advance to next day
    await advanceWarmupDay(session.id);

    // Schedule new day
    await scheduleWarmupDay(session.id);

    // Fetch and store reputation metrics
    try {
      const metrics = await fetchDomainMetrics(
        session.user_id,
        session.email_accounts.domain,
        new Date().toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      );

      if (metrics.length > 0) {
        await storeReputationMetrics(session.user_id, session.email_accounts.domain, metrics[0]);
      }

      // Check for alerts
      const alerts = await checkReputationAlerts(session.user_id, session.email_accounts.domain);
      if (alerts.some(a => a.severity === 'critical')) {
        // Pause warmup on critical alerts
        await supabase
          .from('warmup_sessions')
          .update({
            status: 'paused',
            pause_reason: alerts.map(a => a.message).join('; ')
          })
          .eq('id', session.id);
      }
    } catch (error) {
      console.error(`Failed to fetch metrics for ${session.email_accounts.domain}:`, error);
    }
  }
}

/**
 * Get warmup status for an account
 */
export async function getWarmupStatus(accountId: string) {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('warmup_sessions')
    .select(`
      *,
      email_accounts!inner(email, domain)
    `)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!session) return null;

  // Get recent emails
  const { data: recentEmails } = await supabase
    .from('warmup_emails')
    .select('status, landed_in_spam, opened_at, replied_at')
    .eq('session_id', session.id)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  // Get reputation
  const { data: reputation } = await supabase
    .from('sender_reputation')
    .select('*')
    .eq('identifier', session.email_accounts.domain)
    .single();

  const totalRecent = recentEmails?.length || 0;
  const openRate = totalRecent > 0
    ? recentEmails.filter(e => e.opened_at).length / totalRecent
    : 0;
  const replyRate = totalRecent > 0
    ? recentEmails.filter(e => e.replied_at).length / totalRecent
    : 0;
  const spamRate = totalRecent > 0
    ? recentEmails.filter(e => e.landed_in_spam).length / totalRecent
    : 0;

  // Calculate warmup progress (0-100%)
  const targetDays = Math.ceil(session.target_daily_limit / session.ramp_rate);
  const progress = Math.min(100, (session.current_day / targetDays) * 100);

  // Determine health score (0-100)
  let healthScore = 100;
  if (spamRate > 0.003) healthScore -= 30;
  if (openRate < 0.5) healthScore -= 20;
  if (replyRate < 0.2) healthScore -= 10;
  if (reputation?.reputation_score === 'bad') healthScore -= 40;
  if (reputation?.reputation_score === 'low') healthScore -= 20;

  return {
    session: {
      id: session.id,
      status: session.status,
      currentDay: session.current_day,
      dailyLimit: session.daily_limit,
      targetDailyLimit: session.target_daily_limit,
      poolTier: session.pool_tier,
      startedAt: session.started_at,
      pauseReason: session.pause_reason
    },
    metrics: {
      totalSent: session.total_sent,
      totalReceived: session.total_received,
      totalOpened: session.total_opened,
      totalReplied: session.total_replied,
      totalRescuedFromSpam: session.total_rescued_from_spam,
      openRate,
      replyRate,
      spamRate
    },
    reputation: reputation ? {
      score: reputation.reputation_score,
      spamRate: reputation.spam_rate,
      dkimSuccessRate: reputation.dkim_success_rate,
      spfSuccessRate: reputation.spf_success_rate,
      lastMeasured: reputation.measured_at
    } : null,
    progress,
    healthScore: Math.max(0, healthScore),
    phase: progress < 25 ? 'cold' : progress < 50 ? 'warming' : progress < 75 ? 'warm' : 'hot'
  };
}
```

### Task 8: Warmup API Endpoints

Create `/src/app/api/warmup/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startWarmup, getWarmupStatus } from '@/lib/warmup/orchestrator';
import { getPoolStats } from '@/lib/warmup/pool-manager';

// GET /api/warmup - Get warmup status for all accounts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all user's email accounts with warmup status
    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('id, email, domain, provider')
      .eq('user_id', user.id);

    if (!accounts) {
      return NextResponse.json({ accounts: [] });
    }

    const accountsWithStatus = await Promise.all(
      accounts.map(async (account) => {
        const status = await getWarmupStatus(account.id);
        return { ...account, warmup: status };
      })
    );

    // Get pool stats
    const poolStats = await getPoolStats();

    return NextResponse.json({
      accounts: accountsWithStatus,
      pool: poolStats
    });

  } catch (error) {
    console.error('Warmup GET error:', error);
    return NextResponse.json({ error: 'Failed to get warmup status' }, { status: 500 });
  }
}

// POST /api/warmup - Start warmup for an account
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { accountId, targetDailyLimit, poolTier, readEmulation, replyRate, spamRescue } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    // Verify account ownership
    const { data: account } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const sessionId = await startWarmup({
      accountId,
      userId: user.id,
      targetDailyLimit,
      poolTier,
      readEmulation,
      replyRate,
      spamRescue
    });

    return NextResponse.json({ sessionId, message: 'Warmup started' });

  } catch (error) {
    console.error('Warmup POST error:', error);
    return NextResponse.json({ error: 'Failed to start warmup' }, { status: 500 });
  }
}
```

Create `/src/app/api/warmup/[accountId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWarmupStatus } from '@/lib/warmup/orchestrator';

// GET /api/warmup/:accountId - Get detailed warmup status
export async function GET(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await getWarmupStatus(params.accountId);

    if (!status) {
      return NextResponse.json({ error: 'No warmup found' }, { status: 404 });
    }

    return NextResponse.json(status);

  } catch (error) {
    console.error('Warmup status error:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}

// PATCH /api/warmup/:accountId - Pause/resume warmup
export async function PATCH(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body; // 'pause' | 'resume'

    const { data: session } = await supabase
      .from('warmup_sessions')
      .select('id, status')
      .eq('account_id', params.accountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'No warmup session found' }, { status: 404 });
    }

    if (action === 'pause') {
      await supabase
        .from('warmup_sessions')
        .update({ status: 'paused', pause_reason: 'User paused' })
        .eq('id', session.id);
    } else if (action === 'resume') {
      await supabase
        .from('warmup_sessions')
        .update({ status: 'active', pause_reason: null })
        .eq('id', session.id);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Warmup update error:', error);
    return NextResponse.json({ error: 'Failed to update warmup' }, { status: 500 });
  }
}

// DELETE /api/warmup/:accountId - Stop warmup
export async function DELETE(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await supabase
      .from('warmup_sessions')
      .update({ status: 'completed' })
      .eq('account_id', params.accountId)
      .eq('status', 'active');

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Warmup stop error:', error);
    return NextResponse.json({ error: 'Failed to stop warmup' }, { status: 500 });
  }
}
```

---

## Verification Checklist

- [ ] Database schema created with all tables
- [ ] Pool manager selects partners correctly (70% same ESP)
- [ ] Slow ramp increases volume correctly
- [ ] AI replies sound natural
- [ ] Google Postmaster Tools integration working
- [ ] Reputation alerts trigger on high spam rate
- [ ] Warmup pauses automatically on issues
- [ ] Dashboard shows health score
- [ ] All API endpoints working

## Done When

- Complete warmup system operational
- 10K+ accounts in warmup pool
- Headless browser engagement working
- Google Postmaster integration live
- Real-time reputation monitoring
- Auto-pause on reputation issues
- >85% primary inbox placement achieved

---

## Sources

- [Instantly Email Warmup](https://instantly.ai/email-warmup) - 4.2M+ account pool
- [Gmail Warmup Guide](https://www.mailreach.co/blog/gmail-warmup) - Best practices
- [Google Postmaster Tools API](https://developers.google.com/workspace/gmail/postmaster)
- [Gmail RETVec Filter](https://folderly.com/blog/gmail-ai-spam-content-filter) - 38% better spam detection
- [Warmup Best Practices 2025](https://www.mailpool.ai/blog/email-warm-up-best-practices-complete-2025-guide)
