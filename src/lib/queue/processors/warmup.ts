import { Job } from 'bullmq'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  executeWarmupForAccount,
  executeWarmupSend,
  processWarmupReplies,
  getWarmupTasks,
  shouldContinueWarmup,
  getRecommendedDailyVolume,
  type EmailAccount,
  type WarmupExecutionResult,
} from '@/lib/warmup/engine'

/**
 * Actions that can be performed in warmup
 */
export type WarmupAction = 'send' | 'reply' | 'check' | 'execute_all'

/**
 * Data structure for warmup jobs
 */
export interface WarmupJobData {
  /** Email account ID to warm up */
  accountId: string
  /** Type of warmup action */
  action: WarmupAction
  /** Target account for reply actions */
  targetAccountId?: string
  /** Email thread ID for reply actions */
  threadId?: string
  /** Optional specific email to reply to */
  messageId?: string
  /** Organization ID for batch operations */
  organizationId?: string
}

/**
 * Result of warmup job execution
 */
export interface WarmupJobResult {
  success: boolean
  action: WarmupAction
  details: {
    messageId?: string
    sentTo?: string
    repliedTo?: string
    healthScore?: number
    deliverabilityRate?: number
    emailsSent?: number
    repliesSent?: number
    errors?: string[]
  }
}

// Database row types
interface EmailAccountRow {
  id: string
  email: string
  organization_id: string | null
  display_name: string | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_username: string | null
  smtp_password_encrypted: string | null
  imap_host: string | null
  imap_port: number | null
  warmup_enabled: boolean
  warmup_progress: number
  daily_limit: number
  sent_today: number
  health_score: number | null
  status: string
}

interface WarmupEmailStats {
  total_sent: number
  total_delivered: number
  total_bounced: number
  total_spam: number
}

/**
 * Process warmup job
 * Handles sending warmup emails, replies, and health checks
 */
export async function processWarmupJob(job: Job<WarmupJobData>): Promise<WarmupJobResult> {
  const { accountId, action, targetAccountId, threadId, messageId } = job.data

  console.log(`[WarmupProcessor] Processing ${action} for account ${accountId}`)

  try {
    await job.updateProgress(10)

    let result: WarmupJobResult

    switch (action) {
      case 'send':
        result = await processSendWarmup(accountId, targetAccountId)
        break
      case 'reply':
        result = await processReplyWarmup(accountId, threadId, messageId)
        break
      case 'check':
        result = await processHealthCheck(accountId)
        break
      case 'execute_all':
        result = await processExecuteAll(accountId)
        break
      default:
        throw new Error(`Unknown warmup action: ${action}`)
    }

    await job.updateProgress(100)
    console.log(`[WarmupProcessor] Completed ${action} for account ${accountId}`)

    return result
  } catch (error) {
    console.error(`[WarmupProcessor] Failed ${action} for account ${accountId}:`, error)
    throw error
  }
}

/**
 * Send a warmup email to another account in the network
 */
