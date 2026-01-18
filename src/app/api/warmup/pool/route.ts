import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPoolManager, type ESPType } from '@/lib/warmup/pool-manager';

/**
 * GET /api/warmup/pool
 * Get warmup pool statistics and available accounts
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can view pool stats
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const espType = searchParams.get('esp');
    const tier = searchParams.get('tier');

    const poolManager = getPoolManager();
    await poolManager.initialize();

    // Get pool stats
    const stats = await poolManager.getPoolStats();

    // Get accounts if specific filters requested
    let accounts = null;
    if (espType) {
      accounts = await poolManager.getAccountsByESP(
        espType as ESPType,
        {
          status: 'active' as const,
          limit: 50
        }
      );
    }

    return NextResponse.json({
      stats,
      accounts: accounts || undefined,
      filters: {
        esp: espType,
        tier
      }
    });
  } catch (error) {
    console.error('Pool stats error:', error);
    return NextResponse.json({ error: 'Failed to get pool stats' }, { status: 500 });
  }
}

/**
 * POST /api/warmup/pool
 * Add accounts to the warmup pool (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can add to pool
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { accounts, tier } = body;

    if (!accounts || !Array.isArray(accounts)) {
      return NextResponse.json({ error: 'Accounts array required' }, { status: 400 });
    }

    const poolManager = getPoolManager();
    await poolManager.initialize();

    interface AccountInput {
      email: string;
      smtpHost: string;
      smtpPort?: number;
      secure?: boolean;
      user?: string;
      password: string;
      imapHost?: string;
      imapPort?: number;
      tier?: string;
    }

    // Bulk import accounts
    const result = await poolManager.bulkImportAccounts(
      accounts.map((acc: AccountInput) => ({
        email: acc.email,
        credentials: {
          host: acc.smtpHost,
          port: acc.smtpPort || 587,
          secure: acc.secure ?? true,
          user: acc.user || acc.email,
          pass: acc.password,
          imapHost: acc.imapHost,
          imapPort: acc.imapPort
        },
        tier: tier || acc.tier || 'standard'
      }))
    );

    return NextResponse.json({
      success: true,
      imported: result.imported,
      failed: result.failed,
      errors: result.errors.slice(0, 10) // Limit error messages
    });
  } catch (error) {
    console.error('Pool import error:', error);
    return NextResponse.json({ error: 'Failed to import accounts' }, { status: 500 });
  }
}

/**
 * DELETE /api/warmup/pool
 * Remove accounts from warmup pool or run maintenance
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can manage pool
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    const poolManager = getPoolManager();
    await poolManager.initialize();

    if (action === 'prune') {
      // Run maintenance to prune unhealthy accounts
      const result = await poolManager.pruneUnhealthyAccounts();
      return NextResponse.json({
        success: true,
        retired: result.retired,
        reactivated: result.reactivated
      });
    }

    if (action === 'reset_daily') {
      // Reset daily counters
      await poolManager.resetDailyCounters();
      return NextResponse.json({ success: true, message: 'Daily counters reset' });
    }

    return NextResponse.json({ error: 'Action required (prune or reset_daily)' }, { status: 400 });
  } catch (error) {
    console.error('Pool maintenance error:', error);
    return NextResponse.json({ error: 'Maintenance failed' }, { status: 500 });
  }
}
