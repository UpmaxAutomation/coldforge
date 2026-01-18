// SPF Record Generator and Validator
// Creates SPF records for cold email sending

import { getCloudflareClient } from '../cloudflare/client';
import { createClient } from '../supabase/server';

export interface SPFConfig {
  domain: string;
  includeMechanisms: string[];
  ipv4Addresses: string[];
  ipv6Addresses: string[];
  policy: 'pass' | 'softfail' | 'fail' | 'neutral';
}

// Default sending providers to include
export const DEFAULT_SPF_INCLUDES = [
  '_spf.google.com',           // Google Workspace
  'spf.protection.outlook.com', // Microsoft 365
  'amazonses.com',             // Amazon SES
  'mailgun.org',               // Mailgun
  'sendgrid.net',              // SendGrid
];

// Generate SPF record for cold email
export function generateSPFRecord(config: Partial<SPFConfig> = {}): string {
  const parts: string[] = ['v=spf1'];

  // Include mechanisms (third-party providers)
  const includes = config.includeMechanisms || DEFAULT_SPF_INCLUDES;
  includes.forEach(include => {
    parts.push(`include:${include}`);
  });

  // IPv4 addresses
  if (config.ipv4Addresses?.length) {
    config.ipv4Addresses.forEach(ip => {
      parts.push(`ip4:${ip}`);
    });
  }

  // IPv6 addresses
  if (config.ipv6Addresses?.length) {
    config.ipv6Addresses.forEach(ip => {
      parts.push(`ip6:${ip}`);
    });
  }

  // Allow the domain's A record
  parts.push('a');

  // Allow the domain's MX records
  parts.push('mx');

  // Policy (default to softfail for cold email - less aggressive)
  const policy = config.policy || 'softfail';
  switch (policy) {
    case 'fail':
      parts.push('-all');
      break;
    case 'softfail':
      parts.push('~all');
      break;
    case 'neutral':
      parts.push('?all');
      break;
    case 'pass':
      parts.push('+all');
      break;
  }

  return parts.join(' ');
}

// Generate minimal SPF for cold email (recommended)
export function generateMinimalSPFRecord(providers: ('google' | 'microsoft' | 'ses' | 'mailgun' | 'sendgrid')[] = []): string {
  const parts: string[] = ['v=spf1'];

  // Add selected providers only
  if (providers.includes('google')) {
    parts.push('include:_spf.google.com');
  }
  if (providers.includes('microsoft')) {
    parts.push('include:spf.protection.outlook.com');
  }
  if (providers.includes('ses')) {
    parts.push('include:amazonses.com');
  }
  if (providers.includes('mailgun')) {
    parts.push('include:mailgun.org');
  }
  if (providers.includes('sendgrid')) {
    parts.push('include:sendgrid.net');
  }

  // If no providers specified, use all common ones
  if (providers.length === 0) {
    parts.push('include:_spf.google.com');
    parts.push('include:spf.protection.outlook.com');
  }

  // Softfail policy (recommended for cold email)
  parts.push('~all');

  return parts.join(' ');
}

