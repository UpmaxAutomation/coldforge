import { ImapFlow, FetchMessageObject } from 'imapflow'

export interface ImapConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}

export async function createImapClient(config: ImapConfig): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
  })

  return client
}

export async function testImapConnection(config: ImapConfig): Promise<{
  success: boolean
  error?: string
}> {
  let client: ImapFlow | null = null
  try {
    client = await createImapClient(config)
    await client.connect()
    await client.logout()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown IMAP error',
    }
  } finally {
    if (client) {
      try {
        await client.logout()
      } catch {
        // Ignore logout errors
      }
    }
  }
}

export async function getImapMessages(
  config: ImapConfig,
  options: {
    folder?: string
    limit?: number
    since?: Date
    unseen?: boolean
  } = {}
): Promise<{
  success: boolean
  messages?: Array<{
    uid: number
    date: Date
    from: string
    to: string
    subject: string
    snippet: string
    flags: string[]
  }>
  error?: string
}> {
  let client: ImapFlow | null = null
  try {
    client = await createImapClient(config)
    await client.connect()

    const folder = options.folder || 'INBOX'
    const lock = await client.getMailboxLock(folder)

    try {
      const messages: Array<{
        uid: number
        date: Date
        from: string
        to: string
        subject: string
        snippet: string
        flags: string[]
      }> = []

      // Build search criteria
      const searchCriteria: Record<string, unknown> = {}
      if (options.since) {
        searchCriteria.since = options.since
      }
      if (options.unseen) {
        searchCriteria.seen = false
      }

      // Fetch messages
      const fetchOptions = {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        source: { start: 0, maxLength: 500 }, // Get snippet
      }

      let count = 0
      const limit = options.limit || 50

      for await (const msg of client.fetch(
        Object.keys(searchCriteria).length > 0 ? searchCriteria : { all: true },
        fetchOptions
      ) as AsyncIterable<FetchMessageObject>) {
        if (count >= limit) break

        const envelope = msg.envelope
        messages.push({
          uid: msg.uid,
          date: envelope?.date || new Date(),
          from: envelope?.from?.[0]?.address || 'unknown',
          to: envelope?.to?.[0]?.address || 'unknown',
          subject: envelope?.subject || '(no subject)',
          snippet: msg.source?.toString('utf-8').substring(0, 200) || '',
          flags: Array.from(msg.flags || []),
        })
        count++
      }

      return { success: true, messages }
    } finally {
      lock.release()
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch messages',
    }
  } finally {
    if (client) {
      try {
        await client.logout()
      } catch {
        // Ignore logout errors
      }
    }
  }
}

export async function markMessageAsRead(
  config: ImapConfig,
  uid: number,
  folder = 'INBOX'
): Promise<{ success: boolean; error?: string }> {
  let client: ImapFlow | null = null
  try {
    client = await createImapClient(config)
    await client.connect()

    const lock = await client.getMailboxLock(folder)
    try {
      await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true })
      return { success: true }
    } finally {
      lock.release()
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark message as read',
    }
  } finally {
    if (client) {
      try {
        await client.logout()
      } catch {
        // Ignore logout errors
      }
    }
  }
}

// Common IMAP configurations for popular providers
export const IMAP_PRESETS: Record<string, Partial<ImapConfig>> = {
  gmail: {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
  },
  outlook: {
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
  },
  yahoo: {
    host: 'imap.mail.yahoo.com',
    port: 993,
    secure: true,
  },
  zoho: {
    host: 'imap.zoho.com',
    port: 993,
    secure: true,
  },
}

export function getImapPreset(provider: string): Partial<ImapConfig> | undefined {
  return IMAP_PRESETS[provider.toLowerCase()]
}
