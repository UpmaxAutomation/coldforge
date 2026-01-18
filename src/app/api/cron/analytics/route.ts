// Analytics Cron Jobs
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAndSelectWinner } from '@/lib/analytics';

// POST /api/cron/analytics - Run analytics maintenance tasks
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { task } = body;

    const supabase = await createClient();
    const results: Record<string, unknown> = { task };

    switch (task) {
      case 'aggregate-daily': {
        // Aggregate daily metrics for all workspaces
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id');

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        let aggregated = 0;
        for (const workspace of workspaces || []) {
          // Call the aggregation function
          await supabase.rpc('aggregate_daily_metrics', {
            p_workspace_id: workspace.id,
            p_date: dateStr,
            p_campaign_id: null,
          });

          // Also aggregate per-campaign metrics
          const { data: campaigns } = await supabase
            .from('campaigns')
            .select('id')
            .eq('workspace_id', workspace.id);

          for (const campaign of campaigns || []) {
            await supabase.rpc('aggregate_daily_metrics', {
              p_workspace_id: workspace.id,
              p_date: dateStr,
              p_campaign_id: campaign.id,
            });
          }

          aggregated++;
        }

        results.aggregated = aggregated;
        results.date = dateStr;
        break;
      }

      case 'check-ab-tests': {
        // Check running A/B tests for automatic winner selection
        const { data: runningTests } = await supabase
          .from('ab_tests')
          .select('id, name')
          .eq('status', 'running')
          .eq('auto_select_winner', true);

        let checked = 0;
        let completed = 0;

        for (const test of runningTests || []) {
          try {
            const updatedTest = await checkAndSelectWinner(test.id);
            checked++;
            if (updatedTest.status === 'completed') {
              completed++;
            }
          } catch (error) {
            console.error(`Error checking A/B test ${test.id}:`, error);
          }
        }

        results.checked = checked;
        results.completed = completed;
        break;
      }

      case 'run-scheduled-reports': {
        // Run scheduled reports that are due
        const now = new Date();

        const { data: dueReports } = await supabase
          .from('scheduled_reports')
          .select('*')
          .eq('schedule_enabled', true)
          .lte('next_run_at', now.toISOString());

        let executed = 0;

        for (const report of dueReports || []) {
          try {
            // Generate report (would normally send email to recipients)
            // For now, just update the run times

            // Calculate next run time
            let nextRun: Date | null = null;
            const scheduleDay = report.schedule_day || 1;
            const scheduleTime = report.schedule_time || '09:00:00';

            switch (report.schedule_frequency) {
              case 'daily':
                nextRun = new Date(now);
                nextRun.setDate(nextRun.getDate() + 1);
                break;
              case 'weekly':
                nextRun = new Date(now);
                nextRun.setDate(nextRun.getDate() + 7);
                break;
              case 'monthly':
                nextRun = new Date(now);
                nextRun.setMonth(nextRun.getMonth() + 1);
                break;
            }

            await supabase
              .from('scheduled_reports')
              .update({
                last_run_at: now.toISOString(),
                next_run_at: nextRun?.toISOString() || null,
              })
              .eq('id', report.id);

            executed++;
          } catch (error) {
            console.error(`Error running scheduled report ${report.id}:`, error);
          }
        }

        results.executed = executed;
        break;
      }

      case 'cleanup-events': {
        // Clean up old analytics events (older than retention period)
        const retentionDays = parseInt(process.env.ANALYTICS_RETENTION_DAYS || '365');

        const { data: deletedCount } = await supabase.rpc('cleanup_old_analytics_events', {
          p_retention_days: retentionDays,
        });

        results.deleted = deletedCount || 0;
        results.retentionDays = retentionDays;
        break;
      }

      case 'cleanup-exports': {
        // Clean up expired exports
        const { data: expiredExports, error } = await supabase
          .from('report_exports')
          .delete()
          .lt('expires_at', new Date().toISOString())
          .select('id');

        if (error) throw error;

        results.cleanedUp = expiredExports?.length || 0;
        break;
      }

      case 'recalculate-metrics': {
        // Recalculate all daily metrics for a date range
        const startDate = body.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = body.endDate || new Date().toISOString().split('T')[0];

        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id');

        let recalculated = 0;
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (const workspace of workspaces || []) {
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];

            await supabase.rpc('aggregate_daily_metrics', {
              p_workspace_id: workspace.id,
              p_date: dateStr,
              p_campaign_id: null,
            });

            recalculated++;
          }
        }

        results.recalculated = recalculated;
        results.dateRange = { startDate, endDate };
        break;
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown task: ${task}`,
            availableTasks: [
              'aggregate-daily',
              'check-ab-tests',
              'run-scheduled-reports',
              'cleanup-events',
              'cleanup-exports',
              'recalculate-metrics',
            ],
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analytics cron error:', error);
    return NextResponse.json(
      { error: 'Cron job failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
