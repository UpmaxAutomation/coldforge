// Email Queue Manager

import type {
  EmailJob,
  EmailJobStatus,
  ThrottleConfig,
  MailboxSendingState,
  ScheduleWindow,
  DEFAULT_THROTTLE_CONFIG,
} from './types'

interface QueueOptions {
  throttleConfig?: ThrottleConfig
  scheduleWindows?: ScheduleWindow[]
  timezone?: string
}

// Check if current time is within schedule window
export function isWithinScheduleWindow(
  windows: ScheduleWindow[],
  timezone: string = 'UTC'
): boolean {
  const now = new Date()

  // Convert to timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const dayName = parts.find(p => p.type === 'weekday')?.value
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0')

  const dayMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  }
  const dayOfWeek = dayMap[dayName || 'Mon'] ?? 1

  const window = windows.find(w => w.dayOfWeek === dayOfWeek && w.enabled)

  if (!window) {
    return false
  }

  const currentMinutes = hour * 60 + minute
  const startMinutes = window.startHour * 60 + window.startMinute
  const endMinutes = window.endHour * 60 + window.endMinute

  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

// Calculate next available send time
export function getNextScheduledTime(
  windows: ScheduleWindow[],
  timezone: string = 'UTC',
  minDelaySeconds: number = 60
): Date {
  const now = new Date()
  const minTime = new Date(now.getTime() + minDelaySeconds * 1000)

  // If currently within a window, return min time
  if (isWithinScheduleWindow(windows, timezone)) {
    return minTime
  }

  // Find next available window
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const dayName = parts.find(p => p.type === 'weekday')?.value
  const dayMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  }
  const currentDay = dayMap[dayName || 'Mon'] ?? 1

  // Check next 7 days
  for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
    const checkDay = (currentDay + daysAhead) % 7
    const window = windows.find(w => w.dayOfWeek === checkDay && w.enabled)

    if (window) {
      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() + daysAhead)
      targetDate.setHours(window.startHour, window.startMinute, 0, 0)

      // If this time slot is in the future, use it
      if (targetDate > minTime) {
        return targetDate
      }

      // If it's today but past start time, check if still within window
      if (daysAhead === 0) {
        const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
        const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0')
        const currentMinutes = hour * 60 + minute
        const endMinutes = window.endHour * 60 + window.endMinute

        if (currentMinutes < endMinutes) {
          return minTime
        }
      }
    }
  }

  // Default: return tomorrow at 9 AM
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return tomorrow
}

// Calculate random delay within range
export function calculateDelay(
  minSeconds: number,
  maxSeconds: number
): number {
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds
}

// Check if mailbox is throttled
export function isMailboxThrottled(
  state: MailboxSendingState,
  config: ThrottleConfig
): { throttled: boolean; reason?: string; retryAfter?: number } {
  // Check daily limit
  if (state.sentToday >= config.maxPerDay) {
    return {
      throttled: true,
      reason: 'Daily limit reached',
      retryAfter: getSecondsUntilMidnight(),
    }
  }

  // Check hourly limit
  if (state.sentThisHour >= config.maxPerHour) {
    return {
      throttled: true,
      reason: 'Hourly limit reached',
      retryAfter: getSecondsUntilNextHour(),
    }
  }

  // Check burst limit
  if (state.lastSentAt) {
    const lastSent = new Date(state.lastSentAt)
    const secondsSinceLastSend = (Date.now() - lastSent.getTime()) / 1000

    if (secondsSinceLastSend < config.minDelaySeconds) {
      return {
        throttled: true,
        reason: 'Minimum delay not met',
        retryAfter: Math.ceil(config.minDelaySeconds - secondsSinceLastSend),
      }
    }
  }

  // Check manual throttle
  if (state.isThrottled && state.throttledUntil) {
    const throttleEnd = new Date(state.throttledUntil)
    if (throttleEnd > new Date()) {
      return {
        throttled: true,
        reason: 'Mailbox manually throttled',
        retryAfter: Math.ceil((throttleEnd.getTime() - Date.now()) / 1000),
      }
    }
  }

  return { throttled: false }
}

// Get seconds until midnight
function getSecondsUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000)
}

// Get seconds until next hour
function getSecondsUntilNextHour(): number {
  const now = new Date()
  const nextHour = new Date(now)
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
  return Math.ceil((nextHour.getTime() - now.getTime()) / 1000)
}

// Select best mailbox for sending
export function selectMailbox(
  mailboxes: MailboxSendingState[],
  config: ThrottleConfig
): MailboxSendingState | null {
  // Filter out throttled mailboxes
  const availableMailboxes = mailboxes.filter(m => {
    const { throttled } = isMailboxThrottled(m, config)
    return !throttled
  })

  if (availableMailboxes.length === 0) {
    return null
  }

  // Sort by least used today
  availableMailboxes.sort((a, b) => {
    // Prefer mailboxes with more headroom
    const aHeadroom = a.dailyLimit - a.sentToday
    const bHeadroom = b.dailyLimit - b.sentToday
    return bHeadroom - aHeadroom
  })

  return availableMailboxes[0]
}

// Distribute jobs across mailboxes
export function distributeJobs(
  jobCount: number,
  mailboxes: MailboxSendingState[],
  config: ThrottleConfig
): Map<string, number> {
  const distribution = new Map<string, number>()

  // Initialize distribution
  mailboxes.forEach(m => distribution.set(m.mailboxId, 0))

  // Calculate available capacity for each mailbox
  const capacities = mailboxes.map(m => ({
    mailboxId: m.mailboxId,
    capacity: Math.min(
      config.maxPerDay - m.sentToday,
      config.maxPerHour - m.sentThisHour
    ),
  })).filter(c => c.capacity > 0)

  const totalCapacity = capacities.reduce((sum, c) => sum + c.capacity, 0)

  if (totalCapacity === 0) {
    return distribution
  }

  // Distribute proportionally
  let remaining = Math.min(jobCount, totalCapacity)

  for (const { mailboxId, capacity } of capacities) {
    const share = Math.ceil((capacity / totalCapacity) * jobCount)
    const assigned = Math.min(share, capacity, remaining)
    distribution.set(mailboxId, assigned)
    remaining -= assigned

    if (remaining <= 0) break
  }

  return distribution
}

// Calculate queue statistics
export function calculateQueueStats(jobs: EmailJob[]): {
  pending: number
  scheduled: number
  processing: number
  sent: number
  failed: number
  cancelled: number
} {
  const stats = {
    pending: 0,
    scheduled: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
  }

  for (const job of jobs) {
    switch (job.status) {
      case 'pending':
        stats.pending++
        break
      case 'scheduled':
        stats.scheduled++
        break
      case 'processing':
        stats.processing++
        break
      case 'sent':
        stats.sent++
        break
      case 'failed':
        stats.failed++
        break
      case 'cancelled':
        stats.cancelled++
        break
    }
  }

  return stats
}

// Prioritize jobs for processing
export function prioritizeJobs(jobs: EmailJob[]): EmailJob[] {
  return jobs.sort((a, b) => {
    // Higher priority first
    if (a.priority !== b.priority) {
      return b.priority - a.priority
    }

    // Earlier scheduled time first
    const aTime = new Date(a.scheduledAt).getTime()
    const bTime = new Date(b.scheduledAt).getTime()
    if (aTime !== bTime) {
      return aTime - bTime
    }

    // Fewer attempts first (new jobs get priority)
    return a.attempts - b.attempts
  })
}
