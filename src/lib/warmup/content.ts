// Warmup Email Content Generator
// Generates natural-looking email content for warmup emails

// Content categories for variety
const CONTENT_CATEGORIES = [
  'meeting',
  'project',
  'follow-up',
  'question',
  'networking',
  'sharing',
  'check-in',
  'thanks',
] as const

type ContentCategory = typeof CONTENT_CATEGORIES[number]

// Subject line templates by category
const SUBJECT_TEMPLATES: Record<ContentCategory, string[]> = {
  meeting: [
    'Quick sync this week?',
    'Can we schedule a call?',
    'Meeting request',
    'Let\'s connect',
    'Time for a quick chat?',
    'Availability check',
    'Brief call request',
    'Schedule a catch-up?',
  ],
  project: [
    'Project update',
    'Quick update on progress',
    'Status check',
    'Progress report',
    'Update on the initiative',
    'Where we stand',
    'Current status',
    'Brief update',
  ],
  'follow-up': [
    'Following up',
    'Quick follow-up',
    'Circling back',
    'Just checking in',
    'Quick reminder',
    'Touching base',
    'Re: our conversation',
    'As discussed',
  ],
  question: [
    'Quick question',
    'Need your input',
    'Your thoughts?',
    'Question for you',
    'Brief question',
    'Your expertise needed',
    'Your opinion?',
    'Help with something',
  ],
  networking: [
    'Great connecting!',
    'Nice meeting you',
    'Good to connect',
    'Enjoyed our chat',
    'Thanks for connecting',
    'Following up from the event',
    'Let\'s stay in touch',
    'Great to meet',
  ],
  sharing: [
    'Thought you\'d find this interesting',
    'Check this out',
    'Something relevant',
    'Worth a look',
    'Interesting read',
    'FYI',
    'Sharing this with you',
    'You might like this',
  ],
  'check-in': [
    'How are things?',
    'Checking in',
    'How\'s everything going?',
    'Quick check-in',
    'Hope all is well',
    'Catching up',
    'How\'s your week?',
    'Any updates?',
  ],
  thanks: [
    'Thank you!',
    'Much appreciated',
    'Thanks again',
    'Grateful for your help',
    'Thank you so much',
    'Really appreciate it',
    'Thanks for everything',
    'Many thanks',
  ],
}

