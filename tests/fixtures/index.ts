/**
 * Static Test Fixtures
 * Pre-defined test data for consistent, reproducible tests
 */
import type { Tables } from '@/types/database'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// ============================================================================
// Static IDs (for referential integrity in fixtures)
// ============================================================================

export const FIXTURE_IDS = {
  // Organizations
  ORG_STARTER: '00000000-0000-0000-0000-000000000001',
  ORG_PRO: '00000000-0000-0000-0000-000000000002',
  ORG_AGENCY: '00000000-0000-0000-0000-000000000003',

  // Users
  USER_OWNER: '11111111-1111-1111-1111-111111111001',
  USER_ADMIN: '11111111-1111-1111-1111-111111111002',
  USER_MEMBER: '11111111-1111-1111-1111-111111111003',
  USER_NO_ORG: '11111111-1111-1111-1111-111111111004',

  // Email Accounts
  EMAIL_ACCOUNT_1: '22222222-2222-2222-2222-222222222001',
  EMAIL_ACCOUNT_2: '22222222-2222-2222-2222-222222222002',
  EMAIL_ACCOUNT_WARMING: '22222222-2222-2222-2222-222222222003',
  EMAIL_ACCOUNT_ERROR: '22222222-2222-2222-2222-222222222004',

  // Campaigns
  CAMPAIGN_DRAFT: '33333333-3333-3333-3333-333333333001',
  CAMPAIGN_ACTIVE: '33333333-3333-3333-3333-333333333002',
  CAMPAIGN_PAUSED: '33333333-3333-3333-3333-333333333003',
  CAMPAIGN_COMPLETED: '33333333-3333-3333-3333-333333333004',

  // Leads
  LEAD_1: '44444444-4444-4444-4444-444444444001',
  LEAD_2: '44444444-4444-4444-4444-444444444002',
  LEAD_BOUNCED: '44444444-4444-4444-4444-444444444003',
  LEAD_UNSUBSCRIBED: '44444444-4444-4444-4444-444444444004',

  // Lead Lists
  LEAD_LIST_1: '55555555-5555-5555-5555-555555555001',
  LEAD_LIST_2: '55555555-5555-5555-5555-555555555002',

  // Domains
  DOMAIN_HEALTHY: '66666666-6666-6666-6666-666666666001',
  DOMAIN_WARNING: '66666666-6666-6666-6666-666666666002',
  DOMAIN_ERROR: '66666666-6666-6666-6666-666666666003',

  // Sent Emails
  SENT_EMAIL_1: '77777777-7777-7777-7777-777777777001',
  SENT_EMAIL_OPENED: '77777777-7777-7777-7777-777777777002',
  SENT_EMAIL_CLICKED: '77777777-7777-7777-7777-777777777003',
  SENT_EMAIL_REPLIED: '77777777-7777-7777-7777-777777777004',
  SENT_EMAIL_BOUNCED: '77777777-7777-7777-7777-777777777005',

  // Campaign Sequences
  SEQUENCE_STEP_1: '88888888-8888-8888-8888-888888888001',
  SEQUENCE_STEP_2: '88888888-8888-8888-8888-888888888002',
  SEQUENCE_STEP_3: '88888888-8888-8888-8888-888888888003',
} as const

// ============================================================================
// Static Timestamps
// ============================================================================

const NOW = '2025-01-13T12:00:00.000Z'
const YESTERDAY = '2025-01-12T12:00:00.000Z'
const LAST_WEEK = '2025-01-06T12:00:00.000Z'
const NEXT_WEEK = '2025-01-20T12:00:00.000Z'

// ============================================================================
// Organization Fixtures
// ============================================================================

