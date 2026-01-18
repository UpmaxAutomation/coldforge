import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getSlowRampController,
  createSlowRampController,
  RAMP_PROFILES,
  generateRampSchedule
} from '@/lib/warmup/slow-ramp';

/**
 * GET /api/warmup/ramp
 * Get ramp status and schedule for an account
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
    const includeSchedule = searchParams.get('includeSchedule') === 'true';

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

    const rampController = getSlowRampController();
    await rampController.initialize();

    // Get ramp status
    const status = await rampController.getRampStatus(accountId);

    // Get schedule if requested
    let schedule = null;
    if (includeSchedule) {
      schedule = await rampController.getSchedule(accountId);
    }

    // Get recommended profile
    const recommendedProfile = await rampController.getRecommendedProfile(accountId);

    return NextResponse.json({
      status,
      schedule,
      recommendedProfile,
      profiles: RAMP_PROFILES,
      sendingWindows: rampController.getSendingWindows()
    });
  } catch (error) {
    console.error('Ramp status error:', error);
    return NextResponse.json({ error: 'Failed to get ramp status' }, { status: 500 });
  }
}

/**
 * POST /api/warmup/ramp
 * Update ramp settings or control ramp
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, accountId, profile, reason } = body;

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

    const rampController = getSlowRampController();
    await rampController.initialize();

    switch (action) {
      case 'change_profile': {
        if (!profile || !RAMP_PROFILES[profile as keyof typeof RAMP_PROFILES]) {
          return NextResponse.json({ error: 'Valid profile required' }, { status: 400 });
        }

        await rampController.adjustProfile(accountId, profile);

        return NextResponse.json({
          success: true,
          message: `Ramp profile changed to ${profile}`,
          profile: RAMP_PROFILES[profile as keyof typeof RAMP_PROFILES]
        });
      }

      case 'pause': {
        await rampController.pauseWarmup(accountId, reason || 'User paused');

        return NextResponse.json({
          success: true,
          message: 'Warmup ramp paused'
        });
      }

      case 'resume': {
        await rampController.resumeWarmup(accountId);

        return NextResponse.json({
          success: true,
          message: 'Warmup ramp resumed'
        });
      }

      case 'regenerate_schedule': {
        await rampController.regenerateSchedule(accountId);

        return NextResponse.json({
          success: true,
          message: 'Schedule regenerated'
        });
      }

      case 'preview_schedule': {
        // Generate a preview without saving
        const profileConfig = profile
          ? RAMP_PROFILES[profile as keyof typeof RAMP_PROFILES]
          : RAMP_PROFILES.moderate;

        const previewSchedule = generateRampSchedule({
          ...profileConfig,
          maxDailyVolume: body.maxDailyVolume || 50
        }, new Date(), body.days || 30);

        return NextResponse.json({
          preview: previewSchedule,
          daysToTarget: previewSchedule.length
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Ramp action error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
