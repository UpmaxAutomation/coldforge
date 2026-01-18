import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLANS, checkLimits, calculateUsagePercentage } from '@/lib/billing';

// GET /api/billing/plans - List available plans
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspaceId');
  const includeUsage = searchParams.get('includeUsage') === 'true';

  const activePlans = PLANS.filter(p => p.isActive).map(plan => ({
    id: plan.id,
    name: plan.name,
    tier: plan.tier,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    features: plan.features,
    limits: plan.limits,
    sortOrder: plan.sortOrder,
    isEnterprise: plan.tier === 'enterprise',
  }));

  const sortedPlans = activePlans.sort((a, b) => a.sortOrder - b.sortOrder);

  // If no workspace context requested, return basic plans
  if (!workspaceId || !includeUsage) {
    return NextResponse.json({ plans: sortedPlans });
  }

  try {
    const supabase = await createClient();

    // Get user and verify access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ plans: sortedPlans });
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ plans: sortedPlans });
    }

    // Get current subscription
    const { data: subscription } = await supabase
      .from('workspace_subscriptions')
      .select('plan_id, status')
      .eq('workspace_id', workspaceId)
      .single();

    // Get current usage for the month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usage } = await supabase
      .from('usage_summaries')
      .select('emails_sent, leads_processed')
      .eq('workspace_id', workspaceId)
      .gte('period_start', startOfMonth.toISOString());

    const { count: mailboxCount } = await supabase
      .from('mailboxes')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    const totalEmails = usage?.reduce((sum, u) => sum + (u.emails_sent || 0), 0) || 0;
    const totalLeads = usage?.reduce((sum, u) => sum + (u.leads_processed || 0), 0) || 0;

    // Find current plan
    const currentPlanId = subscription?.plan_id;
    const currentPlan = currentPlanId
      ? PLANS.find(p => p.id === currentPlanId || p.tier === currentPlanId)
      : PLANS.find(p => p.tier === 'free');

    return NextResponse.json({
      plans: sortedPlans,
      currentPlan: currentPlan ? {
        id: currentPlan.id,
        name: currentPlan.name,
        tier: currentPlan.tier,
        usage: {
          emails: {
            used: totalEmails,
            limit: currentPlan.limits.emailsPerMonth,
            percentage: calculateUsagePercentage(totalEmails, currentPlan.limits.emailsPerMonth),
          },
          leads: {
            used: totalLeads,
            limit: currentPlan.limits.leadsStored,
            percentage: calculateUsagePercentage(totalLeads, currentPlan.limits.leadsStored),
          },
          mailboxes: {
            used: mailboxCount || 0,
            limit: currentPlan.limits.mailboxes,
            percentage: calculateUsagePercentage(mailboxCount || 0, currentPlan.limits.mailboxes),
          },
        },
        limitsOk: checkLimits(currentPlan, {
          emails: totalEmails,
          leads: totalLeads,
          mailboxes: mailboxCount || 0,
        }),
      } : null,
      subscription: subscription ? {
        planId: subscription.plan_id,
        status: subscription.status,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching plans with usage:', error);
    return NextResponse.json({ plans: sortedPlans });
  }
}
