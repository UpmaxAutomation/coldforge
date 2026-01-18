import { Job } from 'bullmq'
import { createAdminClient } from '@/lib/supabase/admin'
import { addJob, addScheduledJob } from '@/lib/queue'
import {
  generateUniqueEmailContent,
  processTemplate,
} from '@/lib/campaigns/variables'
import type {
  Campaign,
  CampaignSettings,
  CampaignStats,
  SequenceStep,
  EmailVariant,
  calculateStats,
} from '@/lib/campaigns/types'
import type { EmailJobData } from './email'

/**
 * Campaign actions
 */
export type CampaignAction = 'start' | 'pause' | 'resume' | 'process_batch' | 'complete'

/**
 * Data structure for campaign jobs
 */
export interface CampaignJobData {
  /** Campaign ID */
  campaignId: string
  /** Action to perform */
  action: CampaignAction
  /** Batch size for process_batch action */
  batchSize?: number
  /** User ID owning the campaign */
  userId?: string
  /** Sequence step to process (for multi-step campaigns) */
  sequenceStep?: number
  /** Organization ID */
  organizationId?: string
}

/**
 * Result of campaign job execution
 */
export interface CampaignJobResult {
  success: boolean
  action: CampaignAction
  campaignId: string
  details: {
    leadsProcessed?: number
    emailsQueued?: number
    nextBatchScheduled?: Date
    completedAt?: Date
    error?: string
  }
}

// Database row types
interface CampaignRow {
  id: string
  organization_id: string
  name: string
  status: string
  type: string
  settings: CampaignSettings
  stats: CampaignStats
  created_at: string
  updated_at: string
  started_at: string | null
  paused_at: string | null
  completed_at: string | null
}

interface LeadRow {
  id: string
  organization_id: string
  email: string
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  phone: string | null
  website: string | null
  custom_fields: Record<string, string> | null
  status: string
}

interface SequenceStepRow {
  id: string
  campaign_id: string
  step_order: number
  step_type: string
  delay_days: number
  delay_hours: number
  subject: string | null
  body: string | null
  is_plain_text: boolean
  variants: EmailVariant[] | null
}

interface CampaignLeadRow {
  lead_id: string
  campaign_id: string
  current_step: number
  status: string
  last_sent_at: string | null
  next_send_at: string | null
}

interface EmailAccountRow {
  id: string
  email: string
  display_name: string | null
  organization_id: string | null
  daily_limit: number
  sent_today: number
  status: string
  health_score: number | null
}

/**
 * Process campaign job
 * Handles campaign lifecycle operations
 */
export async function processCampaignJob(job: Job<CampaignJobData>): Promise<CampaignJobResult> {
  const { campaignId, action, batchSize = 50, sequenceStep, organizationId } = job.data

  console.log(`[CampaignProcessor] Processing ${action} for campaign ${campaignId}`)

  try {
    await job.updateProgress(10)

    let result: CampaignJobResult

    switch (action) {
      case 'start':
        result = await startCampaign(campaignId)
        break
      case 'pause':
        result = await pauseCampaign(campaignId)
        break
      case 'resume':
        result = await resumeCampaign(campaignId)
        break
      case 'process_batch':
        result = await processCampaignBatch(campaignId, batchSize, sequenceStep)
        break
      case 'complete':
        result = await completeCampaign(campaignId)
        break
      default:
        throw new Error(`Unknown campaign action: ${action}`)
    }

    await job.updateProgress(100)
    console.log(`[CampaignProcessor] Completed ${action} for campaign ${campaignId}`)

    return result
  } catch (error) {
    console.error(`[CampaignProcessor] Failed ${action} for campaign ${campaignId}:`, error)
    throw error
  }
}

/**
 * Start a campaign
 */
