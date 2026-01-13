// Email Warmup System Types

export interface WarmupConfig {
  // Daily limits per stage
  stages: WarmupStage[]
  // Reply rate target (percentage)
  targetReplyRate: number
  // Hours between warmup emails
  intervalHours: number
  // Whether to use custom templates
  useCustomTemplates: boolean
  // Whether to randomize sending times
  randomizeTime: boolean
  // Time window for sending (24h format)
  sendingWindowStart: number // e.g., 8 for 8 AM
  sendingWindowEnd: number   // e.g., 18 for 6 PM
}

export interface WarmupStage {
  stage: number
  daysInStage: number
  dailySendLimit: number
  dailyReplyTarget: number
  description: string
}

export interface WarmupEmail {
  id: string
  fromMailboxId: string
  toMailboxId: string
  fromEmail: string
  toEmail: string
  subject: string
  body: string
  threadId?: string
  replyToId?: string
  status: 'pending' | 'sent' | 'delivered' | 'replied' | 'failed'
  sentAt?: string
  repliedAt?: string
  error?: string
}

export interface WarmupStats {
  mailboxId: string
  email: string
  stage: number
  daysInCurrentStage: number
  totalDays: number

  // Lifetime stats
  totalSent: number
  totalReceived: number
  totalReplied: number
  replyRate: number

  // Today's stats
  sentToday: number
  receivedToday: number
  repliedToday: number

  // Health indicators
  deliverabilityScore: number
  warmupProgress: number // 0-100%
  isHealthy: boolean
  issues: string[]
}

export interface WarmupPool {
  id: string
  organizationId: string
  name: string
  mailboxIds: string[]
  config: WarmupConfig
  status: 'active' | 'paused' | 'completed'
  createdAt: string
  updatedAt: string
}

export interface WarmupScheduleEntry {
  id: string
  mailboxId: string
  partnerMailboxId: string
  scheduledAt: string
  direction: 'send' | 'reply'
  status: 'scheduled' | 'processing' | 'completed' | 'failed'
  emailId?: string
}

// Warmup email templates for natural conversations
export interface WarmupTemplate {
  id: string
  category: string
  subject: string
  body: string
  replyBody?: string
  tags: string[]
}

// Default warmup stages (can be customized per organization)
export const DEFAULT_WARMUP_STAGES: WarmupStage[] = [
  { stage: 1, daysInStage: 3, dailySendLimit: 5, dailyReplyTarget: 5, description: 'Initial warmup' },
  { stage: 2, daysInStage: 4, dailySendLimit: 10, dailyReplyTarget: 8, description: 'Building reputation' },
  { stage: 3, daysInStage: 5, dailySendLimit: 20, dailyReplyTarget: 15, description: 'Increasing volume' },
  { stage: 4, daysInStage: 7, dailySendLimit: 35, dailyReplyTarget: 25, description: 'Moderate volume' },
  { stage: 5, daysInStage: 7, dailySendLimit: 50, dailyReplyTarget: 35, description: 'High volume' },
  { stage: 6, daysInStage: 0, dailySendLimit: 75, dailyReplyTarget: 50, description: 'Maintenance (ongoing)' },
]

export const DEFAULT_WARMUP_CONFIG: WarmupConfig = {
  stages: DEFAULT_WARMUP_STAGES,
  targetReplyRate: 30,
  intervalHours: 4,
  useCustomTemplates: false,
  randomizeTime: true,
  sendingWindowStart: 8,
  sendingWindowEnd: 18,
}
