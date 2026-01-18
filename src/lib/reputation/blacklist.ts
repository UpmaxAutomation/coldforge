// Blacklist Monitoring System
// Check IPs against DNS-based blacklists (DNSBLs)

import { createClient } from '../supabase/server';
import dns from 'dns';
import { promisify } from 'util';
import type { BlacklistProvider, BlacklistCheck, IPHealth } from './types';

const dnsResolve = promisify(dns.resolve4);

// Reverse IP for DNSBL lookup
function reverseIP(ip: string): string {
  return ip.split('.').reverse().join('.');
}

// Check if IP is listed on a DNSBL
async function checkDNSBL(ip: string, dnsbl: string): Promise<boolean> {
  const reversedIP = reverseIP(ip);
  const query = `${reversedIP}.${dnsbl}`;

  try {
    await dnsResolve(query);
    // If we get a result, IP is listed
    return true;
  } catch {
    // NXDOMAIN means not listed
    return false;
  }
}

// Get all active blacklist providers
export async function getBlacklistProviders(): Promise<BlacklistProvider[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('blacklist_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error || !data) return [];

  return data.map((p) => ({
    id: p.id,
    name: p.name,
    checkUrl: p.check_url,
    checkType: p.check_type,
    priority: p.priority,
    isActive: p.is_active,
  }));
}

// Check single IP against all blacklists
export async function checkIPBlacklists(
  ipId: string,
  ipAddress: string
): Promise<BlacklistCheck[]> {
  const supabase = await createClient();
  const providers = await getBlacklistProviders();
  const results: BlacklistCheck[] = [];

  for (const provider of providers) {
    if (provider.checkType !== 'dns') continue;

    const isListed = await checkDNSBL(ipAddress, provider.checkUrl);

    const check: BlacklistCheck = {
      id: '', // Will be set by database
      ipId,
      ipAddress,
      providerId: provider.id,
      providerName: provider.name,
      isListed,
      checkedAt: new Date(),
    };

    // Store result in database
    const { data } = await supabase
      .from('ip_blacklist_checks')
      .insert({
        ip_id: ipId,
        ip_address: ipAddress,
        provider_id: provider.id,
        is_listed: isListed,
        checked_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (data) {
      check.id = data.id;
    }

    results.push(check);

    // Small delay between checks to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Update IP health status based on blacklist results
  const listedCount = results.filter((r) => r.isListed).length;
  if (listedCount > 0) {
    await supabase
      .from('sending_ips')
      .update({
        is_healthy: listedCount < 3, // Consider unhealthy if on 3+ lists
        updated_at: new Date().toISOString(),
      })
      .eq('id', ipId);

    // Create alert if newly blacklisted
    const listedOn = results.filter((r) => r.isListed).map((r) => r.providerName);
    await createBlacklistAlert(ipId, ipAddress, listedOn);
  }

  return results;
}

// Create blacklist alert
async function createBlacklistAlert(
  ipId: string,
  ipAddress: string,
  blacklists: string[]
): Promise<void> {
  const supabase = await createClient();

  // Get workspace from IP
  const { data: ip } = await supabase
    .from('sending_ips')
    .select('pool_id, ip_pools(workspace_id)')
    .eq('id', ipId)
    .single();

  if (!ip?.ip_pools?.workspace_id) return;

  const severity = blacklists.length >= 3 ? 'critical' : 'warning';

  await supabase.from('reputation_alerts').insert({
    workspace_id: ip.ip_pools.workspace_id,
    alert_type: 'blacklist',
    severity,
    entity_type: 'ip',
    entity_id: ipId,
    entity_value: ipAddress,
    message: `IP ${ipAddress} is listed on ${blacklists.length} blacklist(s)`,
    details: { blacklists },
    is_resolved: false,
  });
}

// Check all IPs for a workspace
export async function checkWorkspaceIPBlacklists(
  workspaceId: string
): Promise<{ checked: number; listed: number }> {
  const supabase = await createClient();

  // Get all IPs for workspace
  const { data: pools } = await supabase
    .from('ip_pools')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (!pools || pools.length === 0) {
    return { checked: 0, listed: 0 };
  }

  const poolIds = pools.map((p) => p.id);

  const { data: ips } = await supabase
    .from('sending_ips')
    .select('id, ip_address')
    .in('pool_id', poolIds)
    .eq('is_active', true);

  if (!ips) return { checked: 0, listed: 0 };

  let listedCount = 0;

  for (const ip of ips) {
    const results = await checkIPBlacklists(ip.id, ip.ip_address);
    if (results.some((r) => r.isListed)) {
      listedCount++;
    }
  }

  return { checked: ips.length, listed: listedCount };
}

// Get IP health status
export async function getIPHealth(ipId: string): Promise<IPHealth | null> {
  const supabase = await createClient();

  // Get IP details
  const { data: ip, error } = await supabase
    .from('sending_ips')
    .select(`
      id,
      ip_address,
      is_healthy,
      reputation_score,
      total_sent,
      total_delivered,
      total_bounced,
      total_complaints
    `)
    .eq('id', ipId)
    .single();

  if (error || !ip) return null;

  // Get recent blacklist checks
  const { data: checks } = await supabase
    .from('ip_blacklist_checks')
    .select(`
      is_listed,
      blacklist_providers(name)
    `)
    .eq('ip_id', ipId)
    .order('checked_at', { ascending: false })
    .limit(20);

  const blacklists = checks
    ?.filter((c) => c.is_listed)
    .map((c) => c.blacklist_providers?.name || 'Unknown') || [];

  const totalSent = ip.total_sent || 0;

  return {
    ipId: ip.id,
    ipAddress: ip.ip_address,
    isHealthy: ip.is_healthy,
    blacklistCount: blacklists.length,
    blacklists: [...new Set(blacklists)],
    reputationScore: ip.reputation_score || 50,
    deliveryRate: totalSent > 0 ? ((ip.total_delivered || 0) / totalSent) * 100 : 0,
    bounceRate: totalSent > 0 ? ((ip.total_bounced || 0) / totalSent) * 100 : 0,
    complaintRate: totalSent > 0 ? ((ip.total_complaints || 0) / totalSent) * 100 : 0,
    lastCheck: new Date(),
  };
}

// Get delisting instructions for common blacklists
export function getDelistingInstructions(blacklistName: string): {
  url?: string;
  instructions: string;
  estimatedTime: string;
} {
  const instructions: Record<string, { url?: string; instructions: string; estimatedTime: string }> = {
    'Spamhaus ZEN': {
      url: 'https://www.spamhaus.org/lookup/',
      instructions: 'Submit a removal request through the Spamhaus website. You must demonstrate that the issue has been resolved.',
      estimatedTime: '24-48 hours',
    },
    'Spamcop': {
      url: 'https://www.spamcop.net/bl.shtml',
      instructions: 'SpamCop listings automatically expire after 24-48 hours if no new spam is reported.',
      estimatedTime: '24-48 hours (automatic)',
    },
    'Barracuda': {
      url: 'https://www.barracudacentral.org/lookups/lookup-reputation',
      instructions: 'Use the Barracuda lookup tool to submit a removal request. Must demonstrate clean sending practices.',
      estimatedTime: '12-24 hours',
    },
    'SORBS': {
      url: 'http://www.sorbs.net/overview.shtml',
      instructions: 'Check the specific SORBS zone and follow their delisting process.',
      estimatedTime: '24-72 hours',
    },
  };

  return instructions[blacklistName] || {
    instructions: 'Contact the blacklist operator directly to request removal.',
    estimatedTime: 'Varies',
  };
}

// Schedule automatic blacklist checks
export async function scheduleBlacklistChecks(): Promise<void> {
  const supabase = await createClient();

  // Get all active IPs that haven't been checked recently (>6 hours)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const { data: ips } = await supabase
    .from('sending_ips')
    .select(`
      id,
      ip_address,
      ip_blacklist_checks(checked_at)
    `)
    .eq('is_active', true)
    .order('ip_blacklist_checks.checked_at', { ascending: true })
    .limit(10);

  if (!ips) return;

  for (const ip of ips) {
    const lastCheck = ip.ip_blacklist_checks?.[0]?.checked_at;
    if (!lastCheck || new Date(lastCheck) < sixHoursAgo) {
      await checkIPBlacklists(ip.id, ip.ip_address);
    }
  }
}
