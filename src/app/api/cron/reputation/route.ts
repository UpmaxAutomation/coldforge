// Reputation Management Cron Jobs
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  scheduleBlacklistChecks,
  resetHourlyIPCounters,
  resetDailyIPCounters,
  checkThresholdAlerts,
  autoResolveAlerts,
  autoCreateRecoveryTasks,
  updateWorkspaceDomainReputations,
} from '@/lib/reputation';

// POST /api/cron/reputation - Run reputation maintenance tasks
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const task = searchParams.get('task');

    const supabase = await createClient();

    switch (task) {
      case 'blacklist-check': {
        // Schedule blacklist checks for all IPs
        await scheduleBlacklistChecks();
        return NextResponse.json({
          success: true,
          task: 'blacklist-check',
          message: 'Blacklist checks scheduled',
        });
      }

      case 'reset-hourly': {
        // Reset hourly IP counters
        await resetHourlyIPCounters();
        return NextResponse.json({
          success: true,
          task: 'reset-hourly',
          message: 'Hourly IP counters reset',
        });
      }

      case 'reset-daily': {
        // Reset daily IP counters
        await resetDailyIPCounters();
        return NextResponse.json({
          success: true,
          task: 'reset-daily',
          message: 'Daily IP counters reset',
        });
      }

      case 'check-alerts': {
        // Check all workspaces for threshold alerts
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id');

        let totalCreated = 0;
        if (workspaces) {
          for (const workspace of workspaces) {
            const result = await checkThresholdAlerts(workspace.id);
            totalCreated += result.created;
          }
        }

        return NextResponse.json({
          success: true,
          task: 'check-alerts',
          alertsCreated: totalCreated,
        });
      }

      case 'auto-resolve': {
        // Auto-resolve alerts that no longer apply
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id');

        let totalResolved = 0;
        if (workspaces) {
          for (const workspace of workspaces) {
            totalResolved += await autoResolveAlerts(workspace.id);
          }
        }

        return NextResponse.json({
          success: true,
          task: 'auto-resolve',
          alertsResolved: totalResolved,
        });
      }

      case 'create-recovery': {
        // Auto-create recovery tasks for issues
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id');

        let totalCreated = 0;
        if (workspaces) {
          for (const workspace of workspaces) {
            const result = await autoCreateRecoveryTasks(workspace.id);
            totalCreated += result.created;
          }
        }

        return NextResponse.json({
          success: true,
          task: 'create-recovery',
          tasksCreated: totalCreated,
        });
      }

      case 'update-domains': {
        // Update domain authentication and metrics
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id');

        let totalUpdated = 0;
        let totalErrors = 0;
        if (workspaces) {
          for (const workspace of workspaces) {
            const result = await updateWorkspaceDomainReputations(workspace.id);
            totalUpdated += result.updated;
            totalErrors += result.errors;
          }
        }

        return NextResponse.json({
          success: true,
          task: 'update-domains',
          domainsUpdated: totalUpdated,
          errors: totalErrors,
        });
      }

      case 'release-quarantine': {
        // Release mailboxes from quarantine if period has expired
        const now = new Date().toISOString();

        const { data: released, error } = await supabase
          .from('mailbox_reputation')
          .update({
            is_quarantined: false,
            quarantine_reason: null,
            quarantine_until: null,
            updated_at: now,
          })
          .eq('is_quarantined', true)
          .lt('quarantine_until', now)
          .select('mailbox_id');

        const count = released?.length || 0;

        // Resume warmup for released mailboxes
        if (released && released.length > 0) {
          const mailboxIds = released.map((m) => m.mailbox_id);
          await supabase
            .from('email_warmup_pool')
            .update({
              warmup_status: 'active',
              updated_at: now,
            })
            .in('mailbox_id', mailboxIds);
        }

        return NextResponse.json({
          success: true,
          task: 'release-quarantine',
          released: count,
        });
      }

      case 'full': {
        // Run all maintenance tasks
        const results: Record<string, unknown> = {};

        // Blacklist checks
        await scheduleBlacklistChecks();
        results.blacklistCheck = 'completed';

        // Check and create alerts
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id');

        let alertsCreated = 0;
        let alertsResolved = 0;
        let recoveryCreated = 0;
        let domainsUpdated = 0;

        if (workspaces) {
          for (const workspace of workspaces) {
            const alerts = await checkThresholdAlerts(workspace.id);
            alertsCreated += alerts.created;

            alertsResolved += await autoResolveAlerts(workspace.id);

            const recovery = await autoCreateRecoveryTasks(workspace.id);
            recoveryCreated += recovery.created;

            const domains = await updateWorkspaceDomainReputations(workspace.id);
            domainsUpdated += domains.updated;
          }
        }

        results.alertsCreated = alertsCreated;
        results.alertsResolved = alertsResolved;
        results.recoveryTasksCreated = recoveryCreated;
        results.domainsUpdated = domainsUpdated;

        return NextResponse.json({
          success: true,
          task: 'full',
          results,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid task. Use: blacklist-check, reset-hourly, reset-daily, check-alerts, auto-resolve, create-recovery, update-domains, release-quarantine, or full' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error running reputation cron:', error);
    return NextResponse.json(
      { error: 'Failed to run reputation cron task' },
      { status: 500 }
    );
  }
}
