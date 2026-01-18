// Domain Reputation Management
// Monitor and manage sending domain reputation

import { createClient } from '../supabase/server';
import dns from 'dns';
import { promisify } from 'util';
import type { DomainReputation } from './types';

const dnsResolveTxt = promisify(dns.resolveTxt);

// Get domain reputation
export async function getDomainReputation(
  domainId: string
): Promise<DomainReputation | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('domain_reputation')
    .select('*')
    .eq('id', domainId)
    .single();

  if (error || !data) return null;

  return mapDomainReputation(data);
}

// Get domain reputation by domain name
export async function getDomainReputationByName(
  workspaceId: string,
  domain: string
): Promise<DomainReputation | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('domain_reputation')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .single();

  if (error || !data) return null;

  return mapDomainReputation(data);
}

// Get all domain reputations for a workspace
export async function getWorkspaceDomainReputations(
  workspaceId: string
): Promise<DomainReputation[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('domain_reputation')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('reputation_score', { ascending: false });

  if (error || !data) return [];

  return data.map(mapDomainReputation);
}

// Create or update domain reputation entry
export async function upsertDomainReputation(
  workspaceId: string,
  domain: string
): Promise<{ success: boolean; domainId?: string; error?: string }> {
  const supabase = await createClient();

  // Check if domain exists
  const { data: existing } = await supabase
    .from('domain_reputation')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .single();

  if (existing) {
    return { success: true, domainId: existing.id };
  }

  // Create new domain reputation entry
  const { data, error } = await supabase
    .from('domain_reputation')
    .insert({
      workspace_id: workspaceId,
      domain,
      reputation_score: 50, // Start at neutral
      google_reputation: 'unknown',
      microsoft_reputation: 'unknown',
      yahoo_reputation: 'unknown',
      spf_status: 'unknown',
      dkim_status: 'unknown',
      dmarc_status: 'unknown',
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, domainId: data.id };
}

// Check SPF record
export async function checkSPF(domain: string): Promise<{
  status: 'pass' | 'fail' | 'unknown';
  record?: string;
}> {
  try {
    const records = await dnsResolveTxt(domain);
    const spfRecord = records.flat().find((r) => r.startsWith('v=spf1'));

    if (spfRecord) {
      return { status: 'pass', record: spfRecord };
    }
    return { status: 'fail' };
  } catch {
    return { status: 'unknown' };
  }
}

// Check DKIM record
export async function checkDKIM(
  domain: string,
  selector: string = 'default'
): Promise<{
  status: 'pass' | 'fail' | 'unknown';
  record?: string;
}> {
  try {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    const records = await dnsResolveTxt(dkimDomain);
    const dkimRecord = records.flat().find((r) => r.includes('v=DKIM1'));

    if (dkimRecord) {
      return { status: 'pass', record: dkimRecord };
    }
    return { status: 'fail' };
  } catch {
    return { status: 'unknown' };
  }
}

// Check DMARC record
export async function checkDMARC(domain: string): Promise<{
  status: 'pass' | 'fail' | 'unknown';
  record?: string;
  policy?: 'none' | 'quarantine' | 'reject';
}> {
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const records = await dnsResolveTxt(dmarcDomain);
    const dmarcRecord = records.flat().find((r) => r.startsWith('v=DMARC1'));

    if (dmarcRecord) {
      let policy: 'none' | 'quarantine' | 'reject' = 'none';
      const policyMatch = dmarcRecord.match(/p=(none|quarantine|reject)/);
      if (policyMatch) {
        policy = policyMatch[1] as 'none' | 'quarantine' | 'reject';
      }
      return { status: 'pass', record: dmarcRecord, policy };
    }
    return { status: 'fail' };
  } catch {
    return { status: 'unknown' };
  }
}

