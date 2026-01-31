/**
 * E2E Test Helpers
 *
 * Utility functions for creating test data and making API-like calls
 */

import { testDataStore, TestUser, TestOrganization } from './setup'

// ============================================================================
// Test Data Factories
// ============================================================================

export function createTestOrganization(overrides: Partial<TestOrganization> = {}): TestOrganization {
  const id = overrides.id || crypto.randomUUID()
  const org: TestOrganization = {
    id,
    name: overrides.name || `Test Org ${id.slice(0, 8)}`,
    slug: overrides.slug || `test-org-${id.slice(0, 8)}`,
    plan: overrides.plan || 'starter',
  }
  testDataStore.organizations.set(id, org)
  return org
}

export function createTestUser(overrides: Partial<TestUser> & { organization_id?: string } = {}): TestUser {
  const id = overrides.id || crypto.randomUUID()
  const orgId = overrides.organization_id || createTestOrganization().id
  const user: TestUser = {
    id,
    email: overrides.email || `user-${id.slice(0, 8)}@test.com`,
    organization_id: orgId,
  }
  testDataStore.users.set(id, user)
  return user
}

export interface TestCampaign {
  id: string
  organization_id: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  settings: Record<string, unknown>
  stats: {
    sent: number
    opened: number
    clicked: number
    replied: number
    bounced: number
  }
}

export function createTestCampaign(
  organizationId: string,
  overrides: Partial<TestCampaign> = {}
): TestCampaign {
  const id = overrides.id || crypto.randomUUID()
  const campaign: TestCampaign = {
    id,
    organization_id: organizationId,
    name: overrides.name || `Test Campaign ${id.slice(0, 8)}`,
    status: overrides.status || 'draft',
    settings: overrides.settings || {
      timezone: 'America/New_York',
      daily_limit: 100,
      send_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    },
    stats: overrides.stats || {
      sent: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
    },
  }
  testDataStore.campaigns.set(id, campaign)
  return campaign
}

export interface TestLead {
  id: string
  organization_id: string
  email: string
  first_name?: string
  last_name?: string
  company?: string
  status: 'active' | 'unsubscribed' | 'bounced' | 'replied'
}

export function createTestLead(
  organizationId: string,
  overrides: Partial<TestLead> = {}
): TestLead {
  const id = overrides.id || crypto.randomUUID()
  const lead: TestLead = {
    id,
    organization_id: organizationId,
    email: overrides.email || `lead-${id.slice(0, 8)}@example.com`,
    first_name: overrides.first_name || 'John',
    last_name: overrides.last_name || 'Doe',
    company: overrides.company || 'Acme Inc',
    status: overrides.status || 'active',
  }
  testDataStore.leads.set(id, lead)
  return lead
}

export interface TestCampaignLead {
  id: string
  campaign_id: string
  lead_id: string
  status: 'pending' | 'in_progress' | 'completed' | 'replied' | 'bounced'
  current_step: number
  replied_at?: string
}

export function createTestCampaignLead(
  campaignId: string,
  leadId: string,
  overrides: Partial<TestCampaignLead> = {}
): TestCampaignLead {
  const id = overrides.id || crypto.randomUUID()
  const campaignLead: TestCampaignLead = {
    id,
    campaign_id: campaignId,
    lead_id: leadId,
    status: overrides.status || 'pending',
    current_step: overrides.current_step || 0,
    replied_at: overrides.replied_at,
  }
  testDataStore.campaignLeads.set(id, campaignLead)
  return campaignLead
}

export interface TestEmailAccount {
  id: string
  organization_id: string
  email: string
  provider: 'google' | 'microsoft' | 'smtp'
  status: 'active' | 'paused' | 'error' | 'warming'
  daily_limit: number
  sent_today: number
}

export function createTestEmailAccount(
  organizationId: string,
  overrides: Partial<TestEmailAccount> = {}
): TestEmailAccount {
  const id = overrides.id || crypto.randomUUID()
  const account: TestEmailAccount = {
    id,
    organization_id: organizationId,
    email: overrides.email || `sender-${id.slice(0, 8)}@company.com`,
    provider: overrides.provider || 'smtp',
    status: overrides.status || 'active',
    daily_limit: overrides.daily_limit || 50,
    sent_today: overrides.sent_today || 0,
  }
  testDataStore.emailAccounts.set(id, account)
  return account
}

export interface TestSentEmail {
  id: string
  organization_id: string
  campaign_id?: string
  lead_id?: string
  email_account_id: string
  from_email: string
  to_email: string
  subject: string
  message_id: string
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced'
  sent_at: string
}

export function createTestSentEmail(
  organizationId: string,
  accountId: string,
  overrides: Partial<TestSentEmail> = {}
): TestSentEmail {
  const id = overrides.id || crypto.randomUUID()
  const messageId = overrides.message_id || `<${crypto.randomUUID()}@test.com>`
  const sentEmail: TestSentEmail = {
    id,
    organization_id: organizationId,
    campaign_id: overrides.campaign_id,
    lead_id: overrides.lead_id,
    email_account_id: accountId,
    from_email: overrides.from_email || 'sender@company.com',
    to_email: overrides.to_email || 'recipient@example.com',
    subject: overrides.subject || 'Test Subject',
    message_id: messageId,
    status: overrides.status || 'sent',
    sent_at: overrides.sent_at || new Date().toISOString(),
  }
  testDataStore.sentEmails.set(id, sentEmail)
  return sentEmail
}

