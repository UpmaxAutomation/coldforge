// SMTP Providers API
// Manage SMTP provider configurations for sending emails

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt } from '@/lib/encryption';
import { verifyProvider } from '@/lib/smtp/client';
import type { SmtpProviderType, SmtpProviderConfig } from '@/lib/smtp/types';

// GET /api/smtp-providers - List SMTP providers
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get providers (without encrypted credentials)
    const { data: providers, error } = await supabase
      .from('smtp_providers')
      .select(`
        id,
        name,
        provider_type,
        host,
        port,
        region,
        endpoint,
        is_active,
        is_healthy,
        priority,
        max_per_second,
        max_per_minute,
        max_per_hour,
        max_per_day,
        current_per_second,
        current_per_minute,
        current_per_hour,
        current_per_day,
        total_sent,
        total_delivered,
        total_bounced,
        total_complaints,
        last_health_check,
        created_at,
        updated_at
      `)
      .eq('workspace_id', workspaceId)
      .order('priority', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
    }

    // Transform to camelCase
    const transformedProviders = (providers || []).map((p) => ({
      id: p.id,
      name: p.name,
      providerType: p.provider_type,
      host: p.host,
      port: p.port,
      region: p.region,
      endpoint: p.endpoint,
      isActive: p.is_active,
      isHealthy: p.is_healthy,
      priority: p.priority,
      rateLimits: {
        maxPerSecond: p.max_per_second,
        maxPerMinute: p.max_per_minute,
        maxPerHour: p.max_per_hour,
        maxPerDay: p.max_per_day,
      },
      currentUsage: {
        perSecond: p.current_per_second,
        perMinute: p.current_per_minute,
        perHour: p.current_per_hour,
        perDay: p.current_per_day,
      },
      stats: {
        totalSent: p.total_sent,
        totalDelivered: p.total_delivered,
        totalBounced: p.total_bounced,
        totalComplaints: p.total_complaints,
      },
      lastHealthCheck: p.last_health_check,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    return NextResponse.json({ providers: transformedProviders });
  } catch (error) {
    console.error('Get SMTP providers error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMTP providers' },
      { status: 500 }
    );
  }
}

// POST /api/smtp-providers - Create SMTP provider
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      workspaceId,
      name,
      providerType,
      credentials,
      apiCredentials,
      config,
      rateLimits,
      priority,
      testConnection,
    } = body;

    if (!workspaceId || !name || !providerType) {
      return NextResponse.json(
        { error: 'workspaceId, name, and providerType are required' },
        { status: 400 }
      );
    }

    // Verify admin access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Validate provider type
    const validTypes: SmtpProviderType[] = [
      'aws_ses', 'sendgrid', 'postmark', 'mailgun', 'sparkpost',
      'smtp_relay', 'google_workspace', 'microsoft_365', 'custom'
    ];
    if (!validTypes.includes(providerType)) {
      return NextResponse.json({ error: 'Invalid provider type' }, { status: 400 });
    }

    // Prepare provider data
    const providerData: Record<string, unknown> = {
      workspace_id: workspaceId,
      name,
      provider_type: providerType,
      is_active: true,
      is_healthy: false,
      priority: priority || 10,
      max_per_second: rateLimits?.maxPerSecond || 10,
      max_per_minute: rateLimits?.maxPerMinute || 100,
      max_per_hour: rateLimits?.maxPerHour || 1000,
      max_per_day: rateLimits?.maxPerDay || 10000,
      config: config || {},
    };

    // Handle SMTP credentials
    if (credentials) {
      providerData.host = credentials.host;
      providerData.port = credentials.port;
      providerData.username_encrypted = encrypt(credentials.username);
      providerData.password_encrypted = encrypt(credentials.password);
    }

    // Handle API credentials
    if (apiCredentials) {
      providerData.api_key_encrypted = encrypt(apiCredentials.apiKey);
      if (apiCredentials.apiSecret) {
        providerData.api_secret_encrypted = encrypt(apiCredentials.apiSecret);
      }
      providerData.region = apiCredentials.region;
      providerData.endpoint = apiCredentials.endpoint;
    }

    // Test connection if requested
    if (testConnection) {
      const testConfig: SmtpProviderConfig = {
        id: 'test',
        workspaceId,
        name,
        providerType,
        credentials: credentials ? {
          host: credentials.host,
          port: credentials.port,
          username: credentials.username,
          password: credentials.password,
        } : undefined,
        apiCredentials: apiCredentials ? {
          apiKey: apiCredentials.apiKey,
          apiSecret: apiCredentials.apiSecret,
          region: apiCredentials.region,
          endpoint: apiCredentials.endpoint,
        } : undefined,
        isActive: true,
        isHealthy: false,
        priority: priority || 10,
        rateLimits: {
          maxPerSecond: rateLimits?.maxPerSecond || 10,
          maxPerMinute: rateLimits?.maxPerMinute || 100,
          maxPerHour: rateLimits?.maxPerHour || 1000,
          maxPerDay: rateLimits?.maxPerDay || 10000,
        },
      };

      const isHealthy = await verifyProvider(testConfig);
      if (!isHealthy) {
        return NextResponse.json(
          { error: 'Connection test failed. Please check your credentials.' },
          { status: 400 }
        );
      }
      providerData.is_healthy = true;
      providerData.last_health_check = new Date().toISOString();
    }

    // Use admin client for INSERT to bypass RLS
    const adminClient = createAdminClient();

    // Create provider
    const { data: provider, error } = await adminClient
      .from('smtp_providers')
      .insert(providerData)
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create provider' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      providerId: provider.id,
      isHealthy: providerData.is_healthy,
    });
  } catch (error) {
    console.error('Create SMTP provider error:', error);
    return NextResponse.json(
      { error: 'Failed to create SMTP provider' },
      { status: 500 }
    );
  }
}

