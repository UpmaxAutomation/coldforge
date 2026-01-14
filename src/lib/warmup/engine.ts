// Email Warmup Engine - Core execution logic for self-warming email accounts
import { createAdminClient } from '@/lib/supabase/admin'
import { createTransporter, sendEmail } from '@/lib/sending/sender'
import { generateWarmupContent, generateReplyContent } from './content'
import type { EmailContent } from '@/lib/sending/types'
import type { Tables, InsertTables, UpdateTables } from '@/types/database'

// Database row types for Supabase queries
type EmailAccountRow = Tables<'email_accounts'>
type WarmupEmailRow = Tables<'warmup_emails'>
type WarmupEmailInsert = InsertTables<'warmup_emails'>
type EmailAccountUpdate = UpdateTables<'email_accounts'>
type WarmupEmailUpdate = UpdateTables<'warmup_emails'>

/**
 * Get a random send time within business hours (9 AM - 5 PM)
 * Adds natural variation to avoid detection patterns
 */
function getRandomSendTime(): Date {
  const now = new Date()
  const startHour = 9  // 9 AM
  const endHour = 17   // 5 PM

  // Random time within business hours today
  const randomHour = startHour + Math.floor(Math.random() * (endHour - startHour))
  const randomMinute = Math.floor(Math.random() * 60)
  const randomSecond = Math.floor(Math.random() * 60)

  const scheduledTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    randomHour,
    randomMinute,
    randomSecond
  )

  // If the scheduled time has passed, schedule for tomorrow
  if (scheduledTime <= now) {
    scheduledTime.setDate(scheduledTime.getDate() + 1)
  }

  return scheduledTime
}

// Engine configuration
export interface WarmupEngineConfig {
  accountId: string
  dailyTarget: number
  currentDay: number  // day in warmup schedule
  maxDailyIncrease: number  // usually 2-3 emails/day
  replyRate: number  // target 30-40% reply rate
}

// Warmup schedule for gradual volume increase
export interface WarmupSchedule {
  day: number
  sendCount: number
  replyCount: number
}

