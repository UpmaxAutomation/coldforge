import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  PLANS,
  getUsageSummary,
  getRemainingQuota,
  listInvoices,
  listPaymentMethods,
  getUpcomingInvoice,
} from '@/lib/billing'

// GET /api/billing - Get billing overview
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .single() as {
        data: {
          id: string
          plan_id: string
          stripe_subscription_id: string
          stripe_customer_id: string
          status: string
          current_period_start: string
          current_period_end: string
          cancel_at_period_end: boolean
          billing_interval: string
        } | null
      }

    // Default to free plan if no subscription
    const planId = subscription?.plan_id || 'free'
    const plan = PLANS.find(p => p.id === planId)

    // Get usage summary
    const usage = await getUsageSummary(profile.organization_id, planId)
    const quota = await getRemainingQuota(profile.organization_id, planId)

    // Get invoices and payment methods if has Stripe customer
    let invoices: Awaited<ReturnType<typeof listInvoices>> = []
    let paymentMethods: Awaited<ReturnType<typeof listPaymentMethods>> = []
    let upcomingInvoice = null

    if (subscription?.stripe_customer_id) {
      try {
        invoices = await listInvoices(subscription.stripe_customer_id, 5)
        paymentMethods = await listPaymentMethods(subscription.stripe_customer_id)
        upcomingInvoice = await getUpcomingInvoice(subscription.stripe_customer_id)
      } catch (e) {
        console.error('Failed to fetch Stripe data:', e)
      }
    }

    return NextResponse.json({
      subscription: subscription ? {
        id: subscription.id,
        planId: subscription.plan_id,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        billingInterval: subscription.billing_interval,
      } : null,
      plan: plan ? {
        id: plan.id,
        name: plan.name,
        tier: plan.tier,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        features: plan.features,
        limits: plan.limits,
      } : null,
      usage,
      quota,
      invoices: invoices.map(inv => ({
        id: inv.id,
        status: inv.status,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
        periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
        pdfUrl: inv.invoice_pdf,
        hostedUrl: inv.hosted_invoice_url,
      })),
      paymentMethods: paymentMethods.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        } : null,
      })),
      upcomingInvoice: upcomingInvoice ? {
        amountDue: upcomingInvoice.amount_due,
        currency: upcomingInvoice.currency,
        periodStart: upcomingInvoice.period_start ? new Date(upcomingInvoice.period_start * 1000).toISOString() : null,
        periodEnd: upcomingInvoice.period_end ? new Date(upcomingInvoice.period_end * 1000).toISOString() : null,
      } : null,
    })
  } catch (error) {
    console.error('Billing API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
