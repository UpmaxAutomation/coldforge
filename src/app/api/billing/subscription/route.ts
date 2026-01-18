// Subscription Management API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createCheckoutSession,
  createPortalSession,
  updateSubscription,
  cancelSubscription,
  getOrCreateCustomer,
} from '@/lib/billing';

// GET /api/billing/subscription - Get current subscription
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

    // Get subscription
    const { data: subscription } = await supabase
      .from('workspace_subscriptions')
      .select(`
        *,
        subscription_plans (*)
      `)
      .eq('workspace_id', workspaceId)
      .single();

    // Get Stripe customer
    const { data: stripeCustomer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('workspace_id', workspaceId)
      .single();

    return NextResponse.json({
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            plan: subscription.subscription_plans
              ? {
                  id: subscription.subscription_plans.id,
                  name: subscription.subscription_plans.name,
                  tier: subscription.subscription_plans.tier,
                  priceCents: subscription.subscription_plans.price_cents,
                  interval: subscription.subscription_plans.billing_interval,
                }
              : null,
          }
        : null,
      hasStripeCustomer: !!stripeCustomer,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

// POST /api/billing/subscription - Subscription actions
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
    const { action, workspaceId, priceId, planId, successUrl, cancelUrl } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify workspace admin/owner access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Admin access required for billing' },
        { status: 403 }
      );
    }

    switch (action) {
      case 'createCheckout': {
        if (!priceId) {
          return NextResponse.json({ error: 'Price ID required' }, { status: 400 });
        }

        // Get or create Stripe customer
        const customerId = await getOrCreateCustomer(workspaceId, user.email || '');
        if (!customerId) {
          return NextResponse.json(
            { error: 'Failed to create customer' },
            { status: 500 }
          );
        }

        // Create checkout session
        const session = await createCheckoutSession({
          customerId,
          priceId,
          successUrl: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
          cancelUrl: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
          metadata: {
            workspaceId,
            userId: user.id,
          },
        });

        return NextResponse.json({
          url: session.url,
          sessionId: session.id,
        });
      }

      case 'createPortal': {
        // Get Stripe customer
        const { data: customer } = await supabase
          .from('stripe_customers')
          .select('stripe_customer_id')
          .eq('workspace_id', workspaceId)
          .single();

        if (!customer) {
          return NextResponse.json(
            { error: 'No billing setup found' },
            { status: 404 }
          );
        }

        const session = await createPortalSession(
          customer.stripe_customer_id,
          successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`
        );

        return NextResponse.json({ url: session.url });
      }

      case 'update': {
        if (!planId) {
          return NextResponse.json({ error: 'Plan ID required' }, { status: 400 });
        }

        // Get current subscription
        const { data: subscription } = await supabase
          .from('workspace_subscriptions')
          .select('stripe_subscription_id')
          .eq('workspace_id', workspaceId)
          .single();

        if (!subscription?.stripe_subscription_id) {
          return NextResponse.json(
            { error: 'No active subscription' },
            { status: 404 }
          );
        }

        // Get new plan price
        const { data: plan } = await supabase
          .from('subscription_plans')
          .select('stripe_price_id')
          .eq('id', planId)
          .single();

        if (!plan?.stripe_price_id) {
          return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        await updateSubscription(
          subscription.stripe_subscription_id,
          plan.stripe_price_id
        );

        return NextResponse.json({ success: true });
      }

      case 'cancel': {
        const { data: subscription } = await supabase
          .from('workspace_subscriptions')
          .select('stripe_subscription_id')
          .eq('workspace_id', workspaceId)
          .single();

        if (!subscription?.stripe_subscription_id) {
          return NextResponse.json(
            { error: 'No active subscription' },
            { status: 404 }
          );
        }

        const atPeriodEnd = body.atPeriodEnd !== false;
        await cancelSubscription(subscription.stripe_subscription_id, atPeriodEnd);

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing subscription action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
