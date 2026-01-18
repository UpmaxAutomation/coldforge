// Individual Agency API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAgency,
  updateAgency,
  hasAgencyPermission,
  suspendAgency,
  reactivateAgency,
} from '@/lib/whitelabel';

interface RouteContext {
  params: Promise<{ agencyId: string }>;
}

// GET /api/agencies/[agencyId] - Get agency details
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agency = await getAgency(agencyId);

    if (!agency) {
      return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
    }

    // Check access
    const hasAccess = await hasAgencyPermission(agencyId, user.id, 'view_analytics');

    if (!hasAccess && agency.ownerId !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ agency });
  } catch (error) {
    console.error('Get agency error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get agency' },
      { status: 500 }
    );
  }
}

// PUT /api/agencies/[agencyId] - Update agency
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_agency');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { name, settings, branding } = body;

    const agency = await updateAgency(agencyId, { name, settings, branding });

    return NextResponse.json({ agency });
  } catch (error) {
    console.error('Update agency error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update agency' },
      { status: 500 }
    );
  }
}

// DELETE /api/agencies/[agencyId] - Delete agency (soft delete - suspend)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agency = await getAgency(agencyId);

    if (!agency) {
      return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
    }

    // Only owner can delete
    if (agency.ownerId !== user.id) {
      return NextResponse.json({ error: 'Only the owner can delete the agency' }, { status: 403 });
    }

    await suspendAgency(agencyId, 'Deleted by owner');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete agency error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete agency' },
      { status: 500 }
    );
  }
}

// POST /api/agencies/[agencyId] - Agency actions
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_agency');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let result;

    switch (action) {
      case 'suspend':
        result = await suspendAgency(agencyId, body.reason);
        break;
      case 'reactivate':
        result = await reactivateAgency(agencyId);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ agency: result });
  } catch (error) {
    console.error('Agency action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
}
