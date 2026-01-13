import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyWebhookSignature, getPlanById } from '@/lib/billing'
import Stripe from 'stripe'

// POST /api/webhooks/stripe - Handle Stripe webhooks
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    const body = await request.text()
    event = verifyWebhookSignature(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id

          const organizationId = session.metadata?.organizationId
          const planTier = session.metadata?.planTier

          if (organizationId && planTier) {
            // Create subscription record
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('subscriptions') as any)
              .upsert({
                organization_id: organizationId,
                plan_id: planTier,
                stripe_subscription_id: subscriptionId,
                stripe_customer_id: session.customer as string,
                status: 'active',
                billing_interval: session.metadata?.interval || 'monthly',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              }, {
                onConflict: 'organization_id',
              })
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const organizationId = subscription.metadata?.organizationId

        // Access items for period info
        const item = subscription.items?.data?.[0]
        const periodStart = item?.current_period_start || Math.floor(Date.now() / 1000)
        const periodEnd = item?.current_period_end || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

        if (organizationId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('subscriptions') as any)
            .update({
              status: subscription.status,
              current_period_start: new Date(periodStart * 1000).toISOString(),
              current_period_end: new Date(periodEnd * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              canceled_at: subscription.canceled_at
                ? new Date(subscription.canceled_at * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscription.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('subscriptions') as any)
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice

        // Get subscription ID from line items
        const subscriptionId = invoice.lines?.data?.[0]?.subscription || null
        const periodStart = invoice.lines?.data?.[0]?.period?.start
        const periodEnd = invoice.lines?.data?.[0]?.period?.end

        // Record invoice
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('invoices') as any)
          .upsert({
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: invoice.customer as string,
            status: 'paid',
            amount_due: invoice.amount_due,
            amount_paid: invoice.amount_paid,
            currency: invoice.currency,
            period_start: periodStart
              ? new Date(periodStart * 1000).toISOString()
              : null,
            period_end: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
            pdf_url: invoice.invoice_pdf,
            hosted_invoice_url: invoice.hosted_invoice_url,
            paid_at: new Date().toISOString(),
          }, {
            onConflict: 'stripe_invoice_id',
          })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const failedSubscriptionId = invoice.lines?.data?.[0]?.subscription

        if (failedSubscriptionId) {
          // Update subscription status
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('subscriptions') as any)
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', failedSubscriptionId)
        }

        // TODO: Send payment failed notification email
        break
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription
        // TODO: Send trial ending notification email
        console.log('Trial ending for subscription:', subscription.id)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
