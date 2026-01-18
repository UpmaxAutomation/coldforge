// Webhook Management API - Get, Update, Delete
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getWebhook,
  updateWebhook,
  deleteWebhook,
  regenerateWebhookSecret,
  getWebhookDeliveries,
} from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ webhookId: string }>;
}

// GET /api/webhooks/outgoing/[webhookId] - Get webhook details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { webhookId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhook = await getWebhook(webhookId);

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', webhook.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if deliveries requested
    const { searchParams } = new URL(request.url);
    const includeDeliveries = searchParams.get('includeDeliveries') === 'true';
    const deliveryStatus = searchParams.get('deliveryStatus') as 'pending' | 'success' | 'failed' | undefined;

    let deliveries = null;
    if (includeDeliveries) {
      const result = await getWebhookDeliveries(webhookId, {
        status: deliveryStatus,
        limit: 50,
      });
      deliveries = result;
    }

    return NextResponse.json({
      webhook,
      deliveries,
    });
  } catch (error) {
    console.error('Error fetching webhook:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhook' },
      { status: 500 }
    );
  }
}

// PATCH /api/webhooks/outgoing/[webhookId] - Update webhook
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { webhookId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhook = await getWebhook(webhookId);

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', webhook.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { action, ...updates } = body;

    // Handle regenerate secret action
    if (action === 'regenerateSecret') {
      const result = await regenerateWebhookSecret(webhookId);
      return NextResponse.json(result);
    }

    // Validate URL if provided
    if (updates.url) {
      try {
        new URL(updates.url);
      } catch {
        return NextResponse.json(
          { error: 'Invalid webhook URL' },
          { status: 400 }
        );
      }
    }

    const result = await updateWebhook(webhookId, updates);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating webhook:', error);
    return NextResponse.json(
      { error: 'Failed to update webhook' },
      { status: 500 }
    );
  }
}

// DELETE /api/webhooks/outgoing/[webhookId] - Delete webhook
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { webhookId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhook = await getWebhook(webhookId);

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', webhook.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const result = await deleteWebhook(webhookId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}
