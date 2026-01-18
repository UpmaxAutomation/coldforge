import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { inboxSyncRequestSchema } from '@/lib/schemas'
import { handleApiError } from '@/lib/errors/handler'
import {
  AuthenticationError,
  BadRequestError,
  ValidationError,
} from '@/lib/errors'
import { getImapMessages, type ImapConfig, IMAP_PRESETS } from '@/lib/imap'
import { categorizeMessage as aiCategorizeMessage } from '@/lib/inbox/categorization'
import type { CategorizationInput, CategoryResult, MessageCategory, MessageSentiment } from '@/lib/inbox/types'

// Types for mailbox data
interface Mailbox {
  id: string
  email: string
  provider: 'google' | 'microsoft' | 'smtp'
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_pass: string | null
  imap_host: string | null
  imap_port: number | null
  oauth_access_token: string | null
  oauth_refresh_token: string | null
}

interface SyncResult {
  mailboxId: string
  email: string
  messagesFound: number
  newMessages: number
  categorizedMessages: number
  categorizationErrors: number
  errors?: string[]
}

interface SyncStats {
  totalMailboxes: number
  successfulSyncs: number
  failedSyncs: number
  totalNewMessages: number
  categorizedMessages: number
  categorizationErrors: number
  results: SyncResult[]
}

// Stored message info for post-processing categorization
interface SavedMessage {
  id: string
  threadId: string
  from: string
  fromName: string | null
  subject: string
  bodyText: string
}

// Simple regex-based categorization (fallback when AI is not enabled)
function quickCategorizeMessage(subject: string, bodyText: string): {
  category: 'interested' | 'not_interested' | 'out_of_office' | 'meeting_request' | 'unsubscribe' | 'question' | 'bounce' | 'auto_reply' | 'other'
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
} {
  const lowerSubject = subject.toLowerCase()
  const lowerBody = bodyText.toLowerCase()
  const combined = `${lowerSubject} ${lowerBody}`

  // Out of office patterns
  const oooPatterns = [
    'out of office', 'out of the office', 'away from', 'on vacation',
    'annual leave', 'holiday', 'will be back', 'returning on',
    'automatic reply', 'auto-reply', 'autoreply', 'i am currently out',
  ]
  if (oooPatterns.some(p => combined.includes(p))) {
    return { category: 'out_of_office', sentiment: 'neutral' }
  }

  // Unsubscribe patterns
  const unsubPatterns = [
    'unsubscribe', 'remove me', 'stop emailing', 'take me off',
    'opt out', 'do not contact', 'don\'t contact', 'stop sending',
  ]
  if (unsubPatterns.some(p => combined.includes(p))) {
    return { category: 'unsubscribe', sentiment: 'negative' }
  }

  // Bounce patterns
  const bouncePatterns = [
    'delivery failed', 'undeliverable', 'mail delivery failed',
    'returned mail', 'message not delivered', 'delivery status notification',
    'mailbox not found', 'user unknown', 'address rejected',
  ]
  if (bouncePatterns.some(p => combined.includes(p))) {
    return { category: 'bounce', sentiment: 'neutral' }
  }

  // Meeting request patterns
  const meetingPatterns = [
    'schedule a call', 'book a meeting', 'let\'s chat', 'would love to talk',
    'set up a time', 'available for a call', 'calendar', 'demo',
    'when are you free', 'schedule time', 'let me know when',
  ]
  if (meetingPatterns.some(p => combined.includes(p))) {
    return { category: 'meeting_request', sentiment: 'positive' }
  }

  // Interested patterns
  const interestedPatterns = [
    'interested', 'sounds great', 'tell me more', 'more information',
    'pricing', 'how much', 'sign me up', 'let\'s do it', 'count me in',
    'yes', 'i\'d like to', 'looking forward', 'excited',
  ]
  if (interestedPatterns.some(p => combined.includes(p))) {
    return { category: 'interested', sentiment: 'positive' }
  }

  // Not interested patterns
  const notInterestedPatterns = [
    'not interested', 'no thank', 'no thanks', 'pass on this',
    'not for us', 'not a fit', 'don\'t need', 'already have',
    'not looking', 'decline', 'not right now', 'not at this time',
  ]
  if (notInterestedPatterns.some(p => combined.includes(p))) {
    return { category: 'not_interested', sentiment: 'negative' }
  }

  // Question patterns
  const questionPatterns = ['?', 'how does', 'what is', 'can you explain', 'wondering']
  if (questionPatterns.some(p => combined.includes(p))) {
    return { category: 'question', sentiment: 'neutral' }
  }

  // Default
  return { category: 'other', sentiment: 'neutral' }
}

