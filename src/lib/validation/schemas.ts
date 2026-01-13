// Zod validation schemas for API routes
import { z } from 'zod'

// Common schemas
export const uuidSchema = z.string().uuid()
export const emailSchema = z.string().email()
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// Auth schemas
export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  organizationName: z.string().min(1, 'Organization name is required'),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

// Mailbox schemas
export const mailboxCreateSchema = z.object({
  email: emailSchema,
  displayName: z.string().optional(),
  provider: z.enum(['google', 'microsoft', 'smtp']),
  smtpHost: z.string().min(1).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpUsername: z.string().optional(),
  smtpPassword: z.string().optional(),
  imapHost: z.string().optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  dailyLimit: z.coerce.number().int().min(1).max(500).default(50),
  warmupEnabled: z.boolean().default(true),
})

export const mailboxUpdateSchema = mailboxCreateSchema.partial()

// Lead schemas
export const leadCreateSchema = z.object({
  email: emailSchema,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  customFields: z.record(z.string(), z.string()).optional(),
  listId: uuidSchema.optional(),
})

export const leadUpdateSchema = leadCreateSchema.partial()

export const leadBulkCreateSchema = z.object({
  leads: z.array(leadCreateSchema).min(1).max(10000),
  listId: uuidSchema.optional(),
})

// Lead list schemas
export const leadListCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

export const leadListUpdateSchema = leadListCreateSchema.partial()

// Campaign schemas
export const campaignCreateSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  settings: z.object({
    timezone: z.string().default('America/New_York'),
    sendDays: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).default(['mon', 'tue', 'wed', 'thu', 'fri']),
    sendHoursStart: z.number().int().min(0).max(23).default(9),
    sendHoursEnd: z.number().int().min(0).max(23).default(17),
    dailyLimit: z.number().int().min(1).max(10000).default(100),
    minDelayMinutes: z.number().int().min(1).default(60),
    maxDelayMinutes: z.number().int().min(1).default(180),
  }).optional(),
})

export const campaignUpdateSchema = campaignCreateSchema.partial().extend({
  status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).optional(),
})

// Campaign sequence schemas
export const sequenceStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  subject: z.string().min(1, 'Subject is required'),
  bodyHtml: z.string().min(1, 'Email body is required'),
  bodyText: z.string().optional(),
  delayDays: z.number().int().min(0).default(1),
  delayHours: z.number().int().min(0).max(23).default(0),
  conditionType: z.enum(['always', 'not_opened', 'not_replied', 'not_clicked']).default('always'),
})

export const sequenceCreateSchema = z.object({
  steps: z.array(sequenceStepSchema).min(1),
})

// Domain schemas
export const domainCreateSchema = z.object({
  domain: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/, 'Invalid domain format'),
  registrar: z.enum(['cloudflare', 'namecheap', 'porkbun', 'manual']).optional(),
})

// Billing schemas
export const checkoutSchema = z.object({
  planId: z.enum(['starter', 'pro', 'agency']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
})

// Reply schemas
export const replyUpdateSchema = z.object({
  category: z.enum(['interested', 'not_interested', 'out_of_office', 'unsubscribe', 'uncategorized']).optional(),
  isRead: z.boolean().optional(),
})

export const replyRespondSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  subject: z.string().optional(),
})

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type MailboxCreateInput = z.infer<typeof mailboxCreateSchema>
export type MailboxUpdateInput = z.infer<typeof mailboxUpdateSchema>
export type LeadCreateInput = z.infer<typeof leadCreateSchema>
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>
export type LeadBulkCreateInput = z.infer<typeof leadBulkCreateSchema>
export type LeadListCreateInput = z.infer<typeof leadListCreateSchema>
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>
export type SequenceCreateInput = z.infer<typeof sequenceCreateSchema>
export type DomainCreateInput = z.infer<typeof domainCreateSchema>
export type CheckoutInput = z.infer<typeof checkoutSchema>
export type ReplyUpdateInput = z.infer<typeof replyUpdateSchema>
export type ReplyRespondInput = z.infer<typeof replyRespondSchema>
