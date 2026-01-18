// OAuth Token Endpoint
import { NextRequest, NextResponse } from 'next/server';
import {
  validateOAuthClient,
  exchangeAuthorizationCode,
  refreshAccessToken,
  scopeToString,
} from '@/lib/api/oauth';

// POST /api/oauth/token - Token endpoint
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type');

  let body: Record<string, string>;

  // Parse body based on content type
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries()) as Record<string, string>;
  } else if (contentType?.includes('application/json')) {
    body = await request.json();
  } else {
    return errorResponse('invalid_request', 'Unsupported content type', 400);
  }

  const grantType = body.grant_type;

  // Handle different grant types
  switch (grantType) {
    case 'authorization_code':
      return handleAuthorizationCode(request, body);
    case 'refresh_token':
      return handleRefreshToken(request, body);
    default:
      return errorResponse('unsupported_grant_type', 'Unsupported grant_type', 400);
  }
}

// Handle authorization_code grant
async function handleAuthorizationCode(
  request: NextRequest,
  body: Record<string, string>
): Promise<NextResponse> {
  const { code, redirect_uri, code_verifier, client_id, client_secret } = body;

  // Validate required parameters
  if (!code) {
    return errorResponse('invalid_request', 'code is required', 400);
  }

  if (!redirect_uri) {
    return errorResponse('invalid_request', 'redirect_uri is required', 400);
  }

  // Get client credentials from header or body
  let clientIdFromAuth: string | undefined;
  let clientSecretFromAuth: string | undefined;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [id, secret] = decoded.split(':');
    clientIdFromAuth = id;
    clientSecretFromAuth = secret;
  }

  const finalClientId = client_id || clientIdFromAuth;
  const finalClientSecret = client_secret || clientSecretFromAuth;

  if (!finalClientId) {
    return errorResponse('invalid_request', 'client_id is required', 400);
  }

  // For confidential clients, validate client credentials
  if (finalClientSecret) {
    const client = await validateOAuthClient(finalClientId, finalClientSecret);
    if (!client) {
      return errorResponse('invalid_client', 'Invalid client credentials', 401);
    }
  }

  // Exchange code for token
  const token = await exchangeAuthorizationCode(
    finalClientId,
    code,
    redirect_uri,
    code_verifier
  );

  if (!token) {
    return errorResponse(
      'invalid_grant',
      'Invalid authorization code or code_verifier',
      400
    );
  }

  // Return token response
  return NextResponse.json({
    access_token: token.accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor((token.expiresAt.getTime() - Date.now()) / 1000),
    refresh_token: token.refreshToken,
    scope: scopeToString(token.scope),
  });
}

// Handle refresh_token grant
async function handleRefreshToken(
  request: NextRequest,
  body: Record<string, string>
): Promise<NextResponse> {
  const { refresh_token, client_id, client_secret } = body;

  if (!refresh_token) {
    return errorResponse('invalid_request', 'refresh_token is required', 400);
  }

  // Get client credentials
  let clientIdFromAuth: string | undefined;
  let clientSecretFromAuth: string | undefined;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [id, secret] = decoded.split(':');
    clientIdFromAuth = id;
    clientSecretFromAuth = secret;
  }

  const finalClientId = client_id || clientIdFromAuth;
  const finalClientSecret = client_secret || clientSecretFromAuth;

  if (!finalClientId) {
    return errorResponse('invalid_request', 'client_id is required', 400);
  }

  // Validate client if secret provided
  if (finalClientSecret) {
    const client = await validateOAuthClient(finalClientId, finalClientSecret);
    if (!client) {
      return errorResponse('invalid_client', 'Invalid client credentials', 401);
    }
  }

  // Refresh the token
  const newToken = await refreshAccessToken(refresh_token, finalClientId);

  if (!newToken) {
    return errorResponse('invalid_grant', 'Invalid or expired refresh token', 400);
  }

  return NextResponse.json({
    access_token: newToken.accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor((newToken.expiresAt.getTime() - Date.now()) / 1000),
    refresh_token: newToken.refreshToken,
    scope: scopeToString(newToken.scope),
  });
}

// Helper to create error response
function errorResponse(
  error: string,
  description: string,
  status: number
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status }
  );
}
