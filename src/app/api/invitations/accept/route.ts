// Invitation Acceptance API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { acceptAgencyInvitation, acceptSubAccountInvitation } from '@/lib/whitelabel';

// POST /api/invitations/accept - Accept an invitation
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { token, type } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    if (!type || !['agency', 'sub_account'].includes(type)) {
      return NextResponse.json({ error: 'Valid type is required (agency, sub_account)' }, { status: 400 });
    }

    let result;

    if (type === 'agency') {
      result = await acceptAgencyInvitation(token, user.id);
      return NextResponse.json({
        success: true,
        type: 'agency',
        agency: result,
      });
    } else {
      result = await acceptSubAccountInvitation(token, user.id);
      return NextResponse.json({
        success: true,
        type: 'sub_account',
        subAccount: result,
      });
    }
  } catch (error) {
    console.error('Accept invitation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to accept invitation' },
      { status: 500 }
    );
  }
}

// GET /api/invitations/accept - Validate invitation token
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const type = searchParams.get('type');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Check agency invitations
    if (!type || type === 'agency') {
      const { data: agencyInvite, error: agencyError } = await supabase
        .from('agency_invitations')
        .select(`
          *,
          agencies:agency_id (
            name,
            branding
          )
        `)
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (!agencyError && agencyInvite) {
        // Check if expired
        if (new Date(agencyInvite.expires_at) < new Date()) {
          return NextResponse.json({
            valid: false,
            error: 'Invitation has expired',
          });
        }

        return NextResponse.json({
          valid: true,
          type: 'agency',
          invitation: {
            email: agencyInvite.email,
            role: agencyInvite.role,
            agencyName: (agencyInvite.agencies as unknown as { name: string })?.name,
            expiresAt: agencyInvite.expires_at,
          },
        });
      }
    }

    // Check sub-account invitations
    if (!type || type === 'sub_account') {
      const { data: subAccountInvite, error: subAccountError } = await supabase
        .from('sub_account_invitations')
        .select(`
          *,
          sub_accounts:sub_account_id (
            name,
            agencies:agency_id (
              name,
              branding
            )
          )
        `)
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (!subAccountError && subAccountInvite) {
        // Check if expired
        if (new Date(subAccountInvite.expires_at) < new Date()) {
          return NextResponse.json({
            valid: false,
            error: 'Invitation has expired',
          });
        }

        const subAccount = subAccountInvite.sub_accounts as unknown as {
          name: string;
          agencies: { name: string; branding: Record<string, unknown> };
        };

        return NextResponse.json({
          valid: true,
          type: 'sub_account',
          invitation: {
            email: subAccountInvite.email,
            role: subAccountInvite.role,
            subAccountName: subAccount?.name,
            agencyName: subAccount?.agencies?.name,
            expiresAt: subAccountInvite.expires_at,
          },
        });
      }
    }

    return NextResponse.json({
      valid: false,
      error: 'Invitation not found or already used',
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate invitation' },
      { status: 500 }
    );
  }
}
