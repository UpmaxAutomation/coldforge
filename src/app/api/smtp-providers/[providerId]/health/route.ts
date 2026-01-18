// SMTP Provider Health Check API
// Test provider connection and update health status

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';
import { checkProviderHealth } from '@/lib/smtp/client';
import type { SmtpProviderConfig, SmtpProviderType } from '@/lib/smtp/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { providerId } = await params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get provider with encrypted credentials
    const { data: provider, error: fetchError } = await supabase
      .from('smtp_providers')
      .select('*')
      .eq('id', providerId)
      .single();

    if (fetchError || !provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', provider.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Build config with decrypted credentials
    let credentials;
    if (provider.username_encrypted && provider.password_encrypted) {
      credentials = {
        host: provider.host,
        port: provider.port,
        username: decrypt(provider.username_encrypted),
        password: decrypt(provider.password_encrypted),
      };
    }

    let apiCredentials;
    if (provider.api_key_encrypted) {
      apiCredentials = {
        apiKey: decrypt(provider.api_key_encrypted),
        apiSecret: provider.api_secret_encrypted ? decrypt(provider.api_secret_encrypted) : undefined,
        region: provider.region,
        endpoint: provider.endpoint,
      };
    }

    const config: SmtpProviderConfig = {
      id: provider.id,
      workspaceId: provider.workspace_id,
      name: provider.name,
      providerType: provider.provider_type as SmtpProviderType,
      credentials,
      apiCredentials,
      config: provider.config,
      isActive: provider.is_active,
      isHealthy: provider.is_healthy,
      priority: provider.priority,
      rateLimits: {
        maxPerSecond: provider.max_per_second,
        maxPerMinute: provider.max_per_minute,
        maxPerHour: provider.max_per_hour,
        maxPerDay: provider.max_per_day,
      },
    };

    // Check health
    const health = await checkProviderHealth(config);

    // Update health status in database
    await supabase
      .from('smtp_providers')
      .update({
        is_healthy: health.isHealthy,
        last_health_check: health.lastCheck.toISOString(),
        consecutive_failures: health.consecutiveFailures,
        updated_at: new Date().toISOString(),
      })
      .eq('id', providerId);

    return NextResponse.json({
      providerId: health.providerId,
      isHealthy: health.isHealthy,
      lastCheck: health.lastCheck,
      responseTimeMs: health.avgResponseTime,
      consecutiveFailures: health.consecutiveFailures,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { error: 'Failed to check provider health' },
      { status: 500 }
    );
  }
}