// Body templates by category (with placeholders)
const BODY_TEMPLATES: Record<ContentCategory, string[]> = {
  meeting: [
    `Hi there,

Hope you're doing well! I was wondering if you'd have some time this week for a quick call? I'd love to catch up and discuss a few things.

Let me know what times work best for you.

Best regards`,

    `Hi,

Would you be available for a brief meeting sometime this week? I have a few things I'd like to discuss with you.

Feel free to suggest a time that works for your schedule.

Thanks`,

    `Hello,

I hope this email finds you well. I wanted to reach out and see if we could schedule a quick sync-up call. There are a few topics I'd like to go over with you.

Please let me know your availability.

Best`,

    `Hi,

I was thinking it would be great to connect and chat about some upcoming work. Do you have 15-20 minutes sometime this week?

Looking forward to hearing from you.

Thanks`,
  ],
  project: [
    `Hi,

Just wanted to give you a quick update on the current status. Things are progressing well and we're on track with our timeline.

I'll keep you posted on any developments. Let me know if you have any questions.

Best`,

    `Hello,

Thought I'd share a brief update on where we stand. We've made good progress this week and are moving forward with the next phase.

Happy to discuss further if you'd like more details.

Thanks`,

    `Hi there,

Quick update from my end - everything is moving along nicely. We've completed most of the initial work and are now focusing on the next steps.

Feel free to reach out if you need more information.

Best regards`,

    `Hi,

I wanted to keep you in the loop on our progress. We're making steady headway and should have more concrete results to share soon.

Let me know if you have any questions or concerns.

Thanks`,
  ],
  'follow-up': [
    `Hi,

Just wanted to follow up on our previous conversation. Have you had a chance to think about what we discussed?

No rush - just wanted to check in.

Best`,

    `Hi there,

Circling back on our earlier discussion. I'm still interested in moving forward when you're ready.

Let me know your thoughts.

Thanks`,

    `Hello,

Following up on the items we talked about. Wanted to see if there's anything else you need from my end.

Looking forward to hearing from you.

Best`,

    `Hi,

Just checking in to see if you've had time to review the information I sent. Happy to answer any questions you might have.

Thanks`,
  ],
  question: [
    `Hi,

I have a quick question for you. When you get a chance, could you help me with something? It shouldn't take too long.

Thanks in advance!`,

    `Hello,

Hope you're having a good week. I was wondering if you could give me your input on something? Your expertise would be really helpful.

Best`,

    `Hi there,

I'm working on something and could use your perspective. Do you have a few minutes to help me think through a question?

Thanks!`,

    `Hi,

Quick question for you - I've been thinking about something and I think you'd have good insight. Would you mind sharing your thoughts?

Thanks`,
  ],
  networking: [
    `Hi,

It was great connecting with you! I really enjoyed our conversation and hope we can stay in touch.

Looking forward to keeping the dialogue going.

Best`,

    `Hello,

Thanks for connecting! I found our discussion really interesting and would love to continue the conversation sometime.

Hope to talk again soon!`,

    `Hi there,

Nice meeting you! I appreciated our chat and think there could be some good opportunities to collaborate in the future.

Let's stay in touch.

Best`,

    `Hi,

Good to connect! I enjoyed learning more about what you're working on. Would be great to grab coffee sometime and continue our discussion.

Talk soon`,
  ],
  sharing: [
    `Hi,

I came across something interesting that made me think of you. Thought you might find it relevant to what we discussed.

Let me know what you think!

Best`,

    `Hello,

Saw this and thought of you - figured it might be useful or at least interesting. Take a look when you have a chance.

Hope it helps!`,

    `Hi there,

I wanted to share something with you that I think you'll find interesting. It relates to what we talked about before.

Let me know your thoughts!

Thanks`,

    `Hi,

Just came across this and thought I'd pass it along. Seemed relevant to your work and I know you'd appreciate it.

Best`,
  ],
  'check-in': [
    `Hi,

Just wanted to check in and see how things are going on your end. Hope everything is well!

Let me know if there's anything I can help with.

Best`,

    `Hello,

Hope you're doing well! Just thought I'd reach out and see how things are progressing. Any updates?

Looking forward to hearing from you.

Thanks`,

    `Hi there,

Checking in to see how everything is going. It's been a while since we last touched base and I wanted to make sure all is well.

Talk soon!`,

    `Hi,

Hope you're having a good week! Just wanted to say hello and see how things are going on your end.

Let me know if you need anything.

Best`,
  ],
  thanks: [
    `Hi,

I just wanted to take a moment to say thank you! I really appreciate your help and it made a big difference.

Thanks again!`,

    `Hello,

Thank you so much for your assistance! It was incredibly helpful and I'm grateful for your time.

Best regards`,

    `Hi there,

I wanted to express my gratitude for your help. It meant a lot and I couldn't have done it without you.

Thanks again!`,

    `Hi,

Just a quick note to say thanks for everything. Your support has been invaluable and I truly appreciate it.

Best`,
  ],
}

// Reply templates
const REPLY_TEMPLATES: string[] = [
  `Hi,

Thanks for reaching out! That sounds great. Let me look at my calendar and get back to you with some times.

Talk soon`,

  `Hello,

Thanks for the update! Good to hear things are progressing well. Keep me posted on any developments.

Best`,

  `Hi there,

Appreciate you following up! I've been meaning to get back to you. Let me review everything and I'll be in touch shortly.

Thanks`,

  `Hi,

Thanks for thinking of me! This looks really interesting. I'll take a closer look when I have a moment.

Best`,

  `Hello,

Thanks for checking in! Things are going well on my end. I'll have some updates to share with you soon.

Talk soon`,

  `Hi,

Thank you for your message! I'd be happy to help with that. Let me know the best way to proceed.

Thanks`,

  `Hi there,

Got your message - thanks! I'll review the details and circle back with you by end of week.

Best`,

  `Hello,

Thanks for reaching out! I'm glad we connected. Let's definitely keep this conversation going.

Best regards`,
]

// Signature variations
const SIGNATURES: string[] = [
  '',
  '\n\nBest',
  '\n\nBest regards',
  '\n\nThanks',
  '\n\nCheers',
  '\n\nTalk soon',
  '\n\nBest,',
  '\n\nThanks!',
]

