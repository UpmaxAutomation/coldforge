// Sending Engine Types

export interface EmailJob {
  id: string
  organizationId: string
  campaignId: string
  leadId: string
  mailboxId: string
  sequenceStepId: string
  variantId: string
  status: EmailJobStatus
  priority: number
  scheduledAt: string
  attempts: number
  maxAttempts: number
  lastAttemptAt?: string
  completedAt?: string
  error?: string
  messageId?: string
  createdAt: string
  updatedAt: string
}

export type EmailJobStatus =
  | 'pending'
  | 'scheduled'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'cancelled'

export interface EmailContent {
  from: {
    email: string
    name: string
  }
  to: {
    email: string
    name?: string
  }
  subject: string
  html?: string
  text: string
  replyTo?: string
  headers?: Record<string, string>
  trackingPixel?: string
  unsubscribeUrl?: string
}

export interface SendingSchedule {
  id: string
  organizationId: string
  name: string
  timezone: string
  windows: ScheduleWindow[]
  createdAt: string
  updatedAt: string
}

export interface ScheduleWindow {
  dayOfWeek: number // 0-6, Sunday = 0
  startHour: number // 0-23
  startMinute: number // 0-59
  endHour: number
  endMinute: number
  enabled: boolean
}

export interface ThrottleConfig {
  maxPerHour: number
  maxPerDay: number
  minDelaySeconds: number
  maxDelaySeconds: number
  burstLimit: number
  burstWindow: number // seconds
}

export interface MailboxSendingState {
  mailboxId: string
  sentToday: number
  sentThisHour: number
  lastSentAt?: string
  dailyLimit: number
  hourlyLimit: number
  isThrottled: boolean
  throttledUntil?: string
}

export interface SendingStats {
  totalJobs: number
  pending: number
  scheduled: number
  processing: number
  sent: number
  failed: number
  cancelled: number
  avgDeliveryTime: number // seconds
}

// Default throttle config
export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  maxPerHour: 30,
  maxPerDay: 200,
  minDelaySeconds: 60,
  maxDelaySeconds: 300,
  burstLimit: 5,
  burstWindow: 60,
}

// Default schedule (9 AM - 5 PM weekdays)
export const DEFAULT_SCHEDULE_WINDOWS: ScheduleWindow[] = [
  { dayOfWeek: 1, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0, enabled: true }, // Monday
  { dayOfWeek: 2, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0, enabled: true }, // Tuesday
  { dayOfWeek: 3, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0, enabled: true }, // Wednesday
  { dayOfWeek: 4, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0, enabled: true }, // Thursday
  { dayOfWeek: 5, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0, enabled: true }, // Friday
  { dayOfWeek: 6, startHour: 0, startMinute: 0, endHour: 0, endMinute: 0, enabled: false }, // Saturday
  { dayOfWeek: 0, startHour: 0, startMinute: 0, endHour: 0, endMinute: 0, enabled: false }, // Sunday
]

// Generate unique job ID
export function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Generate message ID for tracking
export function generateMessageId(domain: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  return `<${timestamp}.${random}@${domain}>`
}
