// OAuth Authorization Endpoint
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOAuthClient, createAuthorizationCode, parseScope } from '@/lib/api/oauth';

// GET /api/oauth/authorize - Authorization endpoint
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Required parameters
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const state = searchParams.get('state');
  const scope = searchParams.get('scope') || 'read';

  // PKCE parameters (optional but recommended)
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method') as 'plain' | 'S256' | null;

  // Validate required parameters
  if (!clientId) {
    return errorResponse('invalid_request', 'client_id is required', state, redirectUri);
  }

  if (!redirectUri) {
    return errorResponse('invalid_request', 'redirect_uri is required', state, null);
  }

  if (responseType !== 'code') {
    return errorResponse(
      'unsupported_response_type',
      'Only authorization_code flow is supported',
      state,
      redirectUri
    );
  }

  // Validate client
  const client = await getOAuthClient(clientId);
  if (!client) {
    return errorResponse('invalid_client', 'Unknown client_id', state, redirectUri);
  }

  // Validate redirect URI
  if (!client.redirectUris.includes(redirectUri)) {
    return errorResponse(
      'invalid_request',
      'redirect_uri not registered for this client',
      state,
      null // Don't redirect to unregistered URI
    );
  }

  // Validate scope
  const requestedScopes = parseScope(scope);
  const invalidScopes = requestedScopes.filter((s) => !client.allowedScopes.includes(s));
  if (invalidScopes.length > 0) {
    return errorResponse(
      'invalid_scope',
      `Invalid scopes: ${invalidScopes.join(', ')}`,
      state,
      redirectUri
    );
  }

  // Check if user is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to login with return URL
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('return_to', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Get user's workspaces to select which one to authorize
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(id, name)')
    .eq('user_id', user.id);

  if (!memberships || memberships.length === 0) {
    return errorResponse(
      'access_denied',
      'User has no workspaces',
      state,
      redirectUri
    );
  }

  // If user has multiple workspaces, show workspace selector
  // For now, use the first workspace
  const workspaceId = memberships[0].workspace_id;

  // Show consent page (in a real app, this would be a proper UI)
  // For API purposes, we'll auto-approve if the user is authenticated
  // In production, you'd want to show a consent screen

  try {
    // Create authorization code
    const code = await createAuthorizationCode(
      clientId,
      user.id,
      workspaceId,
      requestedScopes,
      redirectUri,
      codeChallenge || undefined,
      codeChallengeMethod || undefined
    );

    // Redirect back to client with code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }

    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    return errorResponse(
      'server_error',
      error instanceof Error ? error.message : 'Failed to create authorization code',
      state,
      redirectUri
    );
  }
}

// Helper to create error response
function errorResponse(
  error: string,
  description: string,
  state: string | null,
  redirectUri: string | null
): NextResponse {
  if (redirectUri) {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    url.searchParams.set('error_description', description);
    if (state) {
      url.searchParams.set('state', state);
    }
    return NextResponse.redirect(url);
  }

  // If no valid redirect URI, show error directly
  return NextResponse.json(
    { error, error_description: description },
    { status: 400 }
  );
}
