// Agency Sub-Accounts API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createSubAccount,
  getAgencySubAccounts,
  hasAgencyPermission,
} from '@/lib/whitelabel';

interface RouteContext {
  params: Promise<{ agencyId: string }>;
}

// GET /api/agencies/[agencyId]/sub-accounts - List sub-accounts
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'active' | 'suspended' | 'trial' | 'canceled' | undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || undefined;

    const result = await getAgencySubAccounts(agencyId, {
      status,
      page,
      limit,
      search,
    });

    return NextResponse.json({
      subAccounts: result.subAccounts,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (error) {
    console.error('Get sub-accounts error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get sub-accounts' },
      { status: 500 }
    );
  }
}

// POST /api/agencies/[agencyId]/sub-accounts - Create sub-account
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
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

    const body = await request.json();
    const { name, slug, ownerId, settings, limits, billingOverride } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const subAccount = await createSubAccount(agencyId, {
      name,
      slug,
      ownerId,
      settings,
      limits,
      billingOverride,
    });

    return NextResponse.json({ subAccount }, { status: 201 });
  } catch (error) {
    console.error('Create sub-account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create sub-account' },
      { status: 500 }
    );
  }
}
