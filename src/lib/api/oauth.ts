// OAuth2 Provider for Public API
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import type {
  OAuthClient,
  OAuthAuthorizationCode,
  OAuthAccessToken,
  OAuthScope,
  OAuthGrantType,
} from './types';

// Constants
const AUTHORIZATION_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days

// Generate secure random token
function generateToken(prefix: string = ''): string {
  const bytes = crypto.randomBytes(32);
  return `${prefix}${bytes.toString('base64url')}`;
}

// Hash a secret
function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

// Verify PKCE code challenge
function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: 'plain' | 'S256'
): boolean {
  if (method === 'plain') {
    return verifier === challenge;
  }

  // S256
  const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
  return hash === challenge;
}

// ============================================
// OAuth Client Management
// ============================================

// Create OAuth Client
export async function createOAuthClient(
  workspaceId: string,
  options: {
    name: string;
    description?: string;
    redirectUris: string[];
    allowedScopes: OAuthScope[];
    allowedGrantTypes?: OAuthGrantType[];
    isConfidential?: boolean;
    logoUrl?: string;
    homepageUrl?: string;
    privacyPolicyUrl?: string;
    termsOfServiceUrl?: string;
  }
): Promise<{ client: OAuthClient; clientSecret: string }> {
  const supabase = await createClient();

  const clientId = `client_${crypto.randomBytes(16).toString('hex')}`;
  const clientSecret = `secret_${crypto.randomBytes(32).toString('hex')}`;
  const secretHash = hashSecret(clientSecret);

  const { data, error } = await supabase
    .from('oauth_clients')
    .insert({
      workspace_id: workspaceId,
      name: options.name,
      description: options.description,
      client_id: clientId,
      client_secret_hash: secretHash,
      redirect_uris: options.redirectUris,
      allowed_scopes: options.allowedScopes,
      allowed_grant_types: options.allowedGrantTypes || ['authorization_code', 'refresh_token'],
      is_confidential: options.isConfidential ?? true,
      logo_url: options.logoUrl,
      homepage_url: options.homepageUrl,
      privacy_policy_url: options.privacyPolicyUrl,
      terms_of_service_url: options.termsOfServiceUrl,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    client: mapOAuthClient(data),
    clientSecret, // Only returned on creation
  };
}

// Get OAuth Client by ID
export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('oauth_clients')
    .select('*')
    .eq('client_id', clientId)
    .single();

  if (error || !data) return null;

  return mapOAuthClient(data);
}

// Validate OAuth Client credentials
export async function validateOAuthClient(
  clientId: string,
  clientSecret: string
): Promise<OAuthClient | null> {
  const supabase = await createClient();
  const secretHash = hashSecret(clientSecret);

  const { data, error } = await supabase
    .from('oauth_clients')
    .select('*')
    .eq('client_id', clientId)
    .eq('client_secret_hash', secretHash)
    .single();

  if (error || !data) return null;

  return mapOAuthClient(data);
}

// List OAuth Clients
export async function listOAuthClients(
  workspaceId: string
): Promise<OAuthClient[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('oauth_clients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(mapOAuthClient);
}

// Delete OAuth Client
export async function deleteOAuthClient(clientId: string): Promise<void> {
  const supabase = await createClient();

  // Delete all tokens first
  await supabase
    .from('oauth_access_tokens')
    .delete()
    .eq('client_id', clientId);

  await supabase
    .from('oauth_authorization_codes')
    .delete()
    .eq('client_id', clientId);

  const { error } = await supabase
    .from('oauth_clients')
    .delete()
    .eq('client_id', clientId);

  if (error) throw error;
}

// Rotate OAuth Client Secret
export async function rotateClientSecret(
  clientId: string
): Promise<{ client: OAuthClient; clientSecret: string }> {
  const supabase = await createClient();

  const clientSecret = `secret_${crypto.randomBytes(32).toString('hex')}`;
  const secretHash = hashSecret(clientSecret);

  const { data, error } = await supabase
    .from('oauth_clients')
    .update({ client_secret_hash: secretHash })
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) throw error;

  // Revoke all existing tokens
  await supabase
    .from('oauth_access_tokens')
    .delete()
    .eq('client_id', clientId);

  return {
    client: mapOAuthClient(data),
    clientSecret,
  };
}

// ============================================
// Authorization Code Flow
// ============================================

// Create Authorization Code
export async function createAuthorizationCode(
  clientId: string,
  userId: string,
  workspaceId: string,
  scope: OAuthScope[],
  redirectUri: string,
  codeChallenge?: string,
  codeChallengeMethod?: 'plain' | 'S256'
): Promise<string> {
  const supabase = await createClient();

  const code = generateToken('authcode_');
  const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_EXPIRY);

  const { error } = await supabase
    .from('oauth_authorization_codes')
    .insert({
      client_id: clientId,
      user_id: userId,
      workspace_id: workspaceId,
      code,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope,
      redirect_uri: redirectUri,
      expires_at: expiresAt.toISOString(),
    });

  if (error) throw error;

  return code;
}

