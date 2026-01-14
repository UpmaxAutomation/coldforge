import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  executeWarmupForAccount,
  executeWarmupForOrganization,
  getWarmupTasks,
  type WarmupExecutionResult,
} from '@/lib/warmup/engine'

// Type definitions for database records
interface ProfileRecord {
  organization_id: string
}

interface EmailAccountRecord {
  id: string
  email: string
  organization_id: string
  warmup_enabled: boolean
  warmup_progress: number
  daily_limit: number
  sent_today: number
  status: string
}

interface WarmupEmailRecord {
  id: string
  from_account_id: string
  to_account_id: string
  status: string
  sent_at: string
}

// Generic error type for Supabase
interface SupabaseError {
  message: string
  code?: string
}

/**
 * POST /api/warmup/execute
 * Trigger warmup execution for accounts
 *
 * Body options:
 * - { scope: 'account', accountId: string } - Execute warmup for a single account
 * - { scope: 'organization' } - Execute warmup for all accounts in the user's organization
 * - { scope: 'preview', accountId: string } - Preview tasks without executing
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile and organization
    const profileResult = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const profile = profileResult.data as ProfileRecord | null
    const profileError = profileResult.error as SupabaseError | null

    if (profileError || !profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const { scope, accountId } = body as { scope: string; accountId?: string }

    if (!scope || !['account', 'organization', 'preview'].includes(scope)) {
      return NextResponse.json(
        { error: 'Invalid scope. Must be: account, organization, or preview' },
        { status: 400 }
      )
    }

    // Handle preview scope - return tasks without executing
    if (scope === 'preview') {
      if (!accountId) {
        return NextResponse.json(
          { error: 'accountId required for preview scope' },
          { status: 400 }
        )
      }

      // Verify account belongs to user's organization
      const accountResult = await supabase
        .from('email_accounts')
        .select('id, email, organization_id, warmup_enabled')
        .eq('id', accountId)
        .eq('organization_id', profile.organization_id)
        .single()

      const account = accountResult.data as EmailAccountRecord | null
      const accountError = accountResult.error as SupabaseError | null

      if (accountError || !account) {
        return NextResponse.json(
          { error: 'Account not found or not authorized' },
          { status: 404 }
        )
      }

      if (!account.warmup_enabled) {
        return NextResponse.json(
          { error: 'Warmup is not enabled for this account' },
          { status: 400 }
        )
      }

      const tasks = await getWarmupTasks(accountId)

      return NextResponse.json({
        success: true,
        scope: 'preview',
        accountId,
        email: account.email,
        tasks: tasks.map(t => ({
          id: t.id,
          type: t.type,
          toAccountId: t.toAccountId,
          scheduledAt: t.scheduledAt.toISOString(),
          status: t.status,
        })),
        taskCount: tasks.length,
        sendCount: tasks.filter(t => t.type === 'send').length,
        replyCount: tasks.filter(t => t.type === 'reply').length,
      })
    }

    // Handle account scope - execute for single account
    if (scope === 'account') {
      if (!accountId) {
        return NextResponse.json(
          { error: 'accountId required for account scope' },
          { status: 400 }
        )
      }

      // Verify account belongs to user's organization
      const accountResult = await supabase
        .from('email_accounts')
        .select('id, email, organization_id, warmup_enabled')
        .eq('id', accountId)
        .eq('organization_id', profile.organization_id)
        .single()

      const account = accountResult.data as EmailAccountRecord | null
      const accountError = accountResult.error as SupabaseError | null

      if (accountError || !account) {
        return NextResponse.json(
          { error: 'Account not found or not authorized' },
          { status: 404 }
        )
      }

      if (!account.warmup_enabled) {
        return NextResponse.json(
          { error: 'Warmup is not enabled for this account' },
          { status: 400 }
        )
      }

      const result = await executeWarmupForAccount(accountId)

      return NextResponse.json({
        success: result.success,
        scope: 'account',
        results: [formatResult(result, account.email)],
        summary: {
          accountsProcessed: 1,
          totalEmailsSent: result.emailsSent,
          totalRepliesSent: result.repliesSent,
          totalErrors: result.errors.length,
        },
      })
    }

    // Handle organization scope - execute for all accounts
    if (scope === 'organization') {
      const results = await executeWarmupForOrganization(profile.organization_id)

      // Get account emails for results
      const accountIds = results.map(r => r.accountId)
      const accountsResult = await supabase
        .from('email_accounts')
        .select('id, email')
        .in('id', accountIds)

      const accounts = accountsResult.data as Array<{ id: string; email: string }> | null

      const accountEmailMap = new Map(accounts?.map(a => [a.id, a.email]) || [])

      const formattedResults = results.map(r =>
        formatResult(r, accountEmailMap.get(r.accountId) || 'unknown')
      )

      return NextResponse.json({
        success: results.every(r => r.success),
        scope: 'organization',
        results: formattedResults,
        summary: {
          accountsProcessed: results.length,
          successfulAccounts: results.filter(r => r.success).length,
          failedAccounts: results.filter(r => !r.success).length,
          totalEmailsSent: results.reduce((sum, r) => sum + r.emailsSent, 0),
          totalRepliesSent: results.reduce((sum, r) => sum + r.repliesSent, 0),
          totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
        },
      })
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (error) {
    console.error('Warmup execute error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/warmup/execute
 * Get warmup execution status and pending tasks
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile and organization
    const profileResult = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const profile = profileResult.data as ProfileRecord | null
    const profileError = profileResult.error as SupabaseError | null

    if (profileError || !profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get('accountId')

    // Get warmup-enabled accounts
    let accountQuery = supabase
      .from('email_accounts')
      .select('id, email, warmup_enabled, warmup_progress, daily_limit, sent_today, status')
      .eq('organization_id', profile.organization_id)
      .eq('warmup_enabled', true)

    if (accountId) {
      accountQuery = accountQuery.eq('id', accountId)
    }

    const accountsResult = await accountQuery
    const accounts = accountsResult.data as EmailAccountRecord[] | null
    const accountsError = accountsResult.error as SupabaseError | null

    if (accountsError) {
      return NextResponse.json(
        { error: 'Failed to fetch accounts' },
        { status: 500 }
      )
    }

    // Get pending warmup emails for today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const accountIdList = accounts?.map(a => a.id) || []
    const emailsResult = await supabase
      .from('warmup_emails')
      .select('id, from_account_id, to_account_id, status, sent_at')
      .in('from_account_id', accountIdList.length > 0 ? accountIdList : ['_none_'])
      .gte('sent_at', todayStart.toISOString())

    const pendingEmails = emailsResult.data as WarmupEmailRecord[] | null
    const emailsError = emailsResult.error as SupabaseError | null

    if (emailsError) {
      console.error('Error fetching warmup emails:', emailsError)
    }

    const emailsByAccount = new Map<string, WarmupEmailRecord[]>()
    for (const email of pendingEmails || []) {
      const existing = emailsByAccount.get(email.from_account_id) || []
      existing.push(email)
      emailsByAccount.set(email.from_account_id, existing)
    }

    const accountStatus = accounts?.map(account => {
      const emails = emailsByAccount.get(account.id) || []
      return {
        accountId: account.id,
        email: account.email,
        warmupEnabled: account.warmup_enabled,
        warmupProgress: account.warmup_progress,
        dailyLimit: account.daily_limit,
        sentToday: account.sent_today,
        status: account.status,
        todayEmailsSent: emails.filter(e => e.status === 'sent').length,
        todayEmailsDelivered: emails.filter(e => e.status === 'delivered').length,
        todayEmailsReplied: emails.filter(e => e.status === 'replied').length,
        remainingToday: Math.max(0, (account.daily_limit || 0) - (account.sent_today || 0)),
      }
    })

    return NextResponse.json({
      success: true,
      accounts: accountStatus,
      summary: {
        totalAccounts: accounts?.length || 0,
        totalWarmupEnabled: accounts?.filter(a => a.warmup_enabled).length || 0,
        totalSentToday: accountStatus?.reduce((sum, a) => sum + a.todayEmailsSent, 0) || 0,
        totalRemainingToday: accountStatus?.reduce((sum, a) => sum + a.remainingToday, 0) || 0,
      },
    })
  } catch (error) {
    console.error('Warmup execute GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function formatResult(result: WarmupExecutionResult, email: string) {
  return {
    accountId: result.accountId,
    email,
    success: result.success,
    emailsSent: result.emailsSent,
    repliesSent: result.repliesSent,
    errors: result.errors,
  }
}
