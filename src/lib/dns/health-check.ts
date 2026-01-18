// Domain Health Check System
// Monitors DNS records, blacklists, and overall domain health

import { createClient } from '../supabase/server';
import { verifySPFRecord } from './spf';
import { verifyDKIMRecord } from './dkim';
import { verifyDMARCRecord } from './dmarc';

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type CheckType = 'spf' | 'dkim' | 'dmarc' | 'mx' | 'a_record' | 'blacklist' | 'ssl';

export interface HealthCheckResult {
  checkType: CheckType;
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export interface DomainHealthReport {
  domainId: string;
  domain: string;
  overallStatus: HealthStatus;
  overallScore: number;
  checks: HealthCheckResult[];
  lastChecked: Date;
  recommendations: string[];
}

// Common blacklist DNS servers to check
const BLACKLIST_SERVERS = [
  'zen.spamhaus.org',
  'bl.spamcop.net',
  'b.barracudacentral.org',
  'dnsbl.sorbs.net',
  'spam.dnsbl.sorbs.net',
  'cbl.abuseat.org',
  'dnsbl-1.uceprotect.net',
  'psbl.surriel.com',
];

// Check if IP is on a blacklist
async function checkBlacklist(ip: string): Promise<{
  listed: boolean;
  lists: string[];
}> {
  const dns = await import('dns').then(m => m.promises);
  const listedOn: string[] = [];

  // Reverse the IP for DNSBL lookup
  const reversedIp = ip.split('.').reverse().join('.');

  await Promise.all(
    BLACKLIST_SERVERS.map(async server => {
      try {
        await dns.resolve4(`${reversedIp}.${server}`);
        listedOn.push(server);
      } catch {
        // Not listed on this blacklist (which is good)
      }
    })
  );

  return {
    listed: listedOn.length > 0,
    lists: listedOn,
  };
}

// Check MX records
async function checkMXRecords(domain: string): Promise<HealthCheckResult> {
  try {
    const dns = await import('dns').then(m => m.promises);
    const mxRecords = await dns.resolveMx(domain);

    if (mxRecords.length === 0) {
      return {
        checkType: 'mx',
        status: 'critical',
        message: 'No MX records found',
        details: { records: [] },
        timestamp: new Date(),
      };
    }

    return {
      checkType: 'mx',
      status: 'healthy',
      message: `${mxRecords.length} MX record(s) found`,
      details: { records: mxRecords.map(r => ({ priority: r.priority, exchange: r.exchange })) },
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      checkType: 'mx',
      status: 'critical',
      message: error instanceof Error ? error.message : 'MX lookup failed',
      timestamp: new Date(),
    };
  }
}

// Check A record
async function checkARecord(domain: string): Promise<HealthCheckResult> {
  try {
    const dns = await import('dns').then(m => m.promises);
    const addresses = await dns.resolve4(domain);

    return {
      checkType: 'a_record',
      status: 'healthy',
      message: `A record resolves to ${addresses.join(', ')}`,
      details: { addresses },
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      checkType: 'a_record',
      status: 'warning',
      message: 'No A record found (may be intentional for email-only domain)',
      timestamp: new Date(),
    };
  }
}

// Check SPF record health
async function checkSPFHealth(domain: string): Promise<HealthCheckResult> {
  const result = await verifySPFRecord(domain);

  if (!result.verified) {
    return {
      checkType: 'spf',
      status: 'critical',
      message: result.error || 'SPF record not found or invalid',
      timestamp: new Date(),
    };
  }

  return {
    checkType: 'spf',
    status: 'healthy',
    message: 'SPF record is valid',
    details: { record: result.record },
    timestamp: new Date(),
  };
}

// Check DKIM record health
async function checkDKIMHealth(
  domain: string,
  selector: string = 'coldforge'
): Promise<HealthCheckResult> {
  const result = await verifyDKIMRecord(domain, selector);

  if (!result.verified) {
    return {
      checkType: 'dkim',
      status: 'critical',
      message: result.error || 'DKIM record not found or invalid',
      timestamp: new Date(),
    };
  }

  return {
    checkType: 'dkim',
    status: 'healthy',
    message: `DKIM record valid (selector: ${selector})`,
    details: { selector, record: result.record },
    timestamp: new Date(),
  };
}

// Check DMARC record health
async function checkDMARCHealth(domain: string): Promise<HealthCheckResult> {
  const result = await verifyDMARCRecord(domain);

  if (!result.verified) {
    return {
      checkType: 'dmarc',
      status: 'critical',
      message: result.error || 'DMARC record not found or invalid',
      timestamp: new Date(),
    };
  }

  // Check policy level
  let status: HealthStatus = 'healthy';
  let message = 'DMARC record is valid';

  if (result.policy === 'none') {
    status = 'warning';
    message = 'DMARC policy is "none" - consider upgrading to quarantine or reject';
  }

  return {
    checkType: 'dmarc',
    status,
    message,
    details: { policy: result.policy, record: result.record },
    timestamp: new Date(),
  };
}

// Check blacklist status for domain
async function checkBlacklistHealth(domain: string): Promise<HealthCheckResult> {
  try {
    const dns = await import('dns').then(m => m.promises);

    // Get IP addresses for the domain
    let ips: string[] = [];
    try {
      ips = await dns.resolve4(domain);
    } catch {
      // Try MX records
      try {
        const mxRecords = await dns.resolveMx(domain);
        if (mxRecords.length > 0) {
          const mxIps = await dns.resolve4(mxRecords[0].exchange);
          ips = mxIps;
        }
      } catch {
        // No IPs to check
      }
    }

    if (ips.length === 0) {
      return {
        checkType: 'blacklist',
        status: 'unknown',
        message: 'No IP addresses found to check',
        timestamp: new Date(),
      };
    }

    // Check each IP against blacklists
    const allListings: string[] = [];
    for (const ip of ips) {
      const result = await checkBlacklist(ip);
      if (result.listed) {
        allListings.push(...result.lists.map(list => `${ip}: ${list}`));
      }
    }

    if (allListings.length > 0) {
      return {
        checkType: 'blacklist',
        status: 'critical',
        message: `Listed on ${allListings.length} blacklist(s)`,
        details: { listings: allListings },
        timestamp: new Date(),
      };
    }

    return {
      checkType: 'blacklist',
      status: 'healthy',
      message: 'Not listed on any checked blacklists',
      details: { ipsChecked: ips, listsChecked: BLACKLIST_SERVERS.length },
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      checkType: 'blacklist',
      status: 'unknown',
      message: error instanceof Error ? error.message : 'Blacklist check failed',
      timestamp: new Date(),
    };
  }
}

// Calculate overall health score
function calculateHealthScore(checks: HealthCheckResult[]): number {
  if (checks.length === 0) return 0;

  const weights: Record<CheckType, number> = {
    spf: 20,
    dkim: 20,
    dmarc: 15,
    mx: 15,
    blacklist: 20,
    a_record: 5,
    ssl: 5,
  };

  const statusScores: Record<HealthStatus, number> = {
    healthy: 1,
    warning: 0.6,
    critical: 0,
    unknown: 0.3,
  };

  let totalWeight = 0;
  let weightedScore = 0;

  for (const check of checks) {
    const weight = weights[check.checkType] || 10;
    const score = statusScores[check.status];
    weightedScore += weight * score;
    totalWeight += weight;
  }

  return Math.round((weightedScore / totalWeight) * 100);
}

// Get overall status from checks
function getOverallStatus(checks: HealthCheckResult[]): HealthStatus {
  const hasCritical = checks.some(c => c.status === 'critical');
  const hasWarning = checks.some(c => c.status === 'warning');

  if (hasCritical) return 'critical';
  if (hasWarning) return 'warning';
  return 'healthy';
}

// Generate recommendations based on checks
function generateRecommendations(checks: HealthCheckResult[]): string[] {
  const recommendations: string[] = [];

  for (const check of checks) {
    if (check.status === 'critical') {
      switch (check.checkType) {
        case 'spf':
          recommendations.push('Add SPF record to authorize sending servers');
          break;
        case 'dkim':
          recommendations.push('Configure DKIM signing for email authentication');
          break;
        case 'dmarc':
          recommendations.push('Add DMARC record to protect against spoofing');
          break;
        case 'mx':
          recommendations.push('Configure MX records to receive email');
          break;
        case 'blacklist':
          recommendations.push('Request removal from blacklists immediately');
          break;
      }
    } else if (check.status === 'warning') {
      switch (check.checkType) {
        case 'dmarc':
          if (check.details?.policy === 'none') {
            recommendations.push('Upgrade DMARC policy from "none" to "quarantine" after monitoring');
          }
          break;
      }
    }
  }

  return recommendations;
}

// Run full health check on a domain
export async function checkDomainHealth(
  domain: string,
  dkimSelector: string = 'coldforge'
): Promise<DomainHealthReport> {
  // Run all checks in parallel
  const [spf, dkim, dmarc, mx, aRecord, blacklist] = await Promise.all([
    checkSPFHealth(domain),
    checkDKIMHealth(domain, dkimSelector),
    checkDMARCHealth(domain),
    checkMXRecords(domain),
    checkARecord(domain),
    checkBlacklistHealth(domain),
  ]);

  const checks = [spf, dkim, dmarc, mx, aRecord, blacklist];
  const overallScore = calculateHealthScore(checks);
  const overallStatus = getOverallStatus(checks);
  const recommendations = generateRecommendations(checks);

  return {
    domainId: '', // Will be set by caller
    domain,
    overallStatus,
    overallScore,
    checks,
    lastChecked: new Date(),
    recommendations,
  };
}

// Run health check and store in database
export async function runFullDomainHealthCheck(
  domainId: string,
  domain: string,
  dkimSelector: string = 'coldforge'
): Promise<DomainHealthReport> {
  const supabase = await createClient();

  // Run health check
  const report = await checkDomainHealth(domain, dkimSelector);
  report.domainId = domainId;

  // Store each check result
  const checkInserts = report.checks.map(check => ({
    domain_id: domainId,
    check_type: check.checkType,
    status: check.status,
    message: check.message,
    details: check.details || {},
    checked_at: check.timestamp.toISOString(),
  }));

  await supabase.from('domain_health_checks').insert(checkInserts);

  // Update or insert health summary
  await supabase.from('domain_health_summary').upsert({
    domain_id: domainId,
    overall_status: report.overallStatus,
    overall_score: report.overallScore,
    spf_status: report.checks.find(c => c.checkType === 'spf')?.status || 'unknown',
    dkim_status: report.checks.find(c => c.checkType === 'dkim')?.status || 'unknown',
    dmarc_status: report.checks.find(c => c.checkType === 'dmarc')?.status || 'unknown',
    blacklist_status: report.checks.find(c => c.checkType === 'blacklist')?.status || 'unknown',
    last_check_at: new Date().toISOString(),
  }, {
    onConflict: 'domain_id',
  });

  return report;
}

// Get health check history for a domain
export async function getDomainHealthHistory(
  domainId: string,
  limit: number = 50
): Promise<HealthCheckResult[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('domain_health_checks')
    .select('*')
    .eq('domain_id', domainId)
    .order('checked_at', { ascending: false })
    .limit(limit);

  return (data || []).map(row => ({
    checkType: row.check_type as CheckType,
    status: row.status as HealthStatus,
    message: row.message,
    details: row.details,
    timestamp: new Date(row.checked_at),
  }));
}

// Get health summary for a domain
export async function getDomainHealthSummary(domainId: string): Promise<{
  overallStatus: HealthStatus;
  overallScore: number;
  spfStatus: HealthStatus;
  dkimStatus: HealthStatus;
  dmarcStatus: HealthStatus;
  blacklistStatus: HealthStatus;
  lastCheckAt: Date | null;
} | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('domain_health_summary')
    .select('*')
    .eq('domain_id', domainId)
    .single();

