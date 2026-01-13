// Billing & Subscription Types

export type PlanTier = 'free' | 'starter' | 'growth' | 'scale' | 'enterprise'

export type BillingInterval = 'monthly' | 'yearly'

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'trialing'
  | 'paused'

export interface Plan {
  id: string
  name: string
  tier: PlanTier
  description: string
  priceMonthly: number
  priceYearly: number
  stripePriceIdMonthly: string
  stripePriceIdYearly: string
  features: PlanFeatures
  limits: PlanLimits
  isActive: boolean
  sortOrder: number
}

export interface PlanFeatures {
  emailWarmup: boolean
  customDomains: boolean
  csvImport: boolean
  abTesting: boolean
  webhooks: boolean
  apiAccess: boolean
  prioritySupport: boolean
  dedicatedManager: boolean
  customIntegrations: boolean
  whiteLabeling: boolean
  sso: boolean
  advancedAnalytics: boolean
  teamMembers: number // 0 = unlimited
}

export interface PlanLimits {
  emailsPerMonth: number      // 0 = unlimited
  leadsTotal: number          // 0 = unlimited
  mailboxes: number           // 0 = unlimited
  campaigns: number           // 0 = unlimited
  warmupEmails: number        // Daily warmup emails
  teamMembers: number         // 0 = unlimited
  customDomains: number       // 0 = unlimited
  apiRequestsPerHour: number  // 0 = unlimited
}

export interface Subscription {
  id: string
  organizationId: string
  planId: string
  stripeSubscriptionId: string
  stripeCustomerId: string
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  trialStart: string | null
  trialEnd: string | null
  billingInterval: BillingInterval
  createdAt: string
  updatedAt: string
}

export interface UsageRecord {
  id: string
  organizationId: string
  subscriptionId: string
  periodStart: string
  periodEnd: string
  emailsSent: number
  leadsCreated: number
  mailboxesActive: number
  campaignsActive: number
  apiRequests: number
  warmupEmailsSent: number
  createdAt: string
  updatedAt: string
}

export interface Invoice {
  id: string
  organizationId: string
  subscriptionId: string
  stripeInvoiceId: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  amountDue: number
  amountPaid: number
  currency: string
  periodStart: string
  periodEnd: string
  pdfUrl: string | null
  hostedInvoiceUrl: string | null
  dueDate: string | null
  paidAt: string | null
  createdAt: string
}

export interface PaymentMethod {
  id: string
  organizationId: string
  stripePaymentMethodId: string
  type: 'card' | 'us_bank_account'
  isDefault: boolean
  card?: {
    brand: string
    last4: string
    expMonth: number
    expYear: number
  }
  createdAt: string
}

export interface BillingDetails {
  name: string
  email: string
  phone?: string
  address?: {
    line1: string
    line2?: string
    city: string
    state?: string
    postalCode: string
    country: string
  }
}

export interface UsageSummary {
  currentUsage: {
    emailsSent: number
    leadsTotal: number
    mailboxes: number
    campaigns: number
    warmupEmails: number
    teamMembers: number
  }
  limits: PlanLimits
  percentages: {
    emailsSent: number
    leadsTotal: number
    mailboxes: number
    campaigns: number
  }
  overages: {
    hasOverages: boolean
    emailsOverage: number
    leadsOverage: number
    mailboxesOverage: number
  }
}

