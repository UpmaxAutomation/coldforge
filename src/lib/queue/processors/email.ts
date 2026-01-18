import { Job } from 'bullmq'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail as sendSmtpEmail, createSmtpClient, smtpPool } from '@/lib/smtp/client'
import {
  prepareEmail,
  addTrackingPixel,
  addClickTracking,
  htmlToPlainText,
  sanitizeHtml,
} from '@/lib/sending/sender'
import { generateMessageId } from '@/lib/sending/types'
import type { SmtpProviderConfig, EmailMessage, SmtpCredentials } from '@/lib/smtp/types'
import type { EmailContent } from '@/lib/sending/types'

/**
 * Data structure for email sending jobs
 */
export interface EmailJobData {
  /** Recipient email address */
  to: string
  /** Sender email address */
  from: string
  /** Email subject line */
  subject: string
  /** Email body (HTML or plain text) */
  body: string
  /** Associated email account ID */
  accountId: string
  /** Optional campaign ID for tracking */
  campaignId?: string
  /** Optional lead ID for tracking */
  leadId?: string
  /** Optional CC recipients */
  cc?: string[]
  /** Optional BCC recipients */
  bcc?: string[]
  /** Optional reply-to address */
  replyTo?: string
  /** Whether this is a plain text email */
  isPlainText?: boolean
  /** Custom headers */
  headers?: Record<string, string>
  /** Tracking pixel enabled */
  trackOpens?: boolean
  /** Link tracking enabled */
  trackClicks?: boolean
  /** Organization ID */
  organizationId?: string
  /** From name */
  fromName?: string
  /** To name */
  toName?: string
  /** Sequence step ID */
  sequenceStepId?: string
  /** Variant ID for A/B testing */
  variantId?: string
}

/**
 * Result of email sending job
 */
export interface EmailJobResult {
  messageId: string
  sentAt: Date
  provider: string
  attempts?: number
}

// Database row types
interface EmailAccountRow {
  id: string
  email: string
  organization_id: string | null
  display_name: string | null
  provider: string
  smtp_host: string | null
  smtp_port: number | null
  smtp_username: string | null
  smtp_password_encrypted: string | null
  daily_limit: number
  sent_today: number
  status: string
  health_score: number | null
}

interface SmtpProviderRow {
  id: string
  workspace_id: string
  name: string
  provider_type: string
  credentials: SmtpCredentials | null
  is_active: boolean
  is_healthy: boolean
  priority: number
  rate_limits: {
    maxPerSecond: number
    maxPerMinute: number
    maxPerHour: number
    maxPerDay: number
  }
}

/**
 * Get SMTP configuration for an email account
 */
