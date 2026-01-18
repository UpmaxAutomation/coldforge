// White-Label & Agency Types

// Agency Types
export interface Agency {
  id: string;
  name: string;
  slug: string; // Unique identifier for subdomain/URL
  ownerId: string;
  plan: AgencyPlan;
  status: AgencyStatus;
  settings: AgencySettings;
  branding: AgencyBranding;
  limits: AgencyLimits;
  createdAt: Date;
  updatedAt: Date;
}

export type AgencyPlan = 'starter' | 'professional' | 'enterprise' | 'custom';
export type AgencyStatus = 'active' | 'suspended' | 'trial' | 'canceled';

export interface AgencySettings {
  allowSubAccountCreation: boolean;
  maxSubAccounts: number;
  allowCustomDomains: boolean;
  allowWhitelabeling: boolean;
  enableReselling: boolean;
  defaultMailboxQuota: number;
  defaultLeadQuota: number;
  defaultCampaignQuota: number;
  billingModel: 'per-seat' | 'per-email' | 'flat-rate' | 'custom';
  trialDays: number;
  autoSuspendOnOverage: boolean;
}

export interface AgencyBranding {
  logoUrl?: string;
  logoLightUrl?: string; // For dark backgrounds
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  companyName: string;
  supportEmail?: string;
  supportUrl?: string;
  termsUrl?: string;
  privacyUrl?: string;
  customCss?: string;
  emailFooter?: string;
  loginPageHtml?: string;
  dashboardWelcome?: string;
}

export interface AgencyLimits {
  maxSubAccounts: number;
  maxUsersPerSubAccount: number;
  maxMailboxes: number;
  maxLeads: number;
  maxCampaigns: number;
  maxEmailsPerMonth: number;
  maxApiRequests: number;
  maxStorageGb: number;
  maxCustomDomains: number;
}

// Sub-Account (Client Workspace)
export interface SubAccount {
  id: string;
  agencyId: string;
  name: string;
  slug: string;
  ownerId?: string; // Optional - agency may manage
  status: SubAccountStatus;
  settings: SubAccountSettings;
  limits: SubAccountLimits;
  usage: SubAccountUsage;
  billingOverride?: SubAccountBilling;
  createdAt: Date;
  updatedAt: Date;
}

export type SubAccountStatus = 'active' | 'suspended' | 'trial' | 'canceled';

export interface SubAccountSettings {
  allowExternalUsers: boolean;
  requireApproval: boolean;
  showAgencyBranding: boolean;
  customBranding?: Partial<AgencyBranding>;
  notificationEmails: string[];
  timezone: string;
  language: string;
}

export interface SubAccountLimits {
  maxUsers: number;
  maxMailboxes: number;
  maxLeads: number;
  maxCampaigns: number;
  maxEmailsPerMonth: number;
  maxTemplates: number;
  maxSequences: number;
}

export interface SubAccountUsage {
  users: number;
  mailboxes: number;
  leads: number;
  campaigns: number;
  emailsSentThisMonth: number;
  templates: number;
  sequences: number;
  storageUsedMb: number;
}

