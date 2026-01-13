// Usage Tracking Module

import { createClient } from '@/lib/supabase/server'
import {
  type UsageSummary,
  type PlanLimits,
  calculateUsagePercentage,
  checkLimits,
  getPlanById,
} from './types'

// Get current usage for organization
export async function getCurrentUsage(
  organizationId: string
): Promise<UsageSummary['currentUsage']> {
  const supabase = await createClient()

  // Get current period dates (billing period)
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Count emails sent this month
  const { count: emailsSent } = await supabase
    .from('email_jobs')
    .select('id', { count: 'exact' })
    .eq('organization_id', organizationId)
    .eq('status', 'sent')
    .gte('completed_at', startOfMonth.toISOString())

  // Count total leads
  const { count: leadsTotal } = await supabase
    .from('leads')
    .select('id', { count: 'exact' })
    .eq('organization_id', organizationId)

  // Count active mailboxes
  const { count: mailboxes } = await supabase
    .from('mailboxes')
    .select('id', { count: 'exact' })
    .eq('organization_id', organizationId)
    .eq('status', 'active')

  // Count active campaigns
  const { count: campaigns } = await supabase
    .from('campaigns')
    .select('id', { count: 'exact' })
    .eq('organization_id', organizationId)
    .neq('status', 'archived')

  // Count warmup emails sent today
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const { count: warmupEmails } = await supabase
    .from('warmup_emails')
    .select('id', { count: 'exact' })
    .eq('organization_id', organizationId)
    .gte('sent_at', startOfDay.toISOString())

  // Count team members
  const { count: teamMembers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact' })
    .eq('organization_id', organizationId)

  return {
    emailsSent: emailsSent || 0,
    leadsTotal: leadsTotal || 0,
    mailboxes: mailboxes || 0,
    campaigns: campaigns || 0,
    warmupEmails: warmupEmails || 0,
    teamMembers: teamMembers || 0,
  }
}

// Get usage summary with limits and percentages
export async function getUsageSummary(
  organizationId: string,
  planId: string
): Promise<UsageSummary> {
  const currentUsage = await getCurrentUsage(organizationId)
  const plan = getPlanById(planId)

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`)
  }

  const limits = plan.limits

  const percentages = {
    emailsSent: calculateUsagePercentage(currentUsage.emailsSent, limits.emailsPerMonth),
    leadsTotal: calculateUsagePercentage(currentUsage.leadsTotal, limits.leadsTotal),
    mailboxes: calculateUsagePercentage(currentUsage.mailboxes, limits.mailboxes),
    campaigns: calculateUsagePercentage(currentUsage.campaigns, limits.campaigns),
  }

  const emailsOverage = limits.emailsPerMonth > 0
    ? Math.max(0, currentUsage.emailsSent - limits.emailsPerMonth)
    : 0
  const leadsOverage = limits.leadsTotal > 0
    ? Math.max(0, currentUsage.leadsTotal - limits.leadsTotal)
    : 0
  const mailboxesOverage = limits.mailboxes > 0
    ? Math.max(0, currentUsage.mailboxes - limits.mailboxes)
    : 0

  return {
    currentUsage,
    limits,
    percentages,
    overages: {
      hasOverages: emailsOverage > 0 || leadsOverage > 0 || mailboxesOverage > 0,
      emailsOverage,
      leadsOverage,
      mailboxesOverage,
    },
  }
}

// Record usage snapshot (for historical tracking)
export async function recordUsageSnapshot(
  organizationId: string,
  subscriptionId: string
): Promise<void> {
  const supabase = await createClient()
  const usage = await getCurrentUsage(organizationId)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('usage_records') as any)
    .upsert({
      organization_id: organizationId,
      subscription_id: subscriptionId,
      period_start: startOfMonth.toISOString(),
      period_end: endOfMonth.toISOString(),
      emails_sent: usage.emailsSent,
      leads_created: usage.leadsTotal,
      mailboxes_active: usage.mailboxes,
      campaigns_active: usage.campaigns,
      warmup_emails_sent: usage.warmupEmails,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id,period_start',
    })
}

// Check if action is allowed within limits
export async function canPerformAction(
  organizationId: string,
  planId: string,
  action: 'send_email' | 'create_lead' | 'add_mailbox' | 'create_campaign' | 'add_team_member'
): Promise<{ allowed: boolean; reason?: string }> {
  const summary = await getUsageSummary(organizationId, planId)
  const { currentUsage, limits } = summary

  switch (action) {
    case 'send_email':
      if (limits.emailsPerMonth > 0 && currentUsage.emailsSent >= limits.emailsPerMonth) {
        return { allowed: false, reason: 'Monthly email limit reached. Please upgrade your plan.' }
      }
      break
    case 'create_lead':
      if (limits.leadsTotal > 0 && currentUsage.leadsTotal >= limits.leadsTotal) {
        return { allowed: false, reason: 'Lead storage limit reached. Please upgrade your plan.' }
      }
      break
    case 'add_mailbox':
      if (limits.mailboxes > 0 && currentUsage.mailboxes >= limits.mailboxes) {
        return { allowed: false, reason: 'Mailbox limit reached. Please upgrade your plan.' }
      }
      break
    case 'create_campaign':
      if (limits.campaigns > 0 && currentUsage.campaigns >= limits.campaigns) {
        return { allowed: false, reason: 'Campaign limit reached. Please upgrade your plan.' }
      }
      break
    case 'add_team_member':
      if (limits.teamMembers > 0 && currentUsage.teamMembers >= limits.teamMembers) {
        return { allowed: false, reason: 'Team member limit reached. Please upgrade your plan.' }
      }
      break
  }

  return { allowed: true }
}

// Get usage history for charts
export async function getUsageHistory(
  organizationId: string,
  months = 6
): Promise<Array<{
  period: string
  emailsSent: number
  leadsCreated: number
}>> {
  const supabase = await createClient()

  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)

  const { data: records } = await supabase
    .from('usage_records')
    .select('period_start, emails_sent, leads_created')
    .eq('organization_id', organizationId)
    .gte('period_start', startDate.toISOString())
    .order('period_start', { ascending: true }) as {
      data: Array<{
        period_start: string
        emails_sent: number
        leads_created: number
      }> | null
    }

  return (records || []).map(r => ({
    period: r.period_start,
    emailsSent: r.emails_sent,
    leadsCreated: r.leads_created,
  }))
}

// Enforce limits check (decorator for API routes)
export function withLimitCheck(
  action: 'send_email' | 'create_lead' | 'add_mailbox' | 'create_campaign' | 'add_team_member'
) {
  return async function (
    organizationId: string,
    planId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    return canPerformAction(organizationId, planId, action)
  }
}

// Get remaining quota
export async function getRemainingQuota(
  organizationId: string,
  planId: string
): Promise<{
  emails: number | 'unlimited'
  leads: number | 'unlimited'
  mailboxes: number | 'unlimited'
  campaigns: number | 'unlimited'
}> {
  const summary = await getUsageSummary(organizationId, planId)
  const { currentUsage, limits } = summary

  return {
    emails: limits.emailsPerMonth === 0
      ? 'unlimited'
      : Math.max(0, limits.emailsPerMonth - currentUsage.emailsSent),
    leads: limits.leadsTotal === 0
      ? 'unlimited'
      : Math.max(0, limits.leadsTotal - currentUsage.leadsTotal),
    mailboxes: limits.mailboxes === 0
      ? 'unlimited'
      : Math.max(0, limits.mailboxes - currentUsage.mailboxes),
    campaigns: limits.campaigns === 0
      ? 'unlimited'
      : Math.max(0, limits.campaigns - currentUsage.campaigns),
  }
}
