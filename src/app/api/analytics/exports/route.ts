// Analytics Exports API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createExport, listExports } from '@/lib/analytics';
import type { ExportFormat, AnalyticsEventType } from '@/lib/analytics/types';

// GET /api/analytics/exports - List exports
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
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

    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await listExports(workspaceId, { limit, offset });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing exports:', error);
    return NextResponse.json(
      { error: 'Failed to list exports' },
      { status: 500 }
    );
  }
}

// POST /api/analytics/exports - Create export
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
    const {
      workspaceId,
      type,
      format,
      timeRange,
      customDateRange,
      eventTypes,
      campaignIds,
      columns,
    } = body;

    if (!workspaceId || !type || !format) {
      return NextResponse.json(
        { error: 'workspaceId, type, and format are required' },
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

    const exportResult = await createExport(workspaceId, user.id, {
      type: type as 'events' | 'metrics' | 'report',
      format: format as ExportFormat,
      filters: {
        timeRange,
        customDateRange: customDateRange
          ? {
              startDate: new Date(customDateRange.startDate),
              endDate: new Date(customDateRange.endDate),
            }
          : undefined,
        eventTypes: eventTypes as AnalyticsEventType[],
        campaignIds,
      },
      columns,
    });

    return NextResponse.json(exportResult, { status: 201 });
  } catch (error) {
    console.error('Error creating export:', error);
    return NextResponse.json(
      { error: 'Failed to create export' },
      { status: 500 }
    );
  }
}
