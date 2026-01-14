import type { WarmupTemplate } from './types'

// Natural conversation templates for warmup emails
// These are designed to look like genuine business correspondence

export const WARMUP_TEMPLATES: WarmupTemplate[] = [
  // Business/Professional
  {
    id: 'biz-1',
    category: 'business',
    subject: 'Quick question about your services',
    body: `Hi there,

I came across your company while doing some research and I'm curious about your services.

Do you have time for a quick chat this week?

Best,
{{senderName}}`,
    replyBody: `Hi {{senderName}},

Thanks for reaching out! I'd be happy to chat.

What times work best for you?

Best,
{{recipientName}}`,
    tags: ['inquiry', 'professional'],
  },
  {
    id: 'biz-2',
    category: 'business',
    subject: 'Following up on our conversation',
    body: `Hi {{recipientName}},

Just wanted to follow up on our earlier discussion.

Have you had a chance to review the information I sent over?

Let me know if you have any questions.

Thanks,
{{senderName}}`,
    replyBody: `Hi {{senderName}},

Yes, I looked it over. Everything looks good so far.

I'll let you know if anything comes up.

Thanks,
{{recipientName}}`,
    tags: ['follow-up', 'professional'],
  },
  {
    id: 'biz-3',
    category: 'business',
    subject: 'Checking in',
    body: `Hey {{recipientName}},

Hope you're doing well! Just wanted to check in and see how things are going on your end.

Any updates?

Best,
{{senderName}}`,
    replyBody: `Hey {{senderName}},

Things are going well, thanks for checking in!

Nothing major to report, but I'll keep you posted.

Best,
{{recipientName}}`,
    tags: ['check-in', 'casual'],
  },

  // Networking
  {
    id: 'net-1',
    category: 'networking',
    subject: 'Great connecting with you',
    body: `Hi {{recipientName}},

It was great connecting with you recently. I enjoyed our conversation about {{topic}}.

Would love to stay in touch and maybe grab coffee sometime.

Cheers,
{{senderName}}`,
    replyBody: `Hi {{senderName}},

Likewise! That was a great conversation.

Coffee sounds good - let me know when you're free.

Cheers,
{{recipientName}}`,
    tags: ['networking', 'connection'],
  },
  {
    id: 'net-2',
    category: 'networking',
    subject: 'Thought you might find this interesting',
    body: `Hey {{recipientName}},

I came across this article about {{topic}} and thought of you.

Thought you might find it interesting given our recent conversation.

Let me know what you think!

Best,
{{senderName}}`,
    replyBody: `Hey {{senderName}},

Thanks for sharing! This is really interesting.

I'll give it a read and let you know my thoughts.

Best,
{{recipientName}}`,
    tags: ['sharing', 'networking'],
  },

  // Collaboration
  {
    id: 'collab-1',
    category: 'collaboration',
    subject: 'Project update',
    body: `Hi {{recipientName}},

Just wanted to give you a quick update on the project.

We've made good progress this week and should be on track for the deadline.

Let me know if you need any additional information.

Thanks,
{{senderName}}`,
    replyBody: `Hi {{senderName}},

Great to hear! Thanks for the update.

Keep up the good work - let me know if you need anything from my end.

Thanks,
{{recipientName}}`,
    tags: ['project', 'update'],
  },
  {
    id: 'collab-2',
    category: 'collaboration',
    subject: 'Meeting notes',
    body: `Hi {{recipientName}},

Here are the notes from our meeting today:

- Discussed timeline and milestones
- Agreed on next steps
- Set follow-up for next week

Let me know if I missed anything.

Thanks,
{{senderName}}`,
    replyBody: `Hi {{senderName}},

Thanks for putting this together! Looks accurate to me.

Talk to you next week.

Thanks,
{{recipientName}}`,
    tags: ['meeting', 'notes'],
  },

  // General
  {
    id: 'gen-1',
    category: 'general',
    subject: 'Quick favor',
    body: `Hey {{recipientName}},

Hope you're having a good week!

I was wondering if you could help me with something quick - do you have a moment to chat?

Thanks,
{{senderName}}`,
    replyBody: `Hey {{senderName}},

Sure, I've got a few minutes. What's up?

Let me know how I can help.

Thanks,
{{recipientName}}`,
    tags: ['request', 'help'],
  },
  {
    id: 'gen-2',
    category: 'general',
    subject: 'Thanks!',
    body: `Hi {{recipientName}},

Just wanted to say thanks for your help with {{topic}} - really appreciated it!

Let me know if there's anything I can do to return the favor.

Best,
{{senderName}}`,
    replyBody: `Hi {{senderName}},

You're welcome! Happy to help.

Don't worry about it - that's what colleagues are for.

Best,
{{recipientName}}`,
    tags: ['thanks', 'gratitude'],
  },
  {
    id: 'gen-3',
    category: 'general',
    subject: 'Quick question',
    body: `Hi {{recipientName}},

I have a quick question about {{topic}}.

Do you have a minute to help me out?

Thanks,
{{senderName}}`,
    replyBody: `Hi {{senderName}},

Sure, what's the question?

I'll do my best to help.

Thanks,
{{recipientName}}`,
    tags: ['question', 'help'],
  },

  // Industry-specific
  {
    id: 'ind-1',
    category: 'industry',
    subject: 'Industry news',
    body: `Hey {{recipientName}},

Did you see the latest news about {{topic}}?

Thought it was interesting and wanted to get your take on it.

Best,
{{senderName}}`,
    replyBody: `Hey {{senderName}},

Yes, I saw that! Pretty interesting developments.

What do you think it means for the industry?

Best,
{{recipientName}}`,
    tags: ['news', 'industry'],
  },
  {
    id: 'ind-2',
    category: 'industry',
    subject: 'Conference next month',
    body: `Hi {{recipientName}},

Are you planning to attend the {{topic}} conference next month?

Would be great to catch up in person if you're going.

Let me know!
{{senderName}}`,
    replyBody: `Hi {{senderName}},

Yes, I'm planning to be there! Would love to meet up.

Let's coordinate closer to the date.

Talk soon,
{{recipientName}}`,
    tags: ['conference', 'event'],
  },
]

