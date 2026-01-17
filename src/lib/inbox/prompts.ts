// AI Categorization Prompts for Email Classification

import type { MessageCategory, MessageSentiment } from './types'

export interface CategorizationPromptParams {
  subject: string
  body: string
  fromEmail: string
  fromName?: string | null
}

/**
 * System prompt for email categorization
 * Instructs the AI on how to analyze and classify emails
 */
export const CATEGORIZATION_SYSTEM_PROMPT = `You are an expert email classifier for a sales outreach platform. Your task is to analyze incoming email replies and categorize them accurately.

You must classify each email into exactly ONE of the following categories:

1. INTERESTED - The recipient expresses positive interest:
   - Wants to learn more about the product/service
   - Asks questions about pricing, features, or availability
   - Requests a demo, call, or meeting
   - Says "yes", "sounds good", "let's talk", etc.
   - Refers you to the right person to speak with
   - Forward-referrals with positive framing

2. NOT_INTERESTED - The recipient explicitly declines:
   - Says "not interested", "no thanks", "pass"
   - Requests to be removed from the list
   - Expresses frustration or annoyance
   - States your product/service is not relevant
   - Already uses a competitor and won't switch
   - Company policy against such outreach

3. MAYBE - The recipient is neutral or timing is wrong:
   - "Not right now but maybe later"
   - "Check back in Q2/next month/after budget cycle"
   - "We're evaluating options"
   - "Send more information" (without enthusiasm)
   - Non-committal responses
   - "Let me think about it"

4. OUT_OF_OFFICE - Automated vacation/absence replies:
   - "I am out of the office"
   - "On vacation until..."
   - "Away from my desk"
   - "Limited access to email"
   - Includes return date typically
   - May provide alternative contact

5. AUTO_REPLY - Generic automated responses (NOT out of office):
   - "Thank you for your email"
   - "Your message has been received"
   - "This inbox is not monitored"
   - System-generated acknowledgments
   - Help desk ticket confirmations
   - "Do not reply to this email"

6. BOUNCED - Delivery failures:
   - "Mail delivery failed"
   - "Address not found"
   - "Mailbox unavailable"
   - "User unknown"
   - "550" or "5xx" error codes
   - "Permanent failure"
   - "Undeliverable"

7. UNCATEGORIZED - When you truly cannot determine:
   - Completely irrelevant content
   - Garbled or encrypted text
   - Foreign language you can't parse
   - Only use as last resort

IMPORTANT GUIDELINES:
- Look beyond keywords - understand context and intent
- Forwarded emails with positive introductions = INTERESTED
- Questions about unsubscribing = NOT_INTERESTED (not MAYBE)
- "Who should I talk to?" = INTERESTED (they want to redirect)
- Ignore email signatures and boilerplate text
- A single word "Yes" or "Sure" = INTERESTED
- Focus on the actual human response, not automated footers
- When in doubt between MAYBE and NOT_INTERESTED, check for explicit rejection language
- Professional rejections are still NOT_INTERESTED`

/**
 * User prompt template for individual email classification
 */
export function buildCategorizationPrompt(params: CategorizationPromptParams): string {
  const { subject, body, fromEmail, fromName } = params

  const senderInfo = fromName
    ? `${fromName} <${fromEmail}>`
    : fromEmail

  return `Analyze this email reply and classify it.

FROM: ${senderInfo}
SUBJECT: ${subject}
BODY:
---
${body}
---

Respond with a JSON object containing:
{
  "category": "interested" | "not_interested" | "maybe" | "out_of_office" | "auto_reply" | "bounced" | "uncategorized",
  "confidence": <number between 0.0 and 1.0>,
  "sentiment": "positive" | "neutral" | "negative",
  "reasoning": "<brief explanation of why this category>",
  "signals": ["<list of key phrases/signals that led to this classification>"]
}

Be decisive. If the email clearly fits a category, use high confidence (0.85+). Only use lower confidence when genuinely ambiguous.`
}

/**
 * Few-shot examples for improved accuracy
 * These are included in the system prompt for Claude
 */
