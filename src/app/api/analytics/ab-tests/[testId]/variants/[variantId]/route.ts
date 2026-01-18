// A/B Test Variant API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getABTest, updateVariant, deleteVariant } from '@/lib/analytics';

interface RouteParams {
  params: Promise<{ testId: string; variantId: string }>;
}

// PUT /api/analytics/ab-tests/[testId]/variants/[variantId] - Update variant
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { testId, variantId } = await params;
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

    // Don't allow editing variants of running tests
    if (test.status === 'running') {
      return NextResponse.json(
        { error: 'Cannot edit variants of a running test' },
        { status: 400 }
      );
    }

    // Verify variant belongs to test
    const variant = test.variants.find((v) => v.id === variantId);
    if (!variant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Parameters<typeof updateVariant>[1] = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.content !== undefined) updates.content = body.content;
    if (body.weight !== undefined) updates.weight = body.weight;

    const updatedVariant = await updateVariant(variantId, updates);

    return NextResponse.json(updatedVariant);
  } catch (error) {
    console.error('Error updating variant:', error);
    return NextResponse.json(
      { error: 'Failed to update variant' },
      { status: 500 }
    );
  }
}

// DELETE /api/analytics/ab-tests/[testId]/variants/[variantId] - Delete variant
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { testId, variantId } = await params;
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

    // Don't allow deleting variants of running tests
    if (test.status === 'running') {
      return NextResponse.json(
        { error: 'Cannot delete variants of a running test' },
        { status: 400 }
      );
    }

    // Verify variant belongs to test
    const variant = test.variants.find((v) => v.id === variantId);
    if (!variant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    await deleteVariant(variantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting variant:', error);
    return NextResponse.json(
      { error: 'Failed to delete variant' },
      { status: 500 }
    );
  }
}
