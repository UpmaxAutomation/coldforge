/**
 * Domain Purchase Checkout API
 *
 * POST /api/domains/checkout
 * Creates a Stripe checkout session for domain purchases
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getOrCreateCustomer,
  createDomainCheckoutSession,
  createSingleDomainCheckout,
  type DomainCheckoutItem,
} from '@/lib/billing'
import { checkDomainAvailability } from '@/lib/domains/purchase'

interface DomainCheckoutRequest {
  domains: Array<{
    domain: string
    years?: number
  }>
}

interface SingleDomainCheckoutRequest {
  domain: string
  years?: number
}

// POST /api/domains/checkout - Create domain purchase checkout
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    // Get organization
    const { data: org } = await supabase
      .from('organizations')
      .select('name, stripe_customer_id')
      .eq('id', profile.organization_id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const isSingleDomain = 'domain' in body && typeof body.domain === 'string'
    const isBulkDomains = 'domains' in body && Array.isArray(body.domains)

    if (!isSingleDomain && !isBulkDomains) {
      return NextResponse.json(
        { error: 'Provide either a single domain or domains array' },
        { status: 400 }
      )
    }

    // Parse domains to purchase
    let domainsToPurchase: Array<{ domain: string; years: number }> = []

    if (isSingleDomain) {
      const { domain, years = 1 } = body as SingleDomainCheckoutRequest
      domainsToPurchase = [{ domain: domain.toLowerCase(), years }]
    } else {
      const { domains } = body as DomainCheckoutRequest
      domainsToPurchase = domains.map((d) => ({
        domain: d.domain.toLowerCase(),
        years: d.years || 1,
      }))
    }

    // Validate domains (max 20 per checkout)
    if (domainsToPurchase.length > 20) {
      return NextResponse.json(
        { error: 'Maximum 20 domains per checkout' },
        { status: 400 }
      )
    }

    // Check availability and get pricing
    const checkoutItems: DomainCheckoutItem[] = []
    const unavailable: string[] = []

    for (const item of domainsToPurchase) {
      const availability = await checkDomainAvailability(item.domain)

      if (!availability.available) {
        unavailable.push(item.domain)
        continue
      }

      // Convert price to cents (Stripe uses cents)
      const priceInCents = Math.round((availability.price || 10) * 100) * item.years

      checkoutItems.push({
        domain: item.domain,
        price: priceInCents,
        years: item.years,
      })
    }

    // If any domains unavailable, return error
    if (unavailable.length > 0) {
      return NextResponse.json(
        {
          error: 'Some domains are not available',
          unavailable,
        },
        { status: 400 }
      )
    }

    // If no valid domains, return error
    if (checkoutItems.length === 0) {
      return NextResponse.json({ error: 'No valid domains to purchase' }, { status: 400 })
    }

    // Get or create Stripe customer
    const customer = await getOrCreateCustomer(
      user.email || '',
      org.name || 'Customer',
      profile.organization_id
    )

    // Update org with customer ID if new
    if (!org.stripe_customer_id) {
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customer.id })
        .eq('id', profile.organization_id)
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const successUrl = `${baseUrl}/domains?purchase=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/domains?purchase=canceled`

    let session

    if (checkoutItems.length === 1) {
      // Single domain checkout
      const item = checkoutItems[0]
      session = await createSingleDomainCheckout(
        customer.id,
        profile.organization_id,
        item.domain,
        item.price,
        item.years,
        successUrl,
        cancelUrl
      )
    } else {
      // Bulk domain checkout
      session = await createDomainCheckoutSession(
        customer.id,
        profile.organization_id,
        checkoutItems,
        successUrl,
        cancelUrl
      )
    }

    // Calculate totals for response
    const totalPrice = checkoutItems.reduce((sum, d) => sum + d.price, 0)

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
      domains: checkoutItems.map((d) => ({
        domain: d.domain,
        price: d.price / 100, // Convert back to dollars for display
        years: d.years,
      })),
      totalPrice: totalPrice / 100,
      currency: 'USD',
    })
  } catch (error) {
    console.error('Domain checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
