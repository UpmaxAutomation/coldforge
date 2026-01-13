// Reply Management Types

export type ReplyCategory =
  | 'interested'
  | 'not_interested'
  | 'out_of_office'
  | 'unsubscribe'
  | 'bounce'
  | 'auto_reply'
  | 'meeting_request'
  | 'question'
  | 'referral'
  | 'other'

export type ReplySentiment = 'positive' | 'neutral' | 'negative'

export type ReplyStatus = 'unread' | 'read' | 'replied' | 'archived' | 'snoozed'

export interface Reply {
  id: string
  organizationId: string
  campaignId: string | null
  leadId: string | null
  mailboxId: string
  threadId: string
  messageId: string
  inReplyTo: string | null
  from: string
  fromName: string | null
  to: string
  subject: string
  bodyText: string
  bodyHtml: string | null
  category: ReplyCategory
  sentiment: ReplySentiment
  status: ReplyStatus
  isAutoDetected: boolean
  snoozedUntil: string | null
  receivedAt: string
  createdAt: string
  updatedAt: string
}

export interface Thread {
  id: string
  organizationId: string
  campaignId: string | null
  leadId: string | null
  mailboxId: string
  subject: string
  participantEmail: string
  participantName: string | null
  messageCount: number
  lastMessageAt: string
  status: 'active' | 'resolved' | 'archived'
  category: ReplyCategory
  sentiment: ReplySentiment
  assignedTo: string | null
  createdAt: string
  updatedAt: string
}

export interface ThreadMessage {
  id: string
  threadId: string
  direction: 'inbound' | 'outbound'
  messageId: string
  from: string
  fromName: string | null
  to: string
  subject: string
  bodyText: string
  bodyHtml: string | null
  sentAt: string
  createdAt: string
}

export interface CategoryKeywords {
  category: ReplyCategory
  keywords: string[]
  patterns: RegExp[]
  sentiment: ReplySentiment
}

export interface AutoCategorization {
  category: ReplyCategory
  sentiment: ReplySentiment
  confidence: number
  matchedKeywords: string[]
}

export interface ReplyFilters {
  campaignId?: string
  mailboxId?: string
  category?: ReplyCategory
  sentiment?: ReplySentiment
  status?: ReplyStatus
  search?: string
  dateFrom?: string
  dateTo?: string
}

export interface InboxStats {
  total: number
  unread: number
  interested: number
  notInterested: number
  outOfOffice: number
  meetingRequests: number
  needsReply: number
  todayReceived: number
}

