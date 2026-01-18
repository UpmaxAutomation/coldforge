// OAuth Callback Route
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { connectIntegration, createIntegration } from '@/lib/integrations';
import type { IntegrationCredentials } from '@/lib/integrations/types';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

// Token endpoints for each provider
const TOKEN_ENDPOINTS: Record<string, string> = {
  hubspot: 'https://api.hubapi.com/oauth/v1/token',
  salesforce: 'https://login.salesforce.com/services/oauth2/token',
  slack: 'https://slack.com/api/oauth.v2.access',
  google: 'https://oauth2.googleapis.com/token',
};

// Provider type mapping
const PROVIDER_TYPES: Record<string, 'crm' | 'notification' | 'spreadsheet'> = {
  hubspot: 'crm',
  salesforce: 'crm',
  slack: 'notification',
  google: 'spreadsheet',
};

// GET /api/auth/callback/[provider] - Handle OAuth callback
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { provider } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        `${baseUrl}/settings/integrations?error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(
        `${baseUrl}/settings/integrations?error=missing_params`
      );
    }

    // Parse state
    let stateData: { state: string; workspaceId: string; integrationId?: string };
    try {
      stateData = JSON.parse(stateParam);
    } catch {
      return NextResponse.redirect(
        `${baseUrl}/settings/integrations?error=invalid_state`
      );
    }

    // Verify OAuth state
    const { data: oauthState } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', stateData.state)
      .eq('provider', provider)
      .single();

    if (!oauthState) {
      return NextResponse.redirect(
        `${baseUrl}/settings/integrations?error=invalid_state`
      );
    }

    // Check expiration
    if (new Date(oauthState.expires_at) < new Date()) {
      await supabase.from('oauth_states').delete().eq('id', oauthState.id);
      return NextResponse.redirect(
        `${baseUrl}/settings/integrations?error=state_expired`
      );
    }

    // Mark state as used
    await supabase
      .from('oauth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('id', oauthState.id);

    // Exchange code for tokens
    const credentials = await exchangeCodeForTokens(
      provider,
      code,
      oauthState.redirect_uri,
      oauthState.code_verifier
    );

    if (!credentials) {
      return NextResponse.redirect(
        `${baseUrl}/settings/integrations?error=token_exchange_failed`
      );
    }

    // Connect or create integration
    let integrationId = stateData.integrationId;

    if (integrationId) {
      // Connect existing integration
      const result = await connectIntegration(integrationId, credentials);
      if (!result.success) {
        return NextResponse.redirect(
          `${baseUrl}/settings/integrations?error=${encodeURIComponent(result.error || 'connection_failed')}`
        );
      }
    } else {
      // Create new integration
      const providerType = PROVIDER_TYPES[provider];
      const result = await createIntegration(stateData.workspaceId, {
        provider: provider as 'hubspot' | 'salesforce' | 'slack',
        type: providerType,
        name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Integration`,
        credentials,
      });

      if (!result.success) {
        return NextResponse.redirect(
          `${baseUrl}/settings/integrations?error=${encodeURIComponent(result.error || 'creation_failed')}`
        );
      }

      integrationId = result.integrationId;

      // Connect the newly created integration
      await connectIntegration(integrationId!, credentials);
    }

    // Clean up OAuth state
    await supabase.from('oauth_states').delete().eq('id', oauthState.id);

    // Redirect to success page
    return NextResponse.redirect(
      `${baseUrl}/settings/integrations?success=true&provider=${provider}&integrationId=${integrationId}`
    );
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(
      `${baseUrl}/settings/integrations?error=callback_failed`
    );
  }
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(
  provider: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<IntegrationCredentials | null> {
  const tokenUrl = TOKEN_ENDPOINTS[provider];
  if (!tokenUrl) return null;

  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    console.error(`Missing OAuth credentials for ${provider}`);
    return null;
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  // Add code verifier for PKCE (Google)
  if (codeVerifier && provider === 'google') {
    params.set('code_verifier', codeVerifier);
  }

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Token exchange error for ${provider}:`, error);
      return null;
    }

    const data = await response.json();

    // Build credentials based on provider
    const credentials: IntegrationCredentials = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };

    // Add expiration if provided
    if (data.expires_in) {
      credentials.expiresAt = new Date(Date.now() + data.expires_in * 1000);
    }

    // Provider-specific metadata
    switch (provider) {
      case 'salesforce':
        credentials.metadata = {
          instanceUrl: data.instance_url,
          id: data.id,
        };
        break;
      case 'slack':
        credentials.metadata = {
          teamId: data.team?.id,
          teamName: data.team?.name,
          botUserId: data.bot_user_id,
        };
        break;
      case 'google':
        credentials.metadata = {
          scope: data.scope,
          tokenType: data.token_type,
        };
        break;
    }

    return credentials;
  } catch (error) {
    console.error(`Error exchanging code for ${provider}:`, error);
    return null;
  }
}
