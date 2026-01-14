// Stripe Integration Module

import Stripe from 'stripe'
import { PLANS, type BillingInterval, type PlanTier } from './types'

// Lazy Stripe initialization
let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeInstance) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    stripeInstance = new Stripe(stripeSecretKey)
  }
  return stripeInstance
}

// Export stripe getter for lazy access
export const stripe = {
  get customers() { return getStripe().customers },
  get subscriptions() { return getStripe().subscriptions },
  get checkout() { return getStripe().checkout },
  get billingPortal() { return getStripe().billingPortal },
  get invoices() { return getStripe().invoices },
  get paymentMethods() { return getStripe().paymentMethods },
  get setupIntents() { return getStripe().setupIntents },
  get promotionCodes() { return getStripe().promotionCodes },
  get webhooks() { return getStripe().webhooks },
}

// Create Stripe customer
export async function createCustomer(
  email: string,
  name: string,
  organizationId: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email,
    name,
    metadata: {
      organizationId,
      ...metadata,
    },
  })
}

// Get or create customer
export async function getOrCreateCustomer(
  email: string,
  name: string,
  organizationId: string
): Promise<Stripe.Customer> {
  // Search for existing customer
  const existingCustomers = await stripe.customers.search({
    query: `metadata['organizationId']:'${organizationId}'`,
    limit: 1,
  })

  const existingCustomer = existingCustomers.data[0]
  if (existingCustomer) {
    return existingCustomer
  }

  // Create new customer
  return createCustomer(email, name, organizationId)
}

// Create checkout session for subscription
export async function createCheckoutSession(
  customerId: string,
  planTier: PlanTier,
  interval: BillingInterval,
  organizationId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  const plan = PLANS.find(p => p.tier === planTier)

  if (!plan) {
    throw new Error(`Plan not found: ${planTier}`)
  }

  const priceId = interval === 'monthly'
    ? plan.stripePriceIdMonthly
    : plan.stripePriceIdYearly

  if (!priceId) {
    throw new Error(`Price ID not configured for plan: ${planTier}`)
  }

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        organizationId,
        planTier,
      },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
  })
}

// Create portal session for billing management
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}

// Get subscription
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId)
}

// Update subscription (change plan)
export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const firstItem = subscription.items.data[0]

  if (!firstItem) {
    throw new Error('Subscription has no items')
  }

  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: firstItem.id,
        price: newPriceId,
      },
    ],
    proration_behavior: 'always_invoice',
  })
}

// Cancel subscription
export async function cancelSubscription(
  subscriptionId: string,
  cancelImmediately = false
): Promise<Stripe.Subscription> {
  if (cancelImmediately) {
    return stripe.subscriptions.cancel(subscriptionId)
  }

  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  })
}

// Resume subscription (if canceled at period end)
export async function resumeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  })
}

// List invoices
export async function listInvoices(
  customerId: string,
  limit = 10
): Promise<Stripe.Invoice[]> {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  })

  return invoices.data
}

// Get upcoming invoice preview
export async function getUpcomingInvoice(
  customerId: string
): Promise<Stripe.Invoice | null> {
  try {
    return await stripe.invoices.createPreview({
      customer: customerId,
    })
  } catch {
    // No upcoming invoice
    return null
  }
}

// Add payment method
export async function attachPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  setDefault = true
): Promise<Stripe.PaymentMethod> {
  const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  })

  if (setDefault) {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    })
  }

  return paymentMethod
}

// List payment methods
export async function listPaymentMethods(
  customerId: string
): Promise<Stripe.PaymentMethod[]> {
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  })

  return paymentMethods.data
}

// Delete payment method
export async function detachPaymentMethod(
  paymentMethodId: string
): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.detach(paymentMethodId)
}

// Report usage for metered billing (if using usage-based pricing)
export async function reportUsage(
  subscriptionItemId: string,
  quantity: number,
  timestamp?: number
): Promise<unknown> {
  // Usage records API has been deprecated in newer Stripe versions
  // This is a placeholder for metered billing implementation
  console.log('Usage reporting:', { subscriptionItemId, quantity, timestamp })
  return { subscriptionItemId, quantity, timestamp: timestamp || Date.now() }
}

// Verify webhook signature
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  return getStripe().webhooks.constructEvent(payload, signature, webhookSecret)
}

// Get customer portal configuration
export async function getPortalConfiguration(): Promise<Stripe.BillingPortal.Configuration | null> {
  const configs = await stripe.billingPortal.configurations.list({ limit: 1 })
  return configs.data[0] || null
}

// Create setup intent for saving payment method without charging
export async function createSetupIntent(
  customerId: string
): Promise<Stripe.SetupIntent> {
  return stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
  })
}

// Get promotion code details
export async function getPromotionCode(code: string): Promise<Stripe.PromotionCode | null> {
  try {
    const promotionCodes = await stripe.promotionCodes.list({
      code,
      limit: 1,
    })
    return promotionCodes.data[0] || null
  } catch {
    return null
  }
}