// Category detection rules
export const CATEGORY_RULES: CategoryKeywords[] = [
  {
    category: 'interested',
    keywords: [
      'interested', 'tell me more', 'sounds good', 'let\'s talk',
      'schedule a call', 'demo', 'pricing', 'would love to',
      'yes please', 'count me in', 'sign me up', 'looking forward',
      'great timing', 'perfect timing', 'reach out', 'contact me'
    ],
    patterns: [
      /\byes\b/i,
      /interested in/i,
      /tell me more/i,
      /learn more/i,
      /sounds interesting/i,
      /let's connect/i,
      /book a (call|meeting|demo)/i,
      /set up a (call|meeting|time)/i
    ],
    sentiment: 'positive'
  },
  {
    category: 'not_interested',
    keywords: [
      'not interested', 'no thanks', 'no thank you', 'remove me',
      'stop emailing', 'don\'t contact', 'not for us', 'not a fit',
      'pass', 'decline', 'wrong person', 'not the right'
    ],
    patterns: [
      /\bnot interested\b/i,
      /no,? thanks?/i,
      /please remove/i,
      /stop (emailing|contacting)/i,
      /not a (good )?fit/i,
      /wrong (person|company|contact)/i,
      /don't (need|want)/i
    ],
    sentiment: 'negative'
  },
  {
    category: 'out_of_office',
    keywords: [
      'out of office', 'ooo', 'on vacation', 'away from',
      'limited access', 'will return', 'back on', 'out of the office',
      'automatic reply', 'auto-reply', 'autoreply'
    ],
    patterns: [
      /out of (the )?office/i,
      /\booo\b/i,
      /on (vacation|holiday|leave)/i,
      /will (be )?return/i,
      /away from (my )?desk/i,
      /limited access to email/i,
      /automatic reply/i,
      /i('m| am) (currently )?(out|away|traveling)/i
    ],
    sentiment: 'neutral'
  },
  {
    category: 'unsubscribe',
    keywords: [
      'unsubscribe', 'remove from list', 'opt out', 'stop sending',
      'take me off', 'remove my email', 'delete my email'
    ],
    patterns: [
      /unsubscribe/i,
      /remove (me )?from (your )?(list|mailing)/i,
      /opt[- ]?out/i,
      /stop sending/i,
      /take me off/i,
      /gdpr/i,
      /do not (contact|email)/i
    ],
    sentiment: 'negative'
  },
  {
    category: 'meeting_request',
    keywords: [
      'meet', 'meeting', 'calendar', 'schedule', 'call',
      'availability', 'free time', 'this week', 'next week'
    ],
    patterns: [
      /schedule a (call|meeting)/i,
      /book a (time|slot|meeting)/i,
      /what('s| is) your availability/i,
      /are you (free|available)/i,
      /let's (meet|connect|chat)/i,
      /set up (a )?(time|meeting|call)/i,
      /calendly/i,
      /pick a time/i
    ],
    sentiment: 'positive'
  },
  {
    category: 'question',
    keywords: [
      'question', 'how does', 'what is', 'can you explain',
      'more information', 'clarify', 'wondering'
    ],
    patterns: [
      /\?$/m,
      /can you (tell|explain|clarify)/i,
      /how (does|do|would)/i,
      /what (is|are|would)/i,
      /i('m| am) wondering/i,
      /could you (explain|clarify|tell)/i,
      /more (info|information|details)/i
    ],
    sentiment: 'neutral'
  },
  {
    category: 'referral',
    keywords: [
      'reach out to', 'contact instead', 'speak with', 'talk to',
      'better person', 'right person', 'forward this', 'cc\'d'
    ],
    patterns: [
      /reach out to/i,
      /contact .+ instead/i,
      /speak with/i,
      /talk to/i,
      /(better|right) person (would be|is)/i,
      /forward(ed|ing)? (this|your email) to/i,
      /cc['']?d/i,
      /copied .+ on this/i
    ],
    sentiment: 'neutral'
  },
  {
    category: 'bounce',
    keywords: [
      'delivery failed', 'undeliverable', 'mailbox not found',
      'user unknown', 'address rejected', 'permanent failure'
    ],
    patterns: [
      /delivery (status notification|failed|failure)/i,
      /undeliverable/i,
      /mailbox (not found|unavailable)/i,
      /user (unknown|not found)/i,
      /address rejected/i,
      /permanent failure/i,
      /550/
    ],
    sentiment: 'negative'
  },
  {
    category: 'auto_reply',
    keywords: [
      'auto-reply', 'automatic response', 'automated message',
      'do not reply', 'noreply', 'no-reply'
    ],
    patterns: [
      /auto[- ]?reply/i,
      /automatic (response|message)/i,
      /automated (response|message|email)/i,
      /this is an automated/i,
      /do not reply/i,
      /no[- ]?reply/i
    ],
    sentiment: 'neutral'
  }
]

// Auto-categorization function
export function autoCategorize(
  subject: string,
  body: string
): AutoCategorization {
  const text = `${subject} ${body}`.toLowerCase()
  const matchedKeywords: string[] = []
  let bestMatch: { category: ReplyCategory; sentiment: ReplySentiment; score: number } = {
    category: 'other',
    sentiment: 'neutral',
    score: 0
  }

  for (const rule of CATEGORY_RULES) {
    let score = 0
    const ruleMatches: string[] = []

    // Check keywords
    for (const keyword of rule.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1
        ruleMatches.push(keyword)
      }
    }

    // Check patterns (patterns worth more)
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        score += 2
        ruleMatches.push(pattern.source)
      }
    }

    if (score > bestMatch.score) {
      bestMatch = {
        category: rule.category,
        sentiment: rule.sentiment,
        score
      }
      matchedKeywords.push(...ruleMatches)
    }
  }

  // Calculate confidence based on score
  const confidence = Math.min(bestMatch.score / 5, 1)

  return {
    category: bestMatch.category,
    sentiment: bestMatch.sentiment,
    confidence,
    matchedKeywords: [...new Set(matchedKeywords)]
  }
}

// Thread building utilities
export function extractThreadId(headers: Record<string, string>): string {
  // Try to get thread ID from headers
  const references = headers['references'] || ''
  const inReplyTo = headers['in-reply-to'] || ''

  // Use the first message ID in references or in-reply-to
  const firstRef = references.split(/\s+/)[0] || inReplyTo

  // If no reference, generate from subject
  if (!firstRef) {
    const subject = (headers['subject'] || '')
      .replace(/^(re|fwd|fw):\s*/gi, '')
      .trim()
    return `thread-${Buffer.from(subject).toString('base64').slice(0, 32)}`
  }

  return firstRef.replace(/[<>]/g, '')
}

export function normalizeSubject(subject: string): string {
  // Remove RE:, FW:, FWD: prefixes
  return subject
    .replace(/^(re|fwd?|fw):\s*/gi, '')
    .trim()
}