// Topics for template variables
export const WARMUP_TOPICS = [
  'market trends',
  'industry developments',
  'new technology',
  'the recent project',
  'our collaboration',
  'the upcoming event',
  'business strategy',
  'team productivity',
  'workflow optimization',
  'customer feedback',
  'product updates',
  'service improvements',
  'the proposal',
  'contract details',
  'partnership opportunities',
]

// Get a random template
export function getRandomTemplate(): WarmupTemplate {
  const template = WARMUP_TEMPLATES[Math.floor(Math.random() * WARMUP_TEMPLATES.length)]
  if (!template) throw new Error('No templates available')
  return template
}

// Get a random template by category
export function getTemplateByCategory(category: string): WarmupTemplate | null {
  const templates = WARMUP_TEMPLATES.filter(t => t.category === category)
  if (templates.length === 0) return null
  return templates[Math.floor(Math.random() * templates.length)] ?? null
}

// Get a random topic
export function getRandomTopic(): string {
  return WARMUP_TOPICS[Math.floor(Math.random() * WARMUP_TOPICS.length)] ?? 'updates'
}

// Fill template variables
export function fillTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}

// Generate warmup email content
export function generateWarmupEmail(
  senderName: string,
  senderEmail: string,
  recipientName: string,
  recipientEmail: string,
  isReply: boolean = false
): { subject: string; body: string } {
  const template = getRandomTemplate()
  const topic = getRandomTopic()

  const variables = {
    senderName,
    senderEmail,
    recipientName,
    recipientEmail,
    topic,
  }

  if (isReply && template.replyBody) {
    return {
      subject: `Re: ${fillTemplate(template.subject, variables)}`,
      body: fillTemplate(template.replyBody, variables),
    }
  }

  return {
    subject: fillTemplate(template.subject, variables),
    body: fillTemplate(template.body, variables),
  }
}