export const CATEGORIZATION_EXAMPLES = [
  {
    email: {
      subject: "Re: Quick question about your cold email tool",
      body: "Hey! Yes, I'd love to learn more. Can you send me some pricing info? Also curious about integrations with HubSpot.",
      from: "john@company.com"
    },
    expected: {
      category: "interested" as MessageCategory,
      confidence: 0.95,
      sentiment: "positive" as MessageSentiment,
      reasoning: "Explicitly requests more info and asks about pricing and integrations",
      signals: ["love to learn more", "pricing info", "curious about integrations"]
    }
  },
  {
    email: {
      subject: "Re: Partnership opportunity",
      body: "Thanks for reaching out, but we're not looking for any new tools at the moment. Please remove me from your list.",
      from: "sarah@startup.io"
    },
    expected: {
      category: "not_interested" as MessageCategory,
      confidence: 0.92,
      sentiment: "negative" as MessageSentiment,
      reasoning: "Explicitly states not looking for tools and requests removal",
      signals: ["not looking for", "remove me from your list"]
    }
  },
  {
    email: {
      subject: "Re: Scaling your outreach",
      body: "Interesting timing - we're actually reviewing our sales stack for next quarter. Can you check back with me in February?",
      from: "mike@enterprise.com"
    },
    expected: {
      category: "maybe" as MessageCategory,
      confidence: 0.88,
      sentiment: "neutral" as MessageSentiment,
      reasoning: "Shows interest but explicitly asks to follow up later",
      signals: ["reviewing our sales stack", "check back in February"]
    }
  },
  {
    email: {
      subject: "Out of Office: Re: Quick question",
      body: "Hi, I'm currently out of the office with limited access to email until January 20th. For urgent matters, please contact my colleague Dave at dave@company.com. I'll respond to your email upon my return. Best, Tom",
      from: "tom@company.com"
    },
    expected: {
      category: "out_of_office" as MessageCategory,
      confidence: 0.98,
      sentiment: "neutral" as MessageSentiment,
      reasoning: "Standard OOO auto-reply with return date and alternative contact",
      signals: ["out of the office", "limited access", "until January 20th", "upon my return"]
    }
  },
  {
    email: {
      subject: "Re: Collaboration proposal",
      body: "Thank you for your email. This is an automated response to confirm we have received your message. A member of our team will review and respond within 2-3 business days.",
      from: "noreply@bigcorp.com"
    },
    expected: {
      category: "auto_reply" as MessageCategory,
      confidence: 0.95,
      sentiment: "neutral" as MessageSentiment,
      reasoning: "Generic automated acknowledgment email from noreply address",
      signals: ["automated response", "confirm we have received", "noreply"]
    }
  },
  {
    email: {
      subject: "Mail delivery failed: returning message to sender",
      body: "This message was created automatically by mail delivery software. A message that you sent could not be delivered to one or more of its recipients. The following address(es) failed: recipient@invalid.com - 550 5.1.1 The email account that you tried to reach does not exist.",
      from: "mailer-daemon@googlemail.com"
    },
    expected: {
      category: "bounced" as MessageCategory,
      confidence: 0.99,
      sentiment: "negative" as MessageSentiment,
      reasoning: "Email delivery failure notification with 550 error",
      signals: ["mail delivery failed", "could not be delivered", "550 5.1.1", "does not exist"]
    }
  },
  {
    email: {
      subject: "Re: Introduction",
      body: "I'm not the right person for this, but you should reach out to our Head of Sales, Jennifer Martinez. She handles all vendor relationships. Her email is jmartinez@company.com. Good luck!",
      from: "receptionist@company.com"
    },
    expected: {
      category: "interested" as MessageCategory,
      confidence: 0.85,
      sentiment: "positive" as MessageSentiment,
      reasoning: "Positive referral to decision maker with contact info",
      signals: ["reach out to", "handles all vendor relationships", "her email is", "good luck"]
    }
  },
  {
    email: {
      subject: "Re: Demo request",
      body: "No.",
      from: "ceo@startup.com"
    },
    expected: {
      category: "not_interested" as MessageCategory,
      confidence: 0.90,
      sentiment: "negative" as MessageSentiment,
      reasoning: "Single word rejection",
      signals: ["No"]
    }
  }
]

/**
 * Build the full system prompt with examples
 */
export function buildSystemPromptWithExamples(): string {
  const examplesText = CATEGORIZATION_EXAMPLES.map((ex, idx) => {
    return `Example ${idx + 1}:
From: ${ex.email.from}
Subject: ${ex.email.subject}
Body: ${ex.email.body}

Classification:
${JSON.stringify(ex.expected, null, 2)}`
  }).join('\n\n')

  return `${CATEGORIZATION_SYSTEM_PROMPT}

EXAMPLES FOR REFERENCE:
${examplesText}`
}