/**
 * Map AI categorization result to database-compatible format
 * Handles category mapping between AI types and database schema
 */
function mapAiCategoryToDb(category: MessageCategory): 'interested' | 'not_interested' | 'out_of_office' | 'meeting_request' | 'unsubscribe' | 'question' | 'bounce' | 'auto_reply' | 'other' {
  const mapping: Record<MessageCategory, 'interested' | 'not_interested' | 'out_of_office' | 'meeting_request' | 'unsubscribe' | 'question' | 'bounce' | 'auto_reply' | 'other'> = {
    'interested': 'interested',
    'not_interested': 'not_interested',
    'maybe': 'question', // Map 'maybe' to 'question' as it's a neutral/inquiry state
    'out_of_office': 'out_of_office',
    'auto_reply': 'auto_reply',
    'bounced': 'bounce',
    'uncategorized': 'other',
  }
  return mapping[category] || 'other'
}

/**
 * Map AI sentiment to database-compatible format
 */
function mapAiSentimentToDb(sentiment: MessageSentiment): 'positive' | 'negative' | 'neutral' | 'mixed' {
  // Direct mapping since they match
  return sentiment as 'positive' | 'negative' | 'neutral' | 'mixed'
}

/**
 * Run AI categorization on a batch of saved messages
 * Returns categorization results with error handling
 */
