// DMARC Record Generator and Validator
// Creates and manages DMARC policies for email authentication

import { getCloudflareClient } from '../cloudflare/client';
import { createClient } from '../supabase/server';

export type DMARCPolicy = 'none' | 'quarantine' | 'reject';
export type DMARCAlignment = 'relaxed' | 'strict';

export interface DMARCConfig {
  domain: string;
  policy: DMARCPolicy;
  subdomainPolicy?: DMARCPolicy;
  percentage?: number; // 0-100
  aggregateReportEmail?: string;
  forensicReportEmail?: string;
  spfAlignment?: DMARCAlignment;
  dkimAlignment?: DMARCAlignment;
  reportInterval?: number; // seconds (default: 86400 = 24 hours)
  failureReportOptions?: ('0' | '1' | 'd' | 's')[];
}

// Generate DMARC record
export function generateDMARCRecord(config: DMARCConfig): string {
  const parts: string[] = ['v=DMARC1'];

  // Policy (required)
  parts.push(`p=${config.policy}`);

  // Subdomain policy
  if (config.subdomainPolicy) {
    parts.push(`sp=${config.subdomainPolicy}`);
  }

  // Percentage
  if (config.percentage !== undefined && config.percentage !== 100) {
    parts.push(`pct=${config.percentage}`);
  }

  // Aggregate report email (RUA)
  if (config.aggregateReportEmail) {
    parts.push(`rua=mailto:${config.aggregateReportEmail}`);
  }

  // Forensic report email (RUF)
  if (config.forensicReportEmail) {
    parts.push(`ruf=mailto:${config.forensicReportEmail}`);
  }

  // SPF alignment
  if (config.spfAlignment === 'strict') {
    parts.push('aspf=s');
  }

  // DKIM alignment
  if (config.dkimAlignment === 'strict') {
    parts.push('adkim=s');
  }

  // Report interval
  if (config.reportInterval && config.reportInterval !== 86400) {
    parts.push(`ri=${config.reportInterval}`);
  }

  // Failure report options
  if (config.failureReportOptions?.length) {
    parts.push(`fo=${config.failureReportOptions.join(':')}`);
  }

  return parts.join('; ');
}

// Generate DMARC for cold email (recommended settings)
export function generateColdEmailDMARC(
  domain: string,
  reportEmail?: string
): string {
  // For cold email, start with p=none to monitor without affecting delivery
  // Upgrade to quarantine/reject after monitoring shows good alignment
  return generateDMARCRecord({
    domain,
    policy: 'none', // Start permissive
    subdomainPolicy: 'none',
    percentage: 100,
    aggregateReportEmail: reportEmail || `dmarc@${domain}`,
    spfAlignment: 'relaxed',
    dkimAlignment: 'relaxed',
    reportInterval: 86400, // Daily reports
    failureReportOptions: ['1'], // Report on any failure
  });
}

// DMARC upgrade path
export function getDMARCUpgradePath(currentPolicy: DMARCPolicy): {
  nextPolicy: DMARCPolicy;
  recommendation: string;
  requirements: string[];
} {
  switch (currentPolicy) {
    case 'none':
      return {
        nextPolicy: 'quarantine',
        recommendation: 'After 2-4 weeks of monitoring with good alignment, upgrade to quarantine',
        requirements: [
          'SPF record configured and passing',
          'DKIM signing enabled and passing',
          'Aggregate reports show >95% alignment',
          'No critical sending sources missing from SPF',
        ],
      };
    case 'quarantine':
      return {
        nextPolicy: 'reject',
        recommendation: 'After 2-4 weeks of quarantine with no issues, upgrade to reject',
        requirements: [
          'Quarantine period showed minimal false positives',
          'All legitimate sending sources are authenticated',
          'Business stakeholders approve strict policy',
        ],
      };
    case 'reject':
      return {
        nextPolicy: 'reject',
        recommendation: 'You are at the strictest policy level',
        requirements: ['Continue monitoring aggregate reports'],
      };
  }
}

