/**
 * Test Data Factories
 * Generate realistic test data for all database entities
 */
import type { Tables } from '@/types/database'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random UUID
 */
function uuid(): string {
  return crypto.randomUUID()
}

/**
 * Generate a random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Pick a random item from an array
 */
function randomPick<T>(items: T[]): T {
  const item = items[randomInt(0, items.length - 1)]
  if (item === undefined) {
    throw new Error('randomPick called with empty array')
  }
  return item
}

/**
 * Generate a random email
 */
function randomEmail(domain?: string): string {
  const names = ['john', 'jane', 'mike', 'sarah', 'alex', 'emma', 'chris', 'lisa', 'david', 'anna']
  const domains = domain ? [domain] : ['example.com', 'test.com', 'mail.com', 'company.com']
  const name = randomPick(names)
  const num = randomInt(1, 999)
  return `${name}${num}@${randomPick(domains)}`
}

/**
 * Generate a random company name
 */
function randomCompany(): string {
  const prefixes = ['Acme', 'Global', 'Tech', 'Digital', 'Smart', 'Pro', 'Advanced', 'Prime', 'Elite', 'Apex']
  const suffixes = ['Corp', 'Inc', 'Solutions', 'Systems', 'Labs', 'Works', 'Group', 'Services', 'Industries', 'Co']
  return `${randomPick(prefixes)} ${randomPick(suffixes)}`
}

/**
 * Generate a random full name
 */
function randomFullName(): string {
  const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'Alex', 'Emma', 'Chris', 'Lisa', 'David', 'Anna', 'Tom', 'Kate']
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor']
  return `${randomPick(firstNames)} ${randomPick(lastNames)}`
}

/**
 * Generate a random job title
 */
function randomTitle(): string {
  const levels = ['', 'Senior ', 'Junior ', 'Lead ', 'Chief ', 'Head of ']
  const roles = ['Developer', 'Engineer', 'Manager', 'Director', 'Designer', 'Analyst', 'Consultant', 'Specialist']
  return `${randomPick(levels)}${randomPick(roles)}`
}

/**
 * Generate a random domain name
 */
function randomDomain(): string {
  const words = ['acme', 'global', 'tech', 'digital', 'smart', 'pro', 'fast', 'prime', 'elite', 'apex']
  const tlds = ['.com', '.io', '.co', '.net', '.org']
  return `${randomPick(words)}${randomInt(1, 99)}${randomPick(tlds)}`
}

/**
 * Generate an ISO timestamp for a date in the past (within days)
 */
function pastDate(daysAgo: number = 30): string {
  const date = new Date()
  date.setDate(date.getDate() - randomInt(0, daysAgo))
  return date.toISOString()
}

/**
 * Generate an ISO timestamp for a date in the future (within days)
 */
function futureDate(daysAhead: number = 30): string {
  const date = new Date()
  date.setDate(date.getDate() + randomInt(1, daysAhead))
  return date.toISOString()
}

// ============================================================================
// Factory Options Types
// ============================================================================

export interface CreateMockUserOptions {
  id?: string
  email?: string
  fullName?: string
  organizationId?: string
  role?: 'owner' | 'admin' | 'member'
  avatarUrl?: string
  settings?: Record<string, unknown>
}

export interface CreateMockOrganizationOptions {
  id?: string
  name?: string
  slug?: string
  plan?: 'starter' | 'pro' | 'agency'
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  settings?: Record<string, unknown>
}

export interface CreateMockEmailAccountOptions {
  id?: string
  organizationId?: string
  email?: string
  displayName?: string
  provider?: 'google' | 'microsoft' | 'smtp'
  status?: 'active' | 'paused' | 'error' | 'warming'
  dailyLimit?: number
  sentToday?: number
  warmupEnabled?: boolean
  warmupProgress?: number
  healthScore?: number
}

export interface CreateMockCampaignOptions {
  id?: string
  organizationId?: string
  name?: string
  status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
  settings?: Record<string, unknown>
  stats?: Record<string, unknown>
}

