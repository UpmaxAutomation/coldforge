import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Type definitions
interface UserProfile {
  organization_id: string | null
}

interface Organization {
  id: string
  plan: 'starter' | 'pro' | 'agency'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

// Plan limits configuration
const PLAN_LIMITS = {
  starter: {
    emails_limit: 1000,
    accounts_limit: 3,
    leads_limit: 1000
  },
  pro: {
    emails_limit: 10000,
    accounts_limit: 15,
    leads_limit: 10000
  },
  agency: {
    emails_limit: 50000,
    accounts_limit: 999, // "Unlimited"
    leads_limit: 999999 // "Unlimited"
  }
}

// GET /api/settings/billing - Get billing information
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: UserProfile | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Get organization details
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, plan, stripe_customer_id, stripe_subscription_id')
      .eq('id', profile.organization_id)
      .single() as { data: Organization | null; error: { code?: string; message?: string } | null }

    if (orgError) {
      throw orgError
    }

    const plan = (organization?.plan || 'starter') as keyof typeof PLAN_LIMITS
    const limits = PLAN_LIMITS[plan]

    // Get usage stats
    // Count email accounts
    const { count: accountsCount, error: accountsError } = await supabase
      .from('email_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)

    if (accountsError) {
      throw accountsError
    }

    // Count leads
    const { count: leadsCount, error: leadsError } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)

    if (leadsError) {
      throw leadsError
    }

    // Count emails sent this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count: emailsSent, error: emailsError } = await supabase
      .from('sent_emails')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .gte('sent_at', startOfMonth.toISOString())

    if (emailsError) {
      throw emailsError
    }

    // For now, we'll simulate subscription data
    // In production, this would come from Stripe
    const billing = {
      plan: organization?.plan || 'starter',
      status: 'active' as const,
      current_period_end: organization?.stripe_subscription_id
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null,
      usage: {
        emails_sent: emailsSent || 0,
        emails_limit: limits.emails_limit,
        accounts: accountsCount || 0,
        accounts_limit: limits.accounts_limit,
        leads: leadsCount || 0,
        leads_limit: limits.leads_limit
      }
    }

    return NextResponse.json({ billing })
  } catch (error) {
    console.error('Failed to fetch billing:', error)
    return NextResponse.json(
      { error: 'Failed to fetch billing information' },
      { status: 500 }
    )
  }
}
