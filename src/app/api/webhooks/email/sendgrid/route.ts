// SendGrid Webhook Handler
// Processes event notifications from SendGrid

import { NextRequest, NextResponse } from 'next/server';
import { processWebhookBatch, verifyWebhookSignature } from '@/lib/smtp/webhooks';

const SENDGRID_WEBHOOK_SECRET = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY || '';

// Require signature verification in production
const REQUIRE_VERIFICATION = process.env.NODE_ENV === 'production' ||
  process.env.VERIFY_SENDGRID_SIGNATURES === 'true';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-twilio-email-event-webhook-signature') || '';
    const timestamp = request.headers.get('x-twilio-email-event-webhook-timestamp') || '';

    // Build full signature string for verification
    const fullSignature = timestamp ? `t=${timestamp},v1=${signature}` : signature;

    // Verify webhook signature
    if (REQUIRE_VERIFICATION) {
      if (!SENDGRID_WEBHOOK_SECRET) {
        console.error('SendGrid webhook secret not configured');
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
      }
      if (!signature) {
        console.error('Missing SendGrid webhook signature');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }
      const isValid = verifyWebhookSignature('sendgrid', body, fullSignature, SENDGRID_WEBHOOK_SECRET);
      if (!isValid) {
        console.error('SendGrid webhook signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else if (SENDGRID_WEBHOOK_SECRET && signature) {
      // Optional verification in development
      const isValid = verifyWebhookSignature('sendgrid', body, fullSignature, SENDGRID_WEBHOOK_SECRET);
      if (!isValid) {
        console.warn('SendGrid webhook signature verification failed (non-production, continuing)');
      }
    }

    // SendGrid sends events as an array
    const events = JSON.parse(body);

    if (!Array.isArray(events)) {
      return NextResponse.json({ error: 'Expected array of events' }, { status: 400 });
    }

    const result = await processWebhookBatch('sendgrid', events);

    if (result.errors.length > 0) {
      console.error('SendGrid webhook errors:', result.errors);
    }

    return NextResponse.json({
      processed: result.processed,
      total: events.length,
      errors: result.errors.length,
    });
  } catch (error) {
    console.error('SendGrid webhook error:', error);
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
    provider: 'sendgrid',
    description: 'SendGrid event webhook endpoint',
    events: [
      'processed', 'dropped', 'delivered', 'deferred',
      'bounce', 'open', 'click', 'spamreport', 'unsubscribe'
    ],
  });
}
