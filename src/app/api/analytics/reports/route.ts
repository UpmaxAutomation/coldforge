// Analytics Reports API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createScheduledReport,
  listScheduledReports,
  generateReportData,
} from '@/lib/analytics';
import type { ReportType } from '@/lib/analytics/types';

// GET /api/analytics/reports - List scheduled reports or generate report
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

    // Check if this is a generate request
    const generate = searchParams.get('generate') === 'true';

    if (generate) {
      // Generate report data
      const reportType = searchParams.get('type') as ReportType;
      if (!reportType) {
        return NextResponse.json(
          { error: 'type is required for report generation' },
          { status: 400 }
        );
      }

      const timeRange = searchParams.get('timeRange') || '30d';
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const campaignIds = searchParams.get('campaignIds')?.split(',').filter(Boolean);
      const mailboxIds = searchParams.get('mailboxIds')?.split(',').filter(Boolean);

      const reportData = await generateReportData(workspaceId, {
        type: reportType,
        name: 'Ad-hoc Report',
        timeRange: timeRange as '7d' | '30d' | '90d' | '12m' | 'custom',
        customDateRange: startDate && endDate
          ? { startDate: new Date(startDate), endDate: new Date(endDate) }
          : undefined,
        campaignIds,
        mailboxIds,
        metrics: [],
      });

      return NextResponse.json(reportData);
    }

    // List scheduled reports
    const type = searchParams.get('type') as ReportType | undefined;
    const enabled = searchParams.get('enabled');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await listScheduledReports(workspaceId, {
      type,
      enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error with reports:', error);
    return NextResponse.json(
      { error: 'Failed to process reports request' },
      { status: 500 }
    );
  }
}

// POST /api/analytics/reports - Create scheduled report
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
      name,
      description,
      type,
      timeRange,
      customDateRange,
      campaignIds,
      mailboxIds,
      leadTags,
      groupBy,
      metrics,
      schedule,
    } = body;

    if (!workspaceId || !name || !type) {
      return NextResponse.json(
        { error: 'workspaceId, name, and type are required' },
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
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const report = await createScheduledReport(workspaceId, user.id, {
      name,
      description,
      type,
      timeRange: timeRange || '30d',
      customDateRange,
      campaignIds,
      mailboxIds,
      leadTags,
      groupBy,
      metrics: metrics || [],
      schedule,
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error('Error creating report:', error);
    return NextResponse.json(
      { error: 'Failed to create report' },
      { status: 500 }
    );
  }
}
