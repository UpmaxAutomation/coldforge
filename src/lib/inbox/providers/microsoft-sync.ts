/**
 * Microsoft Sync Provider
 *
 * Fetches and syncs messages from Outlook/Microsoft 365 using Microsoft Graph API.
 * Supports incremental sync using delta queries for efficiency.
 */

import { refreshMicrosoftToken } from '@/lib/microsoft'
import {
  SyncProvider,
  AccountCredentials,
  SyncState,
  SyncOptions,
  InboxMessage,
  EmailAddress,
  AttachmentInfo,
  MicrosoftRawMessage,
} from '../types'

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

export class MicrosoftSyncProvider implements SyncProvider {
  readonly providerName = 'microsoft' as const

  /**
   * Get valid access token, refreshing if needed
   */
  private async getValidToken(credentials: AccountCredentials): Promise<string> {
    if (!credentials.accessToken) {
      throw new Error('No access token available')
    }

    // Check if token needs refresh
    if (credentials.tokenExpiresAt && new Date() >= credentials.tokenExpiresAt) {
      if (!credentials.refreshToken) {
        throw new Error('No refresh token available')
      }
      const newTokens = await refreshMicrosoftToken(credentials.refreshToken)
      return newTokens.accessToken || credentials.accessToken
    }

    return credentials.accessToken
  }

