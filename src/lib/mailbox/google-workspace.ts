// Google Workspace Admin SDK Integration
// Handles mailbox provisioning via Google Workspace

import { google } from 'googleapis';
import { createClient } from '../supabase/server';
import { decrypt, encrypt } from '../encryption';

export interface GoogleWorkspaceConfig {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  serviceAccountKey?: string;
  domain: string;
  adminEmail: string;
  customerId?: string;
}

export interface GoogleMailboxCreate {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  orgUnitPath?: string;
}

export interface GoogleMailboxResult {
  success: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

// Initialize Google Admin SDK client
export function getGoogleAdminClient(config: GoogleWorkspaceConfig) {
  let auth;

  if (config.serviceAccountKey) {
    // Service account authentication
    const key = JSON.parse(config.serviceAccountKey);
    auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.user',
        'https://www.googleapis.com/auth/admin.directory.user.alias',
        'https://www.googleapis.com/auth/admin.directory.domain',
      ],
      subject: config.adminEmail, // Impersonate admin
    });
  } else if (config.refreshToken) {
    // OAuth2 authentication
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret
    );
    oauth2Client.setCredentials({ refresh_token: config.refreshToken });
    auth = oauth2Client;
  } else {
    throw new Error('Either serviceAccountKey or refreshToken is required');
  }

  return google.admin({ version: 'directory_v1', auth });
}

// Create a new mailbox (user) in Google Workspace
export async function createGoogleMailbox(
  config: GoogleWorkspaceConfig,
  mailbox: GoogleMailboxCreate
): Promise<GoogleMailboxResult> {
  try {
    const admin = getGoogleAdminClient(config);

    const response = await admin.users.insert({
      requestBody: {
        primaryEmail: mailbox.email,
        name: {
          givenName: mailbox.firstName,
          familyName: mailbox.lastName,
        },
        password: mailbox.password,
        changePasswordAtNextLogin: false,
        recoveryEmail: mailbox.recoveryEmail,
        recoveryPhone: mailbox.recoveryPhone,
        orgUnitPath: mailbox.orgUnitPath || '/',
      },
    });

    return {
      success: true,
      userId: response.data.id || undefined,
      email: response.data.primaryEmail || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create mailbox';
    return { success: false, error: message };
  }
}

// Create email alias
export async function createGoogleAlias(
  config: GoogleWorkspaceConfig,
  userEmail: string,
  alias: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getGoogleAdminClient(config);

    await admin.users.aliases.insert({
      userKey: userEmail,
      requestBody: {
        alias,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create alias',
    };
  }
}

// Update user profile photo
export async function setGoogleProfilePhoto(
  config: GoogleWorkspaceConfig,
  userEmail: string,
  photoData: string // Base64 encoded photo
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getGoogleAdminClient(config);

    await admin.users.photos.update({
      userKey: userEmail,
      requestBody: {
        photoData,
        mimeType: 'image/jpeg',
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set photo',
    };
  }
}

// Get user details
export async function getGoogleUser(
  config: GoogleWorkspaceConfig,
  userEmail: string
): Promise<{
  exists: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    suspended: boolean;
    createdAt: string;
  };
  error?: string;
}> {
  try {
    const admin = getGoogleAdminClient(config);

    const response = await admin.users.get({
      userKey: userEmail,
    });

    return {
      exists: true,
      user: {
        id: response.data.id || '',
        email: response.data.primaryEmail || '',
        firstName: response.data.name?.givenName || '',
        lastName: response.data.name?.familyName || '',
        suspended: response.data.suspended || false,
        createdAt: response.data.creationTime || '',
      },
    };
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      return { exists: false };
    }
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Failed to get user',
    };
  }
}

