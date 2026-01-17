/**
 * Message Parser
 *
 * Utilities for parsing, normalizing, and grouping email messages
 * from different providers into a unified format.
 */

import type { InboxMessage, EmailAddress } from './types'
import { autoCategorize, normalizeSubject } from '@/lib/replies/types'

/**
 * Thread representation with grouped messages
 */
export interface ThreadGroup {
  threadId: string
  subject: string
  participants: EmailAddress[]
  messages: InboxMessage[]
  messageCount: number
  lastMessageAt: Date
  firstMessageAt: Date
  hasUnread: boolean
  preview: string
  labels: string[]
}

/**
 * Normalized message for database storage
 */
export interface NormalizedMessage {
  // Core IDs
  id: string
  externalId: string
  accountId: string
  organizationId: string
  threadId: string

  // Headers
  messageId: string
  inReplyTo: string | null
  references: string[]

  // Addresses
  fromEmail: string
  fromName: string | null
  toEmails: string[]
  ccEmails: string[]

  // Content
  subject: string
  bodyText: string
  bodyHtml: string | null
  snippet: string

  // Status
  isRead: boolean
  direction: 'inbound' | 'outbound'

  // Category (auto-detected)
  category: string
  sentiment: string
  categoryConfidence: number

  // Timestamps
  receivedAt: Date
  internalDate: Date

  // Metadata
  hasAttachments: boolean
  provider: 'google' | 'microsoft' | 'smtp'
  rawData: Record<string, unknown>
}

/**
 * Normalize a message to unified database format
 */
export function normalizeMessage(message: InboxMessage): NormalizedMessage {
  // Auto-categorize the message
  const categorization = autoCategorize(message.subject, message.bodyText)

  // Generate consistent thread ID
  const threadId = extractThreadId(message)

  return {
    id: message.id,
    externalId: message.externalId,
    accountId: message.accountId,
    organizationId: message.organizationId,
    threadId,

    messageId: message.messageId,
    inReplyTo: message.inReplyTo,
    references: message.references,

    fromEmail: message.from.email,
    fromName: message.from.name,
    toEmails: message.to.map((t) => t.email),
    ccEmails: message.cc.map((c) => c.email),

    subject: message.subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    snippet: message.snippet || message.bodyText.substring(0, 200),

    isRead: message.isRead,
    direction: message.direction,

    category: categorization.category,
    sentiment: categorization.sentiment,
    categoryConfidence: categorization.confidence,

    receivedAt: message.receivedAt,
    internalDate: message.internalDate,

    hasAttachments: message.hasAttachments,
    provider: message.provider,
    rawData: {
      labels: message.labels,
      isStarred: message.isStarred,
      attachments: message.attachments,
      rawHeaders: message.rawHeaders,
    },
  }
}

/**
 * Extract or generate a consistent thread ID from a message
 */
export function extractThreadId(message: InboxMessage): string {
  // Priority 1: Use in-reply-to header (original message ID)
  if (message.inReplyTo) {
    return message.inReplyTo.replace(/[<>]/g, '')
  }

  // Priority 2: Use first reference
  if (message.references.length > 0 && message.references[0]) {
    return message.references[0].replace(/[<>]/g, '')
  }

  // Priority 3: Use provider's thread ID
  if (message.threadExternalId) {
    return `${message.provider}_${message.threadExternalId}`
  }

  // Priority 4: Generate from normalized subject + from address
  const normalizedSubject = normalizeSubject(message.subject)
  const participantKey = [message.from.email, ...message.to.map((t) => t.email)]
    .sort()
    .join('|')

  const uniqueKey = `${normalizedSubject}|${participantKey}`
  return `generated_${hashString(uniqueKey)}`
}

/**
 * Group messages into threads
 */
export function extractThreads(messages: InboxMessage[]): Map<string, ThreadGroup> {
  const threads = new Map<string, ThreadGroup>()

  for (const message of messages) {
    const threadId = extractThreadId(message)

    if (threads.has(threadId)) {
      const thread = threads.get(threadId)!

      // Add message to thread
      thread.messages.push(message)
      thread.messageCount++

      // Update thread metadata
      if (message.receivedAt > thread.lastMessageAt) {
        thread.lastMessageAt = message.receivedAt
        thread.preview = message.snippet || message.bodyText.substring(0, 200)
      }
      if (message.receivedAt < thread.firstMessageAt) {
        thread.firstMessageAt = message.receivedAt
      }

      // Track unread status
      if (!message.isRead) {
        thread.hasUnread = true
      }

      // Add participants
      addParticipant(thread.participants, message.from)
      message.to.forEach((to) => addParticipant(thread.participants, to))

      // Merge labels
      for (const label of message.labels) {
        if (!thread.labels.includes(label)) {
          thread.labels.push(label)
        }
      }
    } else {
      // Create new thread
      const participants: EmailAddress[] = [message.from]
      message.to.forEach((to) => addParticipant(participants, to))
      message.cc.forEach((cc) => addParticipant(participants, cc))

      threads.set(threadId, {
        threadId,
        subject: normalizeSubject(message.subject) || message.subject,
        participants,
        messages: [message],
        messageCount: 1,
        lastMessageAt: message.receivedAt,
        firstMessageAt: message.receivedAt,
        hasUnread: !message.isRead,
        preview: message.snippet || message.bodyText.substring(0, 200),
        labels: [...message.labels],
      })
    }
  }

  // Sort messages within each thread by date
  for (const thread of threads.values()) {
    thread.messages.sort(
      (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()
    )
  }

  return threads
}

/**
 * Add participant to list if not already present
 */
function addParticipant(participants: EmailAddress[], address: EmailAddress): void {
  if (!participants.some((p) => p.email.toLowerCase() === address.email.toLowerCase())) {
    participants.push(address)
  }
}

/**
 * Parse email content with proper encoding handling
 */
export function parseEmailContent(
  content: string,
  encoding?: string,
  charset?: string
): string {
  let decoded = content

  // Handle content transfer encoding
  if (encoding) {
    switch (encoding.toLowerCase()) {
      case 'base64':
        try {
          decoded = Buffer.from(content.replace(/\s/g, ''), 'base64').toString(
            (charset || 'utf-8') as BufferEncoding
          )
        } catch {
          // Keep original if decoding fails
        }
        break

      case 'quoted-printable':
        decoded = decodeQuotedPrintable(content)
        break

      case '7bit':
      case '8bit':
      case 'binary':
        // These don't need special decoding
        break
    }
  }

  // Handle charset conversion
  if (charset && charset.toLowerCase() !== 'utf-8') {
    try {
      decoded = Buffer.from(decoded, 'latin1').toString('utf-8')
    } catch {
      // Keep as-is if conversion fails
    }
  }

  return decoded
}

/**
 * Decode quoted-printable encoded string
 */
function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, '') // Remove soft line breaks
    .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
}

