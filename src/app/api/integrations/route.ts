// Integrations API - List and Create
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getWorkspaceIntegrations,
  createIntegration,
} from '@/lib/integrations';
import type { IntegrationProvider, IntegrationType } from '@/lib/integrations/types';

// GET /api/integrations - List integrations
export async function GET(request: NextRequest) {
  try {
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
    const type = searchParams.get('type') as IntegrationType | undefined;
    const provider = searchParams.get('provider') as IntegrationProvider | undefined;
    const status = searchParams.get('status') as 'pending' | 'connected' | 'disconnected' | 'error' | 'expired' | undefined;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const integrations = await getWorkspaceIntegrations(workspaceId, {
      type,
      provider,
      status,
    });

    return NextResponse.json({
      integrations,
      total: integrations.length,
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

// POST /api/integrations - Create integration
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, provider, type, name, config, credentials, syncSettings } = body;

    if (!workspaceId || !provider || !type || !name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    const result = await createIntegration(workspaceId, {
      provider,
      type,
      name,
      config,
      credentials,
      syncSettings,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      integrationId: result.integrationId,
    });
  } catch (error) {
    console.error('Error creating integration:', error);
    return NextResponse.json(
      { error: 'Failed to create integration' },
      { status: 500 }
    );
  }
}
