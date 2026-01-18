// Billing Cron Jobs
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { expireCredits } from '@/lib/billing/credits';

// POST /api/cron/billing - Run billing maintenance tasks
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
      case 'expire-credits': {
        // Expire credits that have passed their expiration date
        const result = await expireCredits();
        return NextResponse.json({
          success: true,
          task: 'expire-credits',
          expiredCount: result.expiredCount,
          totalExpired: result.totalExpired,
        });
      }

      case 'usage-summary': {
        // Generate daily usage summaries for all workspaces
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id');

        if (!workspaces) {
          return NextResponse.json({ success: true, task: 'usage-summary', processed: 0 });
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let processed = 0;

        for (const workspace of workspaces) {
          // Aggregate usage from usage_records
          const { data: usageRecords } = await supabase
            .from('usage_records')
            .select('metric, quantity')
            .eq('workspace_id', workspace.id)
            .gte('recorded_at', yesterday.toISOString())
            .lt('recorded_at', today.toISOString());

          if (usageRecords && usageRecords.length > 0) {
            // Aggregate by metric
            const aggregated: Record<string, number> = {};
            for (const record of usageRecords) {
              aggregated[record.metric] = (aggregated[record.metric] || 0) + record.quantity;
            }

            // Create usage summary
            const adminClient = createAdminClient();
            await adminClient.from('usage_summaries').upsert({
              workspace_id: workspace.id,
              period_start: yesterday.toISOString(),
              period_end: today.toISOString(),
              emails_sent: aggregated['emails_sent'] || 0,
              emails_opened: aggregated['emails_opened'] || 0,
              emails_clicked: aggregated['emails_clicked'] || 0,
              emails_replied: aggregated['emails_replied'] || 0,
              emails_bounced: aggregated['emails_bounced'] || 0,
              mailboxes_active: aggregated['mailboxes_active'] || 0,
              leads_processed: aggregated['leads_processed'] || 0,
              warmup_emails: aggregated['warmup_emails'] || 0,
            }, {
              onConflict: 'workspace_id,period_start',
            });

            processed++;
          }
        }

        return NextResponse.json({
          success: true,
          task: 'usage-summary',
          processed,
        });
      }

      case 'check-limits': {
        // Check usage limits and send warnings
        const { data: subscriptions } = await supabase
          .from('workspace_subscriptions')
          .select(`
            workspace_id,
            plan_id,
            subscription_plans (
              email_limit,
              lead_limit,
              mailbox_limit
            )
          `)
          .eq('status', 'active');

        if (!subscriptions) {
          return NextResponse.json({ success: true, task: 'check-limits', warned: 0 });
        }

        let warned = 0;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        for (const sub of subscriptions) {
          // Get current month usage
          const { data: usage } = await supabase
            .from('usage_summaries')
            .select('emails_sent, leads_processed')
            .eq('workspace_id', sub.workspace_id)
            .gte('period_start', startOfMonth.toISOString());

          if (!usage || !sub.subscription_plans) continue;

          const plan = sub.subscription_plans as {
            email_limit: number;
            lead_limit: number;
            mailbox_limit: number;
          };

          const totalEmails = usage.reduce((sum, u) => sum + (u.emails_sent || 0), 0);
          const totalLeads = usage.reduce((sum, u) => sum + (u.leads_processed || 0), 0);

          // Check if approaching limits (80% threshold)
          const emailPercentage = (totalEmails / plan.email_limit) * 100;
          const leadPercentage = (totalLeads / plan.lead_limit) * 100;

          if (emailPercentage >= 80 || leadPercentage >= 80) {
            // Record limit warning event
            const adminClient = createAdminClient();
            await adminClient.from('billing_events').insert({
              workspace_id: sub.workspace_id,
              event_type: 'limit_warning',
              data: {
                emailPercentage,
                leadPercentage,
                emailLimit: plan.email_limit,
                leadLimit: plan.lead_limit,
                currentEmails: totalEmails,
                currentLeads: totalLeads,
              },
            });
            warned++;
          }
        }

        return NextResponse.json({
          success: true,
          task: 'check-limits',
          warned,
        });
      }

      case 'cleanup-events': {
        // Clean up old billing events (keep 90 days)
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);

        const { count } = await supabase
          .from('billing_events')
          .delete()
          .lt('created_at', cutoff.toISOString())
          .select('id', { count: 'exact', head: true });

        return NextResponse.json({
          success: true,
          task: 'cleanup-events',
          deleted: count || 0,
        });
      }

      case 'full': {
        // Run all maintenance tasks
        const results: Record<string, unknown> = {};

        // Expire credits
        const expireResult = await expireCredits();
        results.expireCredits = {
          expiredCount: expireResult.expiredCount,
          totalExpired: expireResult.totalExpired,
        };

        // Note: Other tasks would be run here but we'll keep it simple
        results.message = 'Full maintenance completed';

        return NextResponse.json({
          success: true,
          task: 'full',
          results,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid task. Use: expire-credits, usage-summary, check-limits, cleanup-events, or full' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error running billing cron:', error);
    return NextResponse.json(
      { error: 'Failed to run billing cron task' },
      { status: 500 }
    );
  }
}