// Exchange Authorization Code for Token
export async function exchangeAuthorizationCode(
  clientId: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<OAuthAccessToken | null> {
  const supabase = await createClient();

  // Get authorization code
  const { data: authCode, error: codeError } = await supabase
    .from('oauth_authorization_codes')
    .select('*')
    .eq('code', code)
    .eq('client_id', clientId)
    .single();

  if (codeError || !authCode) {
    return null;
  }

  // Check if expired
  if (new Date(authCode.expires_at) < new Date()) {
    await supabase.from('oauth_authorization_codes').delete().eq('id', authCode.id);
    return null;
  }

  // Verify redirect URI
  if (authCode.redirect_uri !== redirectUri) {
    return null;
  }

  // Verify PKCE if used
  if (authCode.code_challenge) {
    if (!codeVerifier) {
      return null;
    }
    if (!verifyCodeChallenge(codeVerifier, authCode.code_challenge, authCode.code_challenge_method || 'S256')) {
      return null;
    }
  }

  // Delete used authorization code
  await supabase.from('oauth_authorization_codes').delete().eq('id', authCode.id);

  // Create access token
  return createAccessToken(
    clientId,
    authCode.user_id,
    authCode.workspace_id,
    authCode.scope
  );
}

// ============================================
// Access Tokens
// ============================================

// Create Access Token
export async function createAccessToken(
  clientId: string,
  userId: string,
  workspaceId: string,
  scope: OAuthScope[]
): Promise<OAuthAccessToken> {
  const supabase = await createClient();

  const accessToken = generateToken('cf_at_');
  const refreshToken = generateToken('cf_rt_');
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);

  const { data, error } = await supabase
    .from('oauth_access_tokens')
    .insert({
      client_id: clientId,
      user_id: userId,
      workspace_id: workspaceId,
      access_token: accessToken,
      refresh_token: refreshToken,
      scope,
      expires_at: expiresAt.toISOString(),
      refresh_expires_at: refreshExpiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return mapOAuthAccessToken(data);
}

// Validate Access Token
export async function validateAccessToken(
  accessToken: string
): Promise<{ token: OAuthAccessToken | null; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('oauth_access_tokens')
    .select('*')
    .eq('access_token', accessToken)
    .single();

  if (error || !data) {
    return { token: null, error: 'Invalid token' };
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    return { token: null, error: 'Token expired' };
  }

  return { token: mapOAuthAccessToken(data) };
}

// Refresh Access Token
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string
): Promise<OAuthAccessToken | null> {
  const supabase = await createClient();

  // Get existing token
  const { data: existingToken, error } = await supabase
    .from('oauth_access_tokens')
    .select('*')
    .eq('refresh_token', refreshToken)
    .eq('client_id', clientId)
    .single();

  if (error || !existingToken) {
    return null;
  }

  // Check if refresh token expired
  if (existingToken.refresh_expires_at && new Date(existingToken.refresh_expires_at) < new Date()) {
    await supabase.from('oauth_access_tokens').delete().eq('id', existingToken.id);
    return null;
  }

  // Delete old token
  await supabase.from('oauth_access_tokens').delete().eq('id', existingToken.id);

  // Create new token
  return createAccessToken(
    clientId,
    existingToken.user_id,
    existingToken.workspace_id,
    existingToken.scope
  );
}

// Revoke Access Token
export async function revokeAccessToken(accessToken: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('oauth_access_tokens')
    .delete()
    .eq('access_token', accessToken);
}

// Revoke All Tokens for Client
export async function revokeAllClientTokens(clientId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('oauth_access_tokens')
    .delete()
    .eq('client_id', clientId);

  await supabase
    .from('oauth_authorization_codes')
    .delete()
    .eq('client_id', clientId);
}

// ============================================
// Scope Helpers
// ============================================

// Check if scope includes permission
export function hasScope(
  grantedScopes: OAuthScope[],
  requiredScope: OAuthScope
): boolean {
  // 'write' includes 'read'
  if (requiredScope === 'read' && grantedScopes.includes('write')) {
    return true;
  }

  // General scopes
  if (grantedScopes.includes(requiredScope)) {
    return true;
  }

  // Check if general 'read' or 'write' covers specific scope
  if (requiredScope.endsWith(':read') && grantedScopes.includes('read')) {
    return true;
  }
  if (requiredScope.endsWith(':write') && grantedScopes.includes('write')) {
    return true;
  }

  return false;
}

// Parse scope string to array
export function parseScope(scopeString: string): OAuthScope[] {
  return scopeString.split(' ').filter((s) => s.length > 0) as OAuthScope[];
}

// Scope to string
export function scopeToString(scopes: OAuthScope[]): string {
  return scopes.join(' ');
}

// ============================================
// Helpers
// ============================================

function mapOAuthClient(data: Record<string, unknown>): OAuthClient {
  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    name: data.name as string,
    description: data.description as string | undefined,
    clientId: data.client_id as string,
    clientSecretHash: data.client_secret_hash as string,
    redirectUris: data.redirect_uris as string[],
    allowedScopes: data.allowed_scopes as OAuthScope[],
    allowedGrantTypes: data.allowed_grant_types as OAuthGrantType[],
    isConfidential: data.is_confidential as boolean,
    logoUrl: data.logo_url as string | undefined,
    homepageUrl: data.homepage_url as string | undefined,
    privacyPolicyUrl: data.privacy_policy_url as string | undefined,
    termsOfServiceUrl: data.terms_of_service_url as string | undefined,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  };
}

function mapOAuthAccessToken(data: Record<string, unknown>): OAuthAccessToken {
  return {
    id: data.id as string,
    clientId: data.client_id as string,
    userId: data.user_id as string,
    workspaceId: data.workspace_id as string,
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    scope: data.scope as OAuthScope[],
    expiresAt: new Date(data.expires_at as string),
    refreshExpiresAt: data.refresh_expires_at ? new Date(data.refresh_expires_at as string) : undefined,
    createdAt: new Date(data.created_at as string),
  };
}
