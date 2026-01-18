// Domain Health API
// GET /api/domains/health - Get domain health status for workspace

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDomainAgeInfo } from '@/lib/dns/health-check';

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

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // Get domains with health summary
    const { data: domains, error } = await supabase
      .from('domain_purchases')
      .select(`
        id,
        domain,
        purchased_at,
        domain_health_summary(
          overall_status,
          overall_score,
          spf_status,
          dkim_status,
          dmarc_status,
          blacklist_status,
          last_check_at
        )
      `)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('purchased_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Transform data
    const now = new Date();
    const transformedDomains = (domains || []).map(d => {
      const purchasedAt = new Date(d.purchased_at);
      const ageInDays = Math.floor((now.getTime() - purchasedAt.getTime()) / (1000 * 60 * 60 * 24));
      const health = d.domain_health_summary as {
        overall_status?: string;
        overall_score?: number;
        spf_status?: string;
        dkim_status?: string;
        dmarc_status?: string;
        blacklist_status?: string;
        last_check_at?: string;
      } | null;

      return {
        domainId: d.id,
        domain: d.domain,
        status: health?.overall_status || 'unknown',
        score: health?.overall_score || 0,
        spf: health?.spf_status || 'unknown',
        dkim: health?.dkim_status || 'unknown',
        dmarc: health?.dmarc_status || 'unknown',
        blacklist: health?.blacklist_status || 'unknown',
        ageInDays,
        isWarmupReady: ageInDays >= 14,
        lastCheckAt: health?.last_check_at ? new Date(health.last_check_at) : null,
      };
    });

    return NextResponse.json({ domains: transformedDomains });
  } catch (error) {
    console.error('Domain health error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domain health' },
      { status: 500 }
    );
  }
}
