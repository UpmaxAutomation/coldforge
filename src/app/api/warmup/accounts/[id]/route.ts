// @ts-nocheck - TODO: Add proper Supabase type inference
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/warmup/accounts/[id] - Toggle warmup for an account
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { warmup_enabled, warmup_progress, reset_progress } = body

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Verify account belongs to organization
    const { data: existingAccount, error: fetchError } = await supabase
      .from('email_accounts')
      .select('id, organization_id, warmup_enabled, warmup_progress')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (fetchError || !existingAccount) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (warmup_enabled !== undefined) {
      updates.warmup_enabled = warmup_enabled
      // If enabling warmup, set status to 'warming'
      if (warmup_enabled) {
        updates.status = 'warming'
        // Reset progress if starting fresh
        if (existingAccount.warmup_progress === 0 || reset_progress) {
          updates.warmup_progress = 0
        }
      } else {
        // If disabling warmup, set status back to 'active'
        updates.status = 'active'
      }
    }

    if (warmup_progress !== undefined) {
      updates.warmup_progress = warmup_progress
    }

    if (reset_progress) {
      updates.warmup_progress = 0
    }

    // Update account
    const { error: updateError } = await supabase
      .from('email_accounts')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      console.error('Error updating warmup settings:', updateError)
      return NextResponse.json({ error: 'Failed to update warmup settings' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: warmup_enabled ? 'Warmup enabled' : 'Warmup disabled',
    })
  } catch (error) {
    console.error('Warmup account PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/warmup/accounts/[id] - Get warmup details for a specific account
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Get account with warmup details
    const { data: account, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (error || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Get warmup email history for this account (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: warmupEmails } = await supabase
      .from('warmup_emails')
      .select('*')
      .or(`from_account_id.eq.${id},to_account_id.eq.${id}`)
      .gte('sent_at', thirtyDaysAgo.toISOString())
      .order('sent_at', { ascending: false })

    // Calculate detailed stats
    const sent = warmupEmails?.filter(e => e.from_account_id === id) || []
    const received = warmupEmails?.filter(e => e.to_account_id === id) || []

    const stats = {
      totalSent: sent.length,
      totalReceived: received.length,
      totalReplied: sent.filter(e => e.status === 'replied').length,
      totalOpened: sent.filter(e => e.status === 'opened' || e.status === 'replied').length,
      replyRate: sent.length > 0
        ? Math.round((sent.filter(e => e.status === 'replied').length / sent.length) * 100)
        : 0,
      openRate: sent.length > 0
        ? Math.round((sent.filter(e => e.status === 'opened' || e.status === 'replied').length / sent.length) * 100)
        : 0,
    }

    // Calculate warmup stage (1-6)
    const warmupStage = Math.min(6, Math.floor((account.warmup_progress || 0) / 17) + 1)

    // Get daily limits based on stage
    const stageLimits = [5, 10, 20, 35, 50, 75]
    const dailyLimit = stageLimits[warmupStage - 1] || 5

    return NextResponse.json({
      account: {
        id: account.id,
        email: account.email,
        display_name: account.display_name,
        provider: account.provider,
        warmup_enabled: account.warmup_enabled,
        warmup_progress: account.warmup_progress || 0,
        warmup_stage: warmupStage,
        health_score: account.health_score || 0,
        status: account.status,
        daily_limit: dailyLimit,
        sent_today: account.sent_today || 0,
        created_at: account.created_at,
      },
      stats,
      recentEmails: warmupEmails?.slice(0, 10) || [],
    })
  } catch (error) {
    console.error('Warmup account GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