// Default plans
export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tier: 'free',
    description: 'Perfect for trying out the platform',
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    features: {
      emailWarmup: false,
      customDomains: false,
      csvImport: true,
      abTesting: false,
      webhooks: false,
      apiAccess: false,
      prioritySupport: false,
      dedicatedManager: false,
      customIntegrations: false,
      whiteLabeling: false,
      sso: false,
      advancedAnalytics: false,
      teamMembers: 1,
    },
    limits: {
      emailsPerMonth: 100,
      leadsTotal: 500,
      mailboxes: 1,
      campaigns: 1,
      warmupEmails: 0,
      teamMembers: 1,
      customDomains: 0,
      apiRequestsPerHour: 0,
    },
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'starter',
    name: 'Starter',
    tier: 'starter',
    description: 'For individuals getting started with cold email',
    priceMonthly: 47,
    priceYearly: 470,
    stripePriceIdMonthly: process.env.STRIPE_STARTER_MONTHLY || '',
    stripePriceIdYearly: process.env.STRIPE_STARTER_YEARLY || '',
    features: {
      emailWarmup: true,
      customDomains: true,
      csvImport: true,
      abTesting: false,
      webhooks: false,
      apiAccess: false,
      prioritySupport: false,
      dedicatedManager: false,
      customIntegrations: false,
      whiteLabeling: false,
      sso: false,
      advancedAnalytics: false,
      teamMembers: 1,
    },
    limits: {
      emailsPerMonth: 5000,
      leadsTotal: 10000,
      mailboxes: 5,
      campaigns: 5,
      warmupEmails: 50,
      teamMembers: 1,
      customDomains: 3,
      apiRequestsPerHour: 0,
    },
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'growth',
    name: 'Growth',
    tier: 'growth',
    description: 'For growing teams scaling their outreach',
    priceMonthly: 97,
    priceYearly: 970,
    stripePriceIdMonthly: process.env.STRIPE_GROWTH_MONTHLY || '',
    stripePriceIdYearly: process.env.STRIPE_GROWTH_YEARLY || '',
    features: {
      emailWarmup: true,
      customDomains: true,
      csvImport: true,
      abTesting: true,
      webhooks: true,
      apiAccess: true,
      prioritySupport: false,
      dedicatedManager: false,
      customIntegrations: false,
      whiteLabeling: false,
      sso: false,
      advancedAnalytics: true,
      teamMembers: 5,
    },
    limits: {
      emailsPerMonth: 25000,
      leadsTotal: 50000,
      mailboxes: 25,
      campaigns: 25,
      warmupEmails: 100,
      teamMembers: 5,
      customDomains: 10,
      apiRequestsPerHour: 1000,
    },
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'scale',
    name: 'Scale',
    tier: 'scale',
    description: 'For agencies and high-volume senders',
    priceMonthly: 297,
    priceYearly: 2970,
    stripePriceIdMonthly: process.env.STRIPE_SCALE_MONTHLY || '',
    stripePriceIdYearly: process.env.STRIPE_SCALE_YEARLY || '',
    features: {
      emailWarmup: true,
      customDomains: true,
      csvImport: true,
      abTesting: true,
      webhooks: true,
      apiAccess: true,
      prioritySupport: true,
      dedicatedManager: false,
      customIntegrations: true,
      whiteLabeling: false,
      sso: false,
      advancedAnalytics: true,
      teamMembers: 20,
    },
    limits: {
      emailsPerMonth: 100000,
      leadsTotal: 250000,
      mailboxes: 100,
      campaigns: 100,
      warmupEmails: 200,
      teamMembers: 20,
      customDomains: 50,
      apiRequestsPerHour: 5000,
    },
    isActive: true,
    sortOrder: 3,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    description: 'Custom solutions for large organizations',
    priceMonthly: 0, // Custom pricing
    priceYearly: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    features: {
      emailWarmup: true,
      customDomains: true,
      csvImport: true,
      abTesting: true,
      webhooks: true,
      apiAccess: true,
      prioritySupport: true,
      dedicatedManager: true,
      customIntegrations: true,
      whiteLabeling: true,
      sso: true,
      advancedAnalytics: true,
      teamMembers: 0, // Unlimited
    },
    limits: {
      emailsPerMonth: 0, // Unlimited
      leadsTotal: 0,
      mailboxes: 0,
      campaigns: 0,
      warmupEmails: 500,
      teamMembers: 0,
      customDomains: 0,
      apiRequestsPerHour: 0,
    },
    isActive: true,
    sortOrder: 4,
  },
]

// Helper to get plan by tier
export function getPlanByTier(tier: PlanTier): Plan | undefined {
  return PLANS.find(p => p.tier === tier)
}

// Helper to get plan by ID
export function getPlanById(id: string): Plan | undefined {
  return PLANS.find(p => p.id === id)
}

// Check if organization is within limits
export function checkLimits(
  usage: UsageSummary['currentUsage'],
  limits: PlanLimits
): { withinLimits: boolean; violations: string[] } {
  const violations: string[] = []

  if (limits.emailsPerMonth > 0 && usage.emailsSent >= limits.emailsPerMonth) {
    violations.push('Monthly email limit reached')
  }
  if (limits.leadsTotal > 0 && usage.leadsTotal >= limits.leadsTotal) {
    violations.push('Total leads limit reached')
  }
  if (limits.mailboxes > 0 && usage.mailboxes >= limits.mailboxes) {
    violations.push('Mailbox limit reached')
  }
  if (limits.campaigns > 0 && usage.campaigns >= limits.campaigns) {
    violations.push('Campaign limit reached')
  }
  if (limits.teamMembers > 0 && usage.teamMembers >= limits.teamMembers) {
    violations.push('Team member limit reached')
  }

  return {
    withinLimits: violations.length === 0,
    violations,
  }
}

// Calculate percentage of limit used
export function calculateUsagePercentage(used: number, limit: number): number {
  if (limit === 0) return 0 // Unlimited
  return Math.min(Math.round((used / limit) * 100), 100)
}