export interface CreateMockLeadOptions {
  id?: string
  organizationId?: string
  listId?: string
  email?: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  phone?: string
  linkedinUrl?: string
  customFields?: Record<string, unknown>
  status?: 'active' | 'unsubscribed' | 'bounced' | 'complained'
  validationStatus?: 'valid' | 'invalid' | 'risky' | 'unknown'
}

export interface CreateMockSentEmailOptions {
  id?: string
  organizationId?: string
  campaignId?: string
  campaignLeadId?: string
  emailAccountId?: string
  leadId?: string
  toEmail?: string
  fromEmail?: string
  subject?: string
  bodyHtml?: string
  bodyText?: string
  messageId?: string
  status?: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'complained'
  sentAt?: string
}

export interface CreateMockLeadListOptions {
  id?: string
  organizationId?: string
  name?: string
  description?: string
  leadCount?: number
}

export interface CreateMockDomainOptions {
  id?: string
  organizationId?: string
  domain?: string
  registrar?: 'cloudflare' | 'namecheap' | 'porkbun' | 'manual' | null
  healthStatus?: 'healthy' | 'warning' | 'error' | 'pending'
  spfConfigured?: boolean
  dkimConfigured?: boolean
  dmarcConfigured?: boolean
  bimiConfigured?: boolean
}

export interface CreateMockCampaignSequenceOptions {
  id?: string
  campaignId?: string
  stepNumber?: number
  subject?: string
  bodyHtml?: string
  bodyText?: string
  delayDays?: number
  delayHours?: number
  conditionType?: 'always' | 'not_opened' | 'not_replied' | 'not_clicked'
}

