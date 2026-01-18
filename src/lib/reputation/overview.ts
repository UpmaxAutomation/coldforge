// Reputation Overview
// Aggregate reputation data across IPs, domains, and mailboxes

import { createClient } from '../supabase/server';
import type { ReputationOverview, HealthStatus } from './types';

// Get comprehensive reputation overview for a workspace
export async function getReputationOverview(
  workspaceId: string
): Promise<ReputationOverview> {
  const supabase = await createClient();

  // Get IP statistics
  const { data: pools } = await supabase
    .from('ip_pools')
    .select('id')
    .eq('workspace_id', workspaceId);

  let totalIPs = 0;
  let healthyIPs = 0;
  let blacklistedIPs = 0;

  if (pools && pools.length > 0) {
    const poolIds = pools.map((p) => p.id);

    const { data: ips } = await supabase
      .from('sending_ips')
      .select('id, is_healthy, is_active')
      .in('pool_id', poolIds);

    if (ips) {
      totalIPs = ips.filter((ip) => ip.is_active).length;
      healthyIPs = ips.filter((ip) => ip.is_active && ip.is_healthy).length;
      blacklistedIPs = ips.filter((ip) => ip.is_active && !ip.is_healthy).length;
    }
  }

  // Get domain statistics
  const { data: domains } = await supabase
    .from('domain_reputation')
    .select('reputation_score')
    .eq('workspace_id', workspaceId);

  const totalDomains = domains?.length || 0;
  const healthyDomains = domains?.filter((d) => d.reputation_score >= 50).length || 0;

  // Get mailbox statistics
  const { data: mailboxes } = await supabase
    .from('mailbox_reputation')
    .select('health_status, is_quarantined')
    .eq('workspace_id', workspaceId);

  const totalMailboxes = mailboxes?.length || 0;
  const healthyMailboxes = mailboxes?.filter((m) => m.health_status === 'good').length || 0;
  const quarantinedMailboxes = mailboxes?.filter((m) => m.is_quarantined).length || 0;

  // Get alert statistics
  const { data: alerts } = await supabase
    .from('reputation_alerts')
    .select('severity')
    .eq('workspace_id', workspaceId)
    .eq('is_resolved', false);

  const activeAlerts = alerts?.length || 0;
  const criticalAlerts = alerts?.filter((a) => a.severity === 'critical').length || 0;

  // Get pending recovery tasks
  const { data: recoveryTasks } = await supabase
    .from('reputation_recovery_tasks')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'in_progress']);

  const pendingRecoveryTasks = recoveryTasks?.length || 0;

  // Calculate overall score
  const overallScore = calculateOverallScore({
    totalIPs,
    healthyIPs,
    totalDomains,
    healthyDomains,
    totalMailboxes,
    healthyMailboxes,
    criticalAlerts,
  });

  // Determine health status
  const healthStatus = determineHealthStatus(overallScore, criticalAlerts);

  return {
    workspaceId,
    overallScore,
    healthStatus,
    totalIPs,
    healthyIPs,
    blacklistedIPs,
    totalDomains,
    healthyDomains,
    totalMailboxes,
    healthyMailboxes,
    quarantinedMailboxes,
    activeAlerts,
    criticalAlerts,
    pendingRecoveryTasks,
  };
}

// Calculate overall reputation score
function calculateOverallScore(metrics: {
  totalIPs: number;
  healthyIPs: number;
  totalDomains: number;
  healthyDomains: number;
  totalMailboxes: number;
  healthyMailboxes: number;
  criticalAlerts: number;
}): number {
  let score = 100;

  // IP health impact (25 points)
  if (metrics.totalIPs > 0) {
    const ipHealthPercent = metrics.healthyIPs / metrics.totalIPs;
    score -= (1 - ipHealthPercent) * 25;
  }

  // Domain health impact (25 points)
  if (metrics.totalDomains > 0) {
    const domainHealthPercent = metrics.healthyDomains / metrics.totalDomains;
    score -= (1 - domainHealthPercent) * 25;
  }

  // Mailbox health impact (25 points)
  if (metrics.totalMailboxes > 0) {
    const mailboxHealthPercent = metrics.healthyMailboxes / metrics.totalMailboxes;
    score -= (1 - mailboxHealthPercent) * 25;
  }

  // Critical alerts impact (25 points)
  score -= Math.min(25, metrics.criticalAlerts * 5);

  return Math.max(0, Math.round(score));
}

// Determine overall health status
function determineHealthStatus(score: number, criticalAlerts: number): HealthStatus {
  if (criticalAlerts >= 3 || score < 40) {
    return 'critical';
  }
  if (criticalAlerts >= 1 || score < 70) {
    return 'warning';
  }
  return 'good';
}