  if (!data) return null;

  return {
    overallStatus: data.overall_status as HealthStatus,
    overallScore: data.overall_score,
    spfStatus: data.spf_status as HealthStatus,
    dkimStatus: data.dkim_status as HealthStatus,
    dmarcStatus: data.dmarc_status as HealthStatus,
    blacklistStatus: data.blacklist_status as HealthStatus,
    lastCheckAt: data.last_check_at ? new Date(data.last_check_at) : null,
  };
}

// Monitor multiple domains
export async function monitorDomainsHealth(
  workspaceId: string
): Promise<DomainHealthReport[]> {
  const supabase = await createClient();

  // Get all domains for workspace
  const { data: domains } = await supabase
    .from('domain_purchases')
    .select('id, domain')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active');

  if (!domains || domains.length === 0) {
    return [];
  }

  // Run health checks in parallel (limit concurrency)
  const results: DomainHealthReport[] = [];
  const batchSize = 5;

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(d => runFullDomainHealthCheck(d.id, d.domain))
    );
    results.push(...batchResults);
  }

  return results;
}

// Get domain age information
export async function getDomainAgeInfo(domainId: string): Promise<{
  purchasedAt: Date;
  ageInDays: number;
  isWarmupReady: boolean;
  warmupReadyDate: Date;
} | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('domain_age_view')
    .select('*')
    .eq('id', domainId)
    .single();

  if (!data) return null;

  const purchasedAt = new Date(data.purchased_at);
  const warmupReadyDate = new Date(purchasedAt);
  warmupReadyDate.setDate(warmupReadyDate.getDate() + 14); // 14 days minimum age

  return {
    purchasedAt,
    ageInDays: data.domain_age_days || 0,
    isWarmupReady: (data.domain_age_days || 0) >= 14,
    warmupReadyDate,
  };
}