export const organizationFixtures: Record<string, Tables<'organizations'>> = {
  starterOrg: {
    id: FIXTURE_IDS.ORG_STARTER,
    name: 'Starter Company',
    slug: 'starter-company',
    plan: 'starter',
    stripe_customer_id: 'cus_starter123',
    stripe_subscription_id: null,
    settings: {
      timezone: 'America/New_York',
      dailySendLimit: 500,
    },
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  proOrg: {
    id: FIXTURE_IDS.ORG_PRO,
    name: 'Pro Solutions',
    slug: 'pro-solutions',
    plan: 'pro',
    stripe_customer_id: 'cus_pro456',
    stripe_subscription_id: 'sub_pro789',
    settings: {
      timezone: 'America/Los_Angeles',
      dailySendLimit: 2000,
    },
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  agencyOrg: {
    id: FIXTURE_IDS.ORG_AGENCY,
    name: 'Agency Elite',
    slug: 'agency-elite',
    plan: 'agency',
    stripe_customer_id: 'cus_agency012',
    stripe_subscription_id: 'sub_agency345',
    settings: {
      timezone: 'Europe/London',
      dailySendLimit: 10000,
      whiteLabel: true,
    },
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
}

// ============================================================================
// User Fixtures
// ============================================================================

export const userFixtures: Record<string, Tables<'users'>> = {
  ownerUser: {
    id: FIXTURE_IDS.USER_OWNER,
    organization_id: FIXTURE_IDS.ORG_PRO,
    email: 'owner@prosolutions.com',
    full_name: 'John Owner',
    role: 'owner',
    avatar_url: 'https://example.com/avatars/owner.jpg',
    settings: {
      notifications: {
        email: true,
        desktop: true,
      },
    },
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  adminUser: {
    id: FIXTURE_IDS.USER_ADMIN,
    organization_id: FIXTURE_IDS.ORG_PRO,
    email: 'admin@prosolutions.com',
    full_name: 'Jane Admin',
    role: 'admin',
    avatar_url: null,
    settings: {},
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  memberUser: {
    id: FIXTURE_IDS.USER_MEMBER,
    organization_id: FIXTURE_IDS.ORG_PRO,
    email: 'member@prosolutions.com',
    full_name: 'Bob Member',
    role: 'member',
    avatar_url: null,
    settings: {},
    created_at: YESTERDAY,
    updated_at: NOW,
  },
  noOrgUser: {
    id: FIXTURE_IDS.USER_NO_ORG,
    organization_id: null,
    email: 'solo@example.com',
    full_name: 'Solo User',
    role: 'member',
    avatar_url: null,
    settings: {},
    created_at: NOW,
    updated_at: NOW,
  },
}

// ============================================================================
// Supabase Auth User Fixtures
// ============================================================================

export const supabaseUserFixtures: Record<string, SupabaseUser> = {
  authenticatedUser: {
    id: FIXTURE_IDS.USER_OWNER,
    email: 'owner@prosolutions.com',
    aud: 'authenticated',
    role: 'authenticated',
    created_at: LAST_WEEK,
    updated_at: NOW,
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {
      email: 'owner@prosolutions.com',
      email_verified: true,
      full_name: 'John Owner',
    },
    identities: [],
    factors: [],
  },
  unverifiedUser: {
    id: FIXTURE_IDS.USER_NO_ORG,
    email: 'unverified@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    created_at: NOW,
    updated_at: NOW,
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {
      email: 'unverified@example.com',
      email_verified: false,
    },
    identities: [],
    factors: [],
  },
}

// ============================================================================
// Email Account Fixtures
// ============================================================================

export const emailAccountFixtures: Record<string, Tables<'email_accounts'>> = {
  activeAccount: {
    id: FIXTURE_IDS.EMAIL_ACCOUNT_1,
    organization_id: FIXTURE_IDS.ORG_PRO,
    email: 'sales@prosolutions.com',
    display_name: 'Sales Team',
    provider: 'google',
    status: 'active',
    smtp_host: null,
    smtp_port: null,
    smtp_username: null,
    smtp_password_encrypted: null,
    imap_host: null,
    imap_port: null,
    oauth_tokens_encrypted: { access_token: 'encrypted_token', refresh_token: 'encrypted_refresh' },
    daily_limit: 200,
    sent_today: 45,
    warmup_enabled: false,
    warmup_progress: 100,
    health_score: 95,
    last_error: null,
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  smtpAccount: {
    id: FIXTURE_IDS.EMAIL_ACCOUNT_2,
    organization_id: FIXTURE_IDS.ORG_PRO,
    email: 'outreach@prosolutions.com',
    display_name: 'Outreach',
    provider: 'smtp',
    status: 'active',
    smtp_host: 'smtp.example.com',
    smtp_port: 587,
    smtp_username: 'outreach@prosolutions.com',
    smtp_password_encrypted: 'encrypted_password',
    imap_host: 'imap.example.com',
    imap_port: 993,
    oauth_tokens_encrypted: null,
    daily_limit: 100,
    sent_today: 12,
    warmup_enabled: false,
    warmup_progress: 100,
    health_score: 88,
    last_error: null,
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  warmingAccount: {
    id: FIXTURE_IDS.EMAIL_ACCOUNT_WARMING,
    organization_id: FIXTURE_IDS.ORG_PRO,
    email: 'new@prosolutions.com',
    display_name: 'New Account',
    provider: 'microsoft',
    status: 'warming',
    smtp_host: null,
    smtp_port: null,
    smtp_username: null,
    smtp_password_encrypted: null,
    imap_host: null,
    imap_port: null,
    oauth_tokens_encrypted: { access_token: 'encrypted_token', refresh_token: 'encrypted_refresh' },
    daily_limit: 50,
    sent_today: 5,
    warmup_enabled: true,
    warmup_progress: 35,
    health_score: 70,
    last_error: null,
    created_at: YESTERDAY,
    updated_at: NOW,
  },
  errorAccount: {
    id: FIXTURE_IDS.EMAIL_ACCOUNT_ERROR,
    organization_id: FIXTURE_IDS.ORG_PRO,
    email: 'broken@prosolutions.com',
    display_name: 'Broken Account',
    provider: 'smtp',
    status: 'error',
    smtp_host: 'smtp.broken.com',
    smtp_port: 587,
    smtp_username: 'broken@prosolutions.com',
    smtp_password_encrypted: 'encrypted_password',
    imap_host: 'imap.broken.com',
    imap_port: 993,
    oauth_tokens_encrypted: null,
    daily_limit: 100,
    sent_today: 0,
    warmup_enabled: false,
    warmup_progress: 0,
    health_score: 0,
    last_error: 'Connection refused: Authentication failed',
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
}

// ============================================================================
// Campaign Fixtures
// ============================================================================

export const campaignFixtures: Record<string, Tables<'campaigns'>> = {
  draftCampaign: {
    id: FIXTURE_IDS.CAMPAIGN_DRAFT,
    organization_id: FIXTURE_IDS.ORG_PRO,
    name: 'Q1 Outreach (Draft)',
    status: 'draft',
    settings: {
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
    stats: {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
    },
    created_at: YESTERDAY,
    updated_at: NOW,
  },
  activeCampaign: {
    id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    organization_id: FIXTURE_IDS.ORG_PRO,
    name: 'Product Launch Campaign',
    status: 'active',
    settings: {
      schedule: {
        timezone: 'America/New_York',
        sendingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        sendingHoursStart: 8,
        sendingHoursEnd: 18,
      },
      tracking: {
        openTracking: true,
        clickTracking: true,
        replyDetection: true,
      },
    },
    stats: {
      sent: 500,
      delivered: 485,
      opened: 150,
      clicked: 45,
      replied: 12,
      bounced: 15,
    },
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  pausedCampaign: {
    id: FIXTURE_IDS.CAMPAIGN_PAUSED,
    organization_id: FIXTURE_IDS.ORG_PRO,
    name: 'Holiday Campaign (Paused)',
    status: 'paused',
    settings: {
      schedule: {
        timezone: 'America/New_York',
        sendingDays: ['monday', 'wednesday', 'friday'],
        sendingHoursStart: 10,
        sendingHoursEnd: 16,
      },
      tracking: {
        openTracking: true,
        clickTracking: true,
        replyDetection: true,
      },
    },
    stats: {
      sent: 200,
      delivered: 195,
      opened: 80,
      clicked: 20,
      replied: 5,
      bounced: 5,
    },
    created_at: LAST_WEEK,
    updated_at: YESTERDAY,
  },
  completedCampaign: {
    id: FIXTURE_IDS.CAMPAIGN_COMPLETED,
    organization_id: FIXTURE_IDS.ORG_PRO,
    name: 'December Newsletter',
    status: 'completed',
    settings: {
      schedule: {
        timezone: 'America/New_York',
        sendingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        sendingHoursStart: 9,
        sendingHoursEnd: 17,
      },
      tracking: {
        openTracking: true,
        clickTracking: false,
        replyDetection: true,
      },
    },
    stats: {
      sent: 1000,
      delivered: 980,
      opened: 320,
      clicked: 85,
      replied: 25,
      bounced: 20,
    },
    created_at: LAST_WEEK,
    updated_at: YESTERDAY,
  },
}

// ============================================================================
// Lead Fixtures
// ============================================================================

export const leadFixtures: Record<string, Tables<'leads'>> = {
  activeLead1: {
    id: FIXTURE_IDS.LEAD_1,
    organization_id: FIXTURE_IDS.ORG_PRO,
    list_id: FIXTURE_IDS.LEAD_LIST_1,
    email: 'john.smith@acmecorp.com',
    first_name: 'John',
    last_name: 'Smith',
    company: 'Acme Corporation',
    title: 'VP of Sales',
    phone: '+1-555-123-4567',
    linkedin_url: 'https://linkedin.com/in/johnsmith',
    custom_fields: {
      industry: 'Technology',
      company_size: '100-500',
    },
    status: 'active',
    validation_status: 'valid',
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  activeLead2: {
    id: FIXTURE_IDS.LEAD_2,
    organization_id: FIXTURE_IDS.ORG_PRO,
    list_id: FIXTURE_IDS.LEAD_LIST_1,
    email: 'jane.doe@techstartup.io',
    first_name: 'Jane',
    last_name: 'Doe',
    company: 'Tech Startup Inc',
    title: 'CEO',
    phone: '+1-555-987-6543',
    linkedin_url: 'https://linkedin.com/in/janedoe',
    custom_fields: {
      industry: 'SaaS',
      company_size: '10-50',
      funding_stage: 'Series A',
    },
    status: 'active',
    validation_status: 'valid',
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  bouncedLead: {
    id: FIXTURE_IDS.LEAD_BOUNCED,
    organization_id: FIXTURE_IDS.ORG_PRO,
    list_id: FIXTURE_IDS.LEAD_LIST_1,
    email: 'invalid@nonexistent-domain.com',
    first_name: 'Invalid',
    last_name: 'Lead',
    company: 'Unknown Corp',
    title: 'Unknown',
    phone: null,
    linkedin_url: null,
    custom_fields: {},
    status: 'bounced',
    validation_status: 'invalid',
    created_at: LAST_WEEK,
    updated_at: YESTERDAY,
  },
  unsubscribedLead: {
    id: FIXTURE_IDS.LEAD_UNSUBSCRIBED,
    organization_id: FIXTURE_IDS.ORG_PRO,
    list_id: FIXTURE_IDS.LEAD_LIST_2,
    email: 'unsubscribed@example.com',
    first_name: 'Opted',
    last_name: 'Out',
    company: 'Privacy Corp',
    title: 'Director',
    phone: '+1-555-000-0000',
    linkedin_url: null,
    custom_fields: {},
    status: 'unsubscribed',
    validation_status: 'valid',
    created_at: LAST_WEEK,
    updated_at: YESTERDAY,
  },
}

// ============================================================================
// Lead List Fixtures
// ============================================================================

export const leadListFixtures: Record<string, Tables<'lead_lists'>> = {
  primaryList: {
    id: FIXTURE_IDS.LEAD_LIST_1,
    organization_id: FIXTURE_IDS.ORG_PRO,
    name: 'Q1 2025 Prospects',
    description: 'Primary prospect list for Q1 outreach',
    lead_count: 500,
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  secondaryList: {
    id: FIXTURE_IDS.LEAD_LIST_2,
    organization_id: FIXTURE_IDS.ORG_PRO,
    name: 'Conference Attendees',
    description: 'Leads collected from SaaS conference 2024',
    lead_count: 150,
    created_at: LAST_WEEK,
    updated_at: YESTERDAY,
  },
}

// ============================================================================
// Domain Fixtures
// ============================================================================

export const domainFixtures: Record<string, Tables<'domains'>> = {
  healthyDomain: {
    id: FIXTURE_IDS.DOMAIN_HEALTHY,
    organization_id: FIXTURE_IDS.ORG_PRO,
    domain: 'prosolutions.com',
    registrar: 'cloudflare',
    registrar_domain_id: 'cf_domain_123',
    dns_provider: 'cloudflare',
    dns_zone_id: 'cf_zone_456',
    spf_configured: true,
    dkim_configured: true,
    dkim_selector: 'default',
    dkim_private_key_encrypted: 'encrypted_key',
    dmarc_configured: true,
    bimi_configured: true,
    health_status: 'healthy',
    last_health_check: NOW,
    auto_purchased: false,
    purchase_price: null,
    expires_at: NEXT_WEEK,
    created_at: LAST_WEEK,
    updated_at: NOW,
  },
  warningDomain: {
    id: FIXTURE_IDS.DOMAIN_WARNING,
    organization_id: FIXTURE_IDS.ORG_PRO,
    domain: 'outreach-pro.io',
    registrar: 'namecheap',
    registrar_domain_id: 'nc_domain_789',
    dns_provider: 'cloudflare',
    dns_zone_id: 'cf_zone_789',
    spf_configured: true,
    dkim_configured: true,
    dkim_selector: 'mail',
    dkim_private_key_encrypted: 'encrypted_key',
    dmarc_configured: false,
    bimi_configured: false,
    health_status: 'warning',
    last_health_check: YESTERDAY,
    auto_purchased: true,
    purchase_price: 12.99,
    expires_at: NEXT_WEEK,
    created_at: LAST_WEEK,
    updated_at: YESTERDAY,
  },
  errorDomain: {
    id: FIXTURE_IDS.DOMAIN_ERROR,
    organization_id: FIXTURE_IDS.ORG_PRO,
    domain: 'broken-domain.net',
    registrar: 'manual',
    registrar_domain_id: null,
    dns_provider: null,
    dns_zone_id: null,
    spf_configured: false,
    dkim_configured: false,
    dkim_selector: null,
    dkim_private_key_encrypted: null,
    dmarc_configured: false,
    bimi_configured: false,
    health_status: 'error',
    last_health_check: YESTERDAY,
    auto_purchased: false,
    purchase_price: null,
    expires_at: YESTERDAY,
    created_at: LAST_WEEK,
    updated_at: YESTERDAY,
  },
}

// ============================================================================
// Sent Email Fixtures
// ============================================================================

export const sentEmailFixtures: Record<string, Tables<'sent_emails'>> = {
  sentEmail: {
    id: FIXTURE_IDS.SENT_EMAIL_1,
    organization_id: FIXTURE_IDS.ORG_PRO,
    campaign_id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    campaign_lead_id: null,
    email_account_id: FIXTURE_IDS.EMAIL_ACCOUNT_1,
    lead_id: FIXTURE_IDS.LEAD_1,
    to_email: 'john.smith@acmecorp.com',
    from_email: 'sales@prosolutions.com',
    subject: 'Quick question about your sales process',
    body_html: '<p>Hi John,</p><p>I noticed Acme Corporation...</p>',
    body_text: 'Hi John,\n\nI noticed Acme Corporation...',
    message_id: '<msg-001@prosolutions.com>',
    status: 'sent',
    opened_at: null,
    clicked_at: null,
    replied_at: null,
    bounced_at: null,
    bounce_type: null,
    sent_at: YESTERDAY,
    created_at: YESTERDAY,
  },
  openedEmail: {
    id: FIXTURE_IDS.SENT_EMAIL_OPENED,
    organization_id: FIXTURE_IDS.ORG_PRO,
    campaign_id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    campaign_lead_id: null,
    email_account_id: FIXTURE_IDS.EMAIL_ACCOUNT_1,
    lead_id: FIXTURE_IDS.LEAD_2,
    to_email: 'jane.doe@techstartup.io',
    from_email: 'sales@prosolutions.com',
    subject: 'Partnership opportunity',
    body_html: '<p>Hi Jane,</p><p>I saw your recent funding announcement...</p>',
    body_text: 'Hi Jane,\n\nI saw your recent funding announcement...',
    message_id: '<msg-002@prosolutions.com>',
    status: 'opened',
    opened_at: NOW,
    clicked_at: null,
    replied_at: null,
    bounced_at: null,
    bounce_type: null,
    sent_at: YESTERDAY,
    created_at: YESTERDAY,
  },
  clickedEmail: {
    id: FIXTURE_IDS.SENT_EMAIL_CLICKED,
    organization_id: FIXTURE_IDS.ORG_PRO,
    campaign_id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    campaign_lead_id: null,
    email_account_id: FIXTURE_IDS.EMAIL_ACCOUNT_2,
    lead_id: FIXTURE_IDS.LEAD_1,
    to_email: 'john.smith@acmecorp.com',
    from_email: 'outreach@prosolutions.com',
    subject: 'Check out our case study',
    body_html: '<p>Hi John,</p><p>Here is the case study: <a href="https://example.com/case">Link</a></p>',
    body_text: 'Hi John,\n\nHere is the case study: https://example.com/case',
    message_id: '<msg-003@prosolutions.com>',
    status: 'clicked',
    opened_at: YESTERDAY,
    clicked_at: NOW,
    replied_at: null,
    bounced_at: null,
    bounce_type: null,
    sent_at: LAST_WEEK,
    created_at: LAST_WEEK,
  },
  repliedEmail: {
    id: FIXTURE_IDS.SENT_EMAIL_REPLIED,
    organization_id: FIXTURE_IDS.ORG_PRO,
    campaign_id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    campaign_lead_id: null,
    email_account_id: FIXTURE_IDS.EMAIL_ACCOUNT_1,
    lead_id: FIXTURE_IDS.LEAD_2,
    to_email: 'jane.doe@techstartup.io',
    from_email: 'sales@prosolutions.com',
    subject: 'Let\'s schedule a call',
    body_html: '<p>Hi Jane,</p><p>Would you be available for a quick call?</p>',
    body_text: 'Hi Jane,\n\nWould you be available for a quick call?',
    message_id: '<msg-004@prosolutions.com>',
    status: 'replied',
    opened_at: LAST_WEEK,
    clicked_at: null,
    replied_at: YESTERDAY,
    bounced_at: null,
    bounce_type: null,
    sent_at: LAST_WEEK,
    created_at: LAST_WEEK,
  },
  bouncedEmail: {
    id: FIXTURE_IDS.SENT_EMAIL_BOUNCED,
    organization_id: FIXTURE_IDS.ORG_PRO,
    campaign_id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    campaign_lead_id: null,
    email_account_id: FIXTURE_IDS.EMAIL_ACCOUNT_1,
    lead_id: FIXTURE_IDS.LEAD_BOUNCED,
    to_email: 'invalid@nonexistent-domain.com',
    from_email: 'sales@prosolutions.com',
    subject: 'Introduction',
    body_html: '<p>Hi there,</p><p>I wanted to introduce myself...</p>',
    body_text: 'Hi there,\n\nI wanted to introduce myself...',
    message_id: '<msg-005@prosolutions.com>',
    status: 'bounced',
    opened_at: null,
    clicked_at: null,
    replied_at: null,
    bounced_at: YESTERDAY,
    bounce_type: 'hard',
    sent_at: YESTERDAY,
    created_at: YESTERDAY,
  },
}

// ============================================================================
// Campaign Sequence Fixtures
// ============================================================================

export const campaignSequenceFixtures: Record<string, Tables<'campaign_sequences'>> = {
  step1: {
    id: FIXTURE_IDS.SEQUENCE_STEP_1,
    campaign_id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    step_number: 1,
    subject: 'Quick question about {{company}}',
    body_html: '<p>Hi {{first_name}},</p><p>I noticed {{company}} is expanding...</p><p>Best,<br/>{{sender_name}}</p>',
    body_text: 'Hi {{first_name}},\n\nI noticed {{company}} is expanding...\n\nBest,\n{{sender_name}}',
    delay_days: 0,
    delay_hours: 0,
    condition_type: 'always',
    created_at: LAST_WEEK,
    updated_at: LAST_WEEK,
  },
  step2: {
    id: FIXTURE_IDS.SEQUENCE_STEP_2,
    campaign_id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    step_number: 2,
    subject: 'Re: Quick question about {{company}}',
    body_html: '<p>Hi {{first_name}},</p><p>Just following up on my previous email...</p>',
    body_text: 'Hi {{first_name}},\n\nJust following up on my previous email...',
    delay_days: 3,
    delay_hours: 0,
    condition_type: 'not_replied',
    created_at: LAST_WEEK,
    updated_at: LAST_WEEK,
  },
  step3: {
    id: FIXTURE_IDS.SEQUENCE_STEP_3,
    campaign_id: FIXTURE_IDS.CAMPAIGN_ACTIVE,
    step_number: 3,
    subject: 'One last try',
    body_html: '<p>Hi {{first_name}},</p><p>I know you\'re busy, but I wanted to try one more time...</p>',
    body_text: 'Hi {{first_name}},\n\nI know you\'re busy, but I wanted to try one more time...',
    delay_days: 5,
    delay_hours: 0,
    condition_type: 'not_opened',
    created_at: LAST_WEEK,
    updated_at: LAST_WEEK,
  },
}

// ============================================================================
// Aggregate Exports
// ============================================================================

export const allFixtures = {
  organizations: organizationFixtures,
  users: userFixtures,
  supabaseUsers: supabaseUserFixtures,
  emailAccounts: emailAccountFixtures,
  campaigns: campaignFixtures,
  leads: leadFixtures,
  leadLists: leadListFixtures,
  domains: domainFixtures,
  sentEmails: sentEmailFixtures,
  campaignSequences: campaignSequenceFixtures,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all fixtures for a specific organization
 */
export function getOrganizationFixtures(orgId: string) {
  return {
    organization: Object.values(organizationFixtures).find((o) => o.id === orgId),
    users: Object.values(userFixtures).filter((u) => u.organization_id === orgId),
    emailAccounts: Object.values(emailAccountFixtures).filter((e) => e.organization_id === orgId),
    campaigns: Object.values(campaignFixtures).filter((c) => c.organization_id === orgId),
    leads: Object.values(leadFixtures).filter((l) => l.organization_id === orgId),
    leadLists: Object.values(leadListFixtures).filter((l) => l.organization_id === orgId),
    domains: Object.values(domainFixtures).filter((d) => d.organization_id === orgId),
  }
}

/**
 * Get fixtures for Pro organization (most commonly used in tests)
 */
export function getProOrgFixtures() {
  return getOrganizationFixtures(FIXTURE_IDS.ORG_PRO)
}

/**
 * Convert fixtures to arrays for mock data insertion
 */
export function fixturesAsArrays() {
  return {
    organizations: Object.values(organizationFixtures),
    users: Object.values(userFixtures),
    emailAccounts: Object.values(emailAccountFixtures),
    campaigns: Object.values(campaignFixtures),
    leads: Object.values(leadFixtures),
    leadLists: Object.values(leadListFixtures),
    domains: Object.values(domainFixtures),
    sentEmails: Object.values(sentEmailFixtures),
    campaignSequences: Object.values(campaignSequenceFixtures),
  }
}
