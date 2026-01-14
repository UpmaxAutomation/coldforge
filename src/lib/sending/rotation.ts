import { createClient } from '@/lib/supabase/server'

export interface EmailAccount {
  id: string
  email: string
  dailyLimit: number
  sentToday: number
  isWarm: boolean
  lastUsed?: Date
}

// Database row type for email accounts query
interface EmailAccountRow {
  id: string
  email: string
  daily_limit: number
  sent_today: number
  warmup_enabled: boolean
  warmup_progress: number
  updated_at: string
}

export async function getAvailableAccounts(orgId: string): Promise<EmailAccount[]> {
  const supabase = await createClient()

  // Fetch active accounts where sent_today < daily_limit
  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, email, daily_limit, sent_today, warmup_enabled, warmup_progress, updated_at')
    .eq('organization_id', orgId)
    .eq('status', 'active') as { data: EmailAccountRow[] | null; error: unknown }

  if (error) {
    console.error('Error fetching email accounts:', error)
    return []
  }

  // Filter accounts that haven't exceeded daily limit and map to EmailAccount interface
  return (data || [])
    .filter(a => a.sent_today < a.daily_limit)
    .map(a => ({
      id: a.id,
      email: a.email,
      dailyLimit: a.daily_limit,
      sentToday: a.sent_today,
      // Account is considered warm if warmup is disabled (fully warmed) or warmup_progress >= 100
      isWarm: !a.warmup_enabled || a.warmup_progress >= 100,
      lastUsed: a.updated_at ? new Date(a.updated_at) : undefined
    }))
}

export function selectNextAccount(accounts: EmailAccount[]): EmailAccount | null {
  // Filter to only warmed accounts that haven't exceeded daily limit
  const available = accounts.filter(a => a.sentToday < a.dailyLimit && a.isWarm)

  if (!available.length) {
    return null
  }

  // Round-robin: pick the account that was least recently used
  const sorted = available.sort((a, b) => {
    const aTime = a.lastUsed?.getTime() || 0
    const bTime = b.lastUsed?.getTime() || 0
    return aTime - bTime
  })

  return sorted[0] || null
}

export async function incrementSentCount(accountId: string): Promise<void> {
  const supabase = await createClient()

  // Fallback: manually increment since RPC may not exist
  const { data: account } = await supabase
    .from('email_accounts')
    .select('sent_today')
    .eq('id', accountId)
    .single() as { data: { sent_today: number } | null }

  if (account) {
    await supabase
      .from('email_accounts')
      .update({
        sent_today: account.sent_today + 1,
        updated_at: new Date().toISOString()
      } as never)
      .eq('id', accountId)
  }
}

export async function resetDailyCounts(): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('email_accounts')
    .update({ sent_today: 0 } as never)
    .neq('id', '')

  if (error) {
    console.error('Error resetting daily counts:', error)
    throw error
  }
}

// Helper to check if an account can send more emails today
export function canAccountSend(account: EmailAccount): boolean {
  return account.isWarm && account.sentToday < account.dailyLimit
}

// Get total remaining capacity across all accounts
export function getTotalRemainingCapacity(accounts: EmailAccount[]): number {
  return accounts
    .filter(a => a.isWarm)
    .reduce((total, a) => total + Math.max(0, a.dailyLimit - a.sentToday), 0)
}
