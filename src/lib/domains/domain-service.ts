// Domain Service
// Orchestrates domain purchase, DNS setup, and management

import { getCloudflareClient } from '../cloudflare/client';
import { createClient } from '../supabase/server';
import { createSPFRecord } from '../dns/spf';
import { createDKIMRecord } from '../dns/dkim';
import { createDMARCRecord } from '../dns/dmarc';
import { runFullDomainHealthCheck } from '../dns/health-check';
import type { DomainAvailability } from '../cloudflare/types';

export interface DomainSearchResult {
  domains: DomainAvailability[];
  suggestions: DomainAvailability[];
}

export interface BulkDomainCheck {
  available: DomainAvailability[];
  unavailable: string[];
  totalPrice: number;
}

export interface DomainPurchaseResult {
  success: boolean;
  domainId?: string;
  domain?: string;
  zoneId?: string;
  dnsSetupComplete?: boolean;
  errors?: string[];
}

// Search for available domains
export async function searchDomains(
  baseName: string,
  tlds: string[] = ['com', 'net', 'org', 'io', 'co']
): Promise<DomainSearchResult> {
  const cloudflare = getCloudflareClient();
  const results: DomainAvailability[] = [];

  // Check primary domain with each TLD
  await Promise.all(
    tlds.map(async tld => {
      const domain = `${baseName}.${tld}`;
      const result = await cloudflare.checkDomainAvailability(domain);
      results.push({
        domain,
        available: result.available,
        premium: result.premium,
        price: result.price,
        tld,
        currency: 'USD',
      });
    })
  );

  // Generate suggestions with variations
  const suggestions: DomainAvailability[] = [];
  const variations = [
    `get${baseName}`,
    `${baseName}app`,
    `${baseName}hq`,
    `try${baseName}`,
    `my${baseName}`,
  ];

  // Check first 3 variations with .com only
  await Promise.all(
    variations.slice(0, 3).map(async variation => {
      const domain = `${variation}.com`;
      const result = await cloudflare.checkDomainAvailability(domain);
      if (result.available) {
        suggestions.push({
          domain,
          available: true,
          premium: result.premium,
          price: result.price,
          tld: 'com',
          currency: 'USD',
        });
      }
    })
  );

  return {
    domains: results.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1)),
    suggestions,
  };
}

// Bulk check domain availability
export async function bulkCheckDomains(
  domains: string[]
): Promise<BulkDomainCheck> {
  const cloudflare = getCloudflareClient();
  const available: DomainAvailability[] = [];
  const unavailable: string[] = [];

  // Check in parallel batches
  const batchSize = 10;
  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async domain => {
        const result = await cloudflare.checkDomainAvailability(domain);
        if (result.available) {
          available.push({
            domain,
            available: true,
            premium: result.premium,
            price: result.price,
            tld: domain.split('.').pop() || '',
            currency: 'USD',
          });
        } else {
          unavailable.push(domain);
        }
      })
    );
  }

  const totalPrice = available.reduce((sum, d) => sum + (d.price || 10), 0);

  return { available, unavailable, totalPrice };
}

// Purchase a single domain with full DNS setup
export async function purchaseDomain(
  workspaceId: string,
  domain: string,
  options: {
    autoRenew?: boolean;
    privacy?: boolean;
    setupDNS?: boolean;
    reportEmail?: string;
    emailProviders?: ('google' | 'microsoft' | 'ses' | 'mailgun' | 'sendgrid')[];
  } = {}
): Promise<DomainPurchaseResult> {
  const supabase = await createClient();
  const cloudflare = getCloudflareClient();
  const errors: string[] = [];

  try {
    // Check if domain already purchased
    const { data: existing } = await supabase
      .from('domain_purchases')
      .select('id')
      .eq('domain', domain)
      .eq('workspace_id', workspaceId)
      .single();

    if (existing) {
      return {
        success: false,
        errors: ['Domain already purchased for this workspace'],
      };
    }

    // Check availability
    const availability = await cloudflare.checkDomainAvailability(domain);
    if (!availability.available) {
      return {
        success: false,
        errors: ['Domain is not available for registration'],
      };
    }

    // Register the domain
    const registration = await cloudflare.registerDomain(domain, {
      autoRenew: options.autoRenew ?? true,
      privacy: options.privacy ?? true,
      years: 1,
    });

    if (!registration.success) {
      return {
        success: false,
        errors: [registration.error || 'Domain registration failed'],
      };
    }

    // Get zone (created automatically by Cloudflare after registration)
    let zone = await cloudflare.getZoneByDomain(domain);

    // If zone doesn't exist yet, create it
    if (!zone) {
      zone = await cloudflare.createZone(domain);
    }

    // Store domain in database
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const { data: domainRecord, error: insertError } = await supabase
      .from('domain_purchases')
      .insert({
        workspace_id: workspaceId,
        domain,
        status: 'active',
        cloudflare_zone_id: zone.id,
        purchased_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        auto_renew: options.autoRenew ?? true,
        purchase_price: availability.price || 10,
        dns_setup_complete: false,
      })
      .select()
      .single();

    if (insertError || !domainRecord) {
      errors.push('Failed to store domain in database');
      return {
        success: true,
        domainId: registration.domainId,
        domain,
        zoneId: zone.id,
        dnsSetupComplete: false,
        errors,
      };
    }

    // Setup DNS records if requested
    let dnsSetupComplete = false;
    if (options.setupDNS !== false) {
      const dnsResults = await setupDomainDNS(
        domainRecord.id,
        zone.id,
        domain,
        {
          reportEmail: options.reportEmail,
          emailProviders: options.emailProviders,
        }
      );

      dnsSetupComplete = dnsResults.every(r => r.success);
      if (!dnsSetupComplete) {
        errors.push(...dnsResults.filter(r => !r.success).map(r => r.error || 'DNS setup failed'));
      }

      // Update domain record
      await supabase
        .from('domain_purchases')
        .update({ dns_setup_complete: dnsSetupComplete })
        .eq('id', domainRecord.id);
    }

    return {
      success: true,
      domainId: domainRecord.id,
      domain,
      zoneId: zone.id,
      dnsSetupComplete,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Domain purchase failed'],
    };
  }
}

