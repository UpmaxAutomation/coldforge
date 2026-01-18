// Email Providers API
// GET /api/email-providers - List provider configurations
// POST /api/email-providers - Create provider configuration

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { storeGoogleConfig, GoogleWorkspaceConfig } from '@/lib/mailbox/google-workspace';
import { storeMicrosoft365Config, Microsoft365Config } from '@/lib/mailbox/microsoft-365';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
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

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get provider configs (without sensitive data)
    const { data: configs, error } = await supabase
      .from('email_provider_configs')
      .select(`
        id,
        provider,
        config_name,
        domain,
        admin_email,
        is_active,
        verified_at,
        last_sync_at,
        mailbox_limit,
        mailboxes_created,
        created_at,
        updated_at
      `)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
    }

    return NextResponse.json({
      providers: (configs || []).map(c => ({
        id: c.id,
        provider: c.provider,
        configName: c.config_name,
        domain: c.domain,
        adminEmail: c.admin_email,
        isActive: c.is_active,
        verifiedAt: c.verified_at,
        lastSyncAt: c.last_sync_at,
        mailboxLimit: c.mailbox_limit,
        mailboxesCreated: c.mailboxes_created,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get email providers error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email providers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, provider, config } = body;

    if (!workspaceId || !provider || !config) {
      return NextResponse.json(
        { error: 'workspaceId, provider, and config are required' },
        { status: 400 }
      );
    }

    // Verify user has admin access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Store provider config based on type
    let result: { success: boolean; configId?: string; error?: string };

    if (provider === 'google') {
      const googleConfig: GoogleWorkspaceConfig = {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: config.refreshToken,
        serviceAccountKey: config.serviceAccountKey,
        domain: config.domain,
        adminEmail: config.adminEmail,
        customerId: config.customerId,
      };
      result = await storeGoogleConfig(workspaceId, googleConfig);
    } else if (provider === 'microsoft') {
      const microsoftConfig: Microsoft365Config = {
        tenantId: config.tenantId,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        domain: config.domain,
        adminEmail: config.adminEmail,
      };
      result = await storeMicrosoft365Config(workspaceId, microsoftConfig);
    } else {
      return NextResponse.json(
        { error: 'Invalid provider. Must be "google" or "microsoft"' },
        { status: 400 }
      );
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      configId: result.configId,
    });
  } catch (error) {
    console.error('Create email provider error:', error);
    return NextResponse.json(
      { error: 'Failed to create email provider' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get('configId');

    if (!configId) {
      return NextResponse.json(
        { error: 'configId is required' },
        { status: 400 }
      );
    }

    // Get config to verify workspace access
    const { data: config, error: fetchError } = await supabase
      .from('email_provider_configs')
      .select('workspace_id')
      .eq('id', configId)
      .single();

    if (fetchError || !config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    // Verify user has admin access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', config.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Check if any mailboxes use this config
    const { count } = await supabase
      .from('provisioned_mailboxes')
      .select('id', { count: 'exact', head: true })
      .eq('provider_config_id', configId)
      .neq('status', 'deleted');

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${count} active mailboxes use this provider` },
        { status: 400 }
      );
    }

    // Delete config
    const { error: deleteError } = await supabase
      .from('email_provider_configs')
      .delete()
      .eq('id', configId);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete email provider error:', error);
    return NextResponse.json(
      { error: 'Failed to delete email provider' },
      { status: 500 }
    );
  }
}
