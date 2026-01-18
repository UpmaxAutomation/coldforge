// Domain Reputation API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getDomainReputation,
  getWorkspaceDomainReputations,
  upsertDomainReputation,
  checkDomainAuthentication,
  updateDomainAuthStatus,
  updateDomainReputationMetrics,
  getDomainHealthRecommendations,
  updateWorkspaceDomainReputations,
} from '@/lib/reputation';

// GET /api/reputation/domains - Get domain reputations
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const domainId = searchParams.get('domainId');
    const checkAuth = searchParams.get('checkAuth') === 'true';
    const domain = searchParams.get('domain');

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    // Check domain authentication (without storing)
    if (checkAuth && domain) {
      const auth = await checkDomainAuthentication(domain);
      return NextResponse.json(auth);
    }

    // Get single domain reputation
    if (domainId) {
      const domainRep = await getDomainReputation(domainId);
      if (!domainRep) {
        return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
      }
      const recommendations = getDomainHealthRecommendations(domainRep);
      return NextResponse.json({ ...domainRep, recommendations });
    }

    // Get all domain reputations
    const domains = await getWorkspaceDomainReputations(workspaceId);
    return NextResponse.json({ domains });
  } catch (error) {
    console.error('Error fetching domain reputations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domain reputations' },
      { status: 500 }
    );
  }
}

// POST /api/reputation/domains - Create or update domain reputation
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, workspaceId, domain, domainId, dkimSelector } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    switch (action) {
      case 'create': {
        if (!domain) {
          return NextResponse.json({ error: 'Domain required' }, { status: 400 });
        }
        const result = await upsertDomainReputation(workspaceId, domain);
        if (result.success && result.domainId) {
          // Check authentication status
          await updateDomainAuthStatus(result.domainId, dkimSelector);
        }
        return NextResponse.json(result);
      }

      case 'checkAuth': {
        if (!domainId) {
          return NextResponse.json({ error: 'Domain ID required' }, { status: 400 });
        }
        const result = await updateDomainAuthStatus(domainId, dkimSelector);
        return NextResponse.json(result);
      }

      case 'updateMetrics': {
        if (!domainId) {
          return NextResponse.json({ error: 'Domain ID required' }, { status: 400 });
        }
        const result = await updateDomainReputationMetrics(domainId);
        return NextResponse.json(result);
      }

      case 'updateAll': {
        const result = await updateWorkspaceDomainReputations(workspaceId);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing domain action:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
