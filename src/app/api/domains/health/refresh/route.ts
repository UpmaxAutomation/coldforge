// Domain Health Refresh API
// POST /api/domains/health/refresh - Refresh health check for all domains

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { monitorDomainsHealth } from '@/lib/dns/health-check';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // Run health checks for all domains
    const reports = await monitorDomainsHealth(workspaceId);

    return NextResponse.json({
      success: true,
      checked: reports.length,
      results: reports.map(r => ({
        domain: r.domain,
        status: r.overallStatus,
        score: r.overallScore,
      })),
    });
  } catch (error) {
    console.error('Domain health refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh domain health' },
      { status: 500 }
    );
  }
}
