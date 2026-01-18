// OAuth Initiation Route
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

// OAuth configuration for each provider
const OAUTH_CONFIGS: Record<
  string,
  {
    authUrl: string;
    scopes: string[];
    clientIdEnv: string;
  }
> = {
  hubspot: {
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
    ],
    clientIdEnv: 'HUBSPOT_CLIENT_ID',
  },
  salesforce: {
    authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    scopes: ['api', 'refresh_token', 'offline_access'],
    clientIdEnv: 'SALESFORCE_CLIENT_ID',
  },
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    scopes: [
      'chat:write',
      'channels:read',
      'groups:read',
      'im:read',
      'mpim:read',
    ],
    clientIdEnv: 'SLACK_CLIENT_ID',
  },
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
    clientIdEnv: 'GOOGLE_CLIENT_ID',
  },
};

// GET /api/auth/oauth/[provider] - Initiate OAuth flow
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { provider } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const integrationId = searchParams.get('integrationId');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const oauthConfig = OAUTH_CONFIGS[provider];
    if (!oauthConfig) {
      return NextResponse.json(
        { error: 'Unsupported OAuth provider' },
        { status: 400 }
      );
    }

    const clientId = process.env[oauthConfig.clientIdEnv];
    if (!clientId) {
      return NextResponse.json(
        { error: `${provider} OAuth not configured` },
        { status: 500 }
      );
    }

    // Generate state and code verifier
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/auth/callback/${provider}`;

    // Store OAuth state using admin client to bypass RLS
    const adminClient = createAdminClient();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await adminClient.from('oauth_states').insert({
      workspace_id: workspaceId,
      provider,
      state,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      scopes: oauthConfig.scopes,
      expires_at: expiresAt.toISOString(),
    });

    // Build OAuth URL
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state: JSON.stringify({
        state,
        workspaceId,
        integrationId,
      }),
      response_type: 'code',
    });

    // Provider-specific parameters
    switch (provider) {
      case 'hubspot':
        authParams.set('scope', oauthConfig.scopes.join(' '));
        break;
      case 'salesforce':
        authParams.set('scope', oauthConfig.scopes.join(' '));
        break;
      case 'slack':
        authParams.set('scope', oauthConfig.scopes.join(','));
        break;
      case 'google':
        authParams.set('scope', oauthConfig.scopes.join(' '));
        authParams.set('access_type', 'offline');
        authParams.set('prompt', 'consent');
        authParams.set('code_challenge', codeChallenge);
        authParams.set('code_challenge_method', 'S256');
        break;
    }

    const authUrl = `${oauthConfig.authUrl}?${authParams}`;

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }
}
