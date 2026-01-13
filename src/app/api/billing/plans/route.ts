import { NextRequest, NextResponse } from 'next/server'
import { PLANS } from '@/lib/billing'

// GET /api/billing/plans - List available plans
export async function GET(request: NextRequest) {
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
  }))

  return NextResponse.json({
    plans: activePlans.sort((a, b) => a.sortOrder - b.sortOrder),
  })
}
