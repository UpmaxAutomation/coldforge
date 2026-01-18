// Agency Reseller API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getResellerConfig,
  upsertResellerConfig,
  getResellerAnalytics,
  getResellerPlans,
  getResellerCommissions,
  getPayoutHistory,
  processResellerPayout,
  updatePayoutDetails,
  hasAgencyPermission,
  getAgency,
} from '@/lib/whitelabel';

interface RouteContext {
  params: Promise<{ agencyId: string }>;
}

// GET /api/agencies/[agencyId]/reseller - Get reseller config and analytics
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_billing');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify reselling is enabled for this agency
    const agency = await getAgency(agencyId);

    if (!agency) {
      return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
    }

    if (!agency.settings.enableReselling) {
      return NextResponse.json({ error: 'Reselling is not enabled for this agency' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const include = searchParams.get('include')?.split(',') || [];

    const response: Record<string, unknown> = {
      config: await getResellerConfig(agencyId),
    };

    if (include.includes('analytics')) {
      response.analytics = await getResellerAnalytics(agencyId);
    }

    if (include.includes('plans')) {
      response.plans = await getResellerPlans(agencyId);
    }

    if (include.includes('commissions')) {
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      response.commissions = await getResellerCommissions(agencyId);
    }

    if (include.includes('payouts')) {
      response.payouts = await getPayoutHistory(agencyId);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get reseller error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get reseller data' },
      { status: 500 }
    );
  }
}

// PUT /api/agencies/[agencyId]/reseller - Update reseller config
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_billing');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const agency = await getAgency(agencyId);

    if (!agency?.settings.enableReselling) {
      return NextResponse.json({ error: 'Reselling is not enabled for this agency' }, { status: 403 });
    }

    const body = await request.json();
    const {
      enabled,
      markup,
      customPricing,
      commissionRate,
      minPayoutAmount,
      autoPayouts,
    } = body;

    const config = await upsertResellerConfig(agencyId, {
      enabled,
      markup,
      customPricing,
      commissionRate,
      minPayoutAmount,
      autoPayouts,
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error('Update reseller error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update reseller config' },
      { status: 500 }
    );
  }
}

// POST /api/agencies/[agencyId]/reseller - Reseller actions
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_billing');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const agency = await getAgency(agencyId);

    if (!agency?.settings.enableReselling) {
      return NextResponse.json({ error: 'Reselling is not enabled for this agency' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'request-payout':
        const payout = await processResellerPayout(agencyId, {
          amount: body.amount,
          commissionIds: body.commissionIds,
        });
        return NextResponse.json(payout);

      case 'update-payout-details':
        if (!body.method || !body.details) {
          return NextResponse.json({ error: 'method and details are required' }, { status: 400 });
        }
        const config = await updatePayoutDetails(agencyId, body.method, body.details);
        return NextResponse.json({ config });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Reseller action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
}