  /**
   * Make authenticated request to Microsoft Graph API
   */
  private async graphRequest<T>(
    accessToken: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${GRAPH_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Microsoft Graph API error: ${response.status} - ${error}`)
    }

    return response.json()
  }

  /**
   * Fetch messages from Microsoft 365
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
    const accessToken = await this.getValidToken(credentials)
    const batchSize = options.batchSize || 50
    const maxResults = options.maxResults || 100

    // Use delta query for incremental sync if we have a delta link
    if (syncState?.lastDeltaLink && !options.fullSync) {
      return this.fetchDeltaChanges(
        accessToken,
        credentials,
        syncState.lastDeltaLink
      )
    }

    // Build query parameters
    const queryParams = new URLSearchParams({
      $top: String(Math.min(batchSize, maxResults)),
      $orderby: 'receivedDateTime desc',
      $select: [
        'id',
        'conversationId',
        'conversationIndex',
        'receivedDateTime',
        'sentDateTime',
        'hasAttachments',
        'internetMessageId',
        'subject',
        'bodyPreview',
        'isRead',
        'isDraft',
        'flag',
        'from',
        'toRecipients',
        'ccRecipients',
        'bccRecipients',
        'replyTo',
        'body',
        'internetMessageHeaders',
      ].join(','),
    })

    // Add date filter for incremental sync
    if (options.since && !options.fullSync) {
      const sinceIso = options.since.toISOString()
      queryParams.append('$filter', `receivedDateTime ge ${sinceIso}`)
    }

    // Use skipToken for pagination
    if (syncState?.syncCursor) {
      queryParams.append('$skipToken', syncState.syncCursor)
    }

    const endpoint = `/me/messages?${queryParams.toString()}`
    const response = await this.graphRequest<{
      value: MicrosoftRawMessage[]
      '@odata.nextLink'?: string
      '@odata.deltaLink'?: string
    }>(accessToken, endpoint)

    const messages = response.value.map((raw) =>
      this.parseMicrosoftMessage(
        raw,
        credentials.accountId,
        credentials.organizationId || ''
      )
    )

    // Extract next page token from nextLink
    let nextCursor: string | null = null
    if (response['@odata.nextLink']) {
      const url = new URL(response['@odata.nextLink'])
      nextCursor = url.searchParams.get('$skipToken')
    }

    // Get delta link for future incremental syncs
    let deltaLink: string | null = syncState?.lastDeltaLink || null
    if (!response['@odata.nextLink']) {
      // No more pages - get fresh delta link for next sync
      const deltaResponse = await this.graphRequest<{
        '@odata.deltaLink': string
      }>(accessToken, '/me/messages/delta?$select=id')
      deltaLink = deltaResponse['@odata.deltaLink']
    }

    return {
      messages,
      newSyncState: {
        lastDeltaLink: deltaLink,
        lastSyncAt: new Date(),
        syncCursor: nextCursor,
        messagesSynced: (syncState?.messagesSynced || 0) + messages.length,
      },
      hasMore: !!response['@odata.nextLink'],
    }
  }

  /**
   * Fetch changes using delta query (incremental sync)
   */
  private async fetchDeltaChanges(
    accessToken: string,
    credentials: AccountCredentials,
    deltaLink: string
  ): Promise<{
    messages: InboxMessage[]
    newSyncState: Partial<SyncState>
    hasMore: boolean
  }> {
    try {
      const response = await fetch(deltaLink, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        // Delta link expired, need full sync
        if (response.status === 410) {
          throw new Error('DELTA_EXPIRED')
        }
        const error = await response.text()
        throw new Error(`Delta query failed: ${error}`)
      }

      const data = await response.json() as {
        value: MicrosoftRawMessage[]
        '@odata.nextLink'?: string
        '@odata.deltaLink'?: string
      }

      const messages = data.value.map((raw) =>
        this.parseMicrosoftMessage(
          raw,
          credentials.accountId,
          credentials.organizationId || ''
        )
      )

      // Get new delta link for next sync
      let newDeltaLink = deltaLink
      if (data['@odata.deltaLink']) {
        newDeltaLink = data['@odata.deltaLink']
      }

      return {
        messages,
        newSyncState: {
          lastDeltaLink: newDeltaLink,
          lastSyncAt: new Date(),
          syncCursor: data['@odata.nextLink'] || null,
        },
        hasMore: !!data['@odata.nextLink'],
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'DELTA_EXPIRED') {
        throw error
      }
      throw error
    }
  }

  /**
   * Parse Microsoft message to unified format
   */
  private parseMicrosoftMessage(
    raw: MicrosoftRawMessage,
    accountId: string,
    organizationId: string
  ): InboxMessage {
    // Parse headers into map
    const headers: Record<string, string> = {}
    for (const header of raw.internetMessageHeaders || []) {
      headers[header.name.toLowerCase()] = header.value
    }

    // Extract body content
    const bodyHtml = raw.body?.contentType === 'html' ? raw.body.content : null
    const bodyText =
      raw.body?.contentType === 'text'
        ? raw.body.content
        : bodyHtml
          ? this.stripHtml(bodyHtml)
          : ''

    // Parse addresses
    const from: EmailAddress = raw.from?.emailAddress
      ? {
          email: raw.from.emailAddress.address,
          name: raw.from.emailAddress.name || null,
        }
      : { email: 'unknown', name: null }

    const to = (raw.toRecipients || []).map((r) => ({
      email: r.emailAddress.address,
      name: r.emailAddress.name || null,
    }))

    const cc = (raw.ccRecipients || []).map((r) => ({
      email: r.emailAddress.address,
      name: r.emailAddress.name || null,
    }))

    const bcc = (raw.bccRecipients || []).map((r) => ({
      email: r.emailAddress.address,
      name: r.emailAddress.name || null,
    }))

    const replyTo = raw.replyTo?.[0]?.emailAddress
      ? {
          email: raw.replyTo[0].emailAddress.address,
          name: raw.replyTo[0].emailAddress.name || null,
        }
      : null

    // Parse references from headers
    const references = (headers['references'] || '')
      .split(/\s+/)
      .filter((r) => r.length > 0)
      .map((r) => r.replace(/[<>]/g, ''))

    // Extract attachments
    const attachments: AttachmentInfo[] = (raw.attachments || []).map((att) => ({
      id: att.id,
      filename: att.name,
      mimeType: att.contentType,
      size: att.size,
    }))

    // Determine direction based on draft status and folder
    const isSent = raw.isDraft === false && !raw.from?.emailAddress

    const receivedDate = new Date(raw.receivedDateTime)
    const sentDate = raw.sentDateTime ? new Date(raw.sentDateTime) : receivedDate

    return {
      id: `microsoft_${raw.id}`,
      externalId: raw.id,
      threadExternalId: raw.conversationId,
      accountId,
      organizationId,
      provider: 'microsoft',

      messageId: raw.internetMessageId?.replace(/[<>]/g, '') || raw.id,
      inReplyTo: headers['in-reply-to']?.replace(/[<>]/g, '') || null,
      references,

      from,
      to,
      cc,
      bcc,
      replyTo,

      subject: raw.subject || '(no subject)',
      bodyText,
      bodyHtml,
      snippet: raw.bodyPreview || bodyText.substring(0, 200),

      hasAttachments: raw.hasAttachments,
      attachments,

      isRead: raw.isRead,
      isStarred: raw.flag?.flagStatus === 'flagged',
      labels: [],
      direction: isSent ? 'outbound' : 'inbound',

      date: sentDate,
      receivedAt: receivedDate,
      internalDate: receivedDate,

      rawHeaders: headers,
    }
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
    try {
      const accessToken = await this.getValidToken(credentials)

      const queryParams = new URLSearchParams({
        $select: [
          'id',
          'conversationId',
          'conversationIndex',
          'receivedDateTime',
          'sentDateTime',
          'hasAttachments',
          'internetMessageId',
          'subject',
          'bodyPreview',
          'isRead',
          'isDraft',
          'flag',
          'from',
          'toRecipients',
          'ccRecipients',
          'bccRecipients',
          'replyTo',
          'body',
          'internetMessageHeaders',
        ].join(','),
      })

      const raw = await this.graphRequest<MicrosoftRawMessage>(
        accessToken,
        `/me/messages/${messageId}?${queryParams.toString()}`
      )

      return this.parseMicrosoftMessage(
        raw,
        credentials.accountId,
        credentials.organizationId || ''
      )
    } catch (error) {
      console.error(`Failed to fetch Microsoft message ${messageId}:`, error)
      return null
    }
  }

  /**
   * Validate credentials by fetching user profile
   */
  async validateCredentials(credentials: AccountCredentials): Promise<boolean> {
    try {
      const accessToken = await this.getValidToken(credentials)
      await this.graphRequest(accessToken, '/me')
      return true
    } catch {
      return false
    }
  }
}

// Export singleton instance
export const microsoftSyncProvider = new MicrosoftSyncProvider()