/**
 * Get a random item from an array
 */
function getRandomItem<T>(array: T[]): T {
  const index = Math.floor(Math.random() * array.length)
  return array[index] as T
}

/**
 * Get a random category
 */
function getRandomCategory(): ContentCategory {
  return getRandomItem([...CONTENT_CATEGORIES])
}

/**
 * Generate natural-looking warmup email content
 * Content is conversational, variable length, and includes questions
 */
export function generateWarmupContent(): {
  subject: string
  body: string
} {
  const category = getRandomCategory()
  const subjects = SUBJECT_TEMPLATES[category]
  const bodies = BODY_TEMPLATES[category]

  const subject = getRandomItem(subjects)
  let body = getRandomItem(bodies)

  // Randomly add a signature (50% chance it already has one)
  if (Math.random() > 0.5 && !body.endsWith('Best') && !body.endsWith('Thanks')) {
    body += getRandomItem(SIGNATURES)
  }

  // Add slight variations
  body = addVariations(body)

  return {
    subject,
    body,
  }
}

/**
 * Generate reply content
 */
export function generateReplyContent(originalSubject: string): {
  subject: string
  body: string
} {
  let body = getRandomItem(REPLY_TEMPLATES)

  // Add slight variations
  body = addVariations(body)

  // Handle subject line
  const subject = originalSubject.startsWith('Re:')
    ? originalSubject
    : `Re: ${originalSubject}`

  return {
    subject,
    body,
  }
}

/**
 * Add natural variations to text
 */
function addVariations(text: string): string {
  let result = text

  // Random greeting variations
  const greetingVariations: Record<string, string[]> = {
    'Hi,': ['Hi,', 'Hey,', 'Hello,', 'Hi there,'],
    'Hello,': ['Hello,', 'Hi,', 'Hi there,', 'Hey,'],
    'Hi there,': ['Hi there,', 'Hi,', 'Hello,', 'Hey there,'],
  }

  // Apply random greeting change (30% chance)
  if (Math.random() < 0.3) {
    for (const [greeting, variations] of Object.entries(greetingVariations)) {
      if (result.startsWith(greeting)) {
        result = result.replace(greeting, getRandomItem(variations))
        break
      }
    }
  }

  // Random punctuation variations (20% chance to remove exclamation)
  if (Math.random() < 0.2) {
    result = result.replace(/!/g, '.')
  }

  // Random whitespace/newline variations
  if (Math.random() < 0.1) {
    result = result.replace(/\n\n/g, '\n')
  }

  return result
}

/**
 * Generate content for specific category (useful for testing)
 */
export function generateContentForCategory(category: ContentCategory): {
  subject: string
  body: string
} {
  const subjects = SUBJECT_TEMPLATES[category]
  const bodies = BODY_TEMPLATES[category]

  return {
    subject: getRandomItem(subjects),
    body: getRandomItem(bodies),
  }
}

/**
 * Get all available categories
 */
export function getContentCategories(): ContentCategory[] {
  return [...CONTENT_CATEGORIES]
}

/**
 * Check if content looks natural (basic heuristics)
 */
export function isContentNatural(subject: string, body: string): boolean {
  // Check minimum lengths
  if (subject.length < 5 || body.length < 50) {
    return false
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /click here/i,
    /buy now/i,
    /limited time/i,
    /act now/i,
    /free money/i,
    /congratulations/i,
    /you have won/i,
    /urgent/i,
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(subject) || pattern.test(body)) {
      return false
    }
  }

  // Check body has proper structure (greeting, content, closing)
  const hasGreeting = /^(hi|hello|hey|good\s*(morning|afternoon|evening))/i.test(body)
  const hasClosing = /(best|thanks|regards|cheers|talk soon)\s*$/im.test(body)

  return hasGreeting && hasClosing
}

/**
 * Generate a batch of unique content items
 */
export function generateContentBatch(count: number): Array<{ subject: string; body: string }> {
  const content: Array<{ subject: string; body: string }> = []
  const usedSubjects = new Set<string>()

  while (content.length < count) {
    const item = generateWarmupContent()

    // Avoid duplicate subjects in the same batch
    if (!usedSubjects.has(item.subject)) {
      usedSubjects.add(item.subject)
      content.push(item)
    }
  }

  return content
}
