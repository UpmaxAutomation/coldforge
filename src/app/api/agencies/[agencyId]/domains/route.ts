// Agency Custom Domains API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createCustomDomain,
  getAgencyDomains,
  hasAgencyPermission,
} from '@/lib/whitelabel';
import type { CustomDomainType, CustomDomainStatus } from '@/lib/whitelabel/types';

interface RouteContext {
  params: Promise<{ agencyId: string }>;
}

// GET /api/agencies/[agencyId]/domains - List custom domains
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as CustomDomainType | undefined;
    const status = searchParams.get('status') as CustomDomainStatus | undefined;

    const domains = await getAgencyDomains(agencyId, { type, status });

    return NextResponse.json({ domains });
  } catch (error) {
    console.error('Get domains error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get domains' },
      { status: 500 }
    );
  }
}

// POST /api/agencies/[agencyId]/domains - Add custom domain
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
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

    const body = await request.json();
    const { domain, type, settings } = body;

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    if (!type || !['app', 'email', 'tracking'].includes(type)) {
      return NextResponse.json({ error: 'Valid domain type is required (app, email, tracking)' }, { status: 400 });
    }

    const customDomain = await createCustomDomain({
      agencyId,
      domain,
      type,
      settings,
    });

    return NextResponse.json({ domain: customDomain }, { status: 201 });
  } catch (error) {
    console.error('Create domain error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create domain' },
      { status: 500 }
    );
  }
}