// PATCH /api/smtp-providers - Update SMTP provider
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { providerId, ...updates } = body;

    if (!providerId) {
      return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
    }

    // Get provider to check workspace
    const { data: provider, error: fetchError } = await supabase
      .from('smtp_providers')
      .select('workspace_id')
      .eq('id', providerId)
      .single();

    if (fetchError || !provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Verify admin access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', provider.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Prepare updates
    const updateData: Record<string, unknown> = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    if (updates.rateLimits) {
      if (updates.rateLimits.maxPerSecond) updateData.max_per_second = updates.rateLimits.maxPerSecond;
      if (updates.rateLimits.maxPerMinute) updateData.max_per_minute = updates.rateLimits.maxPerMinute;
      if (updates.rateLimits.maxPerHour) updateData.max_per_hour = updates.rateLimits.maxPerHour;
      if (updates.rateLimits.maxPerDay) updateData.max_per_day = updates.rateLimits.maxPerDay;
    }

    if (updates.credentials) {
      if (updates.credentials.host) updateData.host = updates.credentials.host;
      if (updates.credentials.port) updateData.port = updates.credentials.port;
      if (updates.credentials.username) updateData.username_encrypted = encrypt(updates.credentials.username);
      if (updates.credentials.password) updateData.password_encrypted = encrypt(updates.credentials.password);
    }

    if (updates.apiCredentials) {
      if (updates.apiCredentials.apiKey) updateData.api_key_encrypted = encrypt(updates.apiCredentials.apiKey);
      if (updates.apiCredentials.apiSecret) updateData.api_secret_encrypted = encrypt(updates.apiCredentials.apiSecret);
      if (updates.apiCredentials.region) updateData.region = updates.apiCredentials.region;
      if (updates.apiCredentials.endpoint) updateData.endpoint = updates.apiCredentials.endpoint;
    }

    if (updates.config) updateData.config = updates.config;

    updateData.updated_at = new Date().toISOString();

    // Update provider
    const { error: updateError } = await supabase
      .from('smtp_providers')
      .update(updateData)
      .eq('id', providerId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update SMTP provider error:', error);
    return NextResponse.json(
      { error: 'Failed to update SMTP provider' },
      { status: 500 }
    );
  }
}

// DELETE /api/smtp-providers - Delete SMTP provider
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');

    if (!providerId) {
      return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
    }

    // Get provider to check workspace
    const { data: provider, error: fetchError } = await supabase
      .from('smtp_providers')
      .select('workspace_id')
      .eq('id', providerId)
      .single();

    if (fetchError || !provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Verify admin access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', provider.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Check for pending emails using this provider
    const { count } = await supabase
      .from('email_queue')
      .select('id', { count: 'exact', head: true })
      .eq('smtp_provider_id', providerId)
      .in('status', ['pending', 'scheduled', 'processing']);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${count} pending emails use this provider` },
        { status: 400 }
      );
    }

    // Delete provider
    const { error: deleteError } = await supabase
      .from('smtp_providers')
      .delete()
      .eq('id', providerId);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete SMTP provider error:', error);
    return NextResponse.json(
      { error: 'Failed to delete SMTP provider' },
      { status: 500 }
    );
  }
}
