// Individual Report API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  generateReportData,
} from '@/lib/analytics';

interface RouteParams {
  params: Promise<{ reportId: string }>;
}

// GET /api/analytics/reports/[reportId] - Get scheduled report
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { reportId } = await params;
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = await getScheduledReport(reportId);

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', report.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Run report if requested
    const run = searchParams.get('run') === 'true';
    if (run) {
      const reportData = await generateReportData(report.workspaceId, report.config);

      // Update last run time
      await supabase
        .from('scheduled_reports')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', reportId);

      return NextResponse.json({
        report,
        data: reportData,
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch report' },
      { status: 500 }
    );
  }
}

// PUT /api/analytics/reports/[reportId] - Update scheduled report
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { reportId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = await getScheduledReport(reportId);

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', report.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const updatedReport = await updateScheduledReport(reportId, {
      name: body.name,
      description: body.description,
      timeRange: body.timeRange,
      customDateRange: body.customDateRange,
      campaignIds: body.campaignIds,
      mailboxIds: body.mailboxIds,
      leadTags: body.leadTags,
      groupBy: body.groupBy,
      metrics: body.metrics,
      schedule: body.schedule,
    });

    return NextResponse.json(updatedReport);
  } catch (error) {
    console.error('Error updating report:', error);
    return NextResponse.json(
      { error: 'Failed to update report' },
      { status: 500 }
    );
  }
}

// DELETE /api/analytics/reports/[reportId] - Delete scheduled report
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { reportId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = await getScheduledReport(reportId);

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', report.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    await deleteScheduledReport(reportId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    return NextResponse.json(
      { error: 'Failed to delete report' },
      { status: 500 }
    );
  }
}
