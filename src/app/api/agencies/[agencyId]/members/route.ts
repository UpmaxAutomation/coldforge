// Agency Members API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAgencyMembers,
  hasAgencyPermission,
  createAgencyInvitation,
  getPendingInvitations,
} from '@/lib/whitelabel';

interface RouteContext {
  params: Promise<{ agencyId: string }>;
}

// GET /api/agencies/[agencyId]/members - List agency members
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_members');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const includePending = searchParams.get('include_pending') === 'true';

    const members = await getAgencyMembers(agencyId);

    let pendingInvitations: Awaited<ReturnType<typeof getPendingInvitations>> = [];
    if (includePending) {
      pendingInvitations = await getPendingInvitations(agencyId);
    }

    return NextResponse.json({
      members,
      pendingInvitations,
    });
  } catch (error) {
    console.error('Get members error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get members' },
      { status: 500 }
    );
  }
}

// POST /api/agencies/[agencyId]/members - Invite a new member
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_members');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role, permissions, subAccountAccess, assignedSubAccounts } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const invitation = await createAgencyInvitation(agencyId, user.id, {
      email,
      role: role || 'support',
      permissions: permissions || [],
      subAccountAccess: subAccountAccess || 'none',
      assignedSubAccounts,
    });

    // In production, send invitation email here

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    console.error('Invite member error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to invite member' },
      { status: 500 }
    );
  }
}
