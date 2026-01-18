// Individual Domain API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getCustomDomain,
  updateDomainSettings,
  deleteCustomDomain,
  verifyDomain,
  refreshDomainVerification,
  getDnsInstructions,
  checkDomainHealth,
  hasAgencyPermission,
} from '@/lib/whitelabel';

interface RouteContext {
  params: Promise<{ agencyId: string; domainId: string }>;
}

// GET /api/agencies/[agencyId]/domains/[domainId] - Get domain details
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId, domainId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_domains');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const domain = await getCustomDomain(domainId);

    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    if (domain.agencyId !== agencyId) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    // Include DNS instructions
    const dnsInstructions = getDnsInstructions(domain);

    return NextResponse.json({
      domain,
      dnsInstructions,
    });
  } catch (error) {
    console.error('Get domain error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get domain' },
      { status: 500 }
    );
  }
}

// PUT /api/agencies/[agencyId]/domains/[domainId] - Update domain settings
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId, domainId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_domains');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const domain = await getCustomDomain(domainId);

    if (!domain || domain.agencyId !== agencyId) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    const body = await request.json();
    const { settings } = body;

    const updated = await updateDomainSettings(domainId, settings);

    return NextResponse.json({ domain: updated });
  } catch (error) {
    console.error('Update domain error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update domain' },
      { status: 500 }
    );
  }
}

// DELETE /api/agencies/[agencyId]/domains/[domainId] - Delete domain
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId, domainId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_domains');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const domain = await getCustomDomain(domainId);

    if (!domain || domain.agencyId !== agencyId) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    await deleteCustomDomain(domainId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete domain error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete domain' },
      { status: 500 }
    );
  }
}

// POST /api/agencies/[agencyId]/domains/[domainId] - Domain actions
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId, domainId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_domains');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const domain = await getCustomDomain(domainId);

    if (!domain || domain.agencyId !== agencyId) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;

    let result;

    switch (action) {
      case 'verify':
        result = await verifyDomain(domainId);
        return NextResponse.json(result);

      case 'refresh':
        result = await refreshDomainVerification(domainId);
        return NextResponse.json({
          domain: result,
          dnsInstructions: getDnsInstructions(result),
        });

      case 'health':
        result = await checkDomainHealth(domainId);
        return NextResponse.json(result);

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Domain action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
}
