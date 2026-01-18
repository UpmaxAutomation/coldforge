// Microsoft 365 Admin SDK Integration
// Handles mailbox provisioning via Microsoft Graph API

import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { createClient } from '../supabase/server';
import { decrypt, encrypt } from '../encryption';

export interface Microsoft365Config {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  domain: string;
  adminEmail?: string;
}

export interface Microsoft365MailboxCreate {
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  password: string;
  usageLocation?: string; // Required for license assignment
  licenseSkuId?: string;
}

export interface Microsoft365MailboxResult {
  success: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

// Initialize Microsoft Graph client
export function getMicrosoftGraphClient(config: Microsoft365Config): Client {
  const credential = new ClientSecretCredential(
    config.tenantId,
    config.clientId,
    config.clientSecret
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: [
      'https://graph.microsoft.com/.default',
    ],
  });

  return Client.initWithMiddleware({
    authProvider,
  });
}

// Create a new mailbox (user) in Microsoft 365
export async function createMicrosoft365Mailbox(
  config: Microsoft365Config,
  mailbox: Microsoft365MailboxCreate
): Promise<Microsoft365MailboxResult> {
  try {
    const client = getMicrosoftGraphClient(config);

    // Create the user
    const user = await client.api('/users').post({
      accountEnabled: true,
      displayName: mailbox.displayName,
      mailNickname: mailbox.email.split('@')[0],
      userPrincipalName: mailbox.email,
      givenName: mailbox.firstName,
      surname: mailbox.lastName,
      passwordProfile: {
        forceChangePasswordNextSignIn: false,
        password: mailbox.password,
      },
      usageLocation: mailbox.usageLocation || 'US',
    });

    // Assign license if provided
    if (mailbox.licenseSkuId) {
      await client.api(`/users/${user.id}/assignLicense`).post({
        addLicenses: [
          {
            skuId: mailbox.licenseSkuId,
            disabledPlans: [],
          },
        ],
        removeLicenses: [],
      });
    }

    return {
      success: true,
      userId: user.id,
      email: user.userPrincipalName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create mailbox';
    return { success: false, error: message };
  }
}

// Create email alias (proxyAddresses)
export async function createMicrosoft365Alias(
  config: Microsoft365Config,
  userEmail: string,
  alias: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getMicrosoftGraphClient(config);

    // Get current user to get existing proxy addresses
    const user = await client.api(`/users/${userEmail}`).select('proxyAddresses').get();
    const currentAddresses: string[] = user.proxyAddresses || [];

    // Add new alias (smtp: prefix for alias, SMTP: for primary)
    const newAddresses = [...currentAddresses, `smtp:${alias}`];

    await client.api(`/users/${userEmail}`).patch({
      proxyAddresses: newAddresses,
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
export async function setMicrosoft365ProfilePhoto(
  config: Microsoft365Config,
  userEmail: string,
  photoData: Buffer
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getMicrosoftGraphClient(config);

    await client.api(`/users/${userEmail}/photo/$value`)
      .header('Content-Type', 'image/jpeg')
      .put(photoData);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set photo',
    };
  }
}

// Get user details
export async function getMicrosoft365User(
  config: Microsoft365Config,
  userEmail: string
): Promise<{
  exists: boolean;
  user?: {
    id: string;
    email: string;
    displayName: string;
    firstName: string;
    lastName: string;
    accountEnabled: boolean;
    createdAt: string;
  };
  error?: string;
}> {
  try {
    const client = getMicrosoftGraphClient(config);

    const user = await client.api(`/users/${userEmail}`)
      .select('id,userPrincipalName,displayName,givenName,surname,accountEnabled,createdDateTime')
      .get();

    return {
      exists: true,
      user: {
        id: user.id,
        email: user.userPrincipalName,
        displayName: user.displayName,
        firstName: user.givenName || '',
        lastName: user.surname || '',
        accountEnabled: user.accountEnabled,
        createdAt: user.createdDateTime,
      },
    };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return { exists: false };
    }
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Failed to get user',
    };
  }
}

// Disable user (block sign-in)
export async function disableMicrosoft365User(
  config: Microsoft365Config,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getMicrosoftGraphClient(config);

    await client.api(`/users/${userEmail}`).patch({
      accountEnabled: false,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to disable user',
    };
  }
}