export interface TestDomain {
  id: string
  organization_id: string
  domain: string
  registrar: 'cloudflare' | 'namecheap' | 'porkbun'
  status: 'pending' | 'active' | 'expired'
  spf_configured: boolean
  dkim_configured: boolean
  dmarc_configured: boolean
  health_status: 'pending' | 'healthy' | 'warning' | 'error'
}

export function createTestDomain(
  organizationId: string,
  overrides: Partial<TestDomain> = {}
): TestDomain {
  const id = overrides.id || crypto.randomUUID()
  const domain: TestDomain = {
    id,
    organization_id: organizationId,
    domain: overrides.domain || `test-${id.slice(0, 8)}.com`,
    registrar: overrides.registrar || 'cloudflare',
    status: overrides.status || 'active',
    spf_configured: overrides.spf_configured ?? false,
    dkim_configured: overrides.dkim_configured ?? false,
    dmarc_configured: overrides.dmarc_configured ?? false,
    health_status: overrides.health_status || 'pending',
  }
  testDataStore.domains.set(id, domain)
  return domain
}

export interface TestInboxMessage {
  id: string
  organization_id: string
  account_id: string
  external_id: string
  message_id: string
  from_email: string
  to_emails: string[]
  subject: string
  direction: 'inbound' | 'outbound'
  in_reply_to?: string
  references?: string[]
  received_at: string
}

export function createTestInboxMessage(
  organizationId: string,
  accountId: string,
  overrides: Partial<TestInboxMessage> = {}
): TestInboxMessage {
  const id = overrides.id || crypto.randomUUID()
  const messageId = overrides.message_id || `<${crypto.randomUUID()}@test.com>`
  const message: TestInboxMessage = {
    id,
    organization_id: organizationId,
    account_id: accountId,
    external_id: overrides.external_id || crypto.randomUUID(),
    message_id: messageId,
    from_email: overrides.from_email || 'sender@example.com',
    to_emails: overrides.to_emails || ['recipient@company.com'],
    subject: overrides.subject || 'Test Message',
    direction: overrides.direction || 'inbound',
    in_reply_to: overrides.in_reply_to,
    references: overrides.references,
    received_at: overrides.received_at || new Date().toISOString(),
  }
  testDataStore.inboxMessages.set(id, message)
  return message
}

// ============================================================================
// Test Scenario Builders
// ============================================================================

/**
 * Create a complete campaign scenario with leads
 */
export function createCampaignScenario(options: {
  leadCount?: number
  status?: 'draft' | 'active' | 'paused'
} = {}) {
  const { leadCount = 5, status = 'active' } = options

  const org = createTestOrganization()
  const user = createTestUser({ organization_id: org.id })
  const account = createTestEmailAccount(org.id)
  const campaign = createTestCampaign(org.id, { status })

  const leads: TestLead[] = []
  const campaignLeads: TestCampaignLead[] = []

  for (let i = 0; i < leadCount; i++) {
    const lead = createTestLead(org.id, { email: `lead${i + 1}@example.com` })
    leads.push(lead)

    const campaignLead = createTestCampaignLead(campaign.id, lead.id)
    campaignLeads.push(campaignLead)
  }

  return { org, user, account, campaign, leads, campaignLeads }
}

/**
 * Create a reply scenario for testing reply→campaign linking
 */
export function createReplyScenario() {
  const scenario = createCampaignScenario({ leadCount: 1, status: 'active' })
  const { org, account, campaign, leads, campaignLeads } = scenario

  // Create the original sent email
  const originalMessageId = `<original-${crypto.randomUUID()}@company.com>`
  const sentEmail = createTestSentEmail(org.id, account.id, {
    campaign_id: campaign.id,
    lead_id: leads[0].id,
    message_id: originalMessageId,
    to_email: leads[0].email,
    from_email: account.email,
  })

  // Create the reply message
  const replyMessageId = `<reply-${crypto.randomUUID()}@example.com>`
  const reply = createTestInboxMessage(org.id, account.id, {
    message_id: replyMessageId,
    from_email: leads[0].email,
    to_emails: [account.email],
    direction: 'inbound',
    in_reply_to: originalMessageId,
    references: [originalMessageId],
    subject: 'Re: Test Subject',
  })

  return {
    ...scenario,
    sentEmail,
    reply,
    originalMessageId,
    replyMessageId,
  }
}

/**
 * Create a domain purchase scenario
 */
export function createDomainScenario() {
  const org = createTestOrganization({ plan: 'pro' })
  const user = createTestUser({ organization_id: org.id })
  const domain = createTestDomain(org.id, {
    domain: 'coldoutreach.io',
    spf_configured: true,
    dkim_configured: true,
    dmarc_configured: true,
    health_status: 'healthy',
  })

  return { org, user, domain }
}