// Validate DMARC record
export function validateDMARCRecord(record: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  policy?: DMARCPolicy;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let policy: DMARCPolicy | undefined;

  // Must start with version
  if (!record.includes('v=DMARC1')) {
    errors.push('DMARC record must contain v=DMARC1');
  }

  // Must have policy
  const policyMatch = record.match(/p=(none|quarantine|reject)/);
  if (!policyMatch) {
    errors.push('DMARC record must contain p= policy (none, quarantine, or reject)');
  } else {
    policy = policyMatch[1] as DMARCPolicy;
  }

  // Check for aggregate reports
  if (!record.includes('rua=')) {
    warnings.push('No aggregate report email (rua) specified. Add one to receive DMARC reports.');
  }

  // Check for forensic reports (optional but useful)
  if (!record.includes('ruf=')) {
    warnings.push('No forensic report email (ruf) specified. Consider adding for detailed failure reports.');
  }

  // Validate email format in rua/ruf
  const ruaMatch = record.match(/rua=mailto:([^;,\s]+)/);
  if (ruaMatch && !ruaMatch[1].includes('@')) {
    errors.push('Invalid email format in rua (aggregate report address)');
  }

  // Check percentage
  const pctMatch = record.match(/pct=(\d+)/);
  if (pctMatch) {
    const pct = parseInt(pctMatch[1]);
    if (pct < 0 || pct > 100) {
      errors.push('Percentage (pct) must be between 0 and 100');
    }
    if (pct < 100 && policy !== 'none') {
      warnings.push(`Only ${pct}% of emails will be subject to the ${policy} policy`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    policy,
  };
}

// Create DMARC record in Cloudflare
export async function createDMARCRecord(
  domainId: string,
  zoneId: string,
  domain: string,
  reportEmail?: string,
  customPolicy?: DMARCPolicy
): Promise<{
  success: boolean;
  recordId?: string;
  record?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const cloudflare = getCloudflareClient();

    // Generate DMARC record
    const dmarcRecord = customPolicy
      ? generateDMARCRecord({
          domain,
          policy: customPolicy,
          aggregateReportEmail: reportEmail || `dmarc@${domain}`,
        })
      : generateColdEmailDMARC(domain, reportEmail);

    // Validate
    const validation = validateDMARCRecord(dmarcRecord);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    const dmarcDomain = `_dmarc.${domain}`;

    // Check if DMARC already exists
    const existingRecords = await cloudflare.listDNSRecords(zoneId, 'TXT');
    const existingDMARC = existingRecords.find(r => r.name === dmarcDomain);

    let cloudflareRecordId: string;

    if (existingDMARC?.id) {
      // Update existing
      await cloudflare.updateDNSRecord(zoneId, existingDMARC.id, {
        content: dmarcRecord,
      });
      cloudflareRecordId = existingDMARC.id;
    } else {
      // Create new
      const response = await cloudflare.createDNSRecord(zoneId, {
        type: 'TXT',
        name: dmarcDomain,
        content: dmarcRecord,
        ttl: 3600,
      });
      cloudflareRecordId = response.result?.id || '';
    }

    // Store in database
    await supabase.from('domain_dns_records').upsert({
      domain_id: domainId,
      record_type: 'DMARC',
      record_name: dmarcDomain,
      record_value: dmarcRecord,
      cloudflare_record_id: cloudflareRecordId,
      verified: false,
    }, {
      onConflict: 'domain_id,record_type,record_name',
    });

    return {
      success: true,
      recordId: cloudflareRecordId,
      record: dmarcRecord,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create DMARC record',
    };
  }
}

// Verify DMARC record propagation
export async function verifyDMARCRecord(domain: string): Promise<{
  verified: boolean;
  record?: string;
  policy?: DMARCPolicy;
  error?: string;
}> {
  try {
    const dns = await import('dns').then(m => m.promises);
    const dmarcDomain = `_dmarc.${domain}`;

    const records = await dns.resolveTxt(dmarcDomain);
    const dmarcRecord = records.flat().join('');

    if (!dmarcRecord) {
      return {
        verified: false,
        error: 'No DMARC record found',
      };
    }

    const validation = validateDMARCRecord(dmarcRecord);

    return {
      verified: validation.valid,
      record: dmarcRecord,
      policy: validation.policy,
      error: validation.errors.length > 0 ? validation.errors.join(', ') : undefined,
    };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : 'DNS lookup failed',
    };
  }
}

// Upgrade DMARC policy
export async function upgradeDMARCPolicy(
  domainId: string,
  zoneId: string,
  domain: string,
  newPolicy: DMARCPolicy
): Promise<{
  success: boolean;
  oldPolicy?: DMARCPolicy;
  newPolicy?: DMARCPolicy;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // Get current DMARC record
    const { data: currentRecord } = await supabase
      .from('domain_dns_records')
      .select('record_value')
      .eq('domain_id', domainId)
      .eq('record_type', 'DMARC')
      .single();

    let oldPolicy: DMARCPolicy = 'none';
    if (currentRecord?.record_value) {
      const validation = validateDMARCRecord(currentRecord.record_value);
      oldPolicy = validation.policy || 'none';
    }

    // Create new record with upgraded policy
    const reportEmail = currentRecord?.record_value?.match(/rua=mailto:([^;,\s]+)/)?.[1];

    const result = await createDMARCRecord(
      domainId,
      zoneId,
      domain,
      reportEmail,
      newPolicy
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      oldPolicy,
      newPolicy,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Policy upgrade failed',
    };
  }
}

// Parse DMARC aggregate report XML
export interface DMARCAggregateReport {
  organizationName: string;
  reportId: string;
  dateRange: {
    begin: Date;
    end: Date;
  };
  domain: string;
  policy: DMARCPolicy;
  records: Array<{
    sourceIp: string;
    count: number;
    disposition: 'none' | 'quarantine' | 'reject';
    spfResult: 'pass' | 'fail';
    dkimResult: 'pass' | 'fail';
    spfDomain?: string;
    dkimDomain?: string;
  }>;
  summary: {
    totalEmails: number;
    passedBoth: number;
    failedSPF: number;
    failedDKIM: number;
    alignmentRate: number;
  };
}

// Calculate DMARC alignment score
export function calculateDMARCAlignment(
  spfPass: boolean,
  dkimPass: boolean,
  policy: DMARCPolicy
): {
  aligned: boolean;
  score: number;
  action: 'none' | 'quarantine' | 'reject';
} {
  const aligned = spfPass || dkimPass; // DMARC requires at least one to pass

  let score = 0;
  if (spfPass) score += 50;
  if (dkimPass) score += 50;

  let action: 'none' | 'quarantine' | 'reject' = 'none';
  if (!aligned) {
    action = policy;
  }

  return {
    aligned,
    score,
    action,
  };
}
