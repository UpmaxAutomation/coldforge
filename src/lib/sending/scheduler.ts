import { addJob } from '@/lib/queue'

export interface ScheduledEmail {
  to: string
  from: string
  subject: string
  body: string
  scheduledAt: Date
  timezone: string
  campaignId?: string
  leadId?: string
}

export async function scheduleEmail(email: ScheduledEmail): Promise<string> {
  const delay = email.scheduledAt.getTime() - Date.now()
  const job = await addJob('EMAIL_SEND', 'scheduled-email', email, { delay: Math.max(0, delay) })
  return job.id || ''
}

export function getNextSendWindow(_timezone: string, preferredHours = { start: 9, end: 17 }): Date {
  const now = new Date()
  // Simple implementation - find next business hour in timezone
  const hour = now.getHours()
  if (hour >= preferredHours.start && hour < preferredHours.end) return now
  const next = new Date(now)
  next.setHours(preferredHours.start, 0, 0, 0)
  if (hour >= preferredHours.end) next.setDate(next.getDate() + 1)
  return next
}

export async function scheduleMultiple(emails: ScheduledEmail[], spreadMinutes = 60): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < emails.length; i++) {
    const baseEmail = emails[i]
    if (!baseEmail) continue
    const email: ScheduledEmail = {
      ...baseEmail,
      scheduledAt: new Date(baseEmail.scheduledAt.getTime() + i * (spreadMinutes * 60000 / emails.length)),
    }
    ids.push(await scheduleEmail(email))
  }
  return ids
}