// Suspend user
export async function suspendGoogleUser(
  config: GoogleWorkspaceConfig,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getGoogleAdminClient(config);

    await admin.users.update({
      userKey: userEmail,
      requestBody: {
        suspended: true,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to suspend user',
    };
  }
}

// Unsuspend user
export async function unsuspendGoogleUser(
  config: GoogleWorkspaceConfig,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getGoogleAdminClient(config);

    await admin.users.update({
      userKey: userEmail,
      requestBody: {
        suspended: false,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unsuspend user',
    };
  }
}

// Delete user
export async function deleteGoogleUser(
  config: GoogleWorkspaceConfig,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getGoogleAdminClient(config);

    await admin.users.delete({
      userKey: userEmail,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete user',
    };
  }
}

// List users in domain
export async function listGoogleUsers(
  config: GoogleWorkspaceConfig,
  options: {
    maxResults?: number;
    pageToken?: string;
    query?: string;
  } = {}
): Promise<{
  users: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    suspended: boolean;
  }>;
  nextPageToken?: string;
  error?: string;
}> {
  try {
    const admin = getGoogleAdminClient(config);

    const response = await admin.users.list({
      customer: config.customerId || 'my_customer',
      domain: config.domain,
      maxResults: options.maxResults || 100,
      pageToken: options.pageToken,
      query: options.query,
    });

    return {
      users: (response.data.users || []).map(u => ({
        id: u.id || '',
        email: u.primaryEmail || '',
        firstName: u.name?.givenName || '',
        lastName: u.name?.familyName || '',
        suspended: u.suspended || false,
      })),
      nextPageToken: response.data.nextPageToken || undefined,
    };
  } catch (error) {
    return {
      users: [],
      error: error instanceof Error ? error.message : 'Failed to list users',
    };
  }
}

// Update user password
export async function updateGooglePassword(
  config: GoogleWorkspaceConfig,
  userEmail: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getGoogleAdminClient(config);

    await admin.users.update({
      userKey: userEmail,
      requestBody: {
        password: newPassword,
        changePasswordAtNextLogin: false,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update password',
    };
  }
}

// Store provider config
export async function storeGoogleConfig(
  workspaceId: string,
  config: GoogleWorkspaceConfig
): Promise<{ success: boolean; configId?: string; error?: string }> {
  try {
    const supabase = await createClient();

    // Encrypt sensitive data
    const encryptedCredentials = config.serviceAccountKey
      ? encrypt(config.serviceAccountKey)
      : config.refreshToken
        ? encrypt(JSON.stringify({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            refreshToken: config.refreshToken,
          }))
        : null;

    const { data, error } = await supabase
      .from('email_provider_configs')
      .upsert({
        workspace_id: workspaceId,
        provider: 'google',
        config_name: `Google Workspace - ${config.domain}`,
        service_account_key_encrypted: config.serviceAccountKey ? encryptedCredentials : null,
        oauth_credentials_encrypted: config.refreshToken ? encryptedCredentials : null,
        domain: config.domain,
        admin_email: config.adminEmail,
        customer_id: config.customerId,
        is_active: true,
      }, {
        onConflict: 'workspace_id,domain,provider',
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, configId: data.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store config',
    };
  }
}

// Get provider config
export async function getGoogleConfig(
  configId: string
): Promise<GoogleWorkspaceConfig | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('email_provider_configs')
      .select('*')
      .eq('id', configId)
      .eq('provider', 'google')
      .single();

    if (error || !data) return null;

    let credentials: Partial<GoogleWorkspaceConfig> = {};

    if (data.service_account_key_encrypted) {
      credentials.serviceAccountKey = decrypt(data.service_account_key_encrypted);
    } else if (data.oauth_credentials_encrypted) {
      const oauth = JSON.parse(decrypt(data.oauth_credentials_encrypted));
      credentials = oauth;
    }

    return {
      ...credentials,
      domain: data.domain,
      adminEmail: data.admin_email,
      customerId: data.customer_id,
    } as GoogleWorkspaceConfig;
  } catch {
    return null;
  }
}