// Check all authentication records
export async function checkDomainAuthentication(
  domain: string,
  dkimSelector?: string
): Promise<{
  spf: { status: string; record?: string };
  dkim: { status: string; record?: string };
  dmarc: { status: string; record?: string; policy?: string };
  overallStatus: 'pass' | 'partial' | 'fail';
}> {
  const [spf, dkim, dmarc] = await Promise.all([
    checkSPF(domain),
    checkDKIM(domain, dkimSelector),
    checkDMARC(domain),
  ]);

  let overallStatus: 'pass' | 'partial' | 'fail';
  if (spf.status === 'pass' && dkim.status === 'pass' && dmarc.status === 'pass') {
    overallStatus = 'pass';
  } else if (spf.status === 'fail' && dkim.status === 'fail' && dmarc.status === 'fail') {
    overallStatus = 'fail';
  } else {
    overallStatus = 'partial';
  }

  return { spf, dkim, dmarc, overallStatus };
}

// Update domain authentication status in database
export async function updateDomainAuthStatus(
  domainId: string,
  dkimSelector?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Get domain
  const { data: domainData, error: fetchError } = await supabase
    .from('domain_reputation')
    .select('domain')
    .eq('id', domainId)
    .single();

  if (fetchError || !domainData) {
    return { success: false, error: 'Domain not found' };
  }

  const auth = await checkDomainAuthentication(domainData.domain, dkimSelector);

  const { error } = await supabase
    .from('domain_reputation')
    .update({
      spf_status: auth.spf.status,
      dkim_status: auth.dkim.status,
      dmarc_status: auth.dmarc.status,
      last_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', domainId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Calculate domain reputation score
export function calculateDomainReputationScore(metrics: {
  bounceRate: number;
  complaintRate: number;
  openRate: number;
  clickRate: number;
  inboxPlacementRate: number;
  spfPass: boolean;
  dkimPass: boolean;
  dmarcPass: boolean;
}): number {
  let score = 50; // Start at neutral

  // Bounce rate impact (-30 max)
  if (metrics.bounceRate > 10) score -= 30;
  else if (metrics.bounceRate > 5) score -= 20;
  else if (metrics.bounceRate > 2) score -= 10;
  else if (metrics.bounceRate < 1) score += 5;

  // Complaint rate impact (-30 max)
  if (metrics.complaintRate > 0.5) score -= 30;
  else if (metrics.complaintRate > 0.2) score -= 20;
  else if (metrics.complaintRate > 0.1) score -= 10;
  else if (metrics.complaintRate < 0.05) score += 5;

  // Open rate impact (+10 max)
  if (metrics.openRate > 30) score += 10;
  else if (metrics.openRate > 20) score += 5;
  else if (metrics.openRate < 5) score -= 5;

  // Click rate impact (+5 max)
  if (metrics.clickRate > 5) score += 5;
  else if (metrics.clickRate > 2) score += 3;

  // Inbox placement impact (+15 max, -15 min)
  if (metrics.inboxPlacementRate > 95) score += 15;
  else if (metrics.inboxPlacementRate > 90) score += 10;
  else if (metrics.inboxPlacementRate > 80) score += 5;
  else if (metrics.inboxPlacementRate < 60) score -= 15;
  else if (metrics.inboxPlacementRate < 70) score -= 10;

  // Authentication bonus (+15 max)
  if (metrics.spfPass) score += 5;
  if (metrics.dkimPass) score += 5;
  if (metrics.dmarcPass) score += 5;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

// Update domain reputation metrics from email stats
export async function updateDomainReputationMetrics(
  domainId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Get domain info
  const { data: domain, error: fetchError } = await supabase
    .from('domain_reputation')
    .select('*')
    .eq('id', domainId)
    .single();

  if (fetchError || !domain) {
    return { success: false, error: 'Domain not found' };
  }

  // Calculate rates
  const totalSent = domain.total_sent || 0;
  const bounceRate = totalSent > 0 ? ((domain.total_bounced || 0) / totalSent) * 100 : 0;
  const complaintRate = totalSent > 0 ? ((domain.total_complaints || 0) / totalSent) * 100 : 0;

  // Calculate open/click rates from delivered emails
  const totalDelivered = domain.total_delivered || 0;
  const openRate = 0; // Would need email events data
  const clickRate = 0;
  const inboxPlacementRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;

  // Calculate reputation score
  const reputationScore = calculateDomainReputationScore({
    bounceRate,
    complaintRate,
    openRate,
    clickRate,
    inboxPlacementRate,
    spfPass: domain.spf_status === 'pass',
    dkimPass: domain.dkim_status === 'pass',
    dmarcPass: domain.dmarc_status === 'pass',
  });

  // Update in database
  const { error } = await supabase
    .from('domain_reputation')
    .update({
      reputation_score: reputationScore,
      bounce_rate: bounceRate,
      complaint_rate: complaintRate,
      inbox_placement_rate: inboxPlacementRate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', domainId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Get domain health recommendations
export function getDomainHealthRecommendations(domain: DomainReputation): string[] {
  const recommendations: string[] = [];

  // Authentication recommendations
  if (domain.spfStatus !== 'pass') {
    recommendations.push('Configure SPF record to authorize your sending servers');
  }
  if (domain.dkimStatus !== 'pass') {
    recommendations.push('Set up DKIM signing for email authentication');
  }
  if (domain.dmarcStatus !== 'pass') {
    recommendations.push('Implement DMARC policy to protect against spoofing');
  }

  // Reputation recommendations
  if (domain.bounceRate > 5) {
    recommendations.push('High bounce rate detected - clean your email lists');
  }
  if (domain.complaintRate > 0.1) {
    recommendations.push('High complaint rate - review your email content and targeting');
  }
  if (domain.inboxPlacementRate < 80) {
    recommendations.push('Low inbox placement - check authentication and content quality');
  }

  // Provider-specific recommendations
  if (domain.googleReputation === 'bad' || domain.googleReputation === 'low') {
    recommendations.push('Poor Google reputation - follow Google Postmaster guidelines');
  }
  if (domain.microsoftReputation === 'poor') {
    recommendations.push('Poor Microsoft reputation - check SNDS for issues');
  }

  return recommendations;
}

// Batch update all domain reputations for a workspace
export async function updateWorkspaceDomainReputations(
  workspaceId: string
): Promise<{ updated: number; errors: number }> {
  const supabase = await createClient();
  let updated = 0;
  let errors = 0;

  const { data: domains } = await supabase
    .from('domain_reputation')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (!domains) return { updated: 0, errors: 0 };

  for (const domain of domains) {
    // Update authentication status
    const authResult = await updateDomainAuthStatus(domain.id);
    if (!authResult.success) {
      errors++;
      continue;
    }

    // Update reputation metrics
    const metricsResult = await updateDomainReputationMetrics(domain.id);
    if (!metricsResult.success) {
      errors++;
      continue;
    }

    updated++;
  }

  return { updated, errors };
}

// Helper function to map database row to DomainReputation type
function mapDomainReputation(data: Record<string, unknown>): DomainReputation {
  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    domain: data.domain as string,
    reputationScore: (data.reputation_score as number) || 50,
    googleReputation: (data.google_reputation as string) || 'unknown',
    microsoftReputation: (data.microsoft_reputation as string) || 'unknown',
    yahooReputation: (data.yahoo_reputation as string) || 'unknown',
    totalSent: (data.total_sent as number) || 0,
    totalDelivered: (data.total_delivered as number) || 0,
    totalBounced: (data.total_bounced as number) || 0,
    totalComplaints: (data.total_complaints as number) || 0,
    bounceRate: (data.bounce_rate as number) || 0,
    complaintRate: (data.complaint_rate as number) || 0,
    openRate: (data.open_rate as number) || 0,
    clickRate: (data.click_rate as number) || 0,
    inboxPlacementRate: (data.inbox_placement_rate as number) || 0,
    spfStatus: (data.spf_status as string) || 'unknown',
    dkimStatus: (data.dkim_status as string) || 'unknown',
    dmarcStatus: (data.dmarc_status as string) || 'unknown',
    lastCheckAt: data.last_check_at ? new Date(data.last_check_at as string) : undefined,
  };
}