async function getSmtpConfig(
  accountId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<SmtpProviderConfig | null> {
  // First try to get account-level SMTP settings
  const { data: accountData } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (!accountData) {
    console.error(`[EmailProcessor] Account ${accountId} not found`)
    return null
  }

  const account = accountData as EmailAccountRow

  // Check if account has direct SMTP credentials
  if (account.smtp_host && account.smtp_username && account.smtp_password_encrypted) {
    return {
      id: account.id,
      workspaceId: account.organization_id || '',
      name: `Account: ${account.email}`,
      providerType: mapProvider(account.provider),
      credentials: {
        host: account.smtp_host,
        port: account.smtp_port || 587,
        username: account.smtp_username,
        password: account.smtp_password_encrypted,
        secure: account.smtp_port === 465,
      },
      isActive: account.status === 'active',
      isHealthy: (account.health_score || 0) >= 50,
      priority: 1,
      rateLimits: {
        maxPerSecond: 1,
        maxPerMinute: 10,
        maxPerHour: Math.floor(account.daily_limit / 8),
        maxPerDay: account.daily_limit,
      },
    }
  }

  // Fall back to organization-level SMTP provider
  if (account.organization_id) {
    const { data: providerData } = await supabase
      .from('smtp_providers')
      .select('*')
      .eq('workspace_id', account.organization_id)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(1)
      .single()

    if (providerData) {
      const provider = providerData as SmtpProviderRow
      return {
        id: provider.id,
        workspaceId: provider.workspace_id,
        name: provider.name,
        providerType: provider.provider_type as SmtpProviderConfig['providerType'],
        credentials: provider.credentials || undefined,
        isActive: provider.is_active,
        isHealthy: provider.is_healthy,
        priority: provider.priority,
        rateLimits: provider.rate_limits,
      }
    }
  }

  console.error(`[EmailProcessor] No SMTP configuration found for account ${accountId}`)
  return null
}

/**
 * Map provider string to SmtpProviderType
 */
function mapProvider(provider: string): SmtpProviderConfig['providerType'] {
  const mapping: Record<string, SmtpProviderConfig['providerType']> = {
    google: 'google_workspace',
    microsoft: 'microsoft_365',
    smtp: 'smtp_relay',
    aws_ses: 'aws_ses',
    sendgrid: 'sendgrid',
    postmark: 'postmark',
  }
  return mapping[provider] || 'custom'
}

/**
 * Record email send event in database
 */
async function recordSendEvent(
  supabase: ReturnType<typeof createAdminClient>,
  data: {
    organizationId: string
    campaignId?: string
    leadId?: string
    mailboxId: string
    toEmail: string
    subject: string
    messageId: string
    status: 'sent' | 'failed'
    errorMessage?: string
    sequenceStepId?: string
    variantId?: string
  }
): Promise<void> {
  // Insert sent email record
  await supabase.from('sent_emails').insert({
    organization_id: data.organizationId,
    campaign_id: data.campaignId,
    lead_id: data.leadId,
    mailbox_id: data.mailboxId,
    to_email: data.toEmail,
    subject: data.subject,
    message_id: data.messageId,
    status: data.status,
    error_message: data.errorMessage,
    sequence_step_id: data.sequenceStepId,
    variant_id: data.variantId,
    sent_at: new Date().toISOString(),
  })

  // Update mailbox sent count
  if (data.status === 'sent') {
    const { data: mailbox } = await supabase
      .from('email_accounts')
      .select('sent_today')
      .eq('id', data.mailboxId)
      .single()

    if (mailbox) {
      await supabase
        .from('email_accounts')
        .update({
          sent_today: (mailbox.sent_today || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.mailboxId)
    }
  }

  // Update campaign stats if campaign exists
  if (data.campaignId && data.status === 'sent') {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('stats')
      .eq('id', data.campaignId)
      .single()

    if (campaign) {
      const stats = campaign.stats as { sentCount?: number } || {}
      await supabase
        .from('campaigns')
        .update({
          stats: {
            ...stats,
            sentCount: (stats.sentCount || 0) + 1,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.campaignId)
    }
  }

  // Update lead status if lead exists
  if (data.leadId && data.status === 'sent') {
    await supabase
      .from('leads')
      .update({
        status: 'contacted',
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.leadId)
  }
}

/**
 * Process email send job
 */
export async function processEmailJob(job: Job<EmailJobData>): Promise<EmailJobResult> {
  const {
    to,
    from,
    subject,
    body,
    accountId,
    campaignId,
    leadId,
    replyTo,
    headers,
    trackOpens,
    trackClicks,
    isPlainText,
    organizationId,
    fromName,
    toName,
    sequenceStepId,
    variantId,
  } = job.data

  console.log(`[EmailProcessor] Processing job ${job.id}`)
  console.log(`[EmailProcessor] Sending email from ${from} to ${to}`)

  const supabase = createAdminClient()

  try {
    await job.updateProgress(10)

    // Validate required fields
    if (!to || !from || !subject) {
      throw new Error('Missing required email fields: to, from, or subject')
    }

    // Get SMTP configuration
    const smtpConfig = await getSmtpConfig(accountId, supabase)
    if (!smtpConfig) {
      throw new Error(`No SMTP configuration available for account ${accountId}`)
    }

    await job.updateProgress(20)

    // Generate message ID for tracking
    const domain = from.split('@')[1] || 'email.local'
    const messageId = generateMessageId(domain)
    const trackingId = `${campaignId || 'direct'}_${leadId || 'unknown'}_${Date.now()}`

    // Prepare email content
    let htmlContent = isPlainText ? `<pre style="font-family: inherit;">${body}</pre>` : body
    let textContent = isPlainText ? body : htmlToPlainText(body)

    // Sanitize HTML
    htmlContent = sanitizeHtml(htmlContent)

    await job.updateProgress(30)

    // Add tracking if enabled
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (trackOpens && campaignId && leadId) {
      const trackingPixelUrl = `${baseUrl}/api/track/open/${trackingId}`
      htmlContent = addTrackingPixel(htmlContent, trackingPixelUrl)
    }

    if (trackClicks && campaignId && leadId) {
      htmlContent = addClickTracking(htmlContent, baseUrl, campaignId, leadId)
    }

    await job.updateProgress(50)

    // Build email message
    const emailMessage: EmailMessage = {
      from: {
        email: from,
        name: fromName,
      },
      to: {
        email: to,
        name: toName,
      },
      replyTo,
      subject,
      html: htmlContent,
      text: textContent,
      headers: {
        ...headers,
        'X-Campaign-ID': campaignId || '',
        'X-Lead-ID': leadId || '',
        'Message-ID': messageId,
        'X-Mailer': 'ColdForge/1.0',
      },
      trackingId,
    }

    await job.updateProgress(70)

    // Send email
    const result = await sendSmtpEmail(smtpConfig, emailMessage)

    await job.updateProgress(90)

    if (!result.success) {
      // Record failed send
      if (organizationId) {
        await recordSendEvent(supabase, {
          organizationId,
          campaignId,
          leadId,
          mailboxId: accountId,
          toEmail: to,
          subject,
          messageId,
          status: 'failed',
          errorMessage: result.error,
          sequenceStepId,
          variantId,
        })
      }

      throw new Error(result.error || 'Failed to send email')
    }

    // Record successful send
    if (organizationId) {
      await recordSendEvent(supabase, {
        organizationId,
        campaignId,
        leadId,
        mailboxId: accountId,
        toEmail: to,
        subject,
        messageId: result.messageId || messageId,
        status: 'sent',
        sequenceStepId,
        variantId,
      })
    }

    await job.updateProgress(100)

    console.log(`[EmailProcessor] Email sent successfully`)
    console.log(`[EmailProcessor] Message ID: ${result.messageId || messageId}`)

    return {
      messageId: result.messageId || messageId,
      sentAt: new Date(),
      provider: smtpConfig.providerType,
      attempts: job.attemptsMade + 1,
    }
  } catch (error) {
    console.error(`[EmailProcessor] Failed to send email:`, error)
    throw error
  }
}

/**
 * Validate email job data
 */
export function validateEmailJobData(data: Partial<EmailJobData>): data is EmailJobData {
  return !!(
    data.to &&
    data.from &&
    data.subject &&
    data.body &&
    data.accountId &&
    isValidEmail(data.to) &&
    isValidEmail(data.from)
  )
}

/**
 * Basic email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}
