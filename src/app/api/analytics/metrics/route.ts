// Analytics Metrics API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getEmailMetrics,
  getWorkspaceMetrics,
  getMetricsTimeSeries,
  getPeriodComparison,
  getEmailFunnel,
  getMetricBreakdown,
  getTopCampaigns,
} from '@/lib/analytics';
import type { TimeRange, AggregationPeriod } from '@/lib/analytics/types';

// GET /api/analytics/metrics - Get metrics
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

    const type = searchParams.get('type') || 'email';
    const timeRange = (searchParams.get('timeRange') || '30d') as TimeRange;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const campaignId = searchParams.get('campaignId') || undefined;

    const dateRange = startDate && endDate
      ? { startDate: new Date(startDate), endDate: new Date(endDate) }
      : undefined;

    let metrics;

    switch (type) {
      case 'email':
        metrics = await getEmailMetrics(workspaceId, {
          dateRange,
          timeRange,
          campaignId,
        });
        break;

      case 'workspace':
        metrics = await getWorkspaceMetrics(workspaceId, {
          dateRange,
          timeRange,
        });
        break;

      case 'funnel':
        metrics = await getEmailFunnel(workspaceId, {
          dateRange,
          timeRange,
          campaignId,
        });
        break;

      case 'top-campaigns':
        const limit = parseInt(searchParams.get('limit') || '10');
        const sortBy = searchParams.get('sortBy') || 'sent';
        metrics = await getTopCampaigns(workspaceId, {
          dateRange,
          timeRange,
          limit,
          sortBy: sortBy as 'sent' | 'opens' | 'clicks' | 'replies',
        });
        break;

      default:
        return NextResponse.json(
          { error: `Unknown metrics type: ${type}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ metrics });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
