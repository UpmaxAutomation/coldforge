// API Key Management
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import type { APIKey, APIKeyWithSecret, APIKeyPermission, APIKeyStatus } from './types';

// Generate a secure API key
function generateAPIKey(): { key: string; prefix: string; hash: string } {
  // Generate 32 random bytes = 256 bits of entropy
  const randomBytes = crypto.randomBytes(32);
  const key = `cf_live_${randomBytes.toString('base64url')}`;
  const prefix = key.substring(0, 16); // First 16 chars including prefix
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  return { key, prefix, hash };
}

// Hash an API key for comparison
function hashAPIKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Create API Key
export async function createAPIKey(
  workspaceId: string,
  userId: string,
  options: {
    name: string;
    permissions: APIKeyPermission[];
    expiresAt?: Date;
    rateLimit?: number;
  }
): Promise<APIKeyWithSecret> {
  const supabase = await createClient();
  const { key, prefix, hash } = generateAPIKey();

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      workspace_id: workspaceId,
      name: options.name,
      key_prefix: prefix,
      key_hash: hash,
      permissions: options.permissions,
      status: 'active',
      expires_at: options.expiresAt?.toISOString() || null,
      rate_limit: options.rateLimit || 60, // Default 60 req/min
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    name: data.name,
    keyPrefix: data.key_prefix,
    keyHash: data.key_hash,
    permissions: data.permissions,
    status: data.status,
    expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
    rateLimit: data.rate_limit,
    createdAt: new Date(data.created_at),
    createdBy: data.created_by,
    secretKey: key, // Only returned on creation
  };
}

// Get API Key by ID
export async function getAPIKey(keyId: string): Promise<APIKey | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('id', keyId)
    .single();

  if (error || !data) return null;

  return mapAPIKey(data);
}

// Validate and get API Key by secret
export async function validateAPIKey(
  secretKey: string
): Promise<{ key: APIKey | null; error?: string }> {
  const supabase = await createClient();
  const hash = hashAPIKey(secretKey);

  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_hash', hash)
    .single();

  if (error || !data) {
    return { key: null, error: 'Invalid API key' };
  }

  // Check if revoked
  if (data.status === 'revoked') {
    return { key: null, error: 'API key has been revoked' };
  }

  // Check if expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Update status to expired
    await supabase
      .from('api_keys')
      .update({ status: 'expired' })
      .eq('id', data.id);

    return { key: null, error: 'API key has expired' };
  }

  return { key: mapAPIKey(data) };
}

// Check if API key has permission
export function hasPermission(
  key: APIKey,
  requiredPermission: APIKeyPermission
): boolean {
  return key.permissions.includes(requiredPermission);
}

// Check multiple permissions
export function hasPermissions(
  key: APIKey,
  requiredPermissions: APIKeyPermission[]
): boolean {
  return requiredPermissions.every((p) => key.permissions.includes(p));
}

// List API Keys for Workspace
export async function listAPIKeys(
  workspaceId: string,
  options: {
    status?: APIKeyStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ keys: APIKey[]; total: number }> {
  const supabase = await createClient();
  const { status, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('api_keys')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    keys: (data || []).map(mapAPIKey),
    total: count || 0,
  };
}

// Update API Key
export async function updateAPIKey(
  keyId: string,
  updates: {
    name?: string;
    permissions?: APIKeyPermission[];
    rateLimit?: number;
  }
): Promise<APIKey> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.permissions !== undefined) updateData.permissions = updates.permissions;
  if (updates.rateLimit !== undefined) updateData.rate_limit = updates.rateLimit;

  const { data, error } = await supabase
    .from('api_keys')
    .update(updateData)
    .eq('id', keyId)
    .select()
    .single();

  if (error) throw error;

  return mapAPIKey(data);
}

// Revoke API Key
export async function revokeAPIKey(keyId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('api_keys')
    .update({ status: 'revoked' })
    .eq('id', keyId);

  if (error) throw error;
}

