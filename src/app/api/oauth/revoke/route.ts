// OAuth Token Revocation Endpoint
import { NextRequest, NextResponse } from 'next/server';
import { revokeAccessToken, validateOAuthClient } from '@/lib/api/oauth';

// POST /api/oauth/revoke - Revoke a token
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type');

  let body: Record<string, string>;

  // Parse body
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries()) as Record<string, string>;
  } else if (contentType?.includes('application/json')) {
    body = await request.json();
  } else {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Unsupported content type' },
      { status: 400 }
    );
  }

  const { token, client_id, client_secret } = body;

  if (!token) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'token is required' },
      { status: 400 }
    );
  }

  // Validate client credentials if provided
  if (client_id && client_secret) {
    const client = await validateOAuthClient(client_id, client_secret);
    if (!client) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client credentials' },
        { status: 401 }
      );
    }
  }

  // Revoke the token
  try {
    await revokeAccessToken(token);

    // Return 200 OK regardless of whether token existed
    // This is per RFC 7009
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('Token revocation error:', error);
    // Still return 200 as per RFC 7009
    return new NextResponse(null, { status: 200 });
  }
}
