// White-Label Maintenance Cron Job
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/cron/whitelabel - White-label maintenance tasks
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    const supabase = await createClient();

    // 1. Expire agency invitations
    const { data: expiredAgencyInvites } = await supabase.rpc('expire_agency_invitations');
    results.expiredAgencyInvitations = expiredAgencyInvites || 0;

    // 2. Expire sub-account invitations
    const { data: expiredSubAccountInvites } = await supabase.rpc('expire_sub_account_invitations');
    results.expiredSubAccountInvitations = expiredSubAccountInvites || 0;

    // 3. Check domain verifications (retry pending domains)
    const { data: pendingDomains } = await supabase
      .from('custom_domains')
      .select('id, domain, verification')
      .eq('status', 'pending')
      .lt('verification->attempts', 10); // Max 10 attempts

    if (pendingDomains?.length) {
      results.domainsToVerify = pendingDomains.length;

      // Verification would be handled by a separate service
      // Log domains needing verification
      console.log(`${pendingDomains.length} domains pending verification`);
    }

    // 4. Check SSL certificates expiring soon
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: expiringSsl, error: sslError } = await supabase
      .from('custom_domains')
      .select('id, domain')
      .eq('ssl_status', 'active')
      .lt('ssl_expires_at', thirtyDaysFromNow.toISOString());

    results.sslExpiringWithin30Days = expiringSsl?.length || 0;

    // 5. Calculate agency analytics for current month
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    const { data: agencies } = await supabase
      .from('agencies')
      .select('id')
      .eq('status', 'active');

    if (agencies?.length) {
      let analyticsUpdated = 0;

      for (const agency of agencies) {
        try {
          await supabase.rpc('calculate_agency_analytics', {
            p_agency_id: agency.id,
            p_period: currentMonth,
          });
          analyticsUpdated++;
        } catch (err) {
          console.error(`Failed to calculate analytics for agency ${agency.id}:`, err);
        }
      }

      results.analyticsUpdated = analyticsUpdated;
    }

    // 6. Process auto-payouts
    const { data: autoPayoutConfigs } = await supabase
      .from('reseller_configs')
      .select(`
        agency_id,
        min_payout_amount,
        payout_method,
        payout_details
      `)
      .eq('enabled', true)
      .eq('auto_payouts', true)
      .not('payout_method', 'is', null);

    if (autoPayoutConfigs?.length) {
      let payoutsProcessed = 0;

      for (const config of autoPayoutConfigs) {
        // Check pending commissions
        const { data: pendingCommissions } = await supabase
          .from('reseller_commissions')
          .select('id, amount')
          .eq('agency_id', config.agency_id)
          .eq('status', 'pending');

        const totalPending = pendingCommissions?.reduce((sum, c) => sum + c.amount, 0) || 0;

        if (totalPending >= config.min_payout_amount) {
          // Process payout (in production, this would call payment provider)
          console.log(`Auto-payout for agency ${config.agency_id}: $${totalPending}`);
          payoutsProcessed++;
        }
      }

      results.autoPayoutsProcessed = payoutsProcessed;
    }

    // 7. Reset monthly email counters (on first of month)
    const today = new Date();
    if (today.getDate() === 1) {
      const { data: resetUsage } = await supabase.rpc('reset_monthly_email_usage');
      results.monthlyUsageReset = true;
    }

    // 8. Check for suspended agencies with expired suspensions
    const { data: suspendedAgencies } = await supabase
      .from('agencies')
      .select('id, settings')
      .eq('status', 'suspended');

    // Log suspended agencies for manual review
    results.suspendedAgencies = suspendedAgencies?.length || 0;

    // 9. Clean up old activity logs (keep 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { count: deletedLogs } = await supabase
      .from('agency_activity_logs')
      .delete()
      .lt('created_at', ninetyDaysAgo.toISOString());

    results.cleanedActivityLogs = deletedLogs || 0;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('White-label cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cron job failed',
        results,
      },
      { status: 500 }
    );
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/cron/whitelabel',
    tasks: [
      'expire_agency_invitations',
      'expire_sub_account_invitations',
      'verify_pending_domains',
      'check_ssl_expiration',
      'calculate_analytics',
      'process_auto_payouts',
      'reset_monthly_usage',
      'check_suspended_agencies',
      'cleanup_activity_logs',
    ],
  });
}
