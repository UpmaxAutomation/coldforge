// Analytics Time Series API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMetricsTimeSeries, getPeriodComparison } from '@/lib/analytics';
import type { TimeRange, AggregationPeriod } from '@/lib/analytics/types';

// GET /api/analytics/timeseries - Get time series data
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

    const metric = searchParams.get('metric');
    if (!metric) {
      return NextResponse.json(
        { error: 'metric is required' },
        { status: 400 }
      );
    }

    const timeRange = (searchParams.get('timeRange') || '30d') as TimeRange;
    const period = (searchParams.get('period') || 'day') as AggregationPeriod;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const campaignId = searchParams.get('campaignId') || undefined;

    const dateRange = startDate && endDate
      ? { startDate: new Date(startDate), endDate: new Date(endDate) }
      : undefined;

    const timeSeries = await getMetricsTimeSeries(workspaceId, metric, {
      dateRange,
      timeRange,
      period,
      campaignId,
    });

    return NextResponse.json(timeSeries);
  } catch (error) {
    console.error('Error fetching time series:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time series' },
      { status: 500 }
    );
  }
}
