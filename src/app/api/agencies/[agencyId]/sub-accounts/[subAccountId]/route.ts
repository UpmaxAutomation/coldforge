// Individual Sub-Account API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getSubAccount,
  updateSubAccount,
  suspendSubAccount,
  reactivateSubAccount,
  cancelSubAccount,
  transferSubAccount,
  hasAgencyPermission,
} from '@/lib/whitelabel';

interface RouteContext {
  params: Promise<{ agencyId: string; subAccountId: string }>;
}

// GET /api/agencies/[agencyId]/sub-accounts/[subAccountId] - Get sub-account details
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId, subAccountId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_subaccounts');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const subAccount = await getSubAccount(subAccountId);

    if (!subAccount) {
      return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 });
    }

    if (subAccount.agencyId !== agencyId) {
      return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 });
    }

    return NextResponse.json({ subAccount });
  } catch (error) {
    console.error('Get sub-account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get sub-account' },
      { status: 500 }
    );
  }
}

// PUT /api/agencies/[agencyId]/sub-accounts/[subAccountId] - Update sub-account
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId, subAccountId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_subaccounts');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const subAccount = await getSubAccount(subAccountId);

    if (!subAccount || subAccount.agencyId !== agencyId) {
      return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, settings, limits, billingOverride } = body;

    const updated = await updateSubAccount(subAccountId, {
      name,
      settings,
      limits,
      billingOverride,
    });

    return NextResponse.json({ subAccount: updated });
  } catch (error) {
    console.error('Update sub-account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update sub-account' },
      { status: 500 }
    );
  }
}

// DELETE /api/agencies/[agencyId]/sub-accounts/[subAccountId] - Cancel sub-account
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId, subAccountId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_subaccounts');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const subAccount = await getSubAccount(subAccountId);

    if (!subAccount || subAccount.agencyId !== agencyId) {
      return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 });
    }

    await cancelSubAccount(subAccountId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cancel sub-account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel sub-account' },
      { status: 500 }
    );
  }
}

// POST /api/agencies/[agencyId]/sub-accounts/[subAccountId] - Sub-account actions
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId, subAccountId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_subaccounts');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const subAccount = await getSubAccount(subAccountId);

    if (!subAccount || subAccount.agencyId !== agencyId) {
      return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;

    let result;

    switch (action) {
      case 'suspend':
        result = await suspendSubAccount(subAccountId, body.reason);
        break;
      case 'reactivate':
        result = await reactivateSubAccount(subAccountId);
        break;
      case 'transfer':
        if (!body.newOwnerId) {
          return NextResponse.json({ error: 'newOwnerId is required' }, { status: 400 });
        }
        result = await transferSubAccount(subAccountId, body.newOwnerId);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ subAccount: result });
  } catch (error) {
    console.error('Sub-account action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
}