// Get reputation trends over time
export async function getReputationTrends(
  workspaceId: string,
  days: number = 30
): Promise<{
  dates: string[];
  ipScores: number[];
  domainScores: number[];
  mailboxScores: number[];
  overallScores: number[];
}> {
  const supabase = await createClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // This would typically query a time-series table
  // For now, return current snapshot
  const overview = await getReputationOverview(workspaceId);

  const dates: string[] = [];
  const ipScores: number[] = [];
  const domainScores: number[] = [];
  const mailboxScores: number[] = [];
  const overallScores: number[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);

    // Simulate gradual improvement (would be real data in production)
    const dayFactor = i / days;
    ipScores.push(Math.round(overview.overallScore * (0.7 + 0.3 * dayFactor)));
    domainScores.push(Math.round(overview.overallScore * (0.75 + 0.25 * dayFactor)));
    mailboxScores.push(Math.round(overview.overallScore * (0.8 + 0.2 * dayFactor)));
    overallScores.push(Math.round(overview.overallScore * (0.75 + 0.25 * dayFactor)));
  }

  return { dates, ipScores, domainScores, mailboxScores, overallScores };
}

// Get top issues affecting reputation
export async function getTopReputationIssues(
  workspaceId: string,
  limit: number = 10
): Promise<Array<{
  type: string;
  entity: string;
  severity: string;
  message: string;
  impactScore: number;
}>> {
  const supabase = await createClient();
  const issues: Array<{
    type: string;
    entity: string;
    severity: string;
    message: string;
    impactScore: number;
  }> = [];

  // Get blacklisted IPs
  const { data: pools } = await supabase
    .from('ip_pools')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (pools && pools.length > 0) {
    const poolIds = pools.map((p) => p.id);

    const { data: blacklistedIps } = await supabase
      .from('sending_ips')
      .select('ip_address')
      .in('pool_id', poolIds)
      .eq('is_healthy', false)
      .eq('is_active', true);

    if (blacklistedIps) {
      for (const ip of blacklistedIps) {
        issues.push({
          type: 'blacklist',
          entity: ip.ip_address,
          severity: 'critical',
          message: 'IP is blacklisted',
          impactScore: 25,
        });
      }
    }
  }

  // Get domains with authentication issues
  const { data: domainIssues } = await supabase
    .from('domain_reputation')
    .select('domain, spf_status, dkim_status, dmarc_status')
    .eq('workspace_id', workspaceId)
    .or('spf_status.neq.pass,dkim_status.neq.pass,dmarc_status.neq.pass');

  if (domainIssues) {
    for (const domain of domainIssues) {
      if (domain.spf_status !== 'pass') {
        issues.push({
          type: 'authentication',
          entity: domain.domain,
          severity: 'warning',
          message: 'SPF not configured',
          impactScore: 10,
        });
      }
      if (domain.dkim_status !== 'pass') {
        issues.push({
          type: 'authentication',
          entity: domain.domain,
          severity: 'warning',
          message: 'DKIM not configured',
          impactScore: 10,
        });
      }
      if (domain.dmarc_status !== 'pass') {
        issues.push({
          type: 'authentication',
          entity: domain.domain,
          severity: 'warning',
          message: 'DMARC not configured',
          impactScore: 8,
        });
      }
    }
  }

  // Get mailboxes with high bounce/complaint rates
  const { data: mailboxIssues } = await supabase
    .from('mailbox_reputation')
    .select('email, bounce_rate, complaint_rate, consecutive_bounces')
    .eq('workspace_id', workspaceId)
    .or('bounce_rate.gt.5,complaint_rate.gt.0.1,consecutive_bounces.gte.3');

  if (mailboxIssues) {
    for (const mailbox of mailboxIssues) {
      if (mailbox.bounce_rate > 5) {
        issues.push({
          type: 'bounce_rate',
          entity: mailbox.email,
          severity: mailbox.bounce_rate > 10 ? 'critical' : 'warning',
          message: `High bounce rate: ${mailbox.bounce_rate.toFixed(1)}%`,
          impactScore: Math.min(20, mailbox.bounce_rate * 2),
        });
      }
      if (mailbox.complaint_rate > 0.1) {
        issues.push({
          type: 'complaint_rate',
          entity: mailbox.email,
          severity: mailbox.complaint_rate > 0.3 ? 'critical' : 'warning',
          message: `High complaint rate: ${mailbox.complaint_rate.toFixed(2)}%`,
          impactScore: Math.min(25, mailbox.complaint_rate * 50),
        });
      }
      if (mailbox.consecutive_bounces >= 3) {
        issues.push({
          type: 'consecutive_failures',
          entity: mailbox.email,
          severity: mailbox.consecutive_bounces >= 5 ? 'critical' : 'warning',
          message: `${mailbox.consecutive_bounces} consecutive bounces`,
          impactScore: mailbox.consecutive_bounces * 3,
        });
      }
    }
  }

  // Sort by impact score and limit
  return issues.sort((a, b) => b.impactScore - a.impactScore).slice(0, limit);
}