// Setup DNS records for a domain
async function setupDomainDNS(
  domainId: string,
  zoneId: string,
  domain: string,
  options: {
    reportEmail?: string;
    emailProviders?: ('google' | 'microsoft' | 'ses' | 'mailgun' | 'sendgrid')[];
  } = {}
): Promise<Array<{ type: string; success: boolean; error?: string }>> {
  const results: Array<{ type: string; success: boolean; error?: string }> = [];

  // Create SPF record
  const spfResult = await createSPFRecord(
    domainId,
    zoneId,
    domain,
    options.emailProviders || ['google']
  );
  results.push({
    type: 'SPF',
    success: spfResult.success,
    error: spfResult.error,
  });

  // Create DKIM record
  const dkimResult = await createDKIMRecord(domainId, zoneId, domain);
  results.push({
    type: 'DKIM',
    success: dkimResult.success,
    error: dkimResult.error,
  });

  // Create DMARC record
  const dmarcResult = await createDMARCRecord(
    domainId,
    zoneId,
    domain,
    options.reportEmail
  );
  results.push({
    type: 'DMARC',
    success: dmarcResult.success,
    error: dmarcResult.error,
  });

  return results;
}

// Bulk purchase domains
export async function bulkPurchaseDomains(
  workspaceId: string,
  domains: string[],
  options: {
    autoRenew?: boolean;
    privacy?: boolean;
    setupDNS?: boolean;
    reportEmail?: string;
    emailProviders?: ('google' | 'microsoft' | 'ses' | 'mailgun' | 'sendgrid')[];
  } = {}
): Promise<{
  successful: DomainPurchaseResult[];
  failed: DomainPurchaseResult[];
  totalCost: number;
}> {
  const successful: DomainPurchaseResult[] = [];
  const failed: DomainPurchaseResult[] = [];
  let totalCost = 0;

  // Purchase domains sequentially to avoid rate limiting
  for (const domain of domains) {
    const result = await purchaseDomain(workspaceId, domain, options);

    if (result.success) {
      successful.push(result);
      // Estimate cost (would need actual price from purchase)
      totalCost += 10; // Default estimate
    } else {
      failed.push(result);
    }

    // Small delay between purchases
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { successful, failed, totalCost };
}

// Verify DNS propagation for a domain
export async function verifyDomainDNS(
  domainId: string,
  domain: string
): Promise<{
  verified: boolean;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  errors: string[];
}> {
  const supabase = await createClient();
  const errors: string[] = [];

  // Get DKIM selector from database
  const { data: dkimKey } = await supabase
    .from('dkim_keys')
    .select('selector')
    .eq('domain_id', domainId)
    .eq('active', true)
    .single();

  const selector = dkimKey?.selector || 'coldforge';

  // Run health check
  const report = await runFullDomainHealthCheck(domainId, domain, selector);

  const spfCheck = report.checks.find(c => c.checkType === 'spf');
  const dkimCheck = report.checks.find(c => c.checkType === 'dkim');
  const dmarcCheck = report.checks.find(c => c.checkType === 'dmarc');

  if (spfCheck?.status !== 'healthy') {
    errors.push(spfCheck?.message || 'SPF verification failed');
  }
  if (dkimCheck?.status !== 'healthy') {
    errors.push(dkimCheck?.message || 'DKIM verification failed');
  }
  if (dmarcCheck?.status !== 'healthy') {
    errors.push(dmarcCheck?.message || 'DMARC verification failed');
  }

  // Update DNS records verification status
  const allVerified =
    spfCheck?.status === 'healthy' &&
    dkimCheck?.status === 'healthy' &&
    dmarcCheck?.status === 'healthy';

  if (allVerified) {
    await supabase
      .from('domain_dns_records')
      .update({ verified: true })
      .eq('domain_id', domainId);
  }

  return {
    verified: allVerified,
    spf: spfCheck?.status === 'healthy',
    dkim: dkimCheck?.status === 'healthy',
    dmarc: dmarcCheck?.status === 'healthy',
    errors,
  };
}

// Get domains for a workspace
export async function getWorkspaceDomains(
  workspaceId: string,
  options: {
    status?: 'active' | 'expired' | 'pending';
    includeHealth?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  domains: Array<{
    id: string;
    domain: string;
    status: string;
    purchasedAt: Date;
    expiresAt: Date;
    ageInDays: number;
    dnsSetupComplete: boolean;
    healthScore?: number;
    healthStatus?: string;
  }>;
  total: number;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('domain_purchases')
    .select(`
      *,
      domain_health_summary(overall_score, overall_status)
    `, { count: 'exact' })
    .eq('workspace_id', workspaceId);

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  query = query.order('purchased_at', { ascending: false });

  const { data, count } = await query;

  if (!data) {
    return { domains: [], total: 0 };
  }

  const now = new Date();

  return {
    domains: data.map(d => {
      const purchasedAt = new Date(d.purchased_at);
      const ageInDays = Math.floor((now.getTime() - purchasedAt.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: d.id,
        domain: d.domain,
        status: d.status,
        purchasedAt,
        expiresAt: new Date(d.expires_at),
        ageInDays,
        dnsSetupComplete: d.dns_setup_complete,
        healthScore: (d.domain_health_summary as { overall_score?: number })?.overall_score,
        healthStatus: (d.domain_health_summary as { overall_status?: string })?.overall_status,
      };
    }),
    total: count || 0,
  };
}

// Get domain details
export async function getDomainDetails(domainId: string): Promise<{
  domain: {
    id: string;
    domain: string;
    status: string;
    purchasedAt: Date;
    expiresAt: Date;
    autoRenew: boolean;
    ageInDays: number;
  };
  dns: {
    spf?: { value: string; verified: boolean };
    dkim?: { selector: string; value: string; verified: boolean };
    dmarc?: { value: string; verified: boolean };
  };
  health: {
    score: number;
    status: string;
    spf: string;
    dkim: string;
    dmarc: string;
    blacklist: string;
    lastCheckAt?: Date;
  };
} | null> {
  const supabase = await createClient();

  // Get domain
  const { data: domain } = await supabase
    .from('domain_purchases')
    .select('*')
    .eq('id', domainId)
    .single();

  if (!domain) return null;

  // Get DNS records
  const { data: dnsRecords } = await supabase
    .from('domain_dns_records')
    .select('*')
    .eq('domain_id', domainId);

  // Get health summary
  const { data: health } = await supabase
    .from('domain_health_summary')
    .select('*')
    .eq('domain_id', domainId)
    .single();

  const purchasedAt = new Date(domain.purchased_at);
  const now = new Date();
  const ageInDays = Math.floor((now.getTime() - purchasedAt.getTime()) / (1000 * 60 * 60 * 24));

  const spfRecord = dnsRecords?.find(r => r.record_type === 'SPF');
  const dkimRecord = dnsRecords?.find(r => r.record_type === 'DKIM');
  const dmarcRecord = dnsRecords?.find(r => r.record_type === 'DMARC');

  return {
    domain: {
      id: domain.id,
      domain: domain.domain,
      status: domain.status,
      purchasedAt,
      expiresAt: new Date(domain.expires_at),
      autoRenew: domain.auto_renew,
      ageInDays,
    },
    dns: {
      spf: spfRecord
        ? { value: spfRecord.record_value, verified: spfRecord.verified }
        : undefined,
      dkim: dkimRecord
        ? {
            selector: dkimRecord.record_name.split('.')[0],
            value: dkimRecord.record_value,
            verified: dkimRecord.verified,
          }
        : undefined,
      dmarc: dmarcRecord
        ? { value: dmarcRecord.record_value, verified: dmarcRecord.verified }
        : undefined,
    },
    health: {
      score: health?.overall_score || 0,
      status: health?.overall_status || 'unknown',
      spf: health?.spf_status || 'unknown',
      dkim: health?.dkim_status || 'unknown',
      dmarc: health?.dmarc_status || 'unknown',
      blacklist: health?.blacklist_status || 'unknown',
      lastCheckAt: health?.last_check_at ? new Date(health.last_check_at) : undefined,
    },
  };
}
