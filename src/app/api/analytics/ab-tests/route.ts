// A/B Tests API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createABTest, listABTests } from '@/lib/analytics';
import type { ABTestStatus } from '@/lib/analytics/types';

// GET /api/analytics/ab-tests - List A/B tests
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const campaignId = searchParams.get('campaignId') || undefined;
    const status = searchParams.get('status') as ABTestStatus | undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await listABTests(workspaceId, {
      campaignId,
      status,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing A/B tests:', error);
    return NextResponse.json(
      { error: 'Failed to list A/B tests' },
      { status: 500 }
    );
  }
}

// POST /api/analytics/ab-tests - Create A/B test
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      workspaceId,
      campaignId,
      name,
      description,
      testType,
      winningMetric,
      confidenceLevel,
      autoSelectWinner,
      minimumSampleSize,
    } = body;

    if (!workspaceId || !campaignId || !name || !testType) {
      return NextResponse.json(
        { error: 'workspaceId, campaignId, name, and testType are required' },
        { status: 400 }
      );
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Verify campaign exists
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    const test = await createABTest({
      workspaceId,
      campaignId,
      name,
      description,
      status: 'draft',
      testType,
      winningMetric: winningMetric || 'opens',
      confidenceLevel: confidenceLevel || 0.95,
      autoSelectWinner: autoSelectWinner ?? true,
      minimumSampleSize: minimumSampleSize || 100,
    });

    return NextResponse.json(test, { status: 201 });
  } catch (error) {
    console.error('Error creating A/B test:', error);
    return NextResponse.json(
      { error: 'Failed to create A/B test' },
      { status: 500 }
    );
  }
}