export interface SubAccountBilling {
  type: 'included' | 'per-seat' | 'per-email' | 'flat-rate';
  amount?: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly';
  nextBillingDate?: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

// Custom Domain
export interface CustomDomain {
  id: string;
  agencyId?: string;
  workspaceId?: string;
  domain: string;
  type: CustomDomainType;
  status: CustomDomainStatus;
  verification: DomainVerification;
  sslStatus: SSLStatus;
  settings: DomainSettings;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomDomainType = 'app' | 'email' | 'tracking';
export type CustomDomainStatus = 'pending' | 'verified' | 'failed' | 'expired';
export type SSLStatus = 'pending' | 'active' | 'failed' | 'expired';

export interface DomainVerification {
  method: 'dns-cname' | 'dns-txt' | 'file';
  token: string;
  record: string;
  value: string;
  verifiedAt?: Date;
  lastCheckedAt?: Date;
  attempts: number;
  errors?: string[];
}

export interface DomainSettings {
  forceHttps: boolean;
  redirectWww: boolean;
  customHeaders?: Record<string, string>;
  proxySettings?: {
    origin: string;
    cacheEnabled: boolean;
    cacheTtl: number;
  };
}

// Agency Member
export interface AgencyMember {
  id: string;
  agencyId: string;
  userId: string;
  role: AgencyRole;
  permissions: AgencyPermission[];
  subAccountAccess: 'all' | 'assigned' | 'none';
  assignedSubAccounts?: string[];
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt: Date;
}

export type AgencyRole = 'owner' | 'admin' | 'manager' | 'support' | 'billing';

export type AgencyPermission =
  | 'manage_agency'
  | 'manage_billing'
  | 'manage_members'
  | 'manage_subaccounts'
  | 'access_all_subaccounts'
  | 'manage_branding'
  | 'manage_domains'
  | 'view_analytics'
  | 'export_data'
  | 'impersonate_users';

// Agency Invitation
export interface AgencyInvitation {
  id: string;
  agencyId: string;
  email: string;
  role: AgencyRole;
  permissions: AgencyPermission[];
  subAccountAccess: 'all' | 'assigned' | 'none';
  assignedSubAccounts?: string[];
  token: string;
  expiresAt: Date;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdAt: Date;
}

// Sub-Account Invitation
export interface SubAccountInvitation {
  id: string;
  subAccountId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  token: string;
  expiresAt: Date;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdAt: Date;
}

// Agency Analytics
export interface AgencyAnalytics {
  agencyId: string;
  period: string; // YYYY-MM
  subAccountMetrics: {
    total: number;
    active: number;
    suspended: number;
    new: number;
    churned: number;
  };
  emailMetrics: {
    totalSent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
  };
  revenueMetrics: {
    mrr: number;
    arr: number;
    newRevenue: number;
    churnedRevenue: number;
    netRevenue: number;
  };
  usageMetrics: {
    totalMailboxes: number;
    totalLeads: number;
    totalCampaigns: number;
    apiRequests: number;
    storageUsedGb: number;
  };
}

// White-Label Email
export interface WhiteLabelEmailConfig {
  agencyId: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  domain?: string;
  dkimSelector?: string;
  dkimPrivateKey?: string;
  templates: {
    welcome?: string;
    passwordReset?: string;
    invitation?: string;
    notification?: string;
  };
  footer?: string;
}

// Reseller Config
export interface ResellerConfig {
  agencyId: string;
  enabled: boolean;
  markup: number; // Percentage markup on base prices
  customPricing?: {
    planId: string;
    price: number;
    currency: string;
  }[];
  commissionRate?: number;
  payoutMethod?: 'stripe' | 'paypal' | 'wire';
  payoutDetails?: Record<string, string>;
  minPayoutAmount: number;
  autoPayouts: boolean;
}

// Agency Activity Log
export interface AgencyActivityLog {
  id: string;
  agencyId: string;
  actorId: string;
  actorType: 'user' | 'system' | 'api';
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// Plan Limits by Agency Plan
export const AGENCY_PLAN_LIMITS: Record<AgencyPlan, AgencyLimits> = {
  starter: {
    maxSubAccounts: 5,
    maxUsersPerSubAccount: 3,
    maxMailboxes: 25,
    maxLeads: 50000,
    maxCampaigns: 25,
    maxEmailsPerMonth: 50000,
    maxApiRequests: 10000,
    maxStorageGb: 5,
    maxCustomDomains: 1,
  },
  professional: {
    maxSubAccounts: 25,
    maxUsersPerSubAccount: 10,
    maxMailboxes: 100,
    maxLeads: 250000,
    maxCampaigns: 100,
    maxEmailsPerMonth: 250000,
    maxApiRequests: 50000,
    maxStorageGb: 25,
    maxCustomDomains: 5,
  },
  enterprise: {
    maxSubAccounts: 100,
    maxUsersPerSubAccount: 50,
    maxMailboxes: 500,
    maxLeads: 1000000,
    maxCampaigns: 500,
    maxEmailsPerMonth: 1000000,
    maxApiRequests: 500000,
    maxStorageGb: 100,
    maxCustomDomains: 25,
  },
  custom: {
    maxSubAccounts: -1, // Unlimited
    maxUsersPerSubAccount: -1,
    maxMailboxes: -1,
    maxLeads: -1,
    maxCampaigns: -1,
    maxEmailsPerMonth: -1,
    maxApiRequests: -1,
    maxStorageGb: -1,
    maxCustomDomains: -1,
  },
};

// Default branding
export const DEFAULT_BRANDING: AgencyBranding = {
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#3b82f6',
  companyName: 'ColdForge',
};

// Default agency settings
export const DEFAULT_AGENCY_SETTINGS: AgencySettings = {
  allowSubAccountCreation: true,
  maxSubAccounts: 5,
  allowCustomDomains: false,
  allowWhitelabeling: false,
  enableReselling: false,
  defaultMailboxQuota: 5,
  defaultLeadQuota: 10000,
  defaultCampaignQuota: 5,
  billingModel: 'per-seat',
  trialDays: 14,
  autoSuspendOnOverage: false,
};
