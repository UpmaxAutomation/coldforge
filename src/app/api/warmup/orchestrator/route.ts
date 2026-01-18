import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWarmupOrchestrator } from '@/lib/warmup/orchestrator';
import { getSlowRampController } from '@/lib/warmup/slow-ramp';

/**
 * GET /api/warmup/orchestrator
 * Get orchestrator status and warmup overview for an account
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    // Verify access
    const { data: account } = await supabase
      .from('email_accounts')
      .select('organization_id')
      .eq('id', accountId)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', account.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get warmup status
    const orchestrator = getWarmupOrchestrator();
    const status = await orchestrator.getWarmupStatus(accountId);

    return NextResponse.json(status);
  } catch (error) {
    console.error('Orchestrator status error:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}

/**
 * POST /api/warmup/orchestrator
 * Control the warmup orchestrator
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, accountId, targetVolume, profile, reason } = body;

    // For account-specific actions, verify access
    if (accountId) {
      const { data: account } = await supabase
        .from('email_accounts')
        .select('organization_id')
        .eq('id', accountId)
        .single();

      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', account.organization_id)
        .single();

      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const orchestrator = getWarmupOrchestrator();

    switch (action) {
      case 'start': {
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        const session = await orchestrator.startWarmup(accountId, {
          targetVolume: targetVolume || 50,
          profile: profile || 'moderate'
        });

        return NextResponse.json({
          success: true,
          message: 'Warmup started',
          session
        });
      }

      case 'stop': {
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        await orchestrator.stopWarmup(accountId, reason);

        return NextResponse.json({
          success: true,
          message: 'Warmup stopped'
        });
      }

      case 'pause': {
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        await orchestrator.pauseWarmup(accountId, reason || 'User paused');

        return NextResponse.json({
          success: true,
          message: 'Warmup paused'
        });
      }

      case 'resume': {
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        await orchestrator.resumeWarmup(accountId);

        return NextResponse.json({
          success: true,
          message: 'Warmup resumed'
        });
      }

      case 'schedule_daily': {
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        await orchestrator.scheduleDailyWarmup(accountId);

        return NextResponse.json({
          success: true,
          message: 'Daily warmup scheduled'
        });
      }

      case 'run_maintenance': {
        // Admin only
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role !== 'admin') {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        await orchestrator.runDailyMaintenance();

        return NextResponse.json({
          success: true,
          message: 'Daily maintenance completed'
        });
      }

      case 'start_orchestrator': {
        // Admin only - start the background workers
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role !== 'admin') {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        await orchestrator.start();

        return NextResponse.json({
          success: true,
          message: 'Orchestrator started'
        });
      }

      case 'stop_orchestrator': {
        // Admin only
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role !== 'admin') {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        await orchestrator.stop();

        return NextResponse.json({
          success: true,
          message: 'Orchestrator stopped'
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Orchestrator action error:', error);
    return NextResponse.json({
      error: 'Action failed',
      details: (error as Error).message
    }, { status: 500 });
  }
}
