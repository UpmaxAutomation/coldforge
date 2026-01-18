// Reputation Overview API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getReputationOverview,
  getReputationTrends,
  getTopReputationIssues,
  getSendingStatsSummary,
  getHealthBreakdown,
} from '@/lib/reputation';

// GET /api/reputation/overview - Get reputation overview
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const section = searchParams.get('section'); // overview, trends, issues, stats, breakdown

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    // Return requested section or all data
    if (section === 'overview') {
      const overview = await getReputationOverview(workspaceId);
      return NextResponse.json(overview);
    }

    if (section === 'trends') {
      const days = parseInt(searchParams.get('days') || '30', 10);
      const trends = await getReputationTrends(workspaceId, days);
      return NextResponse.json(trends);
    }

    if (section === 'issues') {
      const limit = parseInt(searchParams.get('limit') || '10', 10);
      const issues = await getTopReputationIssues(workspaceId, limit);
      return NextResponse.json({ issues });
    }

    if (section === 'stats') {
      const stats = await getSendingStatsSummary(workspaceId);
      return NextResponse.json(stats);
    }

    if (section === 'breakdown') {
      const breakdown = await getHealthBreakdown(workspaceId);
      return NextResponse.json(breakdown);
    }

    // Return all sections
    const [overview, trends, issues, stats, breakdown] = await Promise.all([
      getReputationOverview(workspaceId),
      getReputationTrends(workspaceId, 30),
      getTopReputationIssues(workspaceId, 10),
      getSendingStatsSummary(workspaceId),
      getHealthBreakdown(workspaceId),
    ]);

    return NextResponse.json({
      overview,
      trends,
      issues,
      stats,
      breakdown,
    });
  } catch (error) {
    console.error('Error fetching reputation overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reputation overview' },
      { status: 500 }
    );
  }
}
