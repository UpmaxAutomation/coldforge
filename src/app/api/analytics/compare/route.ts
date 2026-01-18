// Analytics Period Comparison API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPeriodComparison, getMetricBreakdown } from '@/lib/analytics';
import type { TimeRange } from '@/lib/analytics/types';

// GET /api/analytics/compare - Get period comparison
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

    const type = searchParams.get('type') || 'period';
    const timeRange = (searchParams.get('timeRange') || '30d') as TimeRange;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const campaignId = searchParams.get('campaignId') || undefined;

    const dateRange = startDate && endDate
      ? { startDate: new Date(startDate), endDate: new Date(endDate) }
      : undefined;

    if (type === 'period') {
      // Period-over-period comparison
      const comparison = await getPeriodComparison(workspaceId, {
        dateRange,
        timeRange,
        campaignId,
      });

      return NextResponse.json(comparison);
    }

    if (type === 'breakdown') {
      // Metric breakdown
      const metric = searchParams.get('metric');
      const dimension = searchParams.get('dimension');

      if (!metric || !dimension) {
        return NextResponse.json(
          { error: 'metric and dimension are required for breakdown' },
          { status: 400 }
        );
      }

      const breakdown = await getMetricBreakdown(workspaceId, metric, {
        dateRange,
        timeRange,
        dimension: dimension as 'campaign' | 'mailbox' | 'day' | 'country' | 'device',
        limit: parseInt(searchParams.get('limit') || '10'),
      });

      return NextResponse.json(breakdown);
    }

    return NextResponse.json(
      { error: `Unknown comparison type: ${type}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error fetching comparison:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comparison' },
      { status: 500 }
    );
  }
}
