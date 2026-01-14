import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

type WarmupEmail = Tables<'warmup_emails'>

interface UserWithOrg {
  organization_id: string | null
}

interface EmailAccountPartial {
  id: string
  email: string
}

export interface WarmupActivity {
  id: string
  from_email: string
  to_email: string
  subject: string | null
  status: 'sent' | 'delivered' | 'opened' | 'replied'
  sent_at: string
  opened_at: string | null
  replied_at: string | null
  from_account_id: string | null
  to_account_id: string | null
}

// GET /api/warmup/activity - Get warmup activity log
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const profileResult = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const profile = profileResult.data as UserWithOrg | null

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const accountId = searchParams.get('account_id')
    const status = searchParams.get('status')

    // Get email account IDs for this organization
    const accountsResult = await supabase
      .from('email_accounts')
      .select('id, email')
      .eq('organization_id', profile.organization_id)

    const accounts = accountsResult.data as EmailAccountPartial[] | null

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        activity: [],
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false,
        }
      })
    }

    const accountIds = accounts.map(a => a.id)
    const emailMap = accounts.reduce((acc, a) => {
      acc[a.id] = a.email
      return acc
    }, {} as Record<string, string>)

    // Build query
    let query = supabase
      .from('warmup_emails')
      .select('*', { count: 'exact' })

    // Filter by organization's accounts
    if (accountId) {
      // Filter by specific account
      query = query.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)
    } else {
      // Filter by any of org's accounts
      query = query.or(`from_account_id.in.(${accountIds.join(',')}),to_account_id.in.(${accountIds.join(',')})`)
    }

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status)
    }

    // Order and paginate
    query = query
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const queryResult = await query

    const activity = queryResult.data as WarmupEmail[] | null
    const error = queryResult.error
    const count = queryResult.count

    if (error) {
      throw error
    }

    // Transform activity with email addresses
    const transformedActivity: WarmupActivity[] = (activity || []).map(item => ({
      id: item.id,
      from_email: item.from_account_id ? emailMap[item.from_account_id] || 'Unknown' : 'Unknown',
      to_email: item.to_account_id ? emailMap[item.to_account_id] || 'External' : 'External',
      subject: item.subject,
      status: item.status,
      sent_at: item.sent_at,
      opened_at: item.opened_at,
      replied_at: item.replied_at,
      from_account_id: item.from_account_id,
      to_account_id: item.to_account_id,
    }))

    return NextResponse.json({
      activity: transformedActivity,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      }
    })
  } catch (error) {
    console.error('Failed to fetch warmup activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch warmup activity' },
      { status: 500 }
    )
  }
}