// Task representing a single warmup action
export interface WarmupTask {
  id: string
  type: 'send' | 'reply'
  fromAccountId: string
  toAccountId: string
  scheduledAt: Date
  originalEmailId?: string // For replies
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

// Email account for warmup operations (matches database schema)
export interface EmailAccount {
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
}

// Warmup pair for sending emails between accounts
export interface WarmupPair {
  sender: EmailAccount
  receiver: EmailAccount
  scheduledAt: Date
}

// Result of a warmup execution
export interface WarmupExecutionResult {
  success: boolean
  accountId: string
  emailsSent: number
  repliesSent: number
  errors: string[]
}

/**
 * Generate warmup schedule with gradual volume increase
 * Follows best practices: start with 2-5 emails/day, increase by 2-3/day
 */
export function generateWarmupSchedule(
  startVolume: number = 2,
  targetVolume: number = 50,
  dailyIncrease: number = 2
): WarmupSchedule[] {
  const schedule: WarmupSchedule[] = []
  let currentVolume = startVolume
  let day = 1

  while (currentVolume < targetVolume) {
    // Reply count is approximately 30-40% of send count
    const replyCount = Math.floor(currentVolume * 0.35)

    schedule.push({
      day,
      sendCount: currentVolume,
      replyCount,
    })

    // Increase volume for next day
    currentVolume = Math.min(targetVolume, currentVolume + dailyIncrease)
    day++
  }

  // Add final day at target volume
  schedule.push({
    day,
    sendCount: targetVolume,
    replyCount: Math.floor(targetVolume * 0.35),
  })

  return schedule
}

/**
 * Get the volume for a specific day in the warmup schedule
 */
export function getVolumeForDay(
  day: number,
  startVolume: number = 2,
  targetVolume: number = 50,
  dailyIncrease: number = 2
): { sendCount: number; replyCount: number } {
  const schedule = generateWarmupSchedule(startVolume, targetVolume, dailyIncrease)

  // If day is beyond schedule length, return target volume
  if (day >= schedule.length) {
    return {
      sendCount: targetVolume,
      replyCount: Math.floor(targetVolume * 0.35),
    }
  }

  const daySchedule = schedule[day - 1]
  return daySchedule || { sendCount: startVolume, replyCount: 0 }
}

/**
 * Get warmup tasks for today for a specific account
 */
export async function getWarmupTasks(
  accountId: string
): Promise<WarmupTask[]> {
  const supabase = createAdminClient()
  const tasks: WarmupTask[] = []
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  // Get account details
  const { data: accountData, error: accountError } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('warmup_enabled', true)
    .single()

  if (accountError || !accountData) {
    console.error('Failed to get account for warmup:', accountError)
    return tasks
  }

  // Cast to proper type for TypeScript
  const account = accountData as EmailAccount

  // Get other warmup accounts in the same organization for pairing
  const { data: peerAccountsData, error: peerError } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('organization_id', account.organization_id ?? '')
    .eq('warmup_enabled', true)
    .neq('id', accountId)

  if (peerError || !peerAccountsData || peerAccountsData.length === 0) {
    console.error('No peer accounts for warmup:', peerError)
    return tasks
  }

  // Cast to proper type for iteration
  const peerAccounts = peerAccountsData as EmailAccount[]

  // Calculate today's volume based on warmup progress
  const warmupDay = Math.floor(account.warmup_progress / 2) + 1 // Rough estimate: 2% per day
  const { sendCount, replyCount } = getVolumeForDay(warmupDay)

  // Check how many we've already sent today
  const { count: sentToday } = await supabase
    .from('warmup_emails')
    .select('*', { count: 'exact', head: true })
    .eq('from_account_id', accountId)
    .gte('sent_at', todayStart.toISOString())
    .lt('sent_at', todayEnd.toISOString())

  const remainingSends = Math.max(0, sendCount - (sentToday || 0))

  // Create send tasks
  for (let i = 0; i < remainingSends; i++) {
    // Pick a random peer account
    const peerIndex = Math.floor(Math.random() * peerAccounts.length)
    const peer = peerAccounts[peerIndex]

    if (!peer) continue

    tasks.push({
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'send',
      fromAccountId: accountId,
      toAccountId: peer.id,
      scheduledAt: getRandomSendTime(),
      status: 'pending',
    })
  }

  // Check for emails we need to reply to
  const { data: pendingRepliesData } = await supabase
    .from('warmup_emails')
    .select('*')
    .eq('to_account_id', accountId)
    .eq('status', 'delivered')
    .gte('sent_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()) // Last 48 hours
    .limit(replyCount)

  const pendingReplies = pendingRepliesData as WarmupEmailRow[] | null
  if (pendingReplies) {
    for (const email of pendingReplies) {
      // Random chance to reply (to achieve target reply rate)
      if (Math.random() < 0.7) { // 70% chance to reply to simulate realistic behavior
        tasks.push({
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'reply',
          fromAccountId: accountId,
          toAccountId: email.from_account_id || '',
          scheduledAt: getRandomSendTime(),
          originalEmailId: email.id,
          status: 'pending',
        })
      }
    }
  }

  // Sort tasks by scheduled time
  tasks.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())

  return tasks
}

/**
 * Execute a single warmup send
 */
export async function executeWarmupSend(
  fromAccount: EmailAccount,
  toAccount: EmailAccount,
  isReply: boolean = false,
  originalSubject?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Validate SMTP configuration
  if (!fromAccount.smtp_host || !fromAccount.smtp_port || !fromAccount.smtp_username || !fromAccount.smtp_password_encrypted) {
    return {
      success: false,
      error: 'SMTP configuration incomplete for sender account',
    }
  }

  try {
    // Create SMTP transporter
    const transporter = createTransporter({
      host: fromAccount.smtp_host,
      port: fromAccount.smtp_port,
      secure: fromAccount.smtp_port === 465,
      auth: {
        user: fromAccount.smtp_username,
        pass: fromAccount.smtp_password_encrypted,
      },
    })

    // Generate content
    const content = isReply && originalSubject
      ? generateReplyContent(originalSubject)
      : generateWarmupContent()

    // Build email content
    const emailContent: EmailContent = {
      from: {
        email: fromAccount.email,
        name: fromAccount.display_name || fromAccount.email.split('@')[0] || 'User',
      },
      to: {
        email: toAccount.email,
        name: toAccount.display_name || undefined,
      },
      subject: content.subject,
      text: content.body,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${content.body.replace(/\n/g, '<br>')}</div>`,
    }

    // Send email
    const result = await sendEmail(transporter, emailContent, {
      maxRetries: 2,
    })

    // Close transporter
    transporter.close()

    if (result.success) {
      return {
        success: true,
        messageId: result.messageId,
      }
    }

    return {
      success: false,
      error: result.error || 'Failed to send warmup email',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error sending warmup email',
    }
  }
}

/**
 * Process warmup replies - marks delivered emails as needing reply
 */
export async function processWarmupReplies(
  accountId: string
): Promise<{ processed: number; errors: string[] }> {
  const supabase = createAdminClient()
  const errors: string[] = []
  let processed = 0

  // Get emails that were sent TO this account and need to be marked as delivered
  const { data: receivedEmailsData, error: fetchError } = await supabase
    .from('warmup_emails')
    .select('id, status, to_account_id, sent_at')
    .eq('to_account_id', accountId)
    .eq('status', 'sent')
    .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  if (fetchError) {
    errors.push(`Failed to fetch received emails: ${fetchError.message}`)
    return { processed, errors }
  }

  if (!receivedEmailsData || receivedEmailsData.length === 0) {
    return { processed, errors }
  }

  // Update status to delivered (simulating email delivery)
  for (const email of receivedEmailsData) {
    const { error: updateError } = await supabase
      .from('warmup_emails')
      .update({ status: 'delivered', opened_at: new Date().toISOString() })
      .eq('id', email.id)

    if (updateError) {
      errors.push(`Failed to update email ${email.id}: ${updateError.message}`)
    } else {
      processed++
    }
  }

  return { processed, errors }
}

/**
 * Execute all warmup tasks for an account
 */
export async function executeWarmupForAccount(
  accountId: string
): Promise<WarmupExecutionResult> {
  const supabase = createAdminClient()
  const result: WarmupExecutionResult = {
    success: true,
    accountId,
    emailsSent: 0,
    repliesSent: 0,
    errors: [],
  }

  // Get account with decrypted credentials
  const { data: accountData, error: accountError } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (accountError || !accountData) {
    result.success = false
    result.errors.push('Account not found')
    return result
  }

  const account = accountData as EmailAccountRow
  if (!account.warmup_enabled) {
    result.success = false
    result.errors.push('Warmup not enabled for this account')
    return result
  }

  // Get warmup tasks
  const tasks = await getWarmupTasks(accountId)
  const now = new Date()

  // Filter tasks that should run now (scheduled time has passed)
  const dueTasks = tasks.filter(task => task.scheduledAt <= now)

  for (const task of dueTasks) {
    // Get peer account
    const { data: peerAccountData } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', task.toAccountId)
      .single()

    if (!peerAccountData) {
      result.errors.push(`Peer account ${task.toAccountId} not found`)
      continue
    }

    const peerAccount = peerAccountData as EmailAccountRow

    // Build account objects - cast from database records
    const fromAcc: EmailAccount = {
      id: account.id,
      email: account.email,
      organization_id: account.organization_id ?? null,
      display_name: account.display_name,
      smtp_host: account.smtp_host,
      smtp_port: account.smtp_port,
      smtp_username: account.smtp_username,
      smtp_password_encrypted: account.smtp_password_encrypted,
      imap_host: account.imap_host,
      imap_port: account.imap_port,
      warmup_enabled: account.warmup_enabled,
      warmup_progress: account.warmup_progress,
      daily_limit: account.daily_limit,
      sent_today: account.sent_today,
    }

    const toAcc: EmailAccount = {
      id: peerAccount.id,
      email: peerAccount.email,
      organization_id: peerAccount.organization_id ?? null,
      display_name: peerAccount.display_name,
      smtp_host: peerAccount.smtp_host,
      smtp_port: peerAccount.smtp_port,
      smtp_username: peerAccount.smtp_username,
      smtp_password_encrypted: peerAccount.smtp_password_encrypted,
      imap_host: peerAccount.imap_host,
      imap_port: peerAccount.imap_port,
      warmup_enabled: peerAccount.warmup_enabled,
      warmup_progress: peerAccount.warmup_progress,
      daily_limit: peerAccount.daily_limit,
      sent_today: peerAccount.sent_today,
    }

    // Get original subject for replies
    let originalSubject: string | undefined
    if (task.type === 'reply' && task.originalEmailId) {
      const { data: originalEmailData } = await supabase
        .from('warmup_emails')
        .select('subject')
        .eq('id', task.originalEmailId)
        .single()

      const originalEmail = originalEmailData as { subject: string | null } | null
      originalSubject = originalEmail?.subject || undefined
    }

    // Execute the send
    const sendResult = await executeWarmupSend(
      fromAcc,
      toAcc,
      task.type === 'reply',
      originalSubject
    )

    if (sendResult.success) {
      // Record the warmup email
      const content = task.type === 'reply' && originalSubject
        ? generateReplyContent(originalSubject)
        : generateWarmupContent()

      const insertData: WarmupEmailInsert = {
        from_account_id: accountId,
        to_account_id: task.toAccountId,
        message_id: sendResult.messageId,
        subject: content.subject,
        status: 'sent',
        sent_at: new Date().toISOString(),
      }
      await supabase.from('warmup_emails').insert(insertData)

      if (task.type === 'reply') {
        result.repliesSent++

        // Update original email status to replied
        if (task.originalEmailId) {
          const replyUpdateData: WarmupEmailUpdate = {
            status: 'replied',
            replied_at: new Date().toISOString(),
          }
          await supabase
            .from('warmup_emails')
            .update(replyUpdateData)
            .eq('id', task.originalEmailId)
        }
      } else {
        result.emailsSent++
      }

      // Update account sent count
      const accountUpdateData: EmailAccountUpdate = {
        sent_today: account.sent_today + 1,
        updated_at: new Date().toISOString(),
      }
      await supabase
        .from('email_accounts')
        .update(accountUpdateData)
        .eq('id', accountId)
    } else {
      result.errors.push(sendResult.error || 'Unknown send error')
    }

    // Small delay between sends to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
  }

  // Process incoming replies
  const replyResult = await processWarmupReplies(accountId)
  if (replyResult.errors.length > 0) {
    result.errors.push(...replyResult.errors)
  }

  // Update warmup progress
  if (result.emailsSent > 0 || result.repliesSent > 0) {
    const newProgress = Math.min(100, account.warmup_progress + 1)
    const progressUpdateData: EmailAccountUpdate = {
      warmup_progress: newProgress,
      updated_at: new Date().toISOString(),
    }
    await supabase
      .from('email_accounts')
      .update(progressUpdateData)
      .eq('id', accountId)
  }

  result.success = result.errors.length === 0

  return result
}

/**
 * Execute warmup for all enabled accounts in an organization
 */
export async function executeWarmupForOrganization(
  organizationId: string
): Promise<WarmupExecutionResult[]> {
  const supabase = createAdminClient()
  const results: WarmupExecutionResult[] = []

  // Get all warmup-enabled accounts for this organization
  const { data: accountsData, error } = await supabase
    .from('email_accounts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('warmup_enabled', true)
    .eq('status', 'warming')

  if (error || !accountsData) {
    console.error('Failed to get warmup accounts:', error)
    return results
  }

  const accounts = accountsData as { id: string }[]

  // Execute warmup for each account
  for (const account of accounts) {
    const result = await executeWarmupForAccount(account.id)
    results.push(result)
  }

  return results
}

/**
 * Check if an account should continue warmup
 */
export function shouldContinueWarmup(
  warmupProgress: number,
  healthScore: number,
  consecutiveErrors: number
): boolean {
  // Stop if warmup is complete
  if (warmupProgress >= 100) {
    return false
  }

  // Pause if health score drops too low
  if (healthScore < 50) {
    return false
  }

  // Pause if too many consecutive errors
  if (consecutiveErrors > 5) {
    return false
  }

  return true
}

/**
 * Calculate the recommended daily send volume based on warmup progress
 */
export function getRecommendedDailyVolume(warmupProgress: number): number {
  // Linear interpolation from 2 to 50 based on progress
  const minVolume = 2
  const maxVolume = 50

  return Math.floor(minVolume + (maxVolume - minVolume) * (warmupProgress / 100))
}
