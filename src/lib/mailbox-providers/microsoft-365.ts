import type {
  MailboxConfig,
  MailboxUser,
  MailboxCreateResult,
  MailboxUpdateResult,
  MailboxDeleteResult,
  MailboxProviderClient,
  MailboxStats,
  MailboxQuota,
} from './types'
import { ConfidentialClientApplication } from '@azure/msal-node'

interface Microsoft365Config {
  tenantId: string
  clientId: string
  clientSecret: string
}

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

export class Microsoft365Provider implements MailboxProviderClient {
  name = 'microsoft_365'
  private config: Microsoft365Config
  private msalClient: ConfidentialClientApplication
  private accessToken: string | null = null
  private tokenExpiry: Date | null = null

  constructor(config: Microsoft365Config) {
    this.config = config

    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    })
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken
    }

    const result = await this.msalClient.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    })

    if (!result?.accessToken) {
      throw new Error('Failed to acquire access token')
    }

    this.accessToken = result.accessToken
    // Token is valid for ~1 hour, refresh 5 minutes before expiry
    this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000)

    return this.accessToken
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAccessToken()

    const response = await fetch(`${GRAPH_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `Microsoft Graph API error: ${response.status}`)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T
    }

    return response.json()
  }

  async createMailbox(config: MailboxConfig): Promise<MailboxCreateResult> {
    try {
      const password = config.password || this.generateSecurePassword()
      const [localPart, domain] = config.email.split('@')

      // Create user with Exchange mailbox
      const user = await this.request<{
        id: string
        userPrincipalName: string
        givenName: string
        surname: string
        displayName: string
        createdDateTime: string
      }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          accountEnabled: true,
          displayName: `${config.firstName} ${config.lastName}`,
          givenName: config.firstName,
          surname: config.lastName,
          mailNickname: localPart,
          userPrincipalName: config.email,
          passwordProfile: {
            password,
            forceChangePasswordNextSignIn: false,
          },
          usageLocation: 'US', // Required for license assignment
        }),
      })

      // Note: License assignment requires specific license SKU IDs
      // This would be handled separately based on the organization's licenses

      return {
        success: true,
        user: this.mapMicrosoftUser(user),
      }
    } catch (error) {
      console.error('Microsoft 365 create mailbox error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create mailbox',
      }
    }
  }

  async updateMailbox(email: string, updates: Partial<MailboxConfig>): Promise<MailboxUpdateResult> {
    try {
      const updateBody: Record<string, unknown> = {}

      if (updates.firstName) {
        updateBody.givenName = updates.firstName
      }

      if (updates.lastName) {
        updateBody.surname = updates.lastName
      }

      if (updates.firstName || updates.lastName) {
        updateBody.displayName = `${updates.firstName || ''} ${updates.lastName || ''}`.trim()
      }

      await this.request(`/users/${email}`, {
        method: 'PATCH',
        body: JSON.stringify(updateBody),
      })

      // If password update is requested
      if (updates.password) {
        await this.request(`/users/${email}`, {
          method: 'PATCH',
          body: JSON.stringify({
            passwordProfile: {
              password: updates.password,
              forceChangePasswordNextSignIn: false,
            },
          }),
        })
      }

      // Fetch updated user
      const user = await this.getMailbox(email)

      return {
        success: true,
        user: user || undefined,
      }
    } catch (error) {
      console.error('Microsoft 365 update mailbox error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update mailbox',
      }
    }
  }

  async deleteMailbox(email: string): Promise<MailboxDeleteResult> {
    try {
      await this.request(`/users/${email}`, {
        method: 'DELETE',
      })

      return { success: true }
    } catch (error) {
      console.error('Microsoft 365 delete mailbox error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete mailbox',
      }
    }
  }

  async getMailbox(email: string): Promise<MailboxUser | null> {
    try {
      const user = await this.request<{
        id: string
        userPrincipalName: string
        givenName: string
        surname: string
        displayName: string
        accountEnabled: boolean
        createdDateTime: string
        signInActivity?: {
          lastSignInDateTime?: string
        }
        proxyAddresses?: string[]
      }>(`/users/${email}?$select=id,userPrincipalName,givenName,surname,displayName,accountEnabled,createdDateTime,signInActivity,proxyAddresses`)

      return this.mapMicrosoftUser(user)
    } catch (error) {
      console.error('Microsoft 365 get mailbox error:', error)
      return null
    }
  }

  async listMailboxes(domain: string): Promise<MailboxUser[]> {
    try {
      const users: MailboxUser[] = []
      let nextLink: string | null = `/users?$filter=endswith(userPrincipalName,'@${domain}')&$select=id,userPrincipalName,givenName,surname,displayName,accountEnabled,createdDateTime,signInActivity,proxyAddresses&$top=999`

      interface GraphResponse {
        value: Array<{
          id: string
          userPrincipalName: string
          givenName: string
          surname: string
          displayName: string
          accountEnabled: boolean
          createdDateTime: string
          signInActivity?: { lastSignInDateTime?: string }
          proxyAddresses?: string[]
        }>
        '@odata.nextLink'?: string
      }

      while (nextLink) {
        const endpoint = nextLink.startsWith('http') ? nextLink.replace(GRAPH_API_BASE, '') : nextLink
        const response: GraphResponse = await this.request<GraphResponse>(endpoint)

        users.push(...response.value.map(u => this.mapMicrosoftUser(u)))
        nextLink = response['@odata.nextLink'] || null
      }

      return users
    } catch (error) {
      console.error('Microsoft 365 list mailboxes error:', error)
      return []
    }
  }

  async suspendMailbox(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request(`/users/${email}`, {
        method: 'PATCH',
        body: JSON.stringify({
          accountEnabled: false,
        }),
      })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to suspend mailbox',
      }
    }
  }

  async activateMailbox(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request(`/users/${email}`, {
        method: 'PATCH',
        body: JSON.stringify({
          accountEnabled: true,
        }),
      })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to activate mailbox',
      }
    }
  }

  async addAlias(email: string, alias: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current proxyAddresses
      const user = await this.request<{
        proxyAddresses: string[]
      }>(`/users/${email}?$select=proxyAddresses`)

      const proxyAddresses = user.proxyAddresses || []
      const smtpAlias = `smtp:${alias}`

      if (!proxyAddresses.includes(smtpAlias)) {
        proxyAddresses.push(smtpAlias)

        await this.request(`/users/${email}`, {
          method: 'PATCH',
          body: JSON.stringify({ proxyAddresses }),
        })
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add alias',
      }
    }
  }

  async removeAlias(email: string, alias: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await this.request<{
        proxyAddresses: string[]
      }>(`/users/${email}?$select=proxyAddresses`)

      const proxyAddresses = (user.proxyAddresses || []).filter(
        addr => !addr.toLowerCase().endsWith(`:${alias.toLowerCase()}`)
      )

      await this.request(`/users/${email}`, {
        method: 'PATCH',
        body: JSON.stringify({ proxyAddresses }),
      })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove alias',
      }
    }
  }

  async getMailboxStats(email: string): Promise<MailboxStats | null> {
    try {
      // Get mailbox settings and statistics
      const mailbox = await this.request<{
        totalItemSize?: { value: number }
      }>(`/users/${email}/mailboxSettings`).catch(() => null)

      const user = await this.getMailbox(email)

      return {
        emailsSent: 0, // Would need Message Trace for this
        emailsReceived: 0,
        storageUsed: 0, // Requires Exchange Online reporting
        lastActivity: user?.lastLoginAt,
      }
    } catch (error) {
      console.error('Microsoft 365 get stats error:', error)
      return null
    }
  }

  async setSendingQuota(email: string, quota: number): Promise<{ success: boolean; error?: string }> {
    // Microsoft 365 sending limits are managed through Exchange Online policies
    console.log(`Setting quota ${quota} for ${email} - requires Exchange Online PowerShell or admin portal`)
    return {
      success: false,
      error: 'Per-user sending quota requires Exchange Online admin configuration',
    }
  }

  async getSendingQuota(email: string): Promise<MailboxQuota | null> {
    // Default Microsoft 365 limits
    return {
      used: 0,
      limit: 10000, // Default daily sending limit for M365
      unit: 'emails',
    }
  }

  // License management
  async assignLicense(email: string, skuId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request(`/users/${email}/assignLicense`, {
        method: 'POST',
        body: JSON.stringify({
          addLicenses: [{ skuId }],
          removeLicenses: [],
        }),
      })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign license',
      }
    }
  }

  async getAvailableLicenses(): Promise<Array<{ skuId: string; skuPartNumber: string; available: number }>> {
    try {
      const response = await this.request<{
        value: Array<{
          skuId: string
          skuPartNumber: string
          consumedUnits: number
          prepaidUnits: { enabled: number }
        }>
      }>('/subscribedSkus')

      return response.value.map(sku => ({
        skuId: sku.skuId,
        skuPartNumber: sku.skuPartNumber,
        available: sku.prepaidUnits.enabled - sku.consumedUnits,
      }))
    } catch (error) {
      console.error('Microsoft 365 get licenses error:', error)
      return []
    }
  }

  private mapMicrosoftUser(user: {
    id: string
    userPrincipalName: string
    givenName?: string
    surname?: string
    displayName?: string
    accountEnabled?: boolean
    createdDateTime?: string
    signInActivity?: { lastSignInDateTime?: string }
    proxyAddresses?: string[]
  }): MailboxUser {
    const aliases = (user.proxyAddresses || [])
      .filter(addr => addr.toLowerCase().startsWith('smtp:'))
      .map(addr => addr.substring(5))
      .filter(addr => addr.toLowerCase() !== user.userPrincipalName.toLowerCase())

    return {
      id: user.id,
      email: user.userPrincipalName,
      firstName: user.givenName || '',
      lastName: user.surname || '',
      displayName: user.displayName || user.userPrincipalName,
      status: user.accountEnabled === false ? 'suspended' : 'active',
      createdAt: user.createdDateTime || new Date().toISOString(),
      lastLoginAt: user.signInActivity?.lastSignInDateTime,
      aliases,
    }
  }

  private generateSecurePassword(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()'
    let password = ''
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return password
  }
}

// Factory function
export function createMicrosoft365Client(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Microsoft365Provider {
  return new Microsoft365Provider({
    tenantId,
    clientId,
    clientSecret,
  })
}
