import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

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
  })
}

export async function testSmtpConnection(config: SmtpConfig): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const transporter = createSmtpTransporter(config)
    await transporter.verify()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown SMTP error',
    }
  }
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
