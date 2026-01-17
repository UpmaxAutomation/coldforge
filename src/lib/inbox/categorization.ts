/**
 * AI-powered Lead Categorization Service
 *
 * Uses Claude API to analyze email replies and categorize them based on
 * intent (interested, not interested, maybe, out of office, etc.)
 */

import type {
  CategoryResult,
  MessageCategory,
  MessageSentiment,
  CategorizationInput,
} from './types'
import { CONFIDENCE_THRESHOLDS } from './types'
import {
  buildCategorizationPrompt,
  buildSystemPromptWithExamples,
} from './prompts'

// Configuration
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // ms
const MAX_BODY_LENGTH = 4000 // Truncate long emails

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{
    type: 'text'
    text: string
  }>
  model: string
  stop_reason: string
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

interface AnthropicError {
  type: 'error'
  error: {
    type: string
    message: string
  }
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
  private queue: Array<() => void> = []
  private processing = false
  private lastCallTime = 0
  private minInterval: number

  constructor(requestsPerMinute: number = 50) {
    this.minInterval = (60 * 1000) / requestsPerMinute
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve)
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return

    this.processing = true
    const now = Date.now()
    const timeSinceLastCall = now - this.lastCallTime
    const waitTime = Math.max(0, this.minInterval - timeSinceLastCall)

    if (waitTime > 0) {
      await new Promise((r) => setTimeout(r, waitTime))
    }

    const resolve = this.queue.shift()
    if (resolve) {
      this.lastCallTime = Date.now()
      resolve()
    }

    this.processing = false
    if (this.queue.length > 0) {
      this.processQueue()
    }
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter(50)

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Truncate text to max length while preserving word boundaries
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const truncated = text.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + '...'
  }

  return truncated + '...'
}

/**
 * Clean email body text for analysis
 * Removes signatures, excessive whitespace, quoted replies, etc.
 */
function cleanEmailBody(body: string): string {
  let cleaned = body

  // Remove quoted reply sections (lines starting with >)
  cleaned = cleaned.replace(/^>.*$/gm, '')

  // Remove common signature separators and everything after
  const signatureSeparators = [
    /^--\s*$/m,
    /^_{3,}$/m,
    /^-{3,}$/m,
    /^Sent from my (iPhone|iPad|Android|Samsung|Galaxy)/m,
    /^Get Outlook for/m,
    /^________________________________$/m,
  ]

  for (const separator of signatureSeparators) {
    const match = cleaned.match(separator)
    if (match && match.index !== undefined) {
      cleaned = cleaned.slice(0, match.index)
    }
  }

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.replace(/[ \t]+/g, ' ')
  cleaned = cleaned.trim()

  return cleaned
}

/**
 * Call Claude API with retry logic
 */
async function callClaudeAPI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string = DEFAULT_MODEL
): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Acquire rate limit slot
      await rateLimiter.acquire()

      const messages: AnthropicMessage[] = [
        { role: 'user', content: userPrompt },
      ]

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as AnthropicError
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after')
          const waitTime = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : INITIAL_RETRY_DELAY * Math.pow(2, attempt)
          await sleep(waitTime)
          continue
        }

        // Handle overload
        if (response.status === 529) {
          await sleep(INITIAL_RETRY_DELAY * Math.pow(2, attempt))
          continue
        }

        throw new Error(`Claude API error: ${errorMessage}`)
      }

      const data = (await response.json()) as AnthropicResponse

      if (!data.content || data.content.length === 0) {
        throw new Error('Empty response from Claude API')
      }

      const firstContent = data.content[0]
      if (!firstContent) {
        throw new Error('Empty response content from Claude API')
      }

      return firstContent.text
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Exponential backoff for retryable errors
      if (attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_RETRY_DELAY * Math.pow(2, attempt))
      }
    }
  }

  throw lastError || new Error('Failed to call Claude API after retries')
}

/**
 * Parse Claude's JSON response into CategoryResult
 */
