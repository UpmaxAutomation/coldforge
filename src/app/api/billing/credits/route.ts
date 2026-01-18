// Credits API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getCreditBalance,
  getCreditTransactions,
  getCreditUsageSummary,
  getCreditPackages,
  addCredits,
  estimateCreditCost,
  CREDIT_COSTS,
} from '@/lib/billing/credits';
import { createCheckoutSession, getOrCreateCustomer } from '@/lib/billing/stripe';

// GET /api/billing/credits - Get credit info
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const section = searchParams.get('section'); // balance, transactions, summary, packages, costs

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    switch (section) {
      case 'transactions': {
        const type = searchParams.get('type') as 'purchase' | 'usage' | 'refund' | 'adjustment' | 'expiry' | 'bonus' | null;
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const { transactions, total } = await getCreditTransactions(workspaceId, {
          type: type || undefined,
          limit,
          offset,
        });

        return NextResponse.json({
          transactions,
          total,
          pagination: {
            limit,
            offset,
            hasMore: offset + transactions.length < total,
          },
        });
      }

      case 'summary': {
        const period = (searchParams.get('period') || 'month') as 'day' | 'week' | 'month';
        const summary = await getCreditUsageSummary(workspaceId, period);
        return NextResponse.json(summary);
      }

      case 'packages': {
        const packages = await getCreditPackages();
        return NextResponse.json({ packages });
      }

      case 'costs': {
        return NextResponse.json({ costs: CREDIT_COSTS });
      }

      case 'balance':
      default: {
        const balance = await getCreditBalance(workspaceId);
        return NextResponse.json({
          balance: balance?.balance ?? 0,
          lifetimePurchased: balance?.lifetimePurchased ?? 0,
          lifetimeUsed: balance?.lifetimeUsed ?? 0,
          expiresAt: balance?.expiresAt,
        });
      }
    }
  } catch (error) {
    console.error('Error fetching credits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credits' },
      { status: 500 }
    );
  }
}

// POST /api/billing/credits - Credit actions
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
    const { action, workspaceId, packageId, amount, description, actions, successUrl, cancelUrl } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify workspace admin/owner access for purchases
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    switch (action) {
      case 'purchase': {
        if (!['owner', 'admin'].includes(member.role)) {
          return NextResponse.json(
            { error: 'Admin access required for purchases' },
            { status: 403 }
          );
        }

        if (!packageId) {
          return NextResponse.json({ error: 'Package ID required' }, { status: 400 });
        }

        // Get package
        const { data: pkg } = await supabase
          .from('credit_packages')
          .select('*')
          .eq('id', packageId)
          .eq('is_active', true)
          .single();

        if (!pkg) {
          return NextResponse.json({ error: 'Package not found' }, { status: 404 });
        }

        // Get or create Stripe customer
        const customerId = await getOrCreateCustomer(workspaceId, user.email || '');
        if (!customerId) {
          return NextResponse.json(
            { error: 'Failed to create customer' },
            { status: 500 }
          );
        }

        // Create checkout session for one-time payment
        const session = await createCheckoutSession({
          customerId,
          priceId: pkg.stripe_price_id,
          mode: 'payment',
          successUrl: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?credits=success`,
          cancelUrl: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?credits=canceled`,
          metadata: {
            workspaceId,
            userId: user.id,
            packageId,
            type: 'credits',
          },
        });

        return NextResponse.json({
          url: session.url,
          sessionId: session.id,
        });
      }

      case 'addBonus': {
        // Admin-only action to add bonus credits
        if (!['owner', 'admin'].includes(member.role)) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          );
        }

        if (!amount || amount <= 0) {
          return NextResponse.json({ error: 'Valid amount required' }, { status: 400 });
        }

        const result = await addCredits(workspaceId, amount, {
          type: 'bonus',
          description: description || 'Bonus credits',
        });

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          newBalance: result.newBalance,
        });
      }

      case 'estimate': {
        // Estimate credit cost for planned actions
        if (!actions || !Array.isArray(actions)) {
          return NextResponse.json(
            { error: 'Actions array required' },
            { status: 400 }
          );
        }

        const estimatedCost = estimateCreditCost(actions);
        const balance = await getCreditBalance(workspaceId);
        const currentBalance = balance?.balance ?? 0;

        return NextResponse.json({
          estimatedCost,
          currentBalance,
          sufficient: currentBalance >= estimatedCost,
          deficit: Math.max(0, estimatedCost - currentBalance),
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing credit action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