async function startCampaign(campaignId: string): Promise<CampaignJobResult> {
  const supabase = createAdminClient()

  // Get campaign
  const { data: campaignData, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaignData) {
    throw new Error(`Campaign ${campaignId} not found`)
  }

  const campaign = campaignData as CampaignRow

  // Validate campaign is in valid state to start
  if (campaign.status !== 'draft' && campaign.status !== 'paused') {
    throw new Error(`Campaign cannot be started from status: ${campaign.status}`)
  }

  // Get campaign leads count
  const { count: leadsCount } = await supabase
    .from('campaign_leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  if (!leadsCount || leadsCount === 0) {
    throw new Error('Campaign has no leads assigned')
  }

  // Get sequence steps
  const { data: stepsData, error: stepsError } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('step_order', { ascending: true })

  if (stepsError || !stepsData || stepsData.length === 0) {
    throw new Error('Campaign has no sequence steps configured')
  }

  // Get assigned mailboxes
  const { data: mailboxesData, error: mailboxError } = await supabase
    .from('campaign_mailboxes')
    .select('mailbox_id')
    .eq('campaign_id', campaignId)

  if (mailboxError || !mailboxesData || mailboxesData.length === 0) {
    throw new Error('Campaign has no mailboxes assigned')
  }

  // Update campaign status to active
  const now = new Date().toISOString()
  await supabase
    .from('campaigns')
    .update({
      status: 'active',
      started_at: now,
      updated_at: now,
    })
    .eq('id', campaignId)

  // Initialize campaign_leads status for all leads
  await supabase
    .from('campaign_leads')
    .update({
      status: 'pending',
      current_step: 0,
      next_send_at: calculateNextSendTime(campaign.settings),
    })
    .eq('campaign_id', campaignId)
    .eq('status', 'new')

  // Schedule first batch processing
  const nextBatchTime = calculateNextSendTime(campaign.settings)

  await addScheduledJob('CAMPAIGN', 'process_batch', {
    campaignId,
    action: 'process_batch' as CampaignAction,
    batchSize: campaign.settings.dailyLimit,
    sequenceStep: 0,
    organizationId: campaign.organization_id,
  }, nextBatchTime)

  console.log(`[CampaignProcessor] Started campaign ${campaign.name} with ${leadsCount} leads`)

  return {
    success: true,
    action: 'start',
    campaignId,
    details: {
      leadsProcessed: leadsCount,
      nextBatchScheduled: nextBatchTime,
    },
  }
}

/**
 * Pause a running campaign
 */
async function pauseCampaign(campaignId: string): Promise<CampaignJobResult> {
  const supabase = createAdminClient()

  // Get campaign
  const { data: campaignData, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaignData) {
    throw new Error(`Campaign ${campaignId} not found`)
  }

  const campaign = campaignData as CampaignRow

  if (campaign.status !== 'active') {
    throw new Error(`Campaign cannot be paused from status: ${campaign.status}`)
  }

  // Update campaign status
  const now = new Date().toISOString()
  await supabase
    .from('campaigns')
    .update({
      status: 'paused',
      paused_at: now,
      updated_at: now,
    })
    .eq('id', campaignId)

  // Note: Pending jobs in queue will check campaign status before processing

  console.log(`[CampaignProcessor] Paused campaign ${campaign.name}`)

  return {
    success: true,
    action: 'pause',
    campaignId,
    details: {},
  }
}

/**
 * Resume a paused campaign
 */
async function resumeCampaign(campaignId: string): Promise<CampaignJobResult> {
  const supabase = createAdminClient()

  // Get campaign
  const { data: campaignData, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaignData) {
    throw new Error(`Campaign ${campaignId} not found`)
  }

  const campaign = campaignData as CampaignRow

  if (campaign.status !== 'paused') {
    throw new Error(`Campaign cannot be resumed from status: ${campaign.status}`)
  }

  // Update campaign status
  const now = new Date().toISOString()
  await supabase
    .from('campaigns')
    .update({
      status: 'active',
      paused_at: null,
      updated_at: now,
    })
    .eq('id', campaignId)

  // Schedule next batch processing
  const nextBatchTime = calculateNextSendTime(campaign.settings)

  await addScheduledJob('CAMPAIGN', 'process_batch', {
    campaignId,
    action: 'process_batch' as CampaignAction,
    batchSize: campaign.settings.dailyLimit,
    organizationId: campaign.organization_id,
  }, nextBatchTime)

  console.log(`[CampaignProcessor] Resumed campaign ${campaign.name}`)

  return {
    success: true,
    action: 'resume',
    campaignId,
    details: {
      nextBatchScheduled: nextBatchTime,
    },
  }
}