function parseCategorizationResponse(response: string): CategoryResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    throw new Error('No JSON object found in response')
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    category?: string
    confidence?: number
    sentiment?: string
    reasoning?: string
    signals?: string[]
  }

  // Validate and normalize category
  const validCategories: MessageCategory[] = [
    'interested',
    'not_interested',
    'maybe',
    'out_of_office',
    'auto_reply',
    'bounced',
    'uncategorized',
  ]

  const category = (parsed.category?.toLowerCase() || 'uncategorized') as MessageCategory
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category: ${parsed.category}`)
  }

  // Validate and normalize sentiment
  const validSentiments: MessageSentiment[] = ['positive', 'neutral', 'negative']
  const sentiment = (parsed.sentiment?.toLowerCase() || 'neutral') as MessageSentiment
  if (!validSentiments.includes(sentiment)) {
    throw new Error(`Invalid sentiment: ${parsed.sentiment}`)
  }

  // Validate confidence
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.5

  return {
    category,
    confidence,
    sentiment,
    reasoning: parsed.reasoning || undefined,
    signals: Array.isArray(parsed.signals) ? parsed.signals : [],
  }
}

/**
 * Quick heuristic pre-check for obvious categories
 * Returns a result if confident, null otherwise
 */
function quickCategorize(subject: string, body: string, from: string): CategoryResult | null {
  const text = `${subject} ${body}`.toLowerCase()
  const fromLower = from.toLowerCase()

  // Check for bounce indicators
  const bounceIndicators = [
    'delivery failed',
    'undeliverable',
    'mailbox not found',
    'user unknown',
    'permanent failure',
    'delivery status notification',
    'mail delivery subsystem',
    '550 5.1.1',
    'address rejected',
  ]

  for (const indicator of bounceIndicators) {
    if (text.includes(indicator) || fromLower.includes('mailer-daemon') || fromLower.includes('postmaster')) {
      return {
        category: 'bounced',
        confidence: 0.98,
        sentiment: 'negative',
        signals: [indicator],
      }
    }
  }

  // Check for out of office
  const oooIndicators = [
    'out of office',
    'out of the office',
    'on vacation',
    'on holiday',
    'on leave',
    'i am away',
    "i'm away",
    'away from my desk',
    'limited access to email',
    'automatic reply',
  ]

  for (const indicator of oooIndicators) {
    if (text.includes(indicator)) {
      return {
        category: 'out_of_office',
        confidence: 0.95,
        sentiment: 'neutral',
        signals: [indicator],
      }
    }
  }

  // Check for auto-reply from noreply addresses
  if (
    (fromLower.includes('noreply') || fromLower.includes('no-reply')) &&
    (text.includes('automated') || text.includes('do not reply'))
  ) {
    return {
      category: 'auto_reply',
      confidence: 0.92,
      sentiment: 'neutral',
      signals: ['noreply address', 'automated message'],
    }
  }

  return null
}

/**
 * Main categorization function
 *
 * Analyzes an email message and returns its category with confidence score
 */
export async function categorizeMessage(
  message: CategorizationInput,
  apiKey?: string
): Promise<CategoryResult> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY

  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const { subject, bodyText, from, fromName } = message

  // Clean and truncate the body
  const cleanedBody = truncateText(cleanEmailBody(bodyText), MAX_BODY_LENGTH)

  // Try quick heuristic first for obvious cases
  const quickResult = quickCategorize(subject, cleanedBody, from)
  if (quickResult && quickResult.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    return quickResult
  }

  // Build prompts
  const systemPrompt = buildSystemPromptWithExamples()
  const userPrompt = buildCategorizationPrompt({
    subject,
    body: cleanedBody,
    fromEmail: from,
    fromName,
  })

  try {
    const response = await callClaudeAPI(systemPrompt, userPrompt, key)
    return parseCategorizationResponse(response)
  } catch (error) {
    console.error('Categorization error:', error)

    // Return uncategorized with low confidence on error
    return {
      category: 'uncategorized',
      confidence: 0,
      sentiment: 'neutral',
      signals: [],
      reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Categorize multiple messages in parallel with concurrency limit
 */
export async function categorizeMessages(
  messages: CategorizationInput[],
  options: {
    apiKey?: string
    concurrency?: number
    onProgress?: (completed: number, total: number) => void
  } = {}
): Promise<Map<string, CategoryResult>> {
  const { concurrency = 5, onProgress } = options
  const results = new Map<string, CategoryResult>()

  // Process in batches to respect concurrency
  let completed = 0

  for (let i = 0; i < messages.length; i += concurrency) {
    const batch = messages.slice(i, i + concurrency)

    const batchResults = await Promise.all(
      batch.map(async (message) => {
        const result = await categorizeMessage(message, options.apiKey)
        return { id: message.id, result }
      })
    )

    for (const { id, result } of batchResults) {
      results.set(id, result)
      completed++
    }

    if (onProgress) {
      onProgress(completed, messages.length)
    }
  }

  return results
}

/**
 * Get the confidence level label for a score
 */
export function getConfidenceLevel(
  confidence: number
): 'high' | 'medium' | 'low' | 'very_low' {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high'
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium'
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW) return 'low'
  return 'very_low'
}

/**
 * Check if categorization result should be auto-applied
 * (high confidence results can be automatically applied without user review)
 */
export function shouldAutoApply(result: CategoryResult): boolean {
  // Auto-apply high confidence results for certain categories
  const autoApplyCategories: MessageCategory[] = [
    'out_of_office',
    'auto_reply',
    'bounced',
  ]

  if (autoApplyCategories.includes(result.category)) {
    return result.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
  }

  // For other categories, require high confidence
  return result.confidence >= CONFIDENCE_THRESHOLDS.HIGH
}
