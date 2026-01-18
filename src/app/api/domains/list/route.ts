// Domain List API
// GET /api/domains/list - Get all domains for workspace

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceDomains } from '@/lib/domains';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const status = searchParams.get('status') as 'active' | 'expired' | 'pending' | undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    const result = await getWorkspaceDomains(workspaceId, {
      status,
      includeHealth: true,
      limit,
      offset,
    });

    return NextResponse.json({
      domains: result.domains,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Domain list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domains' },
      { status: 500 }
    );
  }
}
