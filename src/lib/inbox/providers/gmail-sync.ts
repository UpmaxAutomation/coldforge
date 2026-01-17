/**
 * Gmail Sync Provider
 *
 * Fetches and syncs messages from Gmail using the Gmail API.
 * Supports incremental sync using historyId for efficiency.
 */

import { google, gmail_v1 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { getGoogleOAuthClient, refreshGoogleToken } from '@/lib/google'
import {
  SyncProvider,
  AccountCredentials,
  SyncState,
  SyncOptions,
  InboxMessage,
  EmailAddress,
  AttachmentInfo,
  GmailRawMessage,
  GmailMessagePart,
} from '../types'

export class GmailSyncProvider implements SyncProvider {
  readonly providerName = 'google' as const

  /**
   * Get authenticated Gmail client
   */
  private async getGmailClient(
    credentials: AccountCredentials
  ): Promise<{ gmail: gmail_v1.Gmail; oauth2Client: OAuth2Client }> {
    const oauth2Client = getGoogleOAuthClient()

    // Refresh token if needed
    if (credentials.tokenExpiresAt && new Date() >= credentials.tokenExpiresAt) {
      if (!credentials.refreshToken) {
        throw new Error('No refresh token available')
      }
      const newTokens = await refreshGoogleToken(credentials.refreshToken)
      credentials.accessToken = newTokens.access_token || undefined
    }

    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    return { gmail, oauth2Client }
  }

  /**
   * Fetch messages from Gmail
   */
  async fetchMessages(
    credentials: AccountCredentials,
    syncState: SyncState | null,
    options: SyncOptions
  ): Promise<{
    messages: InboxMessage[]
    newSyncState: Partial<SyncState>
    hasMore: boolean
  }> {
    const { gmail } = await this.getGmailClient(credentials)
    const messages: InboxMessage[] = []
    const batchSize = options.batchSize || 50
    const maxResults = options.maxResults || 100

    // Build query
    let query = options.query || ''

    // Add time filter if doing incremental sync
    if (options.since && !options.fullSync) {
      const sinceDate = options.since.toISOString().split('T')[0]
      query += ` after:${sinceDate}`
    }

    // Use history API for incremental sync if we have historyId
    if (syncState?.lastHistoryId && !options.fullSync) {
      const historyResult = await this.fetchHistoryChanges(
        gmail,
        credentials,
        syncState.lastHistoryId,
        batchSize
      )
      return historyResult
    }

    // Full sync or initial sync - list messages
    const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
      userId: 'me',
      maxResults: Math.min(batchSize, maxResults),
      q: query.trim() || undefined,
      pageToken: syncState?.syncCursor || undefined,
    }

    const listResponse = await gmail.users.messages.list(listParams)
    const messageList = listResponse.data.messages || []

    // Fetch full message details in batches
    const messageIds = messageList.slice(0, batchSize).map((m) => m.id!)
    const fullMessages = await this.fetchMessageDetails(gmail, credentials, messageIds)
    messages.push(...fullMessages)

    // Get current historyId for future incremental syncs
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const currentHistoryId = profile.data.historyId || null

    return {
      messages,
      newSyncState: {
        lastHistoryId: currentHistoryId,
        lastSyncAt: new Date(),
        syncCursor: listResponse.data.nextPageToken || null,
        messagesSynced: (syncState?.messagesSynced || 0) + messages.length,
      },
      hasMore: !!listResponse.data.nextPageToken,
    }
  }

  /**
   * Fetch message changes using Gmail History API (incremental sync)
   */
  private async fetchHistoryChanges(
    gmail: gmail_v1.Gmail,
    credentials: AccountCredentials,
    historyId: string,
    maxResults: number
  ): Promise<{
    messages: InboxMessage[]
    newSyncState: Partial<SyncState>
    hasMore: boolean
  }> {
    try {
      const historyResponse = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: historyId,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
        maxResults,
      })

      const history = historyResponse.data.history || []
      const messageIds = new Set<string>()

      // Collect unique message IDs from history
      for (const record of history) {
        if (record.messagesAdded) {
          for (const added of record.messagesAdded) {
            if (added.message?.id) {
              messageIds.add(added.message.id)
            }
          }
        }
      }

      // Fetch details for changed messages
      const messages = await this.fetchMessageDetails(
        gmail,
        credentials,
        Array.from(messageIds)
      )

      return {
        messages,
        newSyncState: {
          lastHistoryId: historyResponse.data.historyId || historyId,
          lastSyncAt: new Date(),
          syncCursor: historyResponse.data.nextPageToken || null,
        },
        hasMore: !!historyResponse.data.nextPageToken,
      }
    } catch (error) {
      // If history is too old, fall back to full sync
      if (error instanceof Error && error.message.includes('historyId')) {
        throw new Error('HISTORY_EXPIRED')
      }
      throw error
    }
  }

  /**
   * Fetch full message details for multiple messages
   */
  private async fetchMessageDetails(
    gmail: gmail_v1.Gmail,
    credentials: AccountCredentials,
    messageIds: string[]
  ): Promise<InboxMessage[]> {
    const messages: InboxMessage[] = []

    // Fetch in parallel but with concurrency limit
    const CONCURRENCY = 10
    for (let i = 0; i < messageIds.length; i += CONCURRENCY) {
      const batch = messageIds.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map(async (id) => {
          try {
            const response = await gmail.users.messages.get({
              userId: 'me',
              id,
              format: 'full',
            })
            return this.parseGmailMessage(
              response.data as GmailRawMessage,
              credentials.accountId,
              credentials.organizationId || ''
            )
          } catch (error) {
            console.error(`Failed to fetch message ${id}:`, error)
            return null
          }
        })
      )

      messages.push(...batchResults.filter((m): m is InboxMessage => m !== null))
    }

    return messages
  }

  /**
   * Parse Gmail message to unified format
   */
  private parseGmailMessage(
    raw: GmailRawMessage,
    accountId: string,
    organizationId: string
  ): InboxMessage {
    const headers = this.extractHeaders(raw.payload?.headers || [])
    const { textBody, htmlBody } = this.extractBody(raw.payload)
    const attachments = this.extractAttachments(raw.payload)

    // Parse addresses
    const from = this.parseEmailAddress(headers['from'] || '')
    const to = this.parseEmailAddresses(headers['to'] || '')
    const cc = this.parseEmailAddresses(headers['cc'] || '')
    const bcc = this.parseEmailAddresses(headers['bcc'] || '')
    const replyTo = headers['reply-to']
      ? this.parseEmailAddress(headers['reply-to'])
      : null

    // Parse references
    const references = (headers['references'] || '')
      .split(/\s+/)
      .filter((r) => r.length > 0)
      .map((r) => r.replace(/[<>]/g, ''))

    // Determine direction
    const isInbound = !raw.labelIds?.includes('SENT')

    const date = raw.internalDate
      ? new Date(parseInt(raw.internalDate))
      : new Date()

    return {
      id: `gmail_${raw.id}`,
      externalId: raw.id,
      threadExternalId: raw.threadId,
      accountId,
      organizationId,
      provider: 'google',

      messageId: headers['message-id']?.replace(/[<>]/g, '') || raw.id,
      inReplyTo: headers['in-reply-to']?.replace(/[<>]/g, '') || null,
      references,

      from,
      to,
      cc,
      bcc,
      replyTo,

      subject: headers['subject'] || '(no subject)',
      bodyText: textBody,
      bodyHtml: htmlBody,
      snippet: raw.snippet || textBody.substring(0, 200),

      hasAttachments: attachments.length > 0,
      attachments,

      isRead: raw.labelIds?.includes('READ') || !raw.labelIds?.includes('UNREAD'),
      isStarred: raw.labelIds?.includes('STARRED') || false,
      labels: raw.labelIds || [],
      direction: isInbound ? 'inbound' : 'outbound',

      date,
      receivedAt: date,
      internalDate: date,

      rawHeaders: headers,
    }
  }

  /**
   * Extract headers into a map
   */
  private extractHeaders(
    headers: Array<{ name: string; value: string }>
  ): Record<string, string> {
    const result: Record<string, string> = {}
    for (const header of headers) {
      result[header.name.toLowerCase()] = header.value
    }
    return result
  }

  /**
   * Extract text and HTML body from message parts
   */
  private extractBody(
    payload?: GmailRawMessage['payload']
  ): { textBody: string; htmlBody: string | null } {
    let textBody = ''
    let htmlBody: string | null = null

    if (!payload) {
      return { textBody, htmlBody }
    }

    const extractFromPart = (part: GmailMessagePart) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        textBody = this.decodeBase64(part.body.data)
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        htmlBody = this.decodeBase64(part.body.data)
      }

      if (part.parts) {
        for (const subPart of part.parts) {
          extractFromPart(subPart)
        }
      }
    }

    // Handle simple message with body directly on payload
    if (payload.body?.data && !payload.parts) {
      if (payload.mimeType === 'text/plain') {
        textBody = this.decodeBase64(payload.body.data)
      } else if (payload.mimeType === 'text/html') {
        htmlBody = this.decodeBase64(payload.body.data)
      }
    }

    // Handle multipart message
    if (payload.parts) {
      for (const part of payload.parts) {
        extractFromPart(part)
      }
    }

    // If we only have HTML, strip tags for text
    if (!textBody && htmlBody) {
      textBody = this.stripHtml(htmlBody)
    }

    return { textBody, htmlBody }
  }

  /**
   * Extract attachment info from message parts
   */
  private extractAttachments(
    payload?: GmailRawMessage['payload']
  ): AttachmentInfo[] {
    const attachments: AttachmentInfo[] = []

    const extractFromPart = (part: GmailMessagePart) => {
      if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        })
      }

      if (part.parts) {
        for (const subPart of part.parts) {
          extractFromPart(subPart)
        }
      }
    }

    if (payload?.parts) {
      for (const part of payload.parts) {
        extractFromPart(part)
      }
    }

    return attachments
  }

  /**
   * Parse a single email address
   */
  private parseEmailAddress(raw: string): EmailAddress {
    // Format: "Name <email@example.com>" or "email@example.com"
    const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/i)
    if (match) {
      return {
        email: match[2]?.trim() || raw.trim(),
        name: match[1]?.trim() || null,
      }
    }
    return { email: raw.trim(), name: null }
  }

  /**
   * Parse multiple email addresses
   */
  private parseEmailAddresses(raw: string): EmailAddress[] {
    if (!raw) return []

    // Split by comma, but not within quotes
    const addresses: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of raw) {
      if (char === '"') {
        inQuotes = !inQuotes
      }
      if (char === ',' && !inQuotes) {
        addresses.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    if (current.trim()) {
      addresses.push(current.trim())
    }

    return addresses.map((addr) => this.parseEmailAddress(addr))
  }

  /**
   * Decode base64url encoded string
   */
  private decodeBase64(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(base64, 'base64').toString('utf-8')
  }

  /**
   * Strip HTML tags from string
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Fetch a single message by ID
   */
  async fetchMessage(
    credentials: AccountCredentials,
    messageId: string
  ): Promise<InboxMessage | null> {
    const { gmail } = await this.getGmailClient(credentials)

    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      })

      return this.parseGmailMessage(
        response.data as GmailRawMessage,
        credentials.accountId,
        credentials.organizationId || ''
      )
    } catch (error) {
      console.error(`Failed to fetch Gmail message ${messageId}:`, error)
      return null
    }
  }

  /**
   * Validate credentials by attempting to fetch profile
   */
  async validateCredentials(credentials: AccountCredentials): Promise<boolean> {
    try {
      const { gmail } = await this.getGmailClient(credentials)
      await gmail.users.getProfile({ userId: 'me' })
      return true
    } catch {
      return false
    }
  }
}

// Export singleton instance
export const gmailSyncProvider = new GmailSyncProvider()
