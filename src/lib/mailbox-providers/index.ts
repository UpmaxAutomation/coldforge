// Re-export all mailbox provider types and clients
export * from './types'
export * from './google-workspace'
export * from './microsoft-365'

import { GoogleWorkspaceProvider, createGoogleWorkspaceClient } from './google-workspace'
import { Microsoft365Provider, createMicrosoft365Client } from './microsoft-365'
import type { MailboxProviderClient, MailboxProviderType, MailboxProviderConfig, MailboxConfig } from './types'

// Factory to create mailbox provider clients
export function createMailboxProviderClient(
  type: MailboxProviderType,
  config: MailboxProviderConfig
): MailboxProviderClient | null {
  switch (type) {
    case 'google_workspace':
      if (config.google_workspace) {
        return createGoogleWorkspaceClient(
          config.google_workspace.serviceAccountEmail,
          config.google_workspace.privateKey,
          config.google_workspace.adminEmail,
          config.google_workspace.customerId
        )
      }
      break
    case 'microsoft_365':
      if (config.microsoft_365) {
        return createMicrosoft365Client(
          config.microsoft_365.tenantId,
          config.microsoft_365.clientId,
          config.microsoft_365.clientSecret
        )
      }
      break
    case 'custom_smtp':
      // Custom SMTP would be handled differently - no provisioning, just connection
      console.warn('Custom SMTP does not support mailbox provisioning')
      return null
  }
  return null
}

// Bulk mailbox provisioning
export interface BulkProvisioningResult {
  total: number
  successful: number
  failed: number
  results: Array<{
    email: string
    success: boolean
    error?: string
  }>
}

export async function bulkProvisionMailboxes(
  client: MailboxProviderClient,
  mailboxes: MailboxConfig[],
  options: {
    stopOnError?: boolean
    delayMs?: number
  } = {}
): Promise<BulkProvisioningResult> {
  const { stopOnError = false, delayMs = 500 } = options
  const results: BulkProvisioningResult['results'] = []
  let successful = 0
  let failed = 0

  for (const mailbox of mailboxes) {
    try {
      const result = await client.createMailbox(mailbox)

      results.push({
        email: mailbox.email,
        success: result.success,
        error: result.error,
      })

      if (result.success) {
        successful++
      } else {
        failed++
        if (stopOnError) {
          break
        }
      }

      // Add delay between operations to avoid rate limiting
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    } catch (error) {
      failed++
      results.push({
        email: mailbox.email,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      if (stopOnError) {
        break
      }
    }
  }

  return {
    total: mailboxes.length,
    successful,
    failed,
    results,
  }
}

// Generate random mailbox names
export function generateMailboxName(domain: string, options: {
  prefix?: string
  useNumbers?: boolean
  useRandomChars?: boolean
  length?: number
} = {}): string {
  const {
    prefix = '',
    useNumbers = true,
    useRandomChars = true,
    length = 8
  } = options

  let localPart = prefix

  if (useRandomChars) {
    const chars = 'abcdefghijklmnopqrstuvwxyz'
    for (let i = 0; i < length; i++) {
      localPart += chars.charAt(Math.floor(Math.random() * chars.length))
    }
  }

  if (useNumbers) {
    const num = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    localPart += num
  }

  return `${localPart}@${domain}`
}

// Generate first/last name combinations
const FIRST_NAMES = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica',
  'Sarah', 'Karen', 'Nancy', 'Lisa', 'Betty', 'Margaret', 'Sandra', 'Ashley',
  'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew',
]

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
]

export function generateRandomName(): { firstName: string; lastName: string } {
  return {
    firstName: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)],
    lastName: LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)],
  }
}

// Generate complete mailbox config with random data
export function generateRandomMailboxConfig(domain: string): MailboxConfig {
  const { firstName, lastName } = generateRandomName()
  const emailVariant = Math.random()

  let localPart: string
  if (emailVariant < 0.33) {
    // first.last@domain
    localPart = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`
  } else if (emailVariant < 0.66) {
    // firstlast@domain
    localPart = `${firstName.toLowerCase()}${lastName.toLowerCase()}`
  } else {
    // first.last123@domain
    localPart = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 100)}`
  }

  return {
    email: `${localPart}@${domain}`,
    firstName,
    lastName,
  }
}

// Generate batch of mailbox configs
export function generateMailboxBatch(domain: string, count: number): MailboxConfig[] {
  const configs: MailboxConfig[] = []
  const usedEmails = new Set<string>()

  while (configs.length < count) {
    const config = generateRandomMailboxConfig(domain)

    if (!usedEmails.has(config.email)) {
      usedEmails.add(config.email)
      configs.push(config)
    }
  }

  return configs
}
