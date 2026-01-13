import type {
  WarmupConfig,
  WarmupStats,
  WarmupScheduleEntry,
  DEFAULT_WARMUP_STAGES,
} from './types'
import { generateWarmupEmail } from './templates'

interface Mailbox {
  id: string
  email: string
  firstName: string
  lastName: string
  warmupStage: number
  warmupDaysInStage: number
  warmupEnabled: boolean
  emailsSentToday: number
}

interface WarmupPair {
  senderId: string
  senderEmail: string
  senderName: string
  receiverId: string
  receiverEmail: string
  receiverName: string
}

// Calculate warmup stats for a mailbox
export function calculateWarmupStats(
  mailbox: Mailbox,
  config: WarmupConfig,
  sentCount: number,
  receivedCount: number,
  repliedCount: number,
  todaySent: number,
  todayReceived: number,
  todayReplied: number
): WarmupStats {
  const currentStage = config.stages[mailbox.warmupStage - 1] || config.stages[0]
  const totalStages = config.stages.length
  const totalDaysToComplete = config.stages.reduce((sum, s) => sum + s.daysInStage, 0)

  // Calculate days completed
  let daysCompleted = 0
  for (let i = 0; i < mailbox.warmupStage - 1; i++) {
    daysCompleted += config.stages[i].daysInStage
  }
  daysCompleted += mailbox.warmupDaysInStage

  const warmupProgress = totalDaysToComplete > 0
    ? Math.min(100, Math.round((daysCompleted / totalDaysToComplete) * 100))
    : 100

  const replyRate = sentCount > 0 ? (repliedCount / sentCount) * 100 : 0

  // Deliverability score based on various factors
  const deliverabilityScore = calculateDeliverabilityScore({
    replyRate,
    sentCount,
    receivedCount,
    warmupStage: mailbox.warmupStage,
  })

  // Identify issues
  const issues: string[] = []
  if (replyRate < config.targetReplyRate * 0.5) {
    issues.push('Reply rate is below target')
  }
  if (todaySent < currentStage.dailySendLimit * 0.5) {
    issues.push('Not meeting daily send quota')
  }
  if (deliverabilityScore < 70) {
    issues.push('Deliverability score is low')
  }

  return {
    mailboxId: mailbox.id,
    email: mailbox.email,
    stage: mailbox.warmupStage,
    daysInCurrentStage: mailbox.warmupDaysInStage,
    totalDays: daysCompleted,
    totalSent: sentCount,
    totalReceived: receivedCount,
    totalReplied: repliedCount,
    replyRate: Math.round(replyRate * 10) / 10,
    sentToday: todaySent,
    receivedToday: todayReceived,
    repliedToday: todayReplied,
    deliverabilityScore: Math.round(deliverabilityScore),
    warmupProgress,
    isHealthy: issues.length === 0,
    issues,
  }
}

function calculateDeliverabilityScore(params: {
  replyRate: number
  sentCount: number
  receivedCount: number
  warmupStage: number
}): number {
  let score = 50 // Base score

  // Reply rate contributes up to 30 points
  score += Math.min(30, params.replyRate)

  // Activity balance (send/receive ratio) contributes up to 15 points
  if (params.sentCount > 0 && params.receivedCount > 0) {
    const ratio = Math.min(params.sentCount, params.receivedCount) /
                  Math.max(params.sentCount, params.receivedCount)
    score += ratio * 15
  }

  // Warmup stage progress contributes up to 5 points
  score += Math.min(5, params.warmupStage)

  return Math.min(100, score)
}

// Get the daily send limit for a mailbox based on its stage
export function getDailySendLimit(stage: number, config: WarmupConfig): number {
  const stageConfig = config.stages[stage - 1]
  return stageConfig?.dailySendLimit || config.stages[config.stages.length - 1].dailySendLimit
}

// Check if a mailbox should advance to the next stage
export function shouldAdvanceStage(
  mailbox: Mailbox,
  config: WarmupConfig,
  replyRate: number
): boolean {
  const currentStage = config.stages[mailbox.warmupStage - 1]

  // Already at max stage
  if (mailbox.warmupStage >= config.stages.length) {
    return false
  }

  // Check days in stage
  if (mailbox.warmupDaysInStage < currentStage.daysInStage) {
    return false
  }

  // Check reply rate meets minimum target
  if (replyRate < config.targetReplyRate * 0.7) {
    return false
  }

  return true
}