// Get sending statistics summary
export async function getSendingStatsSummary(
  workspaceId: string
): Promise<{
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalComplaints: number;
  totalOpens: number;
  totalClicks: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  openRate: number;
  clickRate: number;
}> {
  const supabase = await createClient();

  // Aggregate from mailbox reputation
  const { data: mailboxStats } = await supabase
    .from('mailbox_reputation')
    .select(`
      total_sent,
      total_delivered,
      total_bounced,
      total_complaints,
      total_opens,
      total_clicks
    `)
    .eq('workspace_id', workspaceId);

  if (!mailboxStats || mailboxStats.length === 0) {
    return {
      totalSent: 0,
      totalDelivered: 0,
      totalBounced: 0,
      totalComplaints: 0,
      totalOpens: 0,
      totalClicks: 0,
      deliveryRate: 0,
      bounceRate: 0,
      complaintRate: 0,
      openRate: 0,
      clickRate: 0,
    };
  }

  const totals = mailboxStats.reduce(
    (acc, mb) => ({
      totalSent: acc.totalSent + (mb.total_sent || 0),
      totalDelivered: acc.totalDelivered + (mb.total_delivered || 0),
      totalBounced: acc.totalBounced + (mb.total_bounced || 0),
      totalComplaints: acc.totalComplaints + (mb.total_complaints || 0),
      totalOpens: acc.totalOpens + (mb.total_opens || 0),
      totalClicks: acc.totalClicks + (mb.total_clicks || 0),
    }),
    {
      totalSent: 0,
      totalDelivered: 0,
      totalBounced: 0,
      totalComplaints: 0,
      totalOpens: 0,
      totalClicks: 0,
    }
  );

  const deliveryRate = totals.totalSent > 0
    ? (totals.totalDelivered / totals.totalSent) * 100
    : 0;
  const bounceRate = totals.totalSent > 0
    ? (totals.totalBounced / totals.totalSent) * 100
    : 0;
  const complaintRate = totals.totalSent > 0
    ? (totals.totalComplaints / totals.totalSent) * 100
    : 0;
  const openRate = totals.totalDelivered > 0
    ? (totals.totalOpens / totals.totalDelivered) * 100
    : 0;
  const clickRate = totals.totalDelivered > 0
    ? (totals.totalClicks / totals.totalDelivered) * 100
    : 0;

  return {
    ...totals,
    deliveryRate,
    bounceRate,
    complaintRate,
    openRate,
    clickRate,
  };
}

// Get health breakdown by entity type
export async function getHealthBreakdown(
  workspaceId: string
): Promise<{
  ips: { good: number; warning: number; critical: number };
  domains: { good: number; warning: number; critical: number };
  mailboxes: { good: number; warning: number; critical: number };
}> {
  const supabase = await createClient();

  // IP health
  const { data: pools } = await supabase
    .from('ip_pools')
    .select('id')
    .eq('workspace_id', workspaceId);

  const ips = { good: 0, warning: 0, critical: 0 };
  if (pools && pools.length > 0) {
    const poolIds = pools.map((p) => p.id);
    const { data: ipData } = await supabase
      .from('sending_ips')
      .select('is_healthy, reputation_score')
      .in('pool_id', poolIds)
      .eq('is_active', true);

    if (ipData) {
      for (const ip of ipData) {
        if (!ip.is_healthy || ip.reputation_score < 30) {
          ips.critical++;
        } else if (ip.reputation_score < 60) {
          ips.warning++;
        } else {
          ips.good++;
        }
      }
    }
  }

  // Domain health
  const domains = { good: 0, warning: 0, critical: 0 };
  const { data: domainData } = await supabase
    .from('domain_reputation')
    .select('reputation_score')
    .eq('workspace_id', workspaceId);

  if (domainData) {
    for (const domain of domainData) {
      if (domain.reputation_score < 30) {
        domains.critical++;
      } else if (domain.reputation_score < 60) {
        domains.warning++;
      } else {
        domains.good++;
      }
    }
  }

  // Mailbox health
  const mailboxes = { good: 0, warning: 0, critical: 0 };
  const { data: mailboxData } = await supabase
    .from('mailbox_reputation')
    .select('health_status')
    .eq('workspace_id', workspaceId);

  if (mailboxData) {
    for (const mb of mailboxData) {
      if (mb.health_status === 'critical') {
        mailboxes.critical++;
      } else if (mb.health_status === 'warning') {
        mailboxes.warning++;
      } else {
        mailboxes.good++;
      }
    }
  }

  return { ips, domains, mailboxes };
}
