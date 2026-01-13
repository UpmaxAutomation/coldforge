// Common types for mailbox provisioning

export interface MailboxConfig {
  email: string
  firstName: string
  lastName: string
  password?: string
  aliases?: string[]
  sendingQuota?: number
}

export interface MailboxUser {
  id: string
  email: string
  firstName: string
  lastName: string
  displayName: string
  status: 'active' | 'suspended' | 'deleted' | 'pending'
  createdAt: string
  lastLoginAt?: string
  aliases: string[]
  sendingQuota?: number
}

export interface MailboxCreateResult {
  success: boolean
  user?: MailboxUser
  error?: string
}

export interface MailboxUpdateResult {
  success: boolean
  user?: MailboxUser
  error?: string
}

export interface MailboxDeleteResult {
  success: boolean
  error?: string
}

export interface MailboxQuota {
  used: number
  limit: number
  unit: 'bytes' | 'emails'
}

export interface MailboxStats {
  emailsSent: number
  emailsReceived: number
  storageUsed: number
  lastActivity?: string
}

export interface MailboxProviderClient {
  name: string

  // User management
  createMailbox(config: MailboxConfig): Promise<MailboxCreateResult>
  updateMailbox(email: string, updates: Partial<MailboxConfig>): Promise<MailboxUpdateResult>
  deleteMailbox(email: string): Promise<MailboxDeleteResult>
  getMailbox(email: string): Promise<MailboxUser | null>
  listMailboxes(domain: string): Promise<MailboxUser[]>

  // Status management
  suspendMailbox(email: string): Promise<{ success: boolean; error?: string }>
  activateMailbox(email: string): Promise<{ success: boolean; error?: string }>

  // Aliases
  addAlias?(email: string, alias: string): Promise<{ success: boolean; error?: string }>
  removeAlias?(email: string, alias: string): Promise<{ success: boolean; error?: string }>

  // Sending limits
  setSendingQuota?(email: string, quota: number): Promise<{ success: boolean; error?: string }>
  getSendingQuota?(email: string): Promise<MailboxQuota | null>

  // Stats
  getMailboxStats?(email: string): Promise<MailboxStats | null>
}

export type MailboxProviderType = 'google_workspace' | 'microsoft_365' | 'custom_smtp'

export interface MailboxProviderConfig {
  google_workspace?: {
    serviceAccountEmail: string
    privateKey: string
    adminEmail: string
    customerId: string
  }
  microsoft_365?: {
    tenantId: string
    clientId: string
    clientSecret: string
  }
  custom_smtp?: {
    apiEndpoint: string
    apiKey: string
  }
}
