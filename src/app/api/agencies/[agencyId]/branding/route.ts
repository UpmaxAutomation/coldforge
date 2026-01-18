// Agency Branding API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getBranding,
  updateAgencyBranding,
  previewBranding,
  hasAgencyPermission,
} from '@/lib/whitelabel';

interface RouteContext {
  params: Promise<{ agencyId: string }>;
}

// GET /api/agencies/[agencyId]/branding - Get branding settings
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_branding');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const branding = await getBranding({ agencyId });

    return NextResponse.json({ branding });
  } catch (error) {
    console.error('Get branding error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get branding' },
      { status: 500 }
    );
  }
}

// PUT /api/agencies/[agencyId]/branding - Update branding settings
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_branding');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      primaryColor,
      secondaryColor,
      accentColor,
      companyName,
      supportEmail,
      supportUrl,
      termsUrl,
      privacyUrl,
      customCss,
      emailFooter,
      loginPageHtml,
      dashboardWelcome,
    } = body;

    const branding = await updateAgencyBranding(agencyId, {
      primaryColor,
      secondaryColor,
      accentColor,
      companyName,
      supportEmail,
      supportUrl,
      termsUrl,
      privacyUrl,
      customCss,
      emailFooter,
      loginPageHtml,
      dashboardWelcome,
    });

    return NextResponse.json({ branding });
  } catch (error) {
    console.error('Update branding error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update branding' },
      { status: 500 }
    );
  }
}

// POST /api/agencies/[agencyId]/branding - Branding actions (preview, upload)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agencyId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const hasPermission = await hasAgencyPermission(agencyId, user.id, 'manage_branding');

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'preview':
        const preview = await previewBranding(body.branding || {});
        return NextResponse.json(preview);

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Branding action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
}
