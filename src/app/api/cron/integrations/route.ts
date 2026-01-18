// Integration Maintenance Cron Jobs
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  retryFailedDeliveries,
  refreshOAuthTokens,
  getWorkspaceIntegrations,
} from '@/lib/integrations';

// POST /api/cron/integrations - Run integration maintenance tasks
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const task = searchParams.get('task') || 'all';

    const results: Record<string, unknown> = {};

    // Retry failed webhook deliveries
    if (task === 'all' || task === 'retry-webhooks') {
      const retryResult = await retryFailedDeliveries();
      results.webhookRetries = retryResult;
    }

    // Refresh expiring OAuth tokens
    if (task === 'all' || task === 'refresh-tokens') {
      const tokenResult = await refreshExpiringTokens();
      results.tokenRefresh = tokenResult;
    }

    // Clean up expired OAuth states
    if (task === 'all' || task === 'cleanup-oauth') {
      const cleanupResult = await cleanupExpiredOAuthStates();
      results.oauthCleanup = cleanupResult;
    }

    // Check integration health
    if (task === 'all' || task === 'health-check') {
      const healthResult = await checkIntegrationHealth();
      results.healthCheck = healthResult;
    }

    // Clean up old webhook deliveries
    if (task === 'all' || task === 'cleanup-deliveries') {
      const deliveryCleanup = await cleanupOldDeliveries();
      results.deliveryCleanup = deliveryCleanup;
    }

    // Clean up old integration logs
    if (task === 'all' || task === 'cleanup-logs') {
      const logCleanup = await cleanupOldLogs();
      results.logCleanup = logCleanup;
    }

    return NextResponse.json({
      success: true,
      task,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Integration cron error:', error);
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    );
  }
}

// Refresh tokens expiring within 24 hours
async function refreshExpiringTokens(): Promise<{
  checked: number;
  refreshed: number;
  failed: number;
}> {
  const supabase = await createClient();

  // This requires decrypting and checking credentials
  // For now, we'll check integrations that haven't been updated recently
  // and are of OAuth type

  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Get integrations with OAuth providers
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, provider, status, last_sync_at')
    .eq('status', 'connected')
    .in('provider', ['hubspot', 'salesforce', 'google', 'slack']);

  if (!integrations || integrations.length === 0) {
    return { checked: 0, refreshed: 0, failed: 0 };
  }

  let refreshed = 0;
  let failed = 0;

  for (const integration of integrations) {
    try {
      const result = await refreshOAuthTokens(integration.id);
      if (result.success) {
        refreshed++;
      } else {
        failed++;
        console.error(`Token refresh failed for ${integration.id}:`, result.error);
      }
    } catch (error) {
      failed++;
      console.error(`Token refresh error for ${integration.id}:`, error);
    }
  }

  return {
    checked: integrations.length,
    refreshed,
    failed,
  };
}

// Clean up expired OAuth states
async function cleanupExpiredOAuthStates(): Promise<{ deleted: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('oauth_states')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  return { deleted: data?.length || 0 };
}

// Check integration health and mark errored integrations
async function checkIntegrationHealth(): Promise<{
  checked: number;
  healthy: number;
  unhealthy: number;
}> {
  const supabase = await createClient();

  // Get connected integrations
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, provider, workspace_id')
    .eq('status', 'connected');

  if (!integrations || integrations.length === 0) {
    return { checked: 0, healthy: 0, unhealthy: 0 };
  }

  let healthy = 0;
  let unhealthy = 0;

  for (const integration of integrations) {
    try {
      // Import and test dynamically based on provider
      const { testIntegration } = await import('@/lib/integrations');
      const result = await testIntegration(integration.id);

      if (result.success) {
        healthy++;
      } else {
        unhealthy++;

        // Update integration status
        await supabase
          .from('integrations')
          .update({
            status: 'error',
            last_error: result.error,
            updated_at: new Date().toISOString(),
          })
          .eq('id', integration.id);

        // Log the health check failure
        const adminClient = createAdminClient();
        await adminClient.from('integration_logs').insert({
          integration_id: integration.id,
          action: 'health_check',
          status: 'failed',
          message: result.error,
        });
      }
    } catch (error) {
      unhealthy++;
      console.error(`Health check error for ${integration.id}:`, error);
    }
  }

  return {
    checked: integrations.length,
    healthy,
    unhealthy,
  };
}

// Clean up old webhook deliveries (keep 30 days)
async function cleanupOldDeliveries(): Promise<{ deleted: number }> {
  const supabase = await createClient();

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Delete successful deliveries older than 30 days
  const { data: successDeleted } = await supabase
    .from('webhook_deliveries')
    .delete()
    .eq('status', 'success')
    .lt('created_at', thirtyDaysAgo)
    .select('id');

  // Delete failed deliveries older than 7 days
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: failedDeleted } = await supabase
    .from('webhook_deliveries')
    .delete()
    .eq('status', 'failed')
    .lt('created_at', sevenDaysAgo)
    .select('id');

  return {
    deleted: (successDeleted?.length || 0) + (failedDeleted?.length || 0),
  };
}

// Clean up old integration logs (keep 90 days)
async function cleanupOldLogs(): Promise<{ deleted: number }> {
  const supabase = await createClient();

  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await supabase
    .from('integration_logs')
    .delete()
    .lt('created_at', ninetyDaysAgo)
    .select('id');

  return { deleted: data?.length || 0 };
}

// GET - View scheduled tasks and status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get counts for monitoring
    const [
      { count: pendingDeliveries },
      { count: failedDeliveries },
      { count: connectedIntegrations },
      { count: erroredIntegrations },
      { count: expiredOAuthStates },
    ] = await Promise.all([
      supabase
        .from('webhook_deliveries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('webhook_deliveries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed'),
      supabase
        .from('integrations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'connected'),
      supabase
        .from('integrations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'error'),
      supabase
        .from('oauth_states')
        .select('*', { count: 'exact', head: true })
        .lt('expires_at', new Date().toISOString()),
    ]);

    return NextResponse.json({
      status: 'healthy',
      tasks: [
        'retry-webhooks',
        'refresh-tokens',
        'cleanup-oauth',
        'health-check',
        'cleanup-deliveries',
        'cleanup-logs',
      ],
      metrics: {
        pendingDeliveries: pendingDeliveries || 0,
        failedDeliveries: failedDeliveries || 0,
        connectedIntegrations: connectedIntegrations || 0,
        erroredIntegrations: erroredIntegrations || 0,
        expiredOAuthStates: expiredOAuthStates || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting cron status:', error);
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
