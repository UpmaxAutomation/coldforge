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
import { google } from 'googleapis'

interface GoogleWorkspaceConfig {
  serviceAccountEmail: string
  privateKey: string
  adminEmail: string
  customerId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDirectory = any

export class GoogleWorkspaceProvider implements MailboxProviderClient {
  name = 'google_workspace'
  private config: GoogleWorkspaceConfig
  private admin: AdminDirectory

  constructor(config: GoogleWorkspaceConfig) {
    this.config = config

    // Create JWT client for service account
    const auth = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.privateKey,
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.user',
        'https://www.googleapis.com/auth/admin.directory.user.alias',
        'https://www.googleapis.com/auth/admin.directory.domain',
      ],
      subject: config.adminEmail, // Impersonate admin
    })

    this.admin = google.admin({ version: 'directory_v1', auth })
  }

  async createMailbox(config: MailboxConfig): Promise<MailboxCreateResult> {
    try {
      const password = config.password || this.generateSecurePassword()

      const response = await this.admin.users.insert({
        requestBody: {
          primaryEmail: config.email,
          name: {
            givenName: config.firstName,
            familyName: config.lastName,
          },
          password,
          changePasswordAtNextLogin: false,
        },
      })

      const user = response.data

      // Add aliases if provided
      if (config.aliases && config.aliases.length > 0) {
        for (const alias of config.aliases) {
          try {
            await this.addAlias(config.email, alias)
          } catch (error) {
            console.error(`Failed to add alias ${alias}:`, error)
          }
        }
      }

      return {
        success: true,
        user: this.mapGoogleUser(user),
      }
    } catch (error) {
      console.error('Google Workspace create mailbox error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create mailbox',
      }
    }
  }

  async updateMailbox(email: string, updates: Partial<MailboxConfig>): Promise<MailboxUpdateResult> {
    try {
      const updateBody: Record<string, unknown> = {}

      if (updates.firstName || updates.lastName) {
        updateBody.name = {
          givenName: updates.firstName,
          familyName: updates.lastName,
        }
      }

      if (updates.password) {
        updateBody.password = updates.password
        updateBody.changePasswordAtNextLogin = false
      }

      const response = await this.admin.users.update({
        userKey: email,
        requestBody: updateBody,
      })

      return {
        success: true,
        user: this.mapGoogleUser(response.data),
      }
    } catch (error) {
      console.error('Google Workspace update mailbox error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update mailbox',
      }
    }
  }

  async deleteMailbox(email: string): Promise<MailboxDeleteResult> {
    try {
      await this.admin.users.delete({
        userKey: email,
      })

      return { success: true }
    } catch (error) {
      console.error('Google Workspace delete mailbox error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete mailbox',
      }
    }
  }

  async getMailbox(email: string): Promise<MailboxUser | null> {
    try {
      const response = await this.admin.users.get({
        userKey: email,
        projection: 'full',
      })

      return this.mapGoogleUser(response.data)
    } catch (error) {
      console.error('Google Workspace get mailbox error:', error)
      return null
    }
  }

  async listMailboxes(domain: string): Promise<MailboxUser[]> {
    try {
      const users: MailboxUser[] = []
      let pageToken: string | undefined

      do {
        const response = await this.admin.users.list({
          customer: this.config.customerId,
          domain,
          maxResults: 500,
          pageToken,
        })

        if (response.data.users) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          users.push(...response.data.users.map((u: any) => this.mapGoogleUser(u)))
        }

        pageToken = response.data.nextPageToken || undefined
      } while (pageToken)

      return users
    } catch (error) {
      console.error('Google Workspace list mailboxes error:', error)
      return []
    }
  }

  async suspendMailbox(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.admin.users.update({
        userKey: email,
        requestBody: {
          suspended: true,
        },
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
      await this.admin.users.update({
        userKey: email,
        requestBody: {
          suspended: false,
        },
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
      await this.admin.users.aliases.insert({
        userKey: email,
        requestBody: {
          alias,
        },
      })

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
      await this.admin.users.aliases.delete({
        userKey: email,
        alias,
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
      const response = await this.admin.users.get({
        userKey: email,
        projection: 'full',
      })

      const user = response.data

      return {
        emailsSent: 0, // Would need Gmail API for this
        emailsReceived: 0,
        storageUsed: parseInt(user.emails?.[0]?.['quotaUsedInBytes'] as string || '0', 10),
        lastActivity: user.lastLoginTime || undefined,
      }
    } catch (error) {
      console.error('Google Workspace get stats error:', error)
      return null
    }
  }

  async setSendingQuota(email: string, quota: number): Promise<{ success: boolean; error?: string }> {
    // Google Workspace sending limits are managed at the domain/org level
    // Individual user limits require custom implementation
    console.log(`Setting quota ${quota} for ${email} - requires custom implementation`)
    return {
      success: false,
      error: 'Per-user sending quota requires Google Vault or custom implementation',
    }
  }

  async getSendingQuota(email: string): Promise<MailboxQuota | null> {
    // Default Google Workspace limits
    return {
      used: 0,
      limit: 2000, // Default daily sending limit for Google Workspace
      unit: 'emails',
    }
  }

  private mapGoogleUser(user: Record<string, unknown>): MailboxUser {
    const name = user.name as { givenName?: string; familyName?: string } | undefined
    const aliases = (user.aliases as string[]) || []
    const emails = (user.emails as Array<{ address?: string }>) || []

    return {
      id: user.id as string,
      email: user.primaryEmail as string,
      firstName: name?.givenName || '',
      lastName: name?.familyName || '',
      displayName: `${name?.givenName || ''} ${name?.familyName || ''}`.trim(),
      status: user.suspended ? 'suspended' : user.isEnrolledIn2Sv ? 'active' : 'active',
      createdAt: user.creationTime as string,
      lastLoginAt: user.lastLoginTime as string | undefined,
      aliases: [...aliases, ...emails.map(e => e.address).filter((a): a is string => !!a && a !== user.primaryEmail)],
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
export function createGoogleWorkspaceClient(
  serviceAccountEmail: string,
  privateKey: string,
  adminEmail: string,
  customerId: string
): GoogleWorkspaceProvider {
  return new GoogleWorkspaceProvider({
    serviceAccountEmail,
    privateKey,
    adminEmail,
    customerId,
  })
}