export interface CreateMockSupabaseUserOptions {
  id?: string
  email?: string
  role?: string
  createdAt?: string
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a mock user (database row)
 */
export function createMockUser(options: CreateMockUserOptions = {}): Tables<'users'> {
  const id = options.id ?? uuid()
  const now = new Date().toISOString()

  return {
    id,
    email: options.email ?? randomEmail(),
    full_name: options.fullName ?? randomFullName(),
    organization_id: options.organizationId ?? null,
    role: options.role ?? 'member',
    avatar_url: options.avatarUrl ?? null,
    settings: options.settings ?? {},
    created_at: now,
    updated_at: now,
  }
}

/**
 * Create a mock Supabase auth user
 */
export function createMockSupabaseUser(options: CreateMockSupabaseUserOptions = {}): SupabaseUser {
  const id = options.id ?? uuid()
  const email = options.email ?? randomEmail()
  const now = options.createdAt ?? new Date().toISOString()

  return {
    id,
    email,
    aud: 'authenticated',
    role: options.role ?? 'authenticated',
    created_at: now,
    updated_at: now,
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {
      email,
      email_verified: true,
    },
    identities: [],
    factors: [],
  }
}

/**
 * Create a mock organization
 */
export function createMockOrganization(options: CreateMockOrganizationOptions = {}): Tables<'organizations'> {
  const name = options.name ?? randomCompany()
  const now = new Date().toISOString()

  return {
    id: options.id ?? uuid(),
    name,
    slug: options.slug ?? name.toLowerCase().replace(/\s+/g, '-'),
    plan: options.plan ?? 'starter',
    stripe_customer_id: options.stripeCustomerId ?? null,
    stripe_subscription_id: options.stripeSubscriptionId ?? null,
    settings: options.settings ?? {
      timezone: 'America/New_York',
      dailySendLimit: 1000,
    },
    created_at: now,
    updated_at: now,
  }
}

/**
 * Create a mock email account
 */
export function createMockEmailAccount(options: CreateMockEmailAccountOptions = {}): Tables<'email_accounts'> {
  const email = options.email ?? randomEmail()
  const now = new Date().toISOString()

  return {
    id: options.id ?? uuid(),
    organization_id: options.organizationId ?? null,
    email,
    display_name: options.displayName ?? email.split('@')[0],
    provider: options.provider ?? 'smtp',
    status: options.status ?? 'active',
    smtp_host: options.provider === 'smtp' ? 'smtp.example.com' : null,
    smtp_port: options.provider === 'smtp' ? 587 : null,
    smtp_username: options.provider === 'smtp' ? email : null,
    smtp_password_encrypted: options.provider === 'smtp' ? 'encrypted_password' : null,
    imap_host: options.provider === 'smtp' ? 'imap.example.com' : null,
    imap_port: options.provider === 'smtp' ? 993 : null,
    oauth_tokens_encrypted: options.provider !== 'smtp' ? { access_token: 'encrypted', refresh_token: 'encrypted' } : null,
    daily_limit: options.dailyLimit ?? 100,
    sent_today: options.sentToday ?? 0,
    warmup_enabled: options.warmupEnabled ?? false,
    warmup_progress: options.warmupProgress ?? 0,
    health_score: options.healthScore ?? 100,
    last_error: null,
    created_at: now,
    updated_at: now,
  }
}

/**
 * Create a mock campaign
 */
export function createMockCampaign(options: CreateMockCampaignOptions = {}): Tables<'campaigns'> {
  const now = new Date().toISOString()

  return {
    id: options.id ?? uuid(),
    organization_id: options.organizationId ?? null,
    name: options.name ?? `Campaign ${randomInt(1, 1000)}`,
    status: options.status ?? 'draft',
    settings: options.settings ?? {
      schedule: {
        timezone: 'America/New_York',
        sendingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        sendingHoursStart: 9,
        sendingHoursEnd: 17,
      },
      tracking: {
        openTracking: true,
        clickTracking: true,
        replyDetection: true,
      },
    },
    stats: options.stats ?? {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
    },
    created_at: now,
    updated_at: now,
  }
}

/**
 * Create a mock lead
 */
export function createMockLead(options: CreateMockLeadOptions = {}): Tables<'leads'> {
  const firstName = options.firstName ?? randomPick(['John', 'Jane', 'Mike', 'Sarah', 'Alex', 'Emma'])
  const lastName = options.lastName ?? randomPick(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'])
  const company = options.company ?? randomCompany()
  const now = new Date().toISOString()

  return {
    id: options.id ?? uuid(),
    organization_id: options.organizationId ?? null,
    list_id: options.listId ?? null,
    email: options.email ?? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.toLowerCase().replace(/\s+/g, '')}.com`,
    first_name: firstName,
    last_name: lastName,
    company,
    title: options.title ?? randomTitle(),
    phone: options.phone ?? `+1${randomInt(200, 999)}${randomInt(100, 999)}${randomInt(1000, 9999)}`,
    linkedin_url: options.linkedinUrl ?? `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`,
    custom_fields: options.customFields ?? {},
    status: options.status ?? 'active',
    validation_status: options.validationStatus ?? 'valid',
    created_at: now,
    updated_at: now,
  }
}

/**
 * Create a mock sent email
 */
export function createMockSentEmail(options: CreateMockSentEmailOptions = {}): Tables<'sent_emails'> {
  const now = new Date().toISOString()
  const sentAt = options.sentAt ?? pastDate(7)

  return {
    id: options.id ?? uuid(),
    organization_id: options.organizationId ?? null,
    campaign_id: options.campaignId ?? null,
    campaign_lead_id: options.campaignLeadId ?? null,
    email_account_id: options.emailAccountId ?? null,
    lead_id: options.leadId ?? null,
    to_email: options.toEmail ?? randomEmail(),
    from_email: options.fromEmail ?? randomEmail(),
    subject: options.subject ?? `Re: ${randomPick(['Quick question', 'Following up', 'Checking in', 'Partnership opportunity'])}`,
    body_html: options.bodyHtml ?? '<p>Hello, this is a test email.</p>',
    body_text: options.bodyText ?? 'Hello, this is a test email.',
    message_id: options.messageId ?? `<${uuid()}@mail.example.com>`,
    status: options.status ?? 'sent',
    opened_at: options.status === 'opened' ? now : null,
    clicked_at: options.status === 'clicked' ? now : null,
    replied_at: options.status === 'replied' ? now : null,
    bounced_at: options.status === 'bounced' ? now : null,
    bounce_type: options.status === 'bounced' ? 'hard' : null,
    sent_at: sentAt,
    created_at: sentAt,
  }
}

/**
 * Create a mock lead list
 */
export function createMockLeadList(options: CreateMockLeadListOptions = {}): Tables<'lead_lists'> {
  const now = new Date().toISOString()

  return {
    id: options.id ?? uuid(),
    organization_id: options.organizationId ?? null,
    name: options.name ?? `Lead List ${randomInt(1, 100)}`,
    description: options.description ?? 'A collection of leads',
    lead_count: options.leadCount ?? randomInt(0, 1000),
    created_at: now,
    updated_at: now,
  }
}

/**
 * Create a mock domain
 */
export function createMockDomain(options: CreateMockDomainOptions = {}): Tables<'domains'> {
  const domain = options.domain ?? randomDomain()
  const now = new Date().toISOString()

  return {
    id: options.id ?? uuid(),
    organization_id: options.organizationId ?? null,
    domain,
    registrar: options.registrar ?? 'cloudflare',
    registrar_domain_id: null,
    dns_provider: 'cloudflare',
    dns_zone_id: null,
    spf_configured: options.spfConfigured ?? true,
    dkim_configured: options.dkimConfigured ?? true,
    dkim_selector: 'default',
    dkim_private_key_encrypted: null,
    dmarc_configured: options.dmarcConfigured ?? true,
    bimi_configured: options.bimiConfigured ?? false,
    health_status: options.healthStatus ?? 'healthy',
    last_health_check: now,
    auto_purchased: false,
    purchase_price: null,
    expires_at: futureDate(365),
    created_at: now,
    updated_at: now,
  }
}

/**
 * Create a mock campaign sequence step
 */
export function createMockCampaignSequence(options: CreateMockCampaignSequenceOptions = {}): Tables<'campaign_sequences'> {
  const now = new Date().toISOString()

  return {
    id: options.id ?? uuid(),
    campaign_id: options.campaignId ?? null,
    step_number: options.stepNumber ?? 1,
    subject: options.subject ?? 'Hey {{first_name}}, quick question',
    body_html: options.bodyHtml ?? '<p>Hi {{first_name}},</p><p>I wanted to reach out regarding...</p>',
    body_text: options.bodyText ?? 'Hi {{first_name}},\n\nI wanted to reach out regarding...',
    delay_days: options.delayDays ?? 0,
    delay_hours: options.delayHours ?? 0,
    condition_type: options.conditionType ?? 'always',
    created_at: now,
    updated_at: now,
  }
}

// ============================================================================
// Batch Factory Functions
// ============================================================================

/**
 * Create multiple mock users
 */
export function createMockUsers(count: number, options: CreateMockUserOptions = {}): Tables<'users'>[] {
  return Array.from({ length: count }, () => createMockUser(options))
}

/**
 * Create multiple mock leads
 */
export function createMockLeads(count: number, options: CreateMockLeadOptions = {}): Tables<'leads'>[] {
  return Array.from({ length: count }, () => createMockLead(options))
}

/**
 * Create multiple mock campaigns
 */
export function createMockCampaigns(count: number, options: CreateMockCampaignOptions = {}): Tables<'campaigns'>[] {
  return Array.from({ length: count }, () => createMockCampaign(options))
}

/**
 * Create multiple mock email accounts
 */
export function createMockEmailAccounts(count: number, options: CreateMockEmailAccountOptions = {}): Tables<'email_accounts'>[] {
  return Array.from({ length: count }, () => createMockEmailAccount(options))
}

/**
 * Create multiple mock sent emails
 */
export function createMockSentEmails(count: number, options: CreateMockSentEmailOptions = {}): Tables<'sent_emails'>[] {
  return Array.from({ length: count }, () => createMockSentEmail(options))
}

/**
 * Create a full campaign sequence (multiple steps)
 */
export function createMockCampaignSequences(
  campaignId: string,
  steps: number = 3
): Tables<'campaign_sequences'>[] {
  return Array.from({ length: steps }, (_, i) =>
    createMockCampaignSequence({
      campaignId,
      stepNumber: i + 1,
      delayDays: i === 0 ? 0 : randomInt(1, 3),
      subject: i === 0 ? 'Introduction' : `Follow-up ${i}`,
    })
  )
}

// ============================================================================
// Scenario Factories (Create related entities together)
// ============================================================================

export interface MockOrganizationScenario {
  organization: Tables<'organizations'>
  owner: Tables<'users'>
  members: Tables<'users'>[]
  emailAccounts: Tables<'email_accounts'>[]
  domains: Tables<'domains'>[]
}

/**
 * Create a complete organization scenario with all related entities
 */
export function createMockOrganizationScenario(options?: {
  memberCount?: number
  emailAccountCount?: number
  domainCount?: number
}): MockOrganizationScenario {
  const organization = createMockOrganization()

  const owner = createMockUser({
    organizationId: organization.id,
    role: 'owner',
  })

  const members = createMockUsers(options?.memberCount ?? 2, {
    organizationId: organization.id,
    role: 'member',
  })

  const emailAccounts = createMockEmailAccounts(options?.emailAccountCount ?? 3, {
    organizationId: organization.id,
  })

  const domains = Array.from({ length: options?.domainCount ?? 2 }, () =>
    createMockDomain({ organizationId: organization.id })
  )

  return {
    organization,
    owner,
    members,
    emailAccounts,
    domains,
  }
}

export interface MockCampaignScenario {
  campaign: Tables<'campaigns'>
  sequences: Tables<'campaign_sequences'>[]
  leads: Tables<'leads'>[]
  sentEmails: Tables<'sent_emails'>[]
}

/**
 * Create a complete campaign scenario with sequences, leads, and sent emails
 */
export function createMockCampaignScenario(
  organizationId: string,
  options?: {
    leadCount?: number
    sequenceSteps?: number
    sentEmailsPerLead?: number
  }
): MockCampaignScenario {
  const campaign = createMockCampaign({ organizationId, status: 'active' })

  const sequences = createMockCampaignSequences(
    campaign.id,
    options?.sequenceSteps ?? 3
  )

  const leads = createMockLeads(options?.leadCount ?? 10, {
    organizationId,
  })

  const sentEmails: Tables<'sent_emails'>[] = []
  const emailsPerLead = options?.sentEmailsPerLead ?? 1

  leads.forEach((lead) => {
    for (let i = 0; i < emailsPerLead; i++) {
      sentEmails.push(
        createMockSentEmail({
          organizationId,
          campaignId: campaign.id,
          leadId: lead.id,
          toEmail: lead.email,
          status: randomPick(['sent', 'delivered', 'opened', 'clicked', 'replied']),
        })
      )
    }
  })

  // Update campaign stats
  campaign.stats = {
    sent: sentEmails.length,
    delivered: sentEmails.filter((e) => e.status !== 'bounced').length,
    opened: sentEmails.filter((e) => ['opened', 'clicked', 'replied'].includes(e.status)).length,
    clicked: sentEmails.filter((e) => ['clicked', 'replied'].includes(e.status)).length,
    replied: sentEmails.filter((e) => e.status === 'replied').length,
    bounced: sentEmails.filter((e) => e.status === 'bounced').length,
  }

  return {
    campaign,
    sequences,
    leads,
    sentEmails,
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  uuid,
  randomInt,
  randomPick,
  randomEmail,
  randomCompany,
  randomFullName,
  randomTitle,
  randomDomain,
  pastDate,
  futureDate,
}
