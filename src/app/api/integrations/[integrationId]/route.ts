// Integration Management API - Get, Update, Delete
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getIntegration,
  updateIntegration,
  deleteIntegration,
  testIntegration,
  connectIntegration,
  disconnectIntegration,
} from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ integrationId: string }>;
}

// GET /api/integrations/[integrationId] - Get integration details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { integrationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integration = await getIntegration(integrationId);

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', integration.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ integration });
  } catch (error) {
    console.error('Error fetching integration:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integration' },
      { status: 500 }
    );
  }
}

// PATCH /api/integrations/[integrationId] - Update integration
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { integrationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integration = await getIntegration(integrationId);

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', integration.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { action, ...updates } = body;

    // Handle specific actions
    if (action === 'test') {
      const result = await testIntegration(integrationId);
      return NextResponse.json(result);
    }

    if (action === 'connect' && updates.credentials) {
      const result = await connectIntegration(integrationId, updates.credentials);
      return NextResponse.json(result);
    }

    if (action === 'disconnect') {
      const result = await disconnectIntegration(integrationId);
      return NextResponse.json(result);
    }

    // Regular update
    const result = await updateIntegration(integrationId, updates);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating integration:', error);
    return NextResponse.json(
      { error: 'Failed to update integration' },
      { status: 500 }
    );
  }
}

// DELETE /api/integrations/[integrationId] - Delete integration
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { integrationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integration = await getIntegration(integrationId);

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', integration.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const result = await deleteIntegration(integrationId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting integration:', error);
    return NextResponse.json(
      { error: 'Failed to delete integration' },
      { status: 500 }
    );
  }
}