// Get domains needing attention (critical or warning status)
export async function getDomainsNeedingAttention(
  workspaceId: string
): Promise<Array<{
  domainId: string;
  domain: string;
  status: HealthStatus;
  score: number;
  issues: string[];
}>> {
  const supabase = await createClient();

  // Get domains with health issues
  const { data } = await supabase
    .from('domain_purchases')
    .select(`
      id,
      domain,
      domain_health_summary!inner(
        overall_status,
        overall_score,
        spf_status,
        dkim_status,
        dmarc_status,
        blacklist_status
      )
    `)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .in('domain_health_summary.overall_status', ['critical', 'warning']);

  if (!data) return [];

  return data.map(d => {
    const summary = d.domain_health_summary as {
      overall_status: string;
      overall_score: number;
      spf_status: string;
      dkim_status: string;
      dmarc_status: string;
      blacklist_status: string;
    };

    const issues: string[] = [];
    if (summary.spf_status !== 'healthy') issues.push('SPF');
    if (summary.dkim_status !== 'healthy') issues.push('DKIM');
    if (summary.dmarc_status !== 'healthy') issues.push('DMARC');
    if (summary.blacklist_status !== 'healthy') issues.push('Blacklist');

    return {
      domainId: d.id,
      domain: d.domain,
      status: summary.overall_status as HealthStatus,
      score: summary.overall_score,
      issues,
    };
  });
}