// Validate SPF record syntax
export function validateSPFRecord(record: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  lookups: number;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let lookups = 0;

  // Must start with v=spf1
  if (!record.startsWith('v=spf1')) {
    errors.push('SPF record must start with v=spf1');
  }

  // Count DNS lookups (max 10 allowed)
  const includeMatcher = record.match(/include:/g);
  const aMatcher = record.match(/\ba\b/g);
  const mxMatcher = record.match(/\bmx\b/g);
  const ptrMatcher = record.match(/ptr:/g);
  const existsMatcher = record.match(/exists:/g);

  lookups += includeMatcher?.length || 0;
  lookups += aMatcher?.length || 0;
  lookups += mxMatcher?.length || 0;
  lookups += ptrMatcher?.length || 0;
  lookups += existsMatcher?.length || 0;

  if (lookups > 10) {
    errors.push(`SPF record exceeds 10 DNS lookups (${lookups} found). This will cause PermError.`);
  } else if (lookups > 8) {
    warnings.push(`SPF record has ${lookups} DNS lookups. Consider reducing (max 10 allowed).`);
  }

  // Check for proper termination
  if (!record.match(/[-~?+]all$/)) {
    errors.push('SPF record must end with -all, ~all, ?all, or +all');
  }

  // Check for common issues
  if (record.includes('+all')) {
    warnings.push('Using +all allows any server to send as your domain. Use ~all or -all instead.');
  }

  if (record.length > 255) {
    warnings.push('SPF record is longer than 255 characters. May need to be split into multiple strings.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    lookups,
  };
}

// Create SPF record in Cloudflare
export async function createSPFRecord(
  domainId: string,
  zoneId: string,
  domain: string,
  providers: ('google' | 'microsoft' | 'ses' | 'mailgun' | 'sendgrid')[] = []
): Promise<{
  success: boolean;
  recordId?: string;
  record?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const cloudflare = getCloudflareClient();

    // Generate SPF record
    const spfRecord = generateMinimalSPFRecord(providers);

    // Validate
    const validation = validateSPFRecord(spfRecord);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    // Check if SPF already exists
    const existingRecords = await cloudflare.listDNSRecords(zoneId, 'TXT');
    const existingSPF = existingRecords.find(r =>
      r.name === domain && r.content.startsWith('v=spf1')
    );

    let recordId: string;

    if (existingSPF?.id) {
      // Update existing
      await cloudflare.updateDNSRecord(zoneId, existingSPF.id, {
        content: spfRecord,
      });
      recordId = existingSPF.id;
    } else {
      // Create new
      const response = await cloudflare.createDNSRecord(zoneId, {
        type: 'TXT',
        name: domain,
        content: spfRecord,
        ttl: 3600,
      });
      recordId = response.result?.id || '';
    }

    // Store in database
    await supabase.from('domain_dns_records').upsert({
      domain_id: domainId,
      record_type: 'SPF',
      record_name: domain,
      record_value: spfRecord,
      cloudflare_record_id: recordId,
      verified: false,
    }, {
      onConflict: 'domain_id,record_type,record_name',
    });

    return {
      success: true,
      recordId,
      record: spfRecord,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create SPF record',
    };
  }
}

// Verify SPF record propagation
export async function verifySPFRecord(domain: string): Promise<{
  verified: boolean;
  record?: string;
  error?: string;
}> {
  try {
    const dns = await import('dns').then(m => m.promises);

    const records = await dns.resolveTxt(domain);
    const spfRecord = records.flat().find(r => r.startsWith('v=spf1'));

    if (!spfRecord) {
      return {
        verified: false,
        error: 'No SPF record found',
      };
    }

    const validation = validateSPFRecord(spfRecord);

    return {
      verified: validation.valid,
      record: spfRecord,
      error: validation.errors.length > 0 ? validation.errors.join(', ') : undefined,
    };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : 'DNS lookup failed',
    };
  }
}

// Get SPF recommendations based on sending providers
export function getSPFRecommendations(
  currentProviders: string[],
  plannedProviders: string[]
): {
  addIncludes: string[];
  removeIncludes: string[];
  warnings: string[];
} {
  const providerMap: Record<string, string> = {
    google: '_spf.google.com',
    microsoft: 'spf.protection.outlook.com',
    amazon: 'amazonses.com',
    mailgun: 'mailgun.org',
    sendgrid: 'sendgrid.net',
    postmark: 'spf.mtasv.net',
    mailchimp: 'servers.mcsv.net',
  };

  const addIncludes: string[] = [];
  const removeIncludes: string[] = [];
  const warnings: string[] = [];

  // Check what needs to be added
  plannedProviders.forEach(provider => {
    const include = providerMap[provider.toLowerCase()];
    if (include && !currentProviders.includes(include)) {
      addIncludes.push(include);
    }
  });

  // Check for lookups limit
  const totalLookups = currentProviders.length + addIncludes.length;
  if (totalLookups > 10) {
    warnings.push(`Adding these includes would exceed 10 DNS lookups (${totalLookups}). Consider using SPF flattening.`);
  }

  return {
    addIncludes,
    removeIncludes,
    warnings,
  };
}
