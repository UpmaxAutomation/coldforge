// Mailbox List API
// GET /api/mailboxes/list - List mailboxes for a workspace

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
    const workspaceId = searchParams.get('workspaceId');
    const status = searchParams.get('status');
    const warmupStatus = searchParams.get('warmupStatus');
    const provider = searchParams.get('provider');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

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

    // Build query
    let query = supabase
      .from('provisioned_mailboxes')
      .select(`
        id,
        email_address,
        display_name,
        first_name,
        last_name,
        aliases,
        status,
        warmup_status,
        warmup_started_at,
        warmup_completed_at,
        emails_sent_today,
        emails_sent_total,
        last_sent_at,
        provisioned_at,
        created_at,
        provider_config:email_provider_configs(id, provider, domain, config_name)
      `, { count: 'exact' })
      .eq('workspace_id', workspaceId);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (warmupStatus) {
      query = query.eq('warmup_status', warmupStatus);
    }

    if (search) {
      query = query.or(`email_address.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    // Apply pagination
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch mailboxes' }, { status: 500 });
    }

    return NextResponse.json({
      mailboxes: (data || []).map(m => ({
        id: m.id,
        email: m.email_address,
        displayName: m.display_name,
        firstName: m.first_name,
        lastName: m.last_name,
        aliases: m.aliases,
        status: m.status,
        warmupStatus: m.warmup_status,
        warmupStartedAt: m.warmup_started_at,
        warmupCompletedAt: m.warmup_completed_at,
        emailsSentToday: m.emails_sent_today,
        emailsSentTotal: m.emails_sent_total,
        lastSentAt: m.last_sent_at,
        provisionedAt: m.provisioned_at,
        createdAt: m.created_at,
        provider: m.provider_config,
      })),
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('List mailboxes error:', error);
    return NextResponse.json(
      { error: 'Failed to list mailboxes' },
      { status: 500 }
    );
  }
}