// Enable user
export async function enableMicrosoft365User(
  config: Microsoft365Config,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getMicrosoftGraphClient(config);

    await client.api(`/users/${userEmail}`).patch({
      accountEnabled: true,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to enable user',
    };
  }
}

// Delete user
export async function deleteMicrosoft365User(
  config: Microsoft365Config,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getMicrosoftGraphClient(config);

    await client.api(`/users/${userEmail}`).delete();

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete user',
    };
  }
}

// List users in tenant
export async function listMicrosoft365Users(
  config: Microsoft365Config,
  options: {
    top?: number;
    skip?: number;
    filter?: string;
  } = {}
): Promise<{
  users: Array<{
    id: string;
    email: string;
    displayName: string;
    firstName: string;
    lastName: string;
    accountEnabled: boolean;
  }>;
  nextLink?: string;
  error?: string;
}> {
  try {
    const client = getMicrosoftGraphClient(config);

    let request = client.api('/users')
      .select('id,userPrincipalName,displayName,givenName,surname,accountEnabled')
      .top(options.top || 100);

    if (options.filter) {
      request = request.filter(options.filter);
    }

    const response = await request.get();

    return {
      users: (response.value || []).map((u: {
        id: string;
        userPrincipalName: string;
        displayName: string;
        givenName?: string;
        surname?: string;
        accountEnabled: boolean;
      }) => ({
        id: u.id,
        email: u.userPrincipalName,
        displayName: u.displayName,
        firstName: u.givenName || '',
        lastName: u.surname || '',
        accountEnabled: u.accountEnabled,
      })),
      nextLink: response['@odata.nextLink'],
    };
  } catch (error) {
    return {
      users: [],
      error: error instanceof Error ? error.message : 'Failed to list users',
    };
  }
}

// Update user password
export async function updateMicrosoft365Password(
  config: Microsoft365Config,
  userEmail: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getMicrosoftGraphClient(config);

    await client.api(`/users/${userEmail}`).patch({
      passwordProfile: {
        forceChangePasswordNextSignIn: false,
        password: newPassword,
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

// Get available licenses
export async function getMicrosoft365Licenses(
  config: Microsoft365Config
): Promise<{
  licenses: Array<{
    skuId: string;
    skuPartNumber: string;
    servicePlanName: string;
    totalUnits: number;
    consumedUnits: number;
    availableUnits: number;
  }>;
  error?: string;
}> {
  try {
    const client = getMicrosoftGraphClient(config);

    const response = await client.api('/subscribedSkus').get();

    return {
      licenses: (response.value || []).map((sku: {
        skuId: string;
        skuPartNumber: string;
        servicePlans: Array<{ servicePlanName: string }>;
        prepaidUnits: { enabled: number };
        consumedUnits: number;
      }) => ({
        skuId: sku.skuId,
        skuPartNumber: sku.skuPartNumber,
        servicePlanName: sku.servicePlans?.[0]?.servicePlanName || sku.skuPartNumber,
        totalUnits: sku.prepaidUnits?.enabled || 0,
        consumedUnits: sku.consumedUnits || 0,
        availableUnits: (sku.prepaidUnits?.enabled || 0) - (sku.consumedUnits || 0),
      })),
    };
  } catch (error) {
    return {
      licenses: [],
      error: error instanceof Error ? error.message : 'Failed to get licenses',
    };
  }
}

// Store provider config
export async function storeMicrosoft365Config(
  workspaceId: string,
  config: Microsoft365Config
): Promise<{ success: boolean; configId?: string; error?: string }> {
  try {
    const supabase = await createClient();

    // Encrypt sensitive data
    const encryptedCredentials = encrypt(JSON.stringify({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }));

    const { data, error } = await supabase
      .from('email_provider_configs')
      .upsert({
        workspace_id: workspaceId,
        provider: 'microsoft',
        config_name: `Microsoft 365 - ${config.domain}`,
        oauth_credentials_encrypted: encryptedCredentials,
        domain: config.domain,
        admin_email: config.adminEmail,
        customer_id: config.tenantId,
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
export async function getMicrosoft365Config(
  configId: string
): Promise<Microsoft365Config | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('email_provider_configs')
      .select('*')
      .eq('id', configId)
      .eq('provider', 'microsoft')
      .single();

    if (error || !data) return null;

    const credentials = JSON.parse(decrypt(data.oauth_credentials_encrypted));

    return {
      ...credentials,
      domain: data.domain,
      adminEmail: data.admin_email,
    };
  } catch {
    return null;
  }
}