async function runAiCategorization(
  messages: SavedMessage[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, { category: CategoryResult; error?: string }>> {
  const results = new Map<string, { category: CategoryResult; error?: string }>()

  let completed = 0

  for (const message of messages) {
    try {
      const input: CategorizationInput = {
        id: message.id,
        from: message.from,
        fromName: message.fromName,
        subject: message.subject,
        bodyText: message.bodyText,
      }

      const result = await aiCategorizeMessage(input)
      results.set(message.id, { category: result })

      console.log(`[AI Categorization] Message ${message.id}: category=${result.category}, confidence=${result.confidence.toFixed(2)}, sentiment=${result.sentiment}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[AI Categorization] Error for message ${message.id}:`, errorMessage)

      // Store error but continue processing other messages
      results.set(message.id, {
        category: {
          category: 'uncategorized',
          confidence: 0,
          sentiment: 'neutral',
          signals: [],
          reasoning: `Categorization failed: ${errorMessage}`,
        },
        error: errorMessage,
      })
    }

    completed++
    if (onProgress) {
      onProgress(completed, messages.length)
    }
  }

  return results
}

// Build IMAP config from mailbox data
function buildImapConfig(mailbox: Mailbox): ImapConfig | null {
  // For OAuth providers (Google/Microsoft), IMAP access via OAuth is complex
  // For now, we support SMTP mailboxes with IMAP credentials
  if (mailbox.provider === 'smtp' && mailbox.imap_host && mailbox.smtp_user && mailbox.smtp_pass) {
    return {
      host: mailbox.imap_host,
      port: mailbox.imap_port || 993,
      secure: true,
      user: mailbox.smtp_user,
      password: mailbox.smtp_pass,
    }
  }

  // Check for presets
  const preset = IMAP_PRESETS[mailbox.provider]
  if (preset && mailbox.smtp_user && mailbox.smtp_pass) {
    return {
      host: preset.host!,
      port: preset.port!,
      secure: preset.secure!,
      user: mailbox.smtp_user,
      password: mailbox.smtp_pass,
    }
  }

  return null
}

// POST /api/inbox/sync - Sync messages from all connected accounts
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AuthenticationError()
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      throw new BadRequestError('Profile not found')
    }

    const body = await request.json()

    // Validate request body
    const validationResult = inboxSyncRequestSchema.safeParse(body)
    if (!validationResult.success) {
      throw new ValidationError(
        validationResult.error.issues[0]?.message || 'Invalid request body',
        { issues: validationResult.error.issues }
      )
    }

    const { accountIds, syncAll, since, categorize } = validationResult.data

    // Build query for mailboxes
    let mailboxQuery = supabase
      .from('mailboxes')
      .select('id, email, provider, smtp_host, smtp_port, smtp_user, smtp_pass, imap_host, imap_port, oauth_access_token, oauth_refresh_token')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'active')

    if (!syncAll && accountIds && accountIds.length > 0) {
      mailboxQuery = mailboxQuery.in('id', accountIds)
    }

    const { data: mailboxes, error: mailboxError } = await mailboxQuery as {
      data: Mailbox[] | null
      error: Error | null
    }

    if (mailboxError) {
      throw mailboxError
    }

    if (!mailboxes || mailboxes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active mailboxes found to sync',
        stats: {
          totalMailboxes: 0,
          successfulSyncs: 0,
          failedSyncs: 0,
          totalNewMessages: 0,
          categorizedMessages: 0,
          categorizationErrors: 0,
          results: [],
        },
      })
    }

    // Sync each mailbox
    const syncStats: SyncStats = {
      totalMailboxes: mailboxes.length,
      successfulSyncs: 0,
      failedSyncs: 0,
      totalNewMessages: 0,
      categorizedMessages: 0,
      categorizationErrors: 0,
      results: [],
    }

    // Collect all saved messages for AI categorization (post-processing)
    const allSavedMessages: SavedMessage[] = []

    // Determine since date
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000) // Default 24 hours

    for (const mailbox of mailboxes) {
      const result: SyncResult = {
        mailboxId: mailbox.id,
        email: mailbox.email,
        messagesFound: 0,
        newMessages: 0,
        categorizedMessages: 0,
        categorizationErrors: 0,
        errors: [],
      }

      // Track saved messages for this mailbox
      const mailboxSavedMessages: SavedMessage[] = []

      try {
        // Build IMAP config
        const imapConfig = buildImapConfig(mailbox)

        if (!imapConfig) {
          result.errors?.push('IMAP not configured for this mailbox')
          syncStats.failedSyncs++
          syncStats.results.push(result)
          continue
        }

        // Fetch messages from IMAP
        const imapResult = await getImapMessages(imapConfig, {
          folder: 'INBOX',
          limit: 100,
          since: sinceDate,
          unseen: false,
        })

        if (!imapResult.success || !imapResult.messages) {
          result.errors?.push(imapResult.error || 'Failed to fetch messages')
          syncStats.failedSyncs++
          syncStats.results.push(result)
          continue
        }

        result.messagesFound = imapResult.messages.length

        // Process each message
        for (const message of imapResult.messages) {
          // Check if message already exists
          const { data: existingReply } = await supabase
            .from('replies')
            .select('id')
            .eq('organization_id', profile.organization_id)
            .eq('from_email', message.from)
            .eq('received_at', message.date.toISOString())
            .single() as { data: { id: string } | null }

          if (existingReply) {
            continue // Skip duplicate
          }

          // Find or create thread
          const { data: existingThread } = await supabase
            .from('threads')
            .select('id')
            .eq('organization_id', profile.organization_id)
            .eq('mailbox_id', mailbox.id)
            .eq('participant_email', message.from)
            .single() as { data: { id: string } | null }

          let threadId: string

          if (existingThread) {
            threadId = existingThread.id
          } else {
            // Create new thread using admin client to bypass RLS
            const adminClient = createAdminClient()
            const { data: newThread, error: threadError } = await adminClient
              .from('threads')
              .insert({
                organization_id: profile.organization_id,
                mailbox_id: mailbox.id,
                subject: message.subject,
                participant_email: message.from,
                participant_name: null,
                message_count: 0,
                last_message_at: message.date.toISOString(),
                status: 'active',
                category: 'other',
                sentiment: 'neutral',
              })
              .select('id')
              .single()

            if (threadError || !newThread) {
              result.errors?.push(`Failed to create thread for message from ${message.from}`)
              continue
            }

            threadId = newThread.id
          }

          // Use quick regex-based categorization initially
          // AI categorization will be applied post-save if enabled
          let category: ReturnType<typeof quickCategorizeMessage>['category'] = 'other'
          let sentiment: ReturnType<typeof quickCategorizeMessage>['sentiment'] = 'neutral'

          // Always run quick categorization for initial values
          const quickCat = quickCategorizeMessage(message.subject, message.snippet)
          category = quickCat.category
          sentiment = quickCat.sentiment

          // Try to find lead by email
          const { data: lead } = await supabase
            .from('leads')
            .select('id, campaign_leads:campaign_leads(campaign_id)')
            .eq('organization_id', profile.organization_id)
            .eq('email', message.from)
            .single() as {
              data: {
                id: string
                campaign_leads: Array<{ campaign_id: string }>
              } | null
            }

          // Insert reply and get the ID for potential AI categorization
          // Use admin client to bypass RLS
          const replyAdminClient = createAdminClient()
          const { data: insertedReply, error: replyError } = await replyAdminClient
            .from('replies')
            .insert({
              organization_id: profile.organization_id,
              campaign_id: lead?.campaign_leads?.[0]?.campaign_id || null,
              lead_id: lead?.id || null,
              mailbox_id: mailbox.id,
              thread_id: threadId,
              message_id: `<${message.uid}@${mailbox.email.split('@')[1]}>`,
              from_email: message.from,
              from_name: null,
              to_email: mailbox.email,
              subject: message.subject,
              body_text: message.snippet,
              body_html: null,
              category,
              sentiment,
              confidence: null, // Will be updated by AI categorization
              status: 'unread',
              is_auto_detected: false, // Will be set to true after AI categorization
              received_at: message.date.toISOString(),
            })
            .select('id')
            .single()

          if (replyError || !insertedReply) {
            result.errors?.push(`Failed to save message from ${message.from}`)
            continue
          }

          // Track for AI categorization if enabled
          if (categorize) {
            const savedMessage: SavedMessage = {
              id: insertedReply.id,
              threadId,
              from: message.from,
              fromName: null, // IMAP doesn't give us parsed name easily
              subject: message.subject,
              bodyText: message.snippet,
            }
            mailboxSavedMessages.push(savedMessage)
            allSavedMessages.push(savedMessage)
          }

          // Update thread
          await supabase
            .from('threads')
            .update({
              last_message_at: message.date.toISOString(),
              category,
              sentiment,
              updated_at: new Date().toISOString(),
            })
            .eq('id', threadId)

          // Increment thread message count
          await supabase.rpc('increment_thread_message_count', {
            p_thread_id: threadId,
          })

          result.newMessages++
          syncStats.totalNewMessages++
        }

        syncStats.successfulSyncs++
      } catch (error) {
        result.errors?.push(error instanceof Error ? error.message : 'Unknown error')
        syncStats.failedSyncs++
      }

      syncStats.results.push(result)
    }

    // Post-processing: Run AI categorization on all saved messages
    if (categorize && allSavedMessages.length > 0) {
      console.log(`[Sync] Starting AI categorization for ${allSavedMessages.length} messages...`)

      try {
        const categorizations = await runAiCategorization(allSavedMessages, (completed, total) => {
          console.log(`[Sync] AI categorization progress: ${completed}/${total}`)
        })

        // Update each reply and thread with AI results
        for (const [messageId, catResult] of Array.from(categorizations.entries())) {
          const savedMessage = allSavedMessages.find(m => m.id === messageId)
          if (!savedMessage) continue

          if (catResult.error) {
            syncStats.categorizationErrors++
            // Find the corresponding result and increment its error count
            const mailboxResult = syncStats.results.find(r =>
              r.errors?.some(() => false) || true // just find any result
            )
            if (mailboxResult) {
              mailboxResult.categorizationErrors++
            }
            continue
          }

          const aiCategory = mapAiCategoryToDb(catResult.category.category)
          const aiSentiment = mapAiSentimentToDb(catResult.category.sentiment)
          const confidence = catResult.category.confidence

          // Update the reply with AI categorization results
          const { error: updateReplyError } = await supabase
            .from('replies')
            .update({
              category: aiCategory,
              sentiment: aiSentiment,
              confidence,
              is_auto_detected: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', messageId)

          if (updateReplyError) {
            console.error(`[Sync] Failed to update reply ${messageId} with AI categorization:`, updateReplyError)
            syncStats.categorizationErrors++
            continue
          }

          // Update the parent thread's category based on latest message
          const { error: updateThreadError } = await supabase
            .from('threads')
            .update({
              category: aiCategory,
              sentiment: aiSentiment,
              updated_at: new Date().toISOString(),
            })
            .eq('id', savedMessage.threadId)

          if (updateThreadError) {
            console.error(`[Sync] Failed to update thread ${savedMessage.threadId} with AI categorization:`, updateThreadError)
            // Don't count this as a full error, reply was updated successfully
          }

          syncStats.categorizedMessages++

          // Update the result for the corresponding mailbox
          for (const result of syncStats.results) {
            // Find messages that belong to this result
            // Since we're iterating all messages, increment for any result that has new messages
            if (result.newMessages > 0 && result.categorizedMessages < result.newMessages) {
              result.categorizedMessages++
              break
            }
          }
        }

        console.log(`[Sync] AI categorization complete: ${syncStats.categorizedMessages} categorized, ${syncStats.categorizationErrors} errors`)
      } catch (error) {
        console.error('[Sync] AI categorization failed:', error instanceof Error ? error.message : 'Unknown error')
        // Don't fail the entire sync if categorization fails
        // Messages are already saved with quick categorization
      }
    }

    const categorizeMessage = categorize
      ? `. AI categorized ${syncStats.categorizedMessages} messages`
      : ''

    return NextResponse.json({
      success: true,
      message: `Synced ${syncStats.totalNewMessages} new messages from ${syncStats.successfulSyncs} mailboxes${categorizeMessage}`,
      stats: syncStats,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// GET /api/inbox/sync - Get sync status/history
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AuthenticationError()
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      throw new BadRequestError('Profile not found')
    }

    // Get mailboxes with their last sync info
    const { data: mailboxes } = await supabase
      .from('mailboxes')
      .select('id, email, provider, status, last_sync_at, sync_error')
      .eq('organization_id', profile.organization_id)
      .order('email', { ascending: true }) as {
        data: Array<{
          id: string
          email: string
          provider: string
          status: string
          last_sync_at: string | null
          sync_error: string | null
        }> | null
      }

    // Get recent sync activity (last 24 hours of new messages)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { count: recentMessages } = await supabase
      .from('replies')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .gte('created_at', oneDayAgo)

    return NextResponse.json({
      mailboxes: mailboxes || [],
      recentActivity: {
        newMessagesLast24h: recentMessages || 0,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
