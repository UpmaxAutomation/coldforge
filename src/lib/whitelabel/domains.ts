// Custom Domain Management
import { createClient } from '@/lib/supabase/server';
import {
  CustomDomain,
  CustomDomainType,
  CustomDomainStatus,
  SSLStatus,
  DomainVerification,
  DomainSettings,
} from './types';
import crypto from 'crypto';

// Create a custom domain
export async function createCustomDomain(
  options: {
    agencyId?: string;
    workspaceId?: string;
    domain: string;
    type: CustomDomainType;
    settings?: Partial<DomainSettings>;
  }
): Promise<CustomDomain> {
  const supabase = await createClient();

  if (!options.agencyId && !options.workspaceId) {
    throw new Error('Either agencyId or workspaceId is required');
  }

  // Normalize domain
  const domain = normalizeDomain(options.domain);

  // Validate domain format
  if (!isValidDomain(domain)) {
    throw new Error('Invalid domain format');
  }

  // Check if domain already exists
  const { data: existing } = await supabase
    .from('custom_domains')
    .select('id')
    .eq('domain', domain)
    .single();

  if (existing) {
    throw new Error('Domain is already registered');
  }

  // Generate verification token
  const verificationToken = generateVerificationToken();
  const verificationRecord = `coldforge-verify.${domain}`;
  const verificationValue = `coldforge-verification=${verificationToken}`;

  const verification: DomainVerification = {
    method: 'dns-txt',
    token: verificationToken,
    record: verificationRecord,
    value: verificationValue,
    attempts: 0,
  };

  const defaultSettings: DomainSettings = {
    forceHttps: true,
    redirectWww: true,
  };

  const domainData = {
    agency_id: options.agencyId || null,
    workspace_id: options.workspaceId || null,
    domain,
    type: options.type,
    status: 'pending' as CustomDomainStatus,
    verification,
    ssl_status: 'pending' as SSLStatus,
    settings: { ...defaultSettings, ...options.settings },
  };

  const { data, error } = await supabase
    .from('custom_domains')
    .insert(domainData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create domain: ${error.message}`);
  }

  return mapCustomDomain(data);
}

// Get custom domain by ID
export async function getCustomDomain(domainId: string): Promise<CustomDomain | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('custom_domains')
    .select('*')
    .eq('id', domainId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapCustomDomain(data);
}

// Get custom domain by domain name
export async function getCustomDomainByName(domain: string): Promise<CustomDomain | null> {
  const supabase = await createClient();

  const normalizedDomain = normalizeDomain(domain);

  const { data, error } = await supabase
    .from('custom_domains')
    .select('*')
    .eq('domain', normalizedDomain)
    .single();

  if (error || !data) {
    return null;
  }

  return mapCustomDomain(data);
}

// Get all custom domains for an agency
export async function getAgencyDomains(
  agencyId: string,
  options: {
    type?: CustomDomainType;
    status?: CustomDomainStatus;
  } = {}
): Promise<CustomDomain[]> {
  const supabase = await createClient();

  let query = supabase
    .from('custom_domains')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });

  if (options.type) {
    query = query.eq('type', options.type);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get domains: ${error.message}`);
  }

  return (data || []).map(mapCustomDomain);
}

