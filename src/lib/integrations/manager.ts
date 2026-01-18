// Integration Manager - Core integration lifecycle management

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Integration,
  IntegrationProvider,
  IntegrationType,
  IntegrationStatus,
  IntegrationConfig,
  IntegrationCredentials,
  SyncSettings,
  FieldMapping,
  PROVIDER_CAPABILITIES,
} from './types';

// Get integration by ID
export async function getIntegration(
  integrationId: string
): Promise<Integration | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .single();

  if (error || !data) return null;

  return mapIntegration(data);
}

// Get all integrations for a workspace
export async function getWorkspaceIntegrations(
  workspaceId: string,
  options: {
    type?: IntegrationType;
    provider?: IntegrationProvider;
    status?: IntegrationStatus;
  } = {}
): Promise<Integration[]> {
  const supabase = await createClient();

  let query = supabase
    .from('integrations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (options.type) {
    query = query.eq('type', options.type);
  }
  if (options.provider) {
    query = query.eq('provider', options.provider);
  }
  if (options.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map(mapIntegration);
}

// Create a new integration
export async function createIntegration(
  workspaceId: string,
  integration: {
    provider: IntegrationProvider;
    type: IntegrationType;
    name: string;
    config?: IntegrationConfig;
    credentials?: IntegrationCredentials;
    syncSettings?: SyncSettings;
  }
): Promise<{ success: boolean; integrationId?: string; error?: string }> {
  // Use admin client for INSERT operations to bypass RLS
  const adminClient = createAdminClient();

  // Encrypt credentials if provided
  const encryptedCredentials = integration.credentials
    ? await encryptCredentials(integration.credentials)
    : null;

  const { data, error } = await adminClient
    .from('integrations')
    .insert({
      workspace_id: workspaceId,
      provider: integration.provider,
      type: integration.type,
      name: integration.name,
      status: 'pending',
      config: integration.config || {},
      encrypted_credentials: encryptedCredentials,
      sync_settings: integration.syncSettings || null,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, integrationId: data.id };
}

// Update integration
export async function updateIntegration(
  integrationId: string,
  updates: {
    name?: string;
    config?: IntegrationConfig;
    credentials?: IntegrationCredentials;
    syncSettings?: SyncSettings;
    status?: IntegrationStatus;
    lastError?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name) updateData.name = updates.name;
  if (updates.config) updateData.config = updates.config;
  if (updates.syncSettings) updateData.sync_settings = updates.syncSettings;
  if (updates.status) updateData.status = updates.status;
  if (updates.lastError !== undefined) updateData.last_error = updates.lastError;

  if (updates.credentials) {
    updateData.encrypted_credentials = await encryptCredentials(updates.credentials);
  }

  const { error } = await supabase
    .from('integrations')
    .update(updateData)
    .eq('id', integrationId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Connect integration (update status to connected)
export async function connectIntegration(
  integrationId: string,
  credentials: IntegrationCredentials
): Promise<{ success: boolean; error?: string }> {
  return updateIntegration(integrationId, {
    credentials,
    status: 'connected',
    lastError: null,
  });
}

// Disconnect integration
export async function disconnectIntegration(
  integrationId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('integrations')
    .update({
      status: 'disconnected',
      encrypted_credentials: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Delete integration
export async function deleteIntegration(
  integrationId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Delete related webhooks
  await supabase
    .from('webhooks')
    .delete()
    .eq('integration_id', integrationId);

  // Delete sync jobs
  await supabase
    .from('sync_jobs')
    .delete()
    .eq('integration_id', integrationId);

  // Delete integration
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('id', integrationId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Test integration connection
export async function testIntegration(
  integrationId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const integration = await getIntegration(integrationId);
  if (!integration) {
    return { success: false, error: 'Integration not found' };
  }

  if (!integration.credentials) {
    return { success: false, error: 'No credentials configured' };
  }

  try {
    // Provider-specific connection test
    switch (integration.provider) {
      case 'hubspot':
        return await testHubSpotConnection(integration.credentials);
      case 'salesforce':
        return await testSalesforceConnection(integration.credentials);
      case 'pipedrive':
        return await testPipedriveConnection(integration.credentials);
      case 'slack':
        return await testSlackConnection(integration.credentials);
      case 'webhook':
        return { success: true, message: 'Webhook configured' };
      default:
        return { success: true, message: 'Connection test not implemented' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    await updateIntegration(integrationId, {
      status: 'error',
      lastError: message,
    });
    return { success: false, error: message };
  }
}

// Get decrypted credentials
export async function getIntegrationCredentials(
  integrationId: string
): Promise<IntegrationCredentials | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('integrations')
    .select('encrypted_credentials')
    .eq('id', integrationId)
    .single();

  if (error || !data?.encrypted_credentials) return null;

  return await decryptCredentials(data.encrypted_credentials);
}

// Refresh OAuth tokens
export async function refreshOAuthTokens(
  integrationId: string
): Promise<{ success: boolean; error?: string }> {
  const integration = await getIntegration(integrationId);
  if (!integration) {
    return { success: false, error: 'Integration not found' };
  }

  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials?.refreshToken) {
    return { success: false, error: 'No refresh token available' };
  }

  try {
    // Provider-specific token refresh
    let newCredentials: IntegrationCredentials;

    switch (integration.provider) {
      case 'hubspot':
        newCredentials = await refreshHubSpotTokens(credentials.refreshToken);
        break;
      case 'salesforce':
        newCredentials = await refreshSalesforceTokens(credentials.refreshToken);
        break;
      case 'google_sheets':
        newCredentials = await refreshGoogleTokens(credentials.refreshToken);
        break;
      default:
        return { success: false, error: 'Token refresh not supported' };
    }

    return await connectIntegration(integrationId, newCredentials);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    await updateIntegration(integrationId, {
      status: 'error',
      lastError: message,
    });
    return { success: false, error: message };
  }
}

// Update field mappings
export async function updateFieldMappings(
  integrationId: string,
  mappings: FieldMapping[]
): Promise<{ success: boolean; error?: string }> {
  const integration = await getIntegration(integrationId);
  if (!integration) {
    return { success: false, error: 'Integration not found' };
  }

  const syncSettings = integration.syncSettings || {
    direction: 'bidirectional',
    frequency: 'realtime',
    fieldMappings: [],
    autoSync: true,
  };

  syncSettings.fieldMappings = mappings;

  return updateIntegration(integrationId, { syncSettings });
}

// Update last sync timestamp
export async function updateLastSync(
  integrationId: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('integrations')
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId);
}

// Provider-specific connection tests
async function testHubSpotConnection(
  credentials: IntegrationCredentials
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
    },
  });

  if (response.ok) {
    return { success: true, message: 'Connected to HubSpot' };
  }

  const error = await response.json();
  return { success: false, error: error.message || 'HubSpot connection failed' };
}

async function testSalesforceConnection(
  credentials: IntegrationCredentials
): Promise<{ success: boolean; message?: string; error?: string }> {
  const instanceUrl = credentials.metadata?.instanceUrl as string;
  if (!instanceUrl) {
    return { success: false, error: 'Salesforce instance URL not configured' };
  }

  const response = await fetch(`${instanceUrl}/services/data/v57.0/`, {
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
    },
  });

  if (response.ok) {
    return { success: true, message: 'Connected to Salesforce' };
  }

  return { success: false, error: 'Salesforce connection failed' };
}

async function testPipedriveConnection(
  credentials: IntegrationCredentials
): Promise<{ success: boolean; message?: string; error?: string }> {
  const apiToken = credentials.apiKey || credentials.accessToken;
  const response = await fetch(
    `https://api.pipedrive.com/v1/users/me?api_token=${apiToken}`
  );

  if (response.ok) {
    return { success: true, message: 'Connected to Pipedrive' };
  }

  return { success: false, error: 'Pipedrive connection failed' };
}

async function testSlackConnection(
  credentials: IntegrationCredentials
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  if (data.ok) {
    return { success: true, message: `Connected as ${data.user}` };
  }

  return { success: false, error: data.error || 'Slack connection failed' };
}

// Token refresh functions
async function refreshHubSpotTokens(
  refreshToken: string
): Promise<IntegrationCredentials> {
  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh HubSpot tokens');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

async function refreshSalesforceTokens(
  refreshToken: string
): Promise<IntegrationCredentials> {
  const response = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.SALESFORCE_CLIENT_ID!,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Salesforce tokens');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: refreshToken, // Salesforce doesn't return new refresh token
    metadata: { instanceUrl: data.instance_url },
  };
}

async function refreshGoogleTokens(
  refreshToken: string
): Promise<IntegrationCredentials> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Google tokens');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

// Credential encryption/decryption (simplified - use proper encryption in production)
async function encryptCredentials(
  credentials: IntegrationCredentials
): Promise<string> {
  // In production, use proper encryption with a key from env
  const encoded = Buffer.from(JSON.stringify(credentials)).toString('base64');
  return encoded;
}

async function decryptCredentials(
  encrypted: string
): Promise<IntegrationCredentials> {
  // In production, use proper decryption
  const decoded = Buffer.from(encrypted, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

// Helper to map database row to Integration type
function mapIntegration(data: Record<string, unknown>): Integration {
  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    provider: data.provider as IntegrationProvider,
    type: data.type as IntegrationType,
    name: data.name as string,
    status: data.status as IntegrationStatus,
    config: (data.config as IntegrationConfig) || {},
    credentials: undefined, // Don't include credentials in basic fetch
    syncSettings: data.sync_settings as SyncSettings | undefined,
    lastSyncAt: data.last_sync_at ? new Date(data.last_sync_at as string) : undefined,
    lastError: data.last_error as string | undefined,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  };
}
