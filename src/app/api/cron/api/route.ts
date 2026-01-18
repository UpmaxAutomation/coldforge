// API Maintenance Cron Job
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { retryFailedDeliveries } from '@/lib/api/developer-webhooks';

// POST /api/cron/api - API maintenance tasks
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    const supabase = await createClient();

    // 1. Expire old API keys
    const { data: expiredKeys } = await supabase.rpc('expire_api_keys');
    results.expiredApiKeys = expiredKeys || 0;

    // 2. Cleanup expired authorization codes
    const { data: cleanedCodes } = await supabase.rpc('cleanup_expired_auth_codes');
    results.cleanedAuthCodes = cleanedCodes || 0;

    // 3. Cleanup expired access tokens
    const { data: cleanedTokens } = await supabase.rpc('cleanup_expired_tokens');
    results.cleanedTokens = cleanedTokens || 0;

    // 4. Cleanup old API logs (keep 90 days)
    const { data: cleanedLogs } = await supabase.rpc('cleanup_old_api_logs');
    results.cleanedApiLogs = cleanedLogs || 0;

    // 5. Cleanup old webhook delivery attempts
    const { data: cleanedAttempts } = await supabase.rpc('cleanup_old_webhook_attempts');
    results.cleanedWebhookAttempts = cleanedAttempts || 0;

    // 6. Retry failed webhook deliveries
    const retried = await retryFailedDeliveries();
    results.retriedWebhooks = retried;

    // 7. Check for disabled webhooks due to failures
    const { data: disabledWebhooks } = await supabase
      .from('developer_webhooks')
      .select('id, workspace_id, name, failure_count')
      .eq('is_active', false)
      .gt('failure_count', 10);

    results.disabledWebhooks = disabledWebhooks?.length || 0;

    // 8. Generate API usage summaries for billing
    const { data: usageSummary } = await supabase.rpc('generate_api_usage_summary');
    results.usageSummaryGenerated = !!usageSummary;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('API cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cron job failed',
        results,
      },
      { status: 500 }
    );
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/cron/api',
    tasks: [
      'expire_api_keys',
      'cleanup_expired_auth_codes',
      'cleanup_expired_tokens',
      'cleanup_old_api_logs',
      'cleanup_old_webhook_attempts',
      'retry_failed_webhooks',
      'check_disabled_webhooks',
      'generate_usage_summary',
    ],
  });
}
