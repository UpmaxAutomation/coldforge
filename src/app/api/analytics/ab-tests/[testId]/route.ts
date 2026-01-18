// Individual A/B Test API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getABTest,
  deleteTest,
  startTest,
  pauseTest,
  resumeTest,
  completeTest,
  calculateTestResults,
  addVariant,
} from '@/lib/analytics';

interface RouteParams {
  params: Promise<{ testId: string }>;
}

// GET /api/analytics/ab-tests/[testId] - Get A/B test
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { testId } = await params;
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const test = await getABTest(testId);

    if (!test) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', test.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Include results if requested
    const includeResults = searchParams.get('includeResults') === 'true';
    if (includeResults) {
      const results = await calculateTestResults(testId);
      return NextResponse.json({ test, results });
    }

    return NextResponse.json(test);
  } catch (error) {
    console.error('Error fetching A/B test:', error);
    return NextResponse.json(
      { error: 'Failed to fetch A/B test' },
      { status: 500 }
    );
  }
}

// PUT /api/analytics/ab-tests/[testId] - Update A/B test
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { testId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const test = await getABTest(testId);

    if (!test) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', test.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action } = body;

    // Handle actions
    if (action) {
      let updatedTest;

      switch (action) {
        case 'start':
          if (test.variants.length < 2) {
            return NextResponse.json(
              { error: 'Test must have at least 2 variants to start' },
              { status: 400 }
            );
          }
          updatedTest = await startTest(testId);
          break;

        case 'pause':
          updatedTest = await pauseTest(testId);
          break;

        case 'resume':
          updatedTest = await resumeTest(testId);
          break;

        case 'complete':
          const winningVariantId = body.winningVariantId;
          updatedTest = await completeTest(testId, winningVariantId);
          break;

        case 'add-variant':
          const variant = await addVariant(testId, {
            name: body.variant.name,
            type: body.variant.type || test.testType,
            content: body.variant.content,
            weight: body.variant.weight || 50,
          });
          return NextResponse.json(variant, { status: 201 });

        default:
          return NextResponse.json(
            { error: `Unknown action: ${action}` },
            { status: 400 }
          );
      }

      return NextResponse.json(updatedTest);
    }

    // Regular update
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.confidenceLevel !== undefined) updates.confidence_level = body.confidenceLevel;
    if (body.autoSelectWinner !== undefined) updates.auto_select_winner = body.autoSelectWinner;
    if (body.minimumSampleSize !== undefined) updates.minimum_sample_size = body.minimumSampleSize;

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('ab_tests')
        .update(updates)
        .eq('id', testId)
        .select()
        .single();

      if (error) throw error;

      const updatedTest = await getABTest(testId);
      return NextResponse.json(updatedTest);
    }

    return NextResponse.json(test);
  } catch (error) {
    console.error('Error updating A/B test:', error);
    return NextResponse.json(
      { error: 'Failed to update A/B test' },
      { status: 500 }
    );
  }
}

// DELETE /api/analytics/ab-tests/[testId] - Delete A/B test
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { testId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const test = await getABTest(testId);

    if (!test) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', test.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Don't allow deleting running tests
    if (test.status === 'running') {
      return NextResponse.json(
        { error: 'Cannot delete a running test. Pause or complete it first.' },
        { status: 400 }
      );
    }

    await deleteTest(testId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting A/B test:', error);
    return NextResponse.json(
      { error: 'Failed to delete A/B test' },
      { status: 500 }
    );
  }
}