/**
 * Process a batch of leads for a campaign
 */
async function processCampaignBatch(
  campaignId: string,
  batchSize: number,
  sequenceStep?: number
): Promise<CampaignJobResult> {
  const supabase = createAdminClient()

  // Get campaign
  const { data: campaignData, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaignData) {
    throw new Error(`Campaign ${campaignId} not found`)
  }

  const campaign = campaignData as CampaignRow

  // Check if campaign is still active
  if (campaign.status !== 'active') {
    console.log(`[CampaignProcessor] Campaign ${campaignId} is not active (${campaign.status}), skipping batch`)
    return {
      success: true,
      action: 'process_batch',
      campaignId,
      details: {
        leadsProcessed: 0,
        emailsQueued: 0,
      },
    }
  }

  // Check if we're in sending window
  if (!isInSendingWindow(campaign.settings)) {
    // Schedule for next sending window
    const nextBatchTime = calculateNextSendTime(campaign.settings)
    await addScheduledJob('CAMPAIGN', 'process_batch', {
      campaignId,
      action: 'process_batch' as CampaignAction,
      batchSize,
      sequenceStep,
      organizationId: campaign.organization_id,
    }, nextBatchTime)

    console.log(`[CampaignProcessor] Outside sending window, rescheduled to ${nextBatchTime}`)
    return {
      success: true,
      action: 'process_batch',
      campaignId,
      details: {
        leadsProcessed: 0,
        emailsQueued: 0,
        nextBatchScheduled: nextBatchTime,
      },
    }
  }

  // Get sequence steps
  const { data: stepsData } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('step_order', { ascending: true })

  const steps = (stepsData || []) as SequenceStepRow[]
  if (steps.length === 0) {
    throw new Error('Campaign has no sequence steps')
  }

  // Get available mailboxes with capacity
  const { data: mailboxesData } = await supabase
    .from('campaign_mailboxes')
    .select('mailbox_id')
    .eq('campaign_id', campaignId)

  const mailboxIds = (mailboxesData || []).map((m) => m.mailbox_id)

  const { data: accountsData } = await supabase
    .from('email_accounts')
    .select('*')
    .in('id', mailboxIds)
    .eq('status', 'active')

  const availableAccounts = (accountsData || []) as EmailAccountRow[]
  const accountsWithCapacity = availableAccounts.filter(
    (a) => a.sent_today < a.daily_limit && (a.health_score || 100) >= 50
  )

  if (accountsWithCapacity.length === 0) {
    // No accounts have capacity, schedule for tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(campaign.settings.sendingWindowStart, 0, 0, 0)

    await addScheduledJob('CAMPAIGN', 'process_batch', {
      campaignId,
      action: 'process_batch' as CampaignAction,
      batchSize,
      organizationId: campaign.organization_id,
    }, tomorrow)

    console.log(`[CampaignProcessor] No mailbox capacity, rescheduled to ${tomorrow}`)
    return {
      success: true,
      action: 'process_batch',
      campaignId,
      details: {
        leadsProcessed: 0,
        emailsQueued: 0,
        nextBatchScheduled: tomorrow,
      },
    }
  }

  // Calculate available capacity across all accounts
  const totalCapacity = accountsWithCapacity.reduce(
    (sum, a) => sum + (a.daily_limit - a.sent_today),
    0
  )
  const effectiveBatchSize = Math.min(batchSize, totalCapacity)

  // Get leads ready to be processed
  const now = new Date().toISOString()
  const { data: campaignLeadsData } = await supabase
    .from('campaign_leads')
    .select(`
      *,
      lead:leads(*)
    `)
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'in_sequence'])
    .or(`next_send_at.is.null,next_send_at.lte.${now}`)
    .order('next_send_at', { ascending: true, nullsFirst: true })
    .limit(effectiveBatchSize)

  const campaignLeads = (campaignLeadsData || []) as Array<CampaignLeadRow & { lead: LeadRow }>

  if (campaignLeads.length === 0) {
    // Check if all leads are completed
    const { count: pendingCount } = await supabase
      .from('campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'in_sequence'])

    if (pendingCount === 0) {
      // Campaign is complete
      await addJob('CAMPAIGN', 'complete', {
        campaignId,
        action: 'complete' as CampaignAction,
        organizationId: campaign.organization_id,
      })
      return {
        success: true,
        action: 'process_batch',
        campaignId,
        details: {
          leadsProcessed: 0,
          emailsQueued: 0,
        },
      }
    }

    // Schedule next check
    const nextCheckTime = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    await addScheduledJob('CAMPAIGN', 'process_batch', {
      campaignId,
      action: 'process_batch' as CampaignAction,
      batchSize,
      organizationId: campaign.organization_id,
    }, nextCheckTime)

    return {
      success: true,
      action: 'process_batch',
      campaignId,
      details: {
        leadsProcessed: 0,
        emailsQueued: 0,
        nextBatchScheduled: nextCheckTime,
      },
    }
  }

  let emailsQueued = 0
  let accountIndex = 0

  // Process each lead
  for (const campaignLead of campaignLeads) {
    const lead = campaignLead.lead
    if (!lead) continue

    // Get current step for this lead
    const currentStepIndex = campaignLead.current_step
    const step = steps[currentStepIndex]

    if (!step) {
      // Lead has completed all steps
      await supabase
        .from('campaign_leads')
        .update({ status: 'completed' })
        .eq('campaign_id', campaignId)
        .eq('lead_id', lead.id)
      continue
    }

    // Skip if it's a wait step
    if (step.step_type === 'wait') {
      // Calculate when to send next step
      const nextSendAt = new Date(
        Date.now() + step.delay_days * 24 * 60 * 60 * 1000 + step.delay_hours * 60 * 60 * 1000
      )
      await supabase
        .from('campaign_leads')
        .update({
          current_step: currentStepIndex + 1,
          next_send_at: nextSendAt.toISOString(),
        })
        .eq('campaign_id', campaignId)
        .eq('lead_id', lead.id)
      continue
    }

    // Get mailbox for this email (round-robin)
    const account = accountsWithCapacity[accountIndex % accountsWithCapacity.length]
    if (!account) continue
    accountIndex++

    // Select variant (A/B testing or default)
    const variant = selectVariant(step.variants || [])
    if (!variant && !step.subject && !step.body) {
      console.warn(`[CampaignProcessor] No content for step ${step.id}`)
      continue
    }

    const subject = variant?.subject || step.subject || ''
    const body = variant?.body || step.body || ''

    // Personalize email content
    const leadData = {
      email: lead.email,
      firstName: lead.first_name || undefined,
      lastName: lead.last_name || undefined,
      company: lead.company || undefined,
      title: lead.title || undefined,
      phone: lead.phone || undefined,
      website: lead.website || undefined,
      customFields: lead.custom_fields || undefined,
    }

    const senderData = {
      name: account.display_name || account.email.split('@')[0] || 'Sales',
      email: account.email,
    }

    const personalizedContent = generateUniqueEmailContent(
      subject,
      body,
      leadData,
      senderData,
      campaignId
    )

    // Queue email job
    const emailJobData: EmailJobData = {
      to: lead.email,
      toName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || undefined,
      from: account.email,
      fromName: account.display_name || undefined,
      subject: personalizedContent.subject,
      body: personalizedContent.body,
      accountId: account.id,
      campaignId,
      leadId: lead.id,
      organizationId: campaign.organization_id,
      trackOpens: campaign.settings.trackOpens,
      trackClicks: campaign.settings.trackClicks,
      isPlainText: step.is_plain_text,
      sequenceStepId: step.id,
      variantId: variant?.id,
    }

    await addJob('EMAIL_SEND', 'send_email', emailJobData)
    emailsQueued++

    // Update campaign lead status
    const nextStepIndex = currentStepIndex + 1
    const nextStep = steps[nextStepIndex]
    let nextSendAt: Date | null = null

    if (nextStep) {
      nextSendAt = new Date(
        Date.now() + nextStep.delay_days * 24 * 60 * 60 * 1000 + nextStep.delay_hours * 60 * 60 * 1000
      )
    }

    await supabase
      .from('campaign_leads')
      .update({
        status: nextStep ? 'in_sequence' : 'completed',
        current_step: nextStepIndex,
        last_sent_at: new Date().toISOString(),
        next_send_at: nextSendAt?.toISOString() || null,
      })
      .eq('campaign_id', campaignId)
      .eq('lead_id', lead.id)
  }

  // Update campaign stats
  const newStats = {
    ...campaign.stats,
    contacted: (campaign.stats?.contacted || 0) + emailsQueued,
  }
  await supabase
    .from('campaigns')
    .update({
      stats: newStats,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)

  // Schedule next batch
  const hasMoreLeads = campaignLeads.length >= effectiveBatchSize
  let nextBatchScheduled: Date | undefined

  if (hasMoreLeads) {
    // More leads to process - schedule next batch with delay to respect rate limits
    const delayMs = Math.max(60000, Math.ceil(emailsQueued / accountsWithCapacity.length) * 1000)
    nextBatchScheduled = new Date(Date.now() + delayMs)

    await addScheduledJob('CAMPAIGN', 'process_batch', {
      campaignId,
      action: 'process_batch' as CampaignAction,
      batchSize,
      organizationId: campaign.organization_id,
    }, nextBatchScheduled)
  } else {
    // Check again in 5 minutes for leads that become ready
    nextBatchScheduled = new Date(Date.now() + 5 * 60 * 1000)

    await addScheduledJob('CAMPAIGN', 'process_batch', {
      campaignId,
      action: 'process_batch' as CampaignAction,
      batchSize,
      organizationId: campaign.organization_id,
    }, nextBatchScheduled)
  }

  console.log(`[CampaignProcessor] Processed batch: ${campaignLeads.length} leads, ${emailsQueued} emails queued`)

  return {
    success: true,
    action: 'process_batch',
    campaignId,
    details: {
      leadsProcessed: campaignLeads.length,
      emailsQueued,
      nextBatchScheduled,
    },
  }
}

/**
 * Complete a campaign (all leads processed)
 */
async function completeCampaign(campaignId: string): Promise<CampaignJobResult> {
  const supabase = createAdminClient()

  // Get campaign
  const { data: campaignData, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaignData) {
    throw new Error(`Campaign ${campaignId} not found`)
  }

  const campaign = campaignData as CampaignRow

  // Calculate final stats
  const { data: sentEmailsData } = await supabase
    .from('sent_emails')
    .select('status')
    .eq('campaign_id', campaignId)

  const sentEmails = sentEmailsData || []
  const totalSent = sentEmails.length
  const opened = sentEmails.filter((e) => e.status === 'opened').length
  const clicked = sentEmails.filter((e) => e.status === 'clicked').length
  const replied = sentEmails.filter((e) => e.status === 'replied').length
  const bounced = sentEmails.filter((e) => e.status === 'bounced').length
  const unsubscribed = sentEmails.filter((e) => e.status === 'unsubscribed').length

  // Get total leads
  const { count: totalLeads } = await supabase
    .from('campaign_leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  const finalStats: CampaignStats = {
    totalLeads: totalLeads || 0,
    contacted: totalSent,
    opened,
    clicked,
    replied,
    bounced,
    unsubscribed,
    openRate: totalSent > 0 ? Math.round((opened / totalSent) * 100 * 10) / 10 : 0,
    clickRate: totalSent > 0 ? Math.round((clicked / totalSent) * 100 * 10) / 10 : 0,
    replyRate: totalSent > 0 ? Math.round((replied / totalSent) * 100 * 10) / 10 : 0,
    bounceRate: totalSent > 0 ? Math.round((bounced / totalSent) * 100 * 10) / 10 : 0,
  }

  // Update campaign status
  const now = new Date().toISOString()
  await supabase
    .from('campaigns')
    .update({
      status: 'completed',
      stats: finalStats,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', campaignId)

  console.log(`[CampaignProcessor] Completed campaign ${campaign.name}`)
  console.log(`[CampaignProcessor] Final stats: ${totalSent} sent, ${opened} opened, ${replied} replied`)

  return {
    success: true,
    action: 'complete',
    campaignId,
    details: {
      completedAt: new Date(),
    },
  }
}

/**
 * Calculate next send time based on campaign settings
 */
function calculateNextSendTime(settings: CampaignSettings): Date {
  const now = new Date()

  // Convert to campaign timezone
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: settings.timezone }))
  const currentHour = tzNow.getHours()

  let nextSend = new Date(now)

  // If before sending window, schedule for window start today
  if (currentHour < settings.sendingWindowStart) {
    nextSend.setHours(settings.sendingWindowStart, 0, 0, 0)
  }
  // If after sending window, schedule for window start tomorrow
  else if (currentHour >= settings.sendingWindowEnd) {
    nextSend.setDate(nextSend.getDate() + 1)
    nextSend.setHours(settings.sendingWindowStart, 0, 0, 0)
  }
  // Otherwise, send soon (within a minute)
  else {
    nextSend = new Date(now.getTime() + 60000)
  }

  // Skip weekends if configured
  if (settings.skipWeekends) {
    const day = nextSend.getDay()
    if (day === 0) nextSend.setDate(nextSend.getDate() + 1) // Sunday -> Monday
    if (day === 6) nextSend.setDate(nextSend.getDate() + 2) // Saturday -> Monday
  }

  return nextSend
}

