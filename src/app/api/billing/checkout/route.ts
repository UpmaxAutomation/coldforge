import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getOrCreateCustomer,
  createCheckoutSession,
  type BillingInterval,
  type PlanTier,
} from '@/lib/billing'
import { checkoutRequestSchema } from '@/lib/schemas'
import { validateRequest } from '@/lib/validation'

// POST /api/billing/checkout - Create checkout session
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, full_name')
      .eq('id', user.id)
      .single() as { data: { organization_id: string; full_name: string | null } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get organization name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', profile.organization_id)
      .single() as { data: { name: string } | null }

    // Validate request body
    const validation = await validateRequest(request, checkoutRequestSchema)
    if (!validation.success) return validation.error

    const { planTier, interval } = validation.data as unknown as {
      planTier: PlanTier
      interval: BillingInterval
    }

    // Get or create Stripe customer
    const customer = await getOrCreateCustomer(
      user.email || '',
      org?.name || profile.full_name || 'Customer',
      profile.organization_id
    )

    // Store customer ID if new
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('organizations') as any)
      .update({ stripe_customer_id: customer.id })
      .eq('id', profile.organization_id)

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const successUrl = `${baseUrl}/settings/billing?success=true`
    const cancelUrl = `${baseUrl}/settings/billing?canceled=true`

    const session = await createCheckoutSession(
      customer.id,
      planTier,
      interval,
      profile.organization_id,
      successUrl,
      cancelUrl
    )

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
