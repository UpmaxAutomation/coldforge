// Postmark Webhook Handler
// Processes bounce, spam complaint, delivery, open, and click notifications

import { NextRequest, NextResponse } from 'next/server';
import { processWebhook, verifyWebhookSignature } from '@/lib/smtp/webhooks';

const POSTMARK_WEBHOOK_TOKEN = process.env.POSTMARK_WEBHOOK_TOKEN || '';

export async function POST(request: NextRequest) {
  try {
    // Postmark can use basic auth or a custom header for verification
    const authHeader = request.headers.get('authorization') || '';
    const webhookToken = request.headers.get('x-postmark-webhook-token') || '';

    // Verify if token is configured
    if (POSTMARK_WEBHOOK_TOKEN) {
      const isValid =
        webhookToken === POSTMARK_WEBHOOK_TOKEN ||
        authHeader === `Bearer ${POSTMARK_WEBHOOK_TOKEN}`;

      if (!isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();

    // Postmark sends individual events (not batched)
    const result = await processWebhook('postmark', body);

    if (result.errors.length > 0) {
      console.error('Postmark webhook errors:', result.errors);
    }

    return NextResponse.json({
      processed: result.processed,
      errors: result.errors.length,
    });
  } catch (error) {
    console.error('Postmark webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

// Verification endpoint
export async function GET() {
  return NextResponse.json({
    status: 'active',
    provider: 'postmark',
    description: 'Postmark webhook endpoint',
    supportedEvents: ['Bounce', 'SpamComplaint', 'Delivery', 'Open', 'Click'],
  });
}