async function processSendWarmup(
  accountId: string,
  targetAccountId?: string
): Promise<WarmupJobResult> {
  const supabase = createAdminClient()

  // Get sender account
  const { data: senderData, error: senderError } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (senderError || !senderData) {
    throw new Error(`Sender account ${accountId} not found`)
  }

  const sender = senderData as EmailAccountRow

  // Check if warmup should continue
  if (!shouldContinueWarmup(sender.warmup_progress, sender.health_score || 100, 0)) {
    return {
      success: true,
      action: 'send',
      details: {
        errors: ['Warmup conditions not met - pausing warmup'],
      },
    }
  }

  // Get target account - either specified or random from pool
  let targetData: EmailAccountRow | null = null

  if (targetAccountId) {
    const { data } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', targetAccountId)
      .single()
    targetData = data as EmailAccountRow | null
  } else {
    // Get random warmup peer from same organization
    const { data } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('organization_id', sender.organization_id ?? '')
      .eq('warmup_enabled', true)
      .neq('id', accountId)
      .limit(10)

    if (data && data.length > 0) {
      const randomIndex = Math.floor(Math.random() * data.length)
      targetData = (data as EmailAccountRow[])[randomIndex] || null
    }
  }

  if (!targetData) {
    throw new Error('No target account available for warmup')
  }

  // Build EmailAccount objects for the warmup engine
  const senderAccount: EmailAccount = {
    id: sender.id,
    email: sender.email,
    organization_id: sender.organization_id,
    display_name: sender.display_name,
    smtp_host: sender.smtp_host,
    smtp_port: sender.smtp_port,
    smtp_username: sender.smtp_username,
    smtp_password_encrypted: sender.smtp_password_encrypted,
    imap_host: sender.imap_host,
    imap_port: sender.imap_port,
    warmup_enabled: sender.warmup_enabled,
    warmup_progress: sender.warmup_progress,
    daily_limit: sender.daily_limit,
    sent_today: sender.sent_today,
  }

  const targetAccount: EmailAccount = {
    id: targetData.id,
    email: targetData.email,
    organization_id: targetData.organization_id,
    display_name: targetData.display_name,
    smtp_host: targetData.smtp_host,
    smtp_port: targetData.smtp_port,
    smtp_username: targetData.smtp_username,
    smtp_password_encrypted: targetData.smtp_password_encrypted,
    imap_host: targetData.imap_host,
    imap_port: targetData.imap_port,
    warmup_enabled: targetData.warmup_enabled,
    warmup_progress: targetData.warmup_progress,
    daily_limit: targetData.daily_limit,
    sent_today: targetData.sent_today,
  }

  // Execute the warmup send using the engine
  const sendResult = await executeWarmupSend(senderAccount, targetAccount, false)

  if (sendResult.success) {
    // Update sender's sent count
    await supabase
      .from('email_accounts')
      .update({
        sent_today: sender.sent_today + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)

    console.log(`[WarmupProcessor] Sent warmup email from ${sender.email} to ${targetData.email}`)

    return {
      success: true,
      action: 'send',
      details: {
        messageId: sendResult.messageId,
        sentTo: targetData.email,
      },
    }
  }

  return {
    success: false,
    action: 'send',
    details: {
      errors: [sendResult.error || 'Failed to send warmup email'],
    },
  }
}

/**
 * Reply to a warmup email
 */
async function processReplyWarmup(
  accountId: string,
  threadId?: string,
  messageId?: string
): Promise<WarmupJobResult> {
  const supabase = createAdminClient()

  if (!threadId && !messageId) {
    throw new Error('Reply action requires threadId or messageId')
  }

  // Get the original warmup email to reply to
  const { data: originalEmailData, error: emailError } = await supabase
    .from('warmup_emails')
    .select('*, from_account:email_accounts!warmup_emails_from_account_id_fkey(*)')
    .or(`id.eq.${messageId},thread_id.eq.${threadId}`)
    .eq('to_account_id', accountId)
    .eq('status', 'delivered')
    .single()

  if (emailError || !originalEmailData) {
    throw new Error('Original warmup email not found')
  }

  // Get replier account
  const { data: replierData, error: replierError } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (replierError || !replierData) {
    throw new Error(`Replier account ${accountId} not found`)
  }

  const replier = replierData as EmailAccountRow
  const originalSender = originalEmailData.from_account as EmailAccountRow | null

  if (!originalSender) {
    throw new Error('Original sender account not found')
  }

  // Build EmailAccount objects
  const replierAccount: EmailAccount = {
    id: replier.id,
    email: replier.email,
    organization_id: replier.organization_id,
    display_name: replier.display_name,
    smtp_host: replier.smtp_host,
    smtp_port: replier.smtp_port,
    smtp_username: replier.smtp_username,
    smtp_password_encrypted: replier.smtp_password_encrypted,
    imap_host: replier.imap_host,
    imap_port: replier.imap_port,
    warmup_enabled: replier.warmup_enabled,
    warmup_progress: replier.warmup_progress,
    daily_limit: replier.daily_limit,
    sent_today: replier.sent_today,
  }

  const senderAccount: EmailAccount = {
    id: originalSender.id,
    email: originalSender.email,
    organization_id: originalSender.organization_id,
    display_name: originalSender.display_name,
    smtp_host: originalSender.smtp_host,
    smtp_port: originalSender.smtp_port,
    smtp_username: originalSender.smtp_username,
    smtp_password_encrypted: originalSender.smtp_password_encrypted,
    imap_host: originalSender.imap_host,
    imap_port: originalSender.imap_port,
    warmup_enabled: originalSender.warmup_enabled,
    warmup_progress: originalSender.warmup_progress,
    daily_limit: originalSender.daily_limit,
    sent_today: originalSender.sent_today,
  }

  // Send reply using warmup engine
  const originalSubject = (originalEmailData as { subject?: string }).subject
  const replyResult = await executeWarmupSend(
    replierAccount,
    senderAccount,
    true,
    originalSubject || undefined
  )

  if (replyResult.success) {
    // Update original email status to replied
    await supabase
      .from('warmup_emails')
      .update({
        status: 'replied',
        replied_at: new Date().toISOString(),
      })
      .eq('id', originalEmailData.id)

    // Update replier's sent count
    await supabase
      .from('email_accounts')
      .update({
        sent_today: replier.sent_today + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)

    console.log(`[WarmupProcessor] Sent warmup reply from ${replier.email} to ${originalSender.email}`)

    return {
      success: true,
      action: 'reply',
      details: {
        messageId: replyResult.messageId,
        repliedTo: originalEmailData.id,
      },
    }
  }

  return {
    success: false,
    action: 'reply',
    details: {
      errors: [replyResult.error || 'Failed to send warmup reply'],
    },
  }
}

/**
 * Check account health and deliverability
 */
async function processHealthCheck(accountId: string): Promise<WarmupJobResult> {
  const supabase = createAdminClient()

  // Get account
  const { data: accountData, error: accountError } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (accountError || !accountData) {
    throw new Error(`Account ${accountId} not found`)
  }

  const account = accountData as EmailAccountRow

  // Calculate health metrics from warmup emails in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: statsData } = await supabase
    .from('warmup_emails')
    .select('status')
    .eq('from_account_id', accountId)
    .gte('sent_at', sevenDaysAgo)

  const stats = statsData || []

  const totalSent = stats.length
  const delivered = stats.filter((e) => e.status === 'delivered' || e.status === 'replied').length
  const bounced = stats.filter((e) => e.status === 'bounced').length
  const spam = stats.filter((e) => e.status === 'spam').length

  // Calculate rates
  const deliverabilityRate = totalSent > 0 ? (delivered / totalSent) * 100 : 100
  const bounceRate = totalSent > 0 ? (bounced / totalSent) * 100 : 0
  const spamRate = totalSent > 0 ? (spam / totalSent) * 100 : 0

  // Calculate health score (0-100)
  let healthScore = 100
  healthScore -= bounceRate * 3 // -3 points per 1% bounce
  healthScore -= spamRate * 10 // -10 points per 1% spam
  healthScore = Math.max(0, Math.min(100, healthScore))

  // Update account health score
  await supabase
    .from('email_accounts')
    .update({
      health_score: Math.round(healthScore),
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)

  // Check if warmup should continue or pause
  const shouldContinue = shouldContinueWarmup(account.warmup_progress, healthScore, 0)

  if (!shouldContinue && account.warmup_enabled) {
    // Pause warmup if health is poor
    await supabase
      .from('email_accounts')
      .update({
        warmup_enabled: false,
        status: 'paused',
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)

    console.log(`[WarmupProcessor] Paused warmup for ${account.email} due to poor health score`)
  }

  console.log(`[WarmupProcessor] Health check for ${account.email}: score=${healthScore}, deliverability=${deliverabilityRate}%`)

  return {
    success: true,
    action: 'check',
    details: {
      healthScore: Math.round(healthScore),
      deliverabilityRate: Math.round(deliverabilityRate * 10) / 10,
    },
  }
}

/**
 * Execute all warmup tasks for an account (send + reply + health check)
 */
async function processExecuteAll(accountId: string): Promise<WarmupJobResult> {
  console.log(`[WarmupProcessor] Executing full warmup for account ${accountId}`)

  // Use the warmup engine's comprehensive execution
  const executionResult = await executeWarmupForAccount(accountId)

  // Also process any pending replies
  const replyResult = await processWarmupReplies(accountId)

  // Run health check
  const healthResult = await processHealthCheck(accountId)

  const allErrors = [
    ...executionResult.errors,
    ...replyResult.errors,
  ]

  return {
    success: executionResult.success && allErrors.length === 0,
    action: 'execute_all',
    details: {
      emailsSent: executionResult.emailsSent,
      repliesSent: executionResult.repliesSent + replyResult.processed,
      healthScore: healthResult.details.healthScore,
      deliverabilityRate: healthResult.details.deliverabilityRate,
      errors: allErrors.length > 0 ? allErrors : undefined,
    },
  }
}

/**
 * Calculate warmup level based on account age and metrics
 */
export function calculateWarmupLevel(
  accountAgeDays: number,
  dailySentCount: number,
  bounceRate: number,
  spamRate: number
): number {
  // Base level from account age (1-10)
  let level = Math.min(10, Math.floor(accountAgeDays / 7) + 1)

  // Adjust based on daily volume
  if (dailySentCount > 50) level = Math.min(level, 8)
  if (dailySentCount > 100) level = Math.min(level, 6)

  // Penalties for poor metrics
  if (bounceRate > 5) level = Math.max(1, level - 2)
  if (spamRate > 1) level = Math.max(1, level - 3)

  return level
}

/**
 * Get recommended daily warmup emails based on level
 */
export function getWarmupDailyLimit(level: number): { sends: number; replies: number } {
  const limits: Record<number, { sends: number; replies: number }> = {
    1: { sends: 5, replies: 3 },
    2: { sends: 10, replies: 5 },
    3: { sends: 20, replies: 10 },
    4: { sends: 30, replies: 15 },
    5: { sends: 40, replies: 20 },
    6: { sends: 50, replies: 25 },
    7: { sends: 60, replies: 30 },
    8: { sends: 75, replies: 35 },
    9: { sends: 90, replies: 40 },
    10: { sends: 100, replies: 50 },
  }

  return limits[level] ?? limits[1]!
}
