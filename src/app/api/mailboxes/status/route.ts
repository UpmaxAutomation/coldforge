// Mailbox Status API
// GET /api/mailboxes/status - Get mailbox status
// PATCH /api/mailboxes/status - Update mailbox status

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mailboxId = searchParams.get('mailboxId');

    if (!mailboxId) {
      return NextResponse.json(
        { error: 'mailboxId is required' },
        { status: 400 }
      );
    }

    // Get mailbox with workspace verification
    const { data: mailbox, error } = await supabase
      .from('provisioned_mailboxes')
      .select(`
        *,
        workspace:workspaces(id, name),
        provider_config:email_provider_configs(id, provider, domain, config_name)
      `)
      .eq('id', mailboxId)
      .single();

    if (error || !mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', mailbox.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({
      mailbox: {
        id: mailbox.id,
        email: mailbox.email_address,
        displayName: mailbox.display_name,
        firstName: mailbox.first_name,
        lastName: mailbox.last_name,
        aliases: mailbox.aliases,
        status: mailbox.status,
        errorMessage: mailbox.error_message,
        warmupStatus: mailbox.warmup_status,
        warmupStartedAt: mailbox.warmup_started_at,
        warmupCompletedAt: mailbox.warmup_completed_at,
        emailsSentToday: mailbox.emails_sent_today,
        emailsSentTotal: mailbox.emails_sent_total,
        lastSentAt: mailbox.last_sent_at,
        profilePhotoUrl: mailbox.profile_photo_url,
        signatureHtml: mailbox.signature_html,
        signaturePlain: mailbox.signature_plain,
        provisionedAt: mailbox.provisioned_at,
        createdAt: mailbox.created_at,
        updatedAt: mailbox.updated_at,
        provider: mailbox.provider_config,
        workspace: mailbox.workspace,
      },
    });
  } catch (error) {
    console.error('Get mailbox status error:', error);
    return NextResponse.json(
      { error: 'Failed to get mailbox status' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mailboxId, status, warmupStatus } = body;

    if (!mailboxId) {
      return NextResponse.json(
        { error: 'mailboxId is required' },
        { status: 400 }
      );
    }

    // Get mailbox to verify access
    const { data: mailbox, error: fetchError } = await supabase
      .from('provisioned_mailboxes')
      .select('workspace_id')
      .eq('id', mailboxId)
      .single();

    if (fetchError || !mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    // Verify user has admin access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', mailbox.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    if (status) {
      const validStatuses = ['pending', 'creating', 'active', 'suspended', 'deleted', 'error'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      updates.status = status;
    }

    if (warmupStatus) {
      const validWarmupStatuses = ['not_started', 'in_progress', 'completed', 'paused'];
      if (!validWarmupStatuses.includes(warmupStatus)) {
        return NextResponse.json(
          { error: `Invalid warmup status. Must be one of: ${validWarmupStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      updates.warmup_status = warmupStatus;

      // Set timestamps based on warmup status
      if (warmupStatus === 'in_progress' && !body.warmupStartedAt) {
        updates.warmup_started_at = new Date().toISOString();
      }
      if (warmupStatus === 'completed' && !body.warmupCompletedAt) {
        updates.warmup_completed_at = new Date().toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    // Update mailbox
    const { data: updated, error: updateError } = await supabase
      .from('provisioned_mailboxes')
      .update(updates)
      .eq('id', mailboxId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update mailbox' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mailbox: {
        id: updated.id,
        email: updated.email_address,
        status: updated.status,
        warmupStatus: updated.warmup_status,
      },
    });
  } catch (error) {
    console.error('Update mailbox status error:', error);
    return NextResponse.json(
      { error: 'Failed to update mailbox status' },
      { status: 500 }
    );
  }
}