// Get custom domains for a workspace
export async function getWorkspaceDomains(
  workspaceId: string,
  options: {
    type?: CustomDomainType;
    status?: CustomDomainStatus;
  } = {}
): Promise<CustomDomain[]> {
  const supabase = await createClient();

  let query = supabase
    .from('custom_domains')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (options.type) {
    query = query.eq('type', options.type);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get domains: ${error.message}`);
  }

  return (data || []).map(mapCustomDomain);
}

// Verify domain DNS
export async function verifyDomain(domainId: string): Promise<{
  verified: boolean;
  error?: string;
}> {
  const supabase = await createClient();

  const { data: domain, error: getError } = await supabase
    .from('custom_domains')
    .select('*')
    .eq('id', domainId)
    .single();

  if (getError || !domain) {
    throw new Error('Domain not found');
  }

  const verification = domain.verification as DomainVerification;

  try {
    // Check DNS TXT record
    const verified = await checkDnsRecord(domain.domain, verification.value);

    const updates: Record<string, unknown> = {
      verification: {
        ...verification,
        attempts: verification.attempts + 1,
        lastCheckedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    if (verified) {
      updates.status = 'verified';
      updates.verification = {
        ...updates.verification as DomainVerification,
        verifiedAt: new Date().toISOString(),
      };

      // Start SSL provisioning
      await provisionSSL(domainId, domain.domain);
    } else {
      updates.verification = {
        ...updates.verification as DomainVerification,
        errors: [...(verification.errors || []), 'DNS record not found'],
      };
    }

    await supabase
      .from('custom_domains')
      .update(updates)
      .eq('id', domainId);

    return { verified };
  } catch (error) {
    const updates = {
      verification: {
        ...verification,
        attempts: verification.attempts + 1,
        lastCheckedAt: new Date().toISOString(),
        errors: [...(verification.errors || []), (error as Error).message],
      },
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('custom_domains')
      .update(updates)
      .eq('id', domainId);

    return { verified: false, error: (error as Error).message };
  }
}

// Check DNS record (simplified - in production, use proper DNS library)
async function checkDnsRecord(domain: string, expectedValue: string): Promise<boolean> {
  try {
    // In production, use dns.resolveTxt or a DNS API
    // This is a simplified version using fetch to a DNS API
    const response = await fetch(
      `https://dns.google/resolve?name=_coldforge-verify.${domain}&type=TXT`
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();

    if (data.Answer) {
      for (const answer of data.Answer) {
        if (answer.data && answer.data.includes(expectedValue)) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

// Provision SSL certificate
async function provisionSSL(domainId: string, domain: string): Promise<void> {
  const supabase = await createClient();

  // In production, this would integrate with Let's Encrypt or Cloudflare
  // For now, we'll simulate the process

  await supabase
    .from('custom_domains')
    .update({
      ssl_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', domainId);

  // Simulate SSL provisioning (in production, use ACME client)
  // This would be handled by a background job
  setTimeout(async () => {
    await supabase
      .from('custom_domains')
      .update({
        ssl_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', domainId);
  }, 5000);
}

// Update domain settings
export async function updateDomainSettings(
  domainId: string,
  settings: Partial<DomainSettings>
): Promise<CustomDomain> {
  const supabase = await createClient();

  const { data: current, error: getError } = await supabase
    .from('custom_domains')
    .select('settings')
    .eq('id', domainId)
    .single();

  if (getError || !current) {
    throw new Error('Domain not found');
  }

  const { data, error } = await supabase
    .from('custom_domains')
    .update({
      settings: { ...current.settings, ...settings },
      updated_at: new Date().toISOString(),
    })
    .eq('id', domainId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update domain: ${error.message}`);
  }

  return mapCustomDomain(data);
}

// Delete custom domain
export async function deleteCustomDomain(domainId: string): Promise<void> {
  const supabase = await createClient();

  // In production, also remove from CDN/proxy
  const { error } = await supabase
    .from('custom_domains')
    .delete()
    .eq('id', domainId);

  if (error) {
    throw new Error(`Failed to delete domain: ${error.message}`);
  }
}

// Refresh domain verification
export async function refreshDomainVerification(domainId: string): Promise<CustomDomain> {
  const supabase = await createClient();

  const newToken = generateVerificationToken();

  const { data: domain, error: getError } = await supabase
    .from('custom_domains')
    .select('domain, verification')
    .eq('id', domainId)
    .single();

  if (getError || !domain) {
    throw new Error('Domain not found');
  }

  const verification: DomainVerification = {
    method: 'dns-txt',
    token: newToken,
    record: `_coldforge-verify.${domain.domain}`,
    value: `coldforge-verification=${newToken}`,
    attempts: 0,
  };

  const { data, error } = await supabase
    .from('custom_domains')
    .update({
      status: 'pending',
      verification,
      updated_at: new Date().toISOString(),
    })
    .eq('id', domainId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to refresh verification: ${error.message}`);
  }

  return mapCustomDomain(data);
}

// Get DNS configuration instructions
export function getDnsInstructions(domain: CustomDomain): {
  verification: {
    type: string;
    host: string;
    value: string;
  };
  cname?: {
    type: string;
    host: string;
    value: string;
  };
} {
  const instructions: {
    verification: { type: string; host: string; value: string };
    cname?: { type: string; host: string; value: string };
  } = {
    verification: {
      type: 'TXT',
      host: `_coldforge-verify.${domain.domain}`,
      value: domain.verification.value,
    },
  };

  // Add CNAME instructions based on domain type
  if (domain.type === 'app') {
    instructions.cname = {
      type: 'CNAME',
      host: domain.domain,
      value: 'app.coldforge.io',
    };
  } else if (domain.type === 'tracking') {
    instructions.cname = {
      type: 'CNAME',
      host: domain.domain,
      value: 'track.coldforge.io',
    };
  } else if (domain.type === 'email') {
    instructions.cname = {
      type: 'CNAME',
      host: domain.domain,
      value: 'mail.coldforge.io',
    };
  }

  return instructions;
}

// Check domain health
export async function checkDomainHealth(domainId: string): Promise<{
  healthy: boolean;
  checks: {
    dns: boolean;
    ssl: boolean;
    reachable: boolean;
  };
  issues: string[];
}> {
  const domain = await getCustomDomain(domainId);

  if (!domain) {
    throw new Error('Domain not found');
  }

  const issues: string[] = [];
  const checks = {
    dns: false,
    ssl: false,
    reachable: false,
  };

  // Check DNS
  if (domain.status === 'verified') {
    checks.dns = true;
  } else {
    issues.push('DNS verification incomplete');
  }

  // Check SSL
  if (domain.sslStatus === 'active') {
    checks.ssl = true;
  } else if (domain.sslStatus === 'failed') {
    issues.push('SSL certificate provisioning failed');
  } else if (domain.sslStatus === 'expired') {
    issues.push('SSL certificate has expired');
  } else {
    issues.push('SSL certificate pending');
  }

  // Check reachability
  try {
    const response = await fetch(`https://${domain.domain}`, {
      method: 'HEAD',
      redirect: 'manual',
    });

    if (response.status >= 200 && response.status < 400) {
      checks.reachable = true;
    } else {
      issues.push(`Domain returned status ${response.status}`);
    }
  } catch {
    issues.push('Domain is not reachable');
  }

  return {
    healthy: checks.dns && checks.ssl && checks.reachable,
    checks,
    issues,
  };
}

// Resolve domain to workspace/agency
export async function resolveDomain(domain: string): Promise<{
  type: 'agency' | 'workspace' | null;
  id: string | null;
  customDomain: CustomDomain | null;
}> {
  const customDomain = await getCustomDomainByName(domain);

  if (!customDomain || customDomain.status !== 'verified') {
    return { type: null, id: null, customDomain: null };
  }

  if (customDomain.agencyId) {
    return { type: 'agency', id: customDomain.agencyId, customDomain };
  }

  if (customDomain.workspaceId) {
    return { type: 'workspace', id: customDomain.workspaceId, customDomain };
  }

  return { type: null, id: null, customDomain };
}

// Helper functions

function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  return domainRegex.test(domain);
}

function generateVerificationToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function mapCustomDomain(data: Record<string, unknown>): CustomDomain {
  return {
    id: data.id as string,
    agencyId: data.agency_id as string | undefined,
    workspaceId: data.workspace_id as string | undefined,
    domain: data.domain as string,
    type: data.type as CustomDomainType,
    status: data.status as CustomDomainStatus,
    verification: data.verification as DomainVerification,
    sslStatus: data.ssl_status as SSLStatus,
    settings: data.settings as DomainSettings,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  };
}
