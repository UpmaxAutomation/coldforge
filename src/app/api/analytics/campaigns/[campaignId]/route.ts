// Campaign Analytics API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCampaignMetrics, getMetricsTimeSeries, getEmailFunnel } from '@/lib/analytics';
import type { AggregationPeriod } from '@/lib/analytics/types';

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

// GET /api/analytics/campaigns/[campaignId] - Get campaign analytics
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { campaignId } = await params;
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get campaign and verify access
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('workspace_id, name, status, created_at')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', campaign.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const include = searchParams.get('include')?.split(',') || ['metrics'];

    const result: Record<string, unknown> = {
      campaign: {
        id: campaignId,
        name: campaign.name,
        status: campaign.status,
        createdAt: campaign.created_at,
      },
    };

    // Get campaign metrics
    if (include.includes('metrics')) {
      result.metrics = await getCampaignMetrics(campaignId);
    }

    // Get funnel data
    if (include.includes('funnel')) {
      result.funnel = await getEmailFunnel(campaign.workspace_id, {
        campaignId,
      });
    }

    // Get time series
    if (include.includes('timeseries')) {
      const metric = searchParams.get('metric') || 'sent';
      const period = (searchParams.get('period') || 'day') as AggregationPeriod;

      result.timeseries = await getMetricsTimeSeries(
        campaign.workspace_id,
        metric,
        { campaignId, period }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching campaign analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign analytics' },
      { status: 500 }
    );
  }
}
