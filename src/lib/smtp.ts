import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import { retrySmtp } from './retry'
import { sendWithRetry, classifySmtpError, type SmtpRetryResult } from './retry/smtp'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}

export function createSmtpTransporter(config: SmtpConfig): Transporter<SMTPTransport.SentMessageInfo> {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true for 465, false for other ports
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
    connectionTimeout: 30000, // 30 second connection timeout
    greetingTimeout: 30000,   // 30 second greeting timeout
    socketTimeout: 60000,     // 60 second socket timeout
  })
}

export async function testSmtpConnection(config: SmtpConfig): Promise<{
  success: boolean
  error?: string
  attempts?: number
}> {
  try {
    const transporter = createSmtpTransporter(config)

    // Use retry logic for connection verification
    await retrySmtp(async () => {
      await transporter.verify()
    })

    return { success: true, attempts: 1 }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown SMTP error',
    }
  }
}

export interface SendSmtpEmailResult {
  success: boolean
  messageId?: string
  error?: string
  errorCategory?: string
  attempts: number
  totalTime: number
}

export async function sendSmtpEmail(
  config: SmtpConfig,
  options: {
    from: string
    to: string
    subject: string
    html: string
    text?: string
    replyTo?: string
    headers?: Record<string, string>
  },
  retryOptions?: {
    maxRetries?: number
    onRetry?: (error: Error, attempt: number, delay: number) => void
  }
): Promise<SendSmtpEmailResult> {
  const transporter = createSmtpTransporter(config)

  const result: SmtpRetryResult<SMTPTransport.SentMessageInfo> = await sendWithRetry(
    async () => {
      return await transporter.sendMail({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        headers: options.headers,
      })
    },
    {
      maxRetries: retryOptions?.maxRetries,
      onRetry: retryOptions?.onRetry,
    }
  )

  if (result.success && result.data) {
    return {
      success: true,
      messageId: result.data.messageId,
      attempts: result.attempts,
      totalTime: result.totalTime,
    }
  }

  return {
    success: false,
    error: result.error,
    errorCategory: result.error
      ? classifySmtpError(new Error(result.error))
      : undefined,
    attempts: result.attempts,
    totalTime: result.totalTime,
  }
}

/**
 * Send email without retry logic (for cases where immediate failure is preferred)
 */
export async function sendSmtpEmailNoRetry(
  config: SmtpConfig,
  options: {
    from: string
    to: string
    subject: string
    html: string
    text?: string
    replyTo?: string
    headers?: Record<string, string>
  }
): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  try {
    const transporter = createSmtpTransporter(config)

    const result = await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers,
    })

    return {
      success: true,
      messageId: result.messageId,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

// Common SMTP configurations for popular providers
export const SMTP_PRESETS: Record<string, Partial<SmtpConfig>> = {
  gmail: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
  },
  outlook: {
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
  },
  yahoo: {
    host: 'smtp.mail.yahoo.com',
    port: 587,
    secure: false,
  },
  zoho: {
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
  },
  sendgrid: {
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
  },
  mailgun: {
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
  },
}

export function getSmtpPreset(provider: string): Partial<SmtpConfig> | undefined {
  return SMTP_PRESETS[provider.toLowerCase()]
}
