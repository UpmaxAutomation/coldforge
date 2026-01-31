import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyWebhookSignature, parseDomainCheckoutSession } from '@/lib/billing';
import { syncStripeInvoice } from '@/lib/billing/invoices';
import { purchaseCredits } from '@/lib/billing/credits';
import { setupDomain } from '@/lib/domains/orchestrator';
import Stripe from 'stripe';

// POST /api/webhooks/stripe - Handle Stripe webhooks
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const body = await request.text();
    event = verifyWebhookSignature(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};

        // Handle domain purchases
        if (metadata.type === 'domain_purchase') {
          const domainPurchase = parseDomainCheckoutSession(session);
          if (domainPurchase) {
            console.log(`Processing domain purchase for org ${domainPurchase.organizationId}:`, domainPurchase.domains);

            // Process each domain purchase
            for (const domain of domainPurchase.domains) {
              try {
                const result = await setupDomain({
                  domain,
                  orgId: domainPurchase.organizationId,
                  years: 1, // Default, would need to parse from line items for multi-year
                  autoRenew: true,
                });

                if (result.success) {
                  console.log(`Domain ${domain} setup completed successfully`);
                } else {
                  console.error(`Domain ${domain} setup failed:`, result.error);
                }
              } catch (err) {
                console.error(`Error processing domain ${domain}:`, err);
              }
            }

            await recordBillingEvent(supabase, domainPurchase.organizationId, 'domain_purchased', {
              sessionId: session.id,
              domains: domainPurchase.domains,
              totalAmount: domainPurchase.totalAmountPaid,
            });
          }
          break;
        }

        // Handle credit purchases
        if (metadata.type === 'credits' && metadata.packageId && metadata.workspaceId) {
          await purchaseCredits(
            metadata.workspaceId,
            metadata.packageId,
            session.id
          );
          await recordBillingEvent(supabase, metadata.workspaceId, 'credits_purchased', {
            sessionId: session.id,
            packageId: metadata.packageId,
          });
          break;
        }

        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;

          const organizationId = metadata.organizationId || metadata.workspaceId;
          const planTier = metadata.planTier || metadata.planId;

          if (organizationId && planTier) {
            // Create subscription record
            await adminClient.from('workspace_subscriptions')
              .upsert({
                workspace_id: organizationId,
                plan_id: planTier,
                stripe_subscription_id: subscriptionId,
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              }, {
                onConflict: 'workspace_id',
              });

            // Ensure Stripe customer mapping exists
            await adminClient.from('stripe_customers').upsert({
              workspace_id: organizationId,
              stripe_customer_id: session.customer as string,
            }, {
              onConflict: 'workspace_id',
            });

            await recordBillingEvent(supabase, organizationId, 'subscription_created', {
              subscriptionId,
              planId: planTier,
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const organizationId = subscription.metadata?.organizationId

        // Access items for period info
        const item = subscription.items?.data?.[0]
        const periodStart = item?.current_period_start || Math.floor(Date.now() / 1000)
        const periodEnd = item?.current_period_end || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

        if (organizationId) {
          await supabase.from('subscriptions')
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

        await supabase.from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'invoice.created':
      case 'invoice.updated':
      case 'invoice.finalized':
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const workspaceId = await getWorkspaceForCustomer(supabase, invoice.customer as string);

        if (workspaceId) {
          // Sync invoice using our new invoice system
          await syncStripeInvoice(invoice.id, workspaceId);

          if (event.type === 'invoice.paid') {
            await recordBillingEvent(supabase, workspaceId, 'invoice_paid', {
              invoiceId: invoice.id,
              amount: invoice.amount_paid,
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const workspaceId = await getWorkspaceForCustomer(supabase, invoice.customer as string);
        const failedSubscriptionId = invoice.lines?.data?.[0]?.subscription;

        if (failedSubscriptionId) {
          // Update subscription status
          await supabase
            .from('workspace_subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', failedSubscriptionId);
        }

        if (workspaceId) {
          await recordBillingEvent(supabase, workspaceId, 'payment_failed', {
            invoiceId: invoice.id,
            amount: invoice.amount_due,
          });
        }
        break;
      }

      case 'payment_method.attached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        const workspaceId = await getWorkspaceForCustomer(supabase, paymentMethod.customer as string);

        if (workspaceId) {
          await adminClient.from('payment_methods').upsert({
            workspace_id: workspaceId,
            stripe_payment_method_id: paymentMethod.id,
            type: paymentMethod.type,
            last_four: paymentMethod.card?.last4,
            brand: paymentMethod.card?.brand,
            exp_month: paymentMethod.card?.exp_month,
            exp_year: paymentMethod.card?.exp_year,
            is_default: false,
          }, {
            onConflict: 'stripe_payment_method_id',
          });
        }
        break;
      }

      case 'payment_method.detached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        await supabase
          .from('payment_methods')
          .delete()
          .eq('stripe_payment_method_id', paymentMethod.id);
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        const workspaceId = await getWorkspaceForCustomer(supabase, subscription.customer as string);

        if (workspaceId) {
          await recordBillingEvent(supabase, workspaceId, 'trial_ending', {
            subscriptionId: subscription.id,
            trialEnd: subscription.trial_end,
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// Helper: Get workspace ID for Stripe customer
async function getWorkspaceForCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('stripe_customers')
    .select('workspace_id')
    .eq('stripe_customer_id', customerId)
    .single();

  return data?.workspace_id || null;
}

// Helper: Record billing event
async function recordBillingEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string | null,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!workspaceId) return;

  try {
    const adminClient = createAdminClient();
    await adminClient.from('billing_events').insert({
      workspace_id: workspaceId,
      event_type: eventType,
      data,
    });
  } catch (error) {
    console.error('Failed to record billing event:', error);
  }
}
