import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getPostmasterClient,
  initializePostmasterTools,
  getReputationSummary
} from '@/lib/warmup/postmaster-tools';

/**
 * GET /api/warmup/reputation
 * Get sender reputation data from Google Postmaster Tools
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const domain = searchParams.get('domain');
    const days = parseInt(searchParams.get('days') || '14');

    // Either accountId or domain is required
    if (!accountId && !domain) {
      return NextResponse.json({ error: 'Account ID or domain required' }, { status: 400 });
    }

    // If accountId provided, verify access
    if (accountId) {
      const { data: account } = await supabase
        .from('email_accounts')
        .select('organization_id, email')
        .eq('id', accountId)
        .single();

      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', account.organization_id)
        .single();

      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Get reputation summary for this account
      const summary = await getReputationSummary(accountId);

      return NextResponse.json(summary);
    }

    // Domain-based lookup (admin only)
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required for domain lookup' }, { status: 403 });
    }

    // Initialize postmaster client
    const client = await initializePostmasterTools();

    if (!client) {
      return NextResponse.json({
        error: 'Google Postmaster Tools not configured',
        setup: 'Set GOOGLE_POSTMASTER_CLIENT_ID, GOOGLE_POSTMASTER_CLIENT_SECRET, and GOOGLE_POSTMASTER_REFRESH_TOKEN environment variables'
      }, { status: 503 });
    }

    // Get reputation for domain
    const reputation = await client.getDomainReputation(domain!);
    const history = await client.getReputationHistory(domain!, days);
    const alerts = await client.checkAlerts(domain!);

    return NextResponse.json({
      current: reputation,
      history,
      alerts,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Reputation API error:', error);
    return NextResponse.json({ error: 'Failed to get reputation data' }, { status: 500 });
  }
}

/**
 * POST /api/warmup/reputation
 * Sync reputation data or trigger checks
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, accountId, domain } = body;

    switch (action) {
      case 'sync_account': {
        if (!accountId) {
          return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        // Verify access
        const { data: account } = await supabase
          .from('email_accounts')
          .select('organization_id, email')
          .eq('id', accountId)
          .single();

        if (!account) {
          return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        const { data: membership } = await supabase
          .from('organization_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('organization_id', account.organization_id)
          .single();

        if (!membership) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Sync reputation for this account
        const summary = await getReputationSummary(accountId);

        return NextResponse.json({
          success: true,
          message: 'Reputation synced',
          data: summary
        });
      }

      case 'sync_all_domains': {
        // Admin only
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role !== 'admin') {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const client = await initializePostmasterTools();

        if (!client) {
          return NextResponse.json({ error: 'Postmaster Tools not configured' }, { status: 503 });
        }

        const result = await client.syncAllDomains();

        return NextResponse.json({
          success: true,
          synced: result.synced,
          failed: result.failed,
          alerts: result.alerts
        });
      }

      case 'list_domains': {
        // Admin only
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role !== 'admin') {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const client = await initializePostmasterTools();

        if (!client) {
          return NextResponse.json({ error: 'Postmaster Tools not configured' }, { status: 503 });
        }

        const domains = await client.listDomains();

        return NextResponse.json({
          domains,
          count: domains.length
        });
      }

      case 'check_alerts': {
        if (!domain && !accountId) {
          return NextResponse.json({ error: 'Domain or account ID required' }, { status: 400 });
        }

        const client = await initializePostmasterTools();

        if (!client) {
          return NextResponse.json({ error: 'Postmaster Tools not configured' }, { status: 503 });
        }

        let targetDomain = domain;

        if (accountId && !domain) {
          const { data: account } = await supabase
            .from('email_accounts')
            .select('email')
            .eq('id', accountId)
            .single();

          if (account) {
            targetDomain = account.email.split('@')[1];
          }
        }

        if (!targetDomain) {
          return NextResponse.json({ error: 'Could not determine domain' }, { status: 400 });
        }

        const alerts = await client.checkAlerts(targetDomain);

        return NextResponse.json({
          domain: targetDomain,
          alerts,
          hasIssues: alerts.length > 0,
          criticalCount: alerts.filter(a => a.severity === 'critical').length,
          warningCount: alerts.filter(a => a.severity === 'warning').length
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Reputation action error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