// Generate warmup pairs for a pool of mailboxes
export function generateWarmupPairs(mailboxes: Mailbox[]): WarmupPair[] {
  const enabledMailboxes = mailboxes.filter(m => m.warmupEnabled)

  if (enabledMailboxes.length < 2) {
    return []
  }

  const pairs: WarmupPair[] = []

  // Create pairs ensuring each mailbox sends and receives
  for (let i = 0; i < enabledMailboxes.length; i++) {
    for (let j = i + 1; j < enabledMailboxes.length; j++) {
      const sender = enabledMailboxes[i]
      const receiver = enabledMailboxes[j]

      // Add pair in both directions
      pairs.push({
        senderId: sender.id,
        senderEmail: sender.email,
        senderName: `${sender.firstName} ${sender.lastName}`,
        receiverId: receiver.id,
        receiverEmail: receiver.email,
        receiverName: `${receiver.firstName} ${receiver.lastName}`,
      })

      pairs.push({
        senderId: receiver.id,
        senderEmail: receiver.email,
        senderName: `${receiver.firstName} ${receiver.lastName}`,
        receiverId: sender.id,
        receiverEmail: sender.email,
        receiverName: `${sender.firstName} ${sender.lastName}`,
      })
    }
  }

  // Shuffle pairs for randomization
  return shuffleArray(pairs)
}

// Generate schedule for a day
export function generateDailySchedule(
  mailboxes: Mailbox[],
  config: WarmupConfig,
  existingSentToday: Map<string, number>
): WarmupScheduleEntry[] {
  const schedule: WarmupScheduleEntry[] = []
  const pairs = generateWarmupPairs(mailboxes)

  // Track how many emails each mailbox will send
  const sendCounts = new Map<string, number>()
  mailboxes.forEach(m => {
    sendCounts.set(m.id, existingSentToday.get(m.id) || 0)
  })

  // Generate schedule entries
  for (const pair of pairs) {
    const sender = mailboxes.find(m => m.id === pair.senderId)
    if (!sender) continue

    const dailyLimit = getDailySendLimit(sender.warmupStage, config)
    const currentSent = sendCounts.get(pair.senderId) || 0

    if (currentSent >= dailyLimit) continue

    // Calculate scheduled time within window
    const scheduledTime = calculateScheduledTime(
      config.sendingWindowStart,
      config.sendingWindowEnd,
      config.randomizeTime
    )

    schedule.push({
      id: generateId(),
      mailboxId: pair.senderId,
      partnerMailboxId: pair.receiverId,
      scheduledAt: scheduledTime.toISOString(),
      direction: 'send',
      status: 'scheduled',
    })

    sendCounts.set(pair.senderId, currentSent + 1)
  }

  // Sort by scheduled time
  schedule.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

  return schedule
}

// Calculate a scheduled time within the sending window
function calculateScheduledTime(
  startHour: number,
  endHour: number,
  randomize: boolean
): Date {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (randomize) {
    // Random time within window
    const windowMinutes = (endHour - startHour) * 60
    const randomMinutes = Math.floor(Math.random() * windowMinutes)
    today.setHours(startHour)
    today.setMinutes(randomMinutes)
  } else {
    // Evenly distributed
    today.setHours(startHour + Math.floor(Math.random() * (endHour - startHour)))
    today.setMinutes(Math.floor(Math.random() * 60))
  }

  // If scheduled time is in the past, schedule for tomorrow
  if (today < now) {
    today.setDate(today.getDate() + 1)
  }

  return today
}

// Process a scheduled warmup email
export function processWarmupEmail(
  entry: WarmupScheduleEntry,
  senderMailbox: Mailbox,
  receiverMailbox: Mailbox,
  isReply: boolean = false
): { subject: string; body: string; fromEmail: string; toEmail: string } {
  const { subject, body } = generateWarmupEmail(
    `${senderMailbox.firstName} ${senderMailbox.lastName}`,
    senderMailbox.email,
    `${receiverMailbox.firstName} ${receiverMailbox.lastName}`,
    receiverMailbox.email,
    isReply
  )

  return {
    subject,
    body,
    fromEmail: senderMailbox.email,
    toEmail: receiverMailbox.email,
  }
}

// Utility functions
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function generateId(): string {
  return `wse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Export for external pool interaction
export function getExternalWarmupPool(
  internalMailboxes: Mailbox[],
  externalPoolId: string
): { mailboxId: string; poolId: string }[] {
  // This would connect to an external warmup pool network
  // For now, returns empty - would be implemented with external API
  return []
}