// Delete API Key
export async function deleteAPIKey(keyId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', keyId);

  if (error) throw error;
}

// Record API Key Usage
export async function recordAPIKeyUsage(
  keyId: string,
  ipAddress: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: ipAddress,
    })
    .eq('id', keyId);
}

// Regenerate API Key (creates new key with same permissions)
export async function regenerateAPIKey(
  keyId: string,
  userId: string
): Promise<APIKeyWithSecret> {
  const supabase = await createClient();

  // Get current key
  const { data: currentKey } = await supabase
    .from('api_keys')
    .select('*')
    .eq('id', keyId)
    .single();

  if (!currentKey) {
    throw new Error('API key not found');
  }

  // Revoke old key
  await supabase
    .from('api_keys')
    .update({ status: 'revoked' })
    .eq('id', keyId);

  // Create new key with same permissions
  return createAPIKey(currentKey.workspace_id, userId, {
    name: currentKey.name,
    permissions: currentKey.permissions,
    expiresAt: currentKey.expires_at ? new Date(currentKey.expires_at) : undefined,
    rateLimit: currentKey.rate_limit,
  });
}

// Get API Key usage stats
export async function getAPIKeyStats(
  keyId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  topEndpoints: Array<{ endpoint: string; count: number }>;
}> {
  const supabase = await createClient();
  const startDate = options.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const endDate = options.endDate || new Date();

  const { data: logs } = await supabase
    .from('api_logs')
    .select('*')
    .eq('api_key_id', keyId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const totalRequests = logs?.length || 0;
  const successfulRequests = logs?.filter((l) => l.status_code >= 200 && l.status_code < 300).length || 0;
  const failedRequests = logs?.filter((l) => l.status_code >= 400).length || 0;
  const totalLatency = logs?.reduce((sum, l) => sum + (l.duration || 0), 0) || 0;
  const averageLatency = totalRequests > 0 ? totalLatency / totalRequests : 0;

  // Count requests by endpoint
  const endpointCounts: Record<string, number> = {};
  logs?.forEach((l) => {
    const endpoint = l.path;
    endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
  });

  const topEndpoints = Object.entries(endpointCounts)
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    averageLatency,
    topEndpoints,
  };
}

// Helper: Map database row to APIKey
function mapAPIKey(data: Record<string, unknown>): APIKey {
  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    name: data.name as string,
    keyPrefix: data.key_prefix as string,
    keyHash: data.key_hash as string,
    permissions: data.permissions as APIKeyPermission[],
    status: data.status as APIKeyStatus,
    lastUsedAt: data.last_used_at ? new Date(data.last_used_at as string) : undefined,
    lastUsedIp: data.last_used_ip as string | undefined,
    expiresAt: data.expires_at ? new Date(data.expires_at as string) : undefined,
    rateLimit: data.rate_limit as number,
    createdAt: new Date(data.created_at as string),
    createdBy: data.created_by as string,
  };
}

// Permission presets
export const PERMISSION_PRESETS = {
  readOnly: [
    'campaigns:read',
    'leads:read',
    'mailboxes:read',
    'analytics:read',
    'webhooks:read',
    'sequences:read',
    'templates:read',
  ] as APIKeyPermission[],

  standard: [
    'campaigns:read',
    'campaigns:write',
    'leads:read',
    'leads:write',
    'mailboxes:read',
    'analytics:read',
    'webhooks:read',
    'webhooks:write',
    'sequences:read',
    'sequences:write',
    'templates:read',
    'templates:write',
  ] as APIKeyPermission[],

  full: [
    'campaigns:read',
    'campaigns:write',
    'leads:read',
    'leads:write',
    'mailboxes:read',
    'mailboxes:write',
    'analytics:read',
    'webhooks:read',
    'webhooks:write',
    'sequences:read',
    'sequences:write',
    'templates:read',
    'templates:write',
  ] as APIKeyPermission[],
};