/**
 * Check if current time is within sending window
 */
function isInSendingWindow(settings: CampaignSettings): boolean {
  const now = new Date()
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: settings.timezone }))

  const currentHour = tzNow.getHours()
  const currentDay = tzNow.getDay()

  // Check weekend
  if (settings.skipWeekends && (currentDay === 0 || currentDay === 6)) {
    return false
  }

  // Check hour window
  return currentHour >= settings.sendingWindowStart && currentHour < settings.sendingWindowEnd
}

/**
 * Select variant for A/B testing
 */
function selectVariant(variants: EmailVariant[]): EmailVariant | null {
  if (!variants || variants.length === 0) {
    return null
  }

  if (variants.length === 1) {
    return variants[0] || null
  }

  // Weighted random selection
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 50), 0)
  let random = Math.random() * totalWeight

  for (const variant of variants) {
    const weight = variant.weight || 50
    random -= weight
    if (random <= 0) {
      return variant
    }
  }

  return variants[0] || null
}

/**
 * Calculate optimal batch size based on constraints
 */
export function calculateBatchSize(
  totalLeads: number,
  dailyLimit: number,
  accountCount: number,
  hoursRemaining: number
): number {
  // Start with account capacity
  const maxPerAccount = dailyLimit / 24 // Per hour
  const totalHourlyCapacity = maxPerAccount * accountCount

  // Target to finish within remaining hours
  const targetPerHour = Math.ceil(totalLeads / hoursRemaining)

  // Use the smaller of capacity or need
  const optimalBatchSize = Math.min(totalHourlyCapacity, targetPerHour)

  // Clamp to reasonable range
  return Math.max(10, Math.min(100, Math.floor(optimalBatchSize)))
}

/**
 * Get campaign progress percentage
 */
export function getCampaignProgress(
  totalLeads: number,
  sentCount: number,
  _replyCount: number
): {
  percentage: number
  status: 'not_started' | 'in_progress' | 'mostly_done' | 'completed'
} {
  const percentage = totalLeads > 0 ? Math.round((sentCount / totalLeads) * 100) : 0

  let status: 'not_started' | 'in_progress' | 'mostly_done' | 'completed'
  if (percentage === 0) status = 'not_started'
  else if (percentage < 75) status = 'in_progress'
  else if (percentage < 100) status = 'mostly_done'
  else status = 'completed'

  return { percentage, status }
}
