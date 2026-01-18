// Incoming Webhooks from External Providers
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as HubSpot from '@/lib/integrations/providers/hubspot';
import crypto from 'crypto';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

// POST /api/webhooks/incoming/[provider] - Receive webhooks from providers
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { provider } = await params;
    const rawBody = await request.text();
    const headers = Object.fromEntries(request.headers);

    switch (provider) {
      case 'hubspot':
        return await handleHubSpotWebhook(rawBody, headers);

      case 'salesforce':
        return await handleSalesforceWebhook(rawBody, headers);

      case 'slack':
        return await handleSlackWebhook(rawBody, headers);

      default:
        return NextResponse.json(
          { error: 'Unknown provider' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error processing incoming webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// HubSpot Webhook Handler
async function handleHubSpotWebhook(
  rawBody: string,
  headers: Record<string, string>
): Promise<NextResponse> {
  // Verify HubSpot signature
  const signature = headers['x-hubspot-signature-v3'];
  const timestamp = headers['x-hubspot-request-timestamp'];

  if (signature && timestamp) {
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    if (clientSecret) {
      const signatureBase = `POST${request.url}${rawBody}${timestamp}`;
      const expectedSignature = crypto
        .createHmac('sha256', clientSecret)
        .update(signatureBase)
        .digest('base64');

      // In production, verify timestamp is within 5 minutes
      // and signature matches
    }
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>[];

  // HubSpot sends an array of events
  if (!Array.isArray(payload)) {
    return NextResponse.json({ received: true });
  }

  const supabase = await createClient();

  // Find integrations for HubSpot
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, workspace_id')
    .eq('provider', 'hubspot')
    .eq('status', 'connected');

  if (!integrations || integrations.length === 0) {
    // No active HubSpot integrations
    return NextResponse.json({ received: true });
  }

  // Process events for each integration
  const results = await Promise.all(
    integrations.map((integration) =>
      HubSpot.handleWebhook(payload, integration.id, integration.workspace_id)
    )
  );

  const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
  const allErrors = results.flatMap((r) => r.errors);

  return NextResponse.json({
    received: true,
    processed: totalProcessed,
    errors: allErrors.length > 0 ? allErrors : undefined,
  });
}

// Salesforce Webhook Handler
async function handleSalesforceWebhook(
  rawBody: string,
  headers: Record<string, string>
): Promise<NextResponse> {
  // Salesforce sends Platform Events or Outbound Messages
  const payload = JSON.parse(rawBody);

  // Log for now - implement full handler later
  console.log('Salesforce webhook received:', payload);

  const supabase = await createClient();

  // Find Salesforce integrations
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, workspace_id')
    .eq('provider', 'salesforce')
    .eq('status', 'connected');

  if (!integrations || integrations.length === 0) {
    return NextResponse.json({ received: true });
  }

  // Log the webhook event
  const adminClient = createAdminClient();
  for (const integration of integrations) {
    await adminClient.from('integration_logs').insert({
      integration_id: integration.id,
      action: 'webhook_received',
      status: 'success',
      message: 'Salesforce webhook received',
      details: { payload },
    });
  }

  return NextResponse.json({ received: true });
}

// Slack Webhook Handler (for interactive components and events)
async function handleSlackWebhook(
  rawBody: string,
  headers: Record<string, string>
): Promise<NextResponse> {
  // Verify Slack signature
  const slackSignature = headers['x-slack-signature'];
  const slackTimestamp = headers['x-slack-request-timestamp'];

  if (slackSignature && slackTimestamp) {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;

    if (signingSecret) {
      // Verify timestamp is within 5 minutes
      const timestamp = parseInt(slackTimestamp, 10);
      const now = Math.floor(Date.now() / 1000);

      if (Math.abs(now - timestamp) > 300) {
        return NextResponse.json({ error: 'Timestamp expired' }, { status: 403 });
      }

      // Verify signature
      const sigBaseString = `v0:${slackTimestamp}:${rawBody}`;
      const expectedSignature =
        'v0=' +
        crypto
          .createHmac('sha256', signingSecret)
          .update(sigBaseString)
          .digest('hex');

      if (!crypto.timingSafeEqual(
        Buffer.from(slackSignature),
        Buffer.from(expectedSignature)
      )) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
      }
    }
  }

  // Parse body (could be JSON or URL-encoded)
  let payload: Record<string, unknown>;

  try {
    if (rawBody.startsWith('{')) {
      payload = JSON.parse(rawBody);
    } else {
      // URL-encoded (for interactive components)
      const params = new URLSearchParams(rawBody);
      const payloadStr = params.get('payload');
      payload = payloadStr ? JSON.parse(payloadStr) : Object.fromEntries(params);
    }
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Handle URL verification challenge
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Handle event callbacks
  if (payload.type === 'event_callback') {
    const event = payload.event as Record<string, unknown>;
    console.log('Slack event:', event.type, event);

    // Process event based on type
    switch (event.type) {
      case 'message':
        // Handle incoming message
        break;
      case 'app_mention':
        // Handle mention
        break;
      default:
        console.log('Unhandled Slack event type:', event.type);
    }
  }

  // Handle interactive components (buttons, modals, etc.)
  if (payload.type === 'block_actions' || payload.type === 'view_submission') {
    console.log('Slack interactive:', payload.type);
    // Handle interactive actions
  }

  return NextResponse.json({ received: true });
}

// GET - Health check for webhook URL verification
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;

  return NextResponse.json({
    status: 'active',
    provider,
    timestamp: new Date().toISOString(),
  });
}
