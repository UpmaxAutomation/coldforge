// Cloudflare API Types for Domain Management

export interface CloudflareConfig {
  apiToken: string;
  accountId: string;
  zoneId?: string;
}

// Domain Registration Types
export interface DomainAvailability {
  domain: string;
  available: boolean;
  premium: boolean;
  price?: number;
  currency?: string;
  tld: string;
}

export interface DomainSearchResult {
  domains: DomainAvailability[];
  suggestions?: DomainAvailability[];
}

export interface DomainRegistration {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  expiresAt: string;
  createdAt: string;
  autoRenew: boolean;
  locked: boolean;
  nameservers: string[];
  registrant?: RegistrantContact;
}

export interface RegistrantContact {
  firstName: string;
  lastName: string;
  organization?: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
}

export interface DomainPurchaseRequest {
  domain: string;
  autoRenew?: boolean;
  privacy?: boolean;
  years?: number;
  registrant: RegistrantContact;
}

export interface DomainPurchaseResponse {
  success: boolean;
  domainId?: string;
  domain?: string;
  expiresAt?: string;
  error?: string;
}

// DNS Record Types
export interface DNSRecord {
  id?: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SPF' | 'SRV';
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  zoneId?: string;
}

export interface DNSRecordResponse {
  success: boolean;
  result?: {
    id: string;
    type: string;
    name: string;
    content: string;
    ttl: number;
    proxied: boolean;
    created_on: string;
    modified_on: string;
  };
  errors?: CloudflareError[];
}

export interface CloudflareError {
  code: number;
  message: string;
}

// Zone Types
export interface Zone {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted';
  nameservers: string[];
  originalNameservers?: string[];
}

export interface ZoneCreateResponse {
  success: boolean;
  result?: Zone;
  errors?: CloudflareError[];
}

// DNS Verification Types
export interface DNSVerificationResult {
  recordType: string;
  expected: string;
  actual: string | null;
  verified: boolean;
  propagated: boolean;
  error?: string;
}

// Email Routing Types (for receiving)
export interface EmailRoutingRule {
  id?: string;
  name: string;
  enabled: boolean;
  matchers: {
    type: 'literal' | 'all';
    field: 'to';
    value: string;
  }[];
  actions: {
    type: 'forward' | 'worker' | 'drop';
    value: string[];
  }[];
}

// API Response wrapper
export interface CloudflareAPIResponse<T> {
  success: boolean;
  result: T;
  errors: CloudflareError[];
  messages: string[];
  result_info?: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

// Domain Pricing
export interface DomainPricing {
  tld: string;
  registrationPrice: number;
  renewalPrice: number;
  transferPrice: number;
  currency: string;
  available: boolean;
}

// TLD Information
export interface TLDInfo {
  tld: string;
  displayName: string;
  registrationPrice: number;
  renewalPrice: number;
  popular: boolean;
  category: 'generic' | 'country' | 'new';
}

// Common TLDs with pricing (approximations)
export const COMMON_TLDS: TLDInfo[] = [
  { tld: 'com', displayName: '.com', registrationPrice: 9.77, renewalPrice: 10.77, popular: true, category: 'generic' },
  { tld: 'net', displayName: '.net', registrationPrice: 10.77, renewalPrice: 11.77, popular: true, category: 'generic' },
  { tld: 'org', displayName: '.org', registrationPrice: 9.93, renewalPrice: 10.93, popular: true, category: 'generic' },
  { tld: 'io', displayName: '.io', registrationPrice: 33.98, renewalPrice: 33.98, popular: true, category: 'country' },
  { tld: 'co', displayName: '.co', registrationPrice: 11.99, renewalPrice: 25.99, popular: true, category: 'country' },
  { tld: 'dev', displayName: '.dev', registrationPrice: 12.00, renewalPrice: 12.00, popular: false, category: 'new' },
  { tld: 'app', displayName: '.app', registrationPrice: 14.00, renewalPrice: 14.00, popular: false, category: 'new' },
  { tld: 'ai', displayName: '.ai', registrationPrice: 75.00, renewalPrice: 75.00, popular: true, category: 'country' },
  { tld: 'xyz', displayName: '.xyz', registrationPrice: 1.00, renewalPrice: 10.00, popular: false, category: 'new' },
  { tld: 'online', displayName: '.online', registrationPrice: 2.00, renewalPrice: 30.00, popular: false, category: 'new' },
];

// Bulk operation types
export interface BulkDomainCheck {
  domains: string[];
  results: DomainAvailability[];
  totalAvailable: number;
  totalUnavailable: number;
  totalPremium: number;
}

export interface BulkDomainPurchase {
  domains: DomainPurchaseRequest[];
  results: DomainPurchaseResponse[];
  totalSuccess: number;
  totalFailed: number;
  totalCost: number;
}