/**
 * Extract plain text from HTML
 */
export function stripHtmlToText(html: string): string {
  return html
    // Remove style and script tags with content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Convert line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim()
}

/**
 * Parse email address from string
 */
export function parseEmailAddress(raw: string): EmailAddress {
  // Format: "Name <email@example.com>" or "email@example.com"
  const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/i)
  if (match) {
    return {
      email: match[2]?.trim().toLowerCase() || raw.trim().toLowerCase(),
      name: match[1]?.trim() || null,
    }
  }
  return { email: raw.trim().toLowerCase(), name: null }
}

/**
 * Parse multiple email addresses from comma-separated string
 */
export function parseEmailAddresses(raw: string): EmailAddress[] {
  if (!raw) return []

  const addresses: string[] = []
  let current = ''
  let inQuotes = false
  let depth = 0

  for (const char of raw) {
    if (char === '"' && depth === 0) {
      inQuotes = !inQuotes
    }
    if (char === '<') depth++
    if (char === '>') depth--

    if (char === ',' && !inQuotes && depth === 0) {
      if (current.trim()) {
        addresses.push(current.trim())
      }
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    addresses.push(current.trim())
  }

  return addresses.map(parseEmailAddress)
}

/**
 * Simple hash function for string
 */
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Check if two messages are likely duplicates
 */
export function isDuplicateMessage(
  existing: InboxMessage | NormalizedMessage,
  incoming: InboxMessage
): boolean {
  // Same message ID
  if (existing.messageId === incoming.messageId) {
    return true
  }

  // Same external ID from same provider
  if (
    existing.externalId === incoming.externalId &&
    existing.provider === incoming.provider
  ) {
    return true
  }

  // Same ID format
  if (existing.id === incoming.id) {
    return true
  }

  return false
}

/**
 * Merge updates into existing message
 */
export function mergeMessageUpdates(
  existing: NormalizedMessage,
  incoming: InboxMessage
): Partial<NormalizedMessage> {
  const updates: Partial<NormalizedMessage> = {}

  // Update read status
  if (existing.isRead !== incoming.isRead) {
    updates.isRead = incoming.isRead
  }

  // Update body if it was truncated before
  if (
    incoming.bodyText.length > existing.bodyText.length ||
    (incoming.bodyHtml && !existing.bodyHtml)
  ) {
    updates.bodyText = incoming.bodyText
    updates.bodyHtml = incoming.bodyHtml
  }

  // Update category if confidence is higher
  const newCategorization = autoCategorize(incoming.subject, incoming.bodyText)
  if (newCategorization.confidence > existing.categoryConfidence) {
    updates.category = newCategorization.category
    updates.sentiment = newCategorization.sentiment
    updates.categoryConfidence = newCategorization.confidence
  }

  return updates
}

/**
 * Get display name for a thread participant
 */
export function getParticipantDisplayName(participants: EmailAddress[]): string {
  if (participants.length === 0) {
    return 'Unknown'
  }

  const primary = participants[0]
  if (!primary) {
    return 'Unknown'
  }

  if (primary.name) {
    if (participants.length > 1) {
      return `${primary.name} (+${participants.length - 1})`
    }
    return primary.name
  }

  // Use email username
  const username = primary.email.split('@')[0] || primary.email
  if (participants.length > 1) {
    return `${username} (+${participants.length - 1})`
  }
  return username
}

/**
 * Calculate conversation metrics
 */
export function calculateThreadMetrics(thread: ThreadGroup): {
  responseTime: number | null
  messageFrequency: number
  participantCount: number
  isActive: boolean
} {
  const messages = thread.messages
  let responseTime: number | null = null

  // Calculate average response time
  if (messages.length >= 2) {
    let totalResponseTime = 0
    let responseCount = 0

    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1]
      const curr = messages[i]

      // Only count if it's a response (different sender)
      if (prev && curr && prev.from.email !== curr.from.email) {
        totalResponseTime += curr.receivedAt.getTime() - prev.receivedAt.getTime()
        responseCount++
      }
    }

    if (responseCount > 0) {
      responseTime = totalResponseTime / responseCount / (1000 * 60 * 60) // In hours
    }
  }

  // Message frequency (messages per day)
  const daysDiff =
    (thread.lastMessageAt.getTime() - thread.firstMessageAt.getTime()) /
    (1000 * 60 * 60 * 24)
  const messageFrequency = daysDiff > 0 ? thread.messageCount / daysDiff : 0

  // Is active (had activity in last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const isActive = thread.lastMessageAt > sevenDaysAgo

  return {
    responseTime,
    messageFrequency,
    participantCount: thread.participants.length,
    isActive,
  }
}
