// IP Reputation API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  checkIPBlacklists,
  checkWorkspaceIPBlacklists,
  getIPHealth,
  getBlacklistProviders,
  scheduleBlacklistChecks,
  getRotationRules,
  createRotationRule,
  updateRotationRule,
  deleteRotationRule,
  selectIP,
  getIPUsageStats,
} from '@/lib/reputation';
import type { IPRotationRule } from '@/lib/reputation/types';

// GET /api/reputation/ips - Get IP reputation data
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
    const ipId = searchParams.get('ipId');
    const section = searchParams.get('section'); // health, blacklists, rules, usage, providers

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

    // Get blacklist providers
    if (section === 'providers') {
      const providers = await getBlacklistProviders();
      return NextResponse.json({ providers });
    }

    // Get IP health
    if (section === 'health' && ipId) {
      const health = await getIPHealth(ipId);
      if (!health) {
        return NextResponse.json({ error: 'IP not found' }, { status: 404 });
      }
      return NextResponse.json(health);
    }

    // Get rotation rules
    if (section === 'rules') {
      const rules = await getRotationRules(workspaceId);
      return NextResponse.json({ rules });
    }

    // Get IP usage stats
    if (section === 'usage') {
      const stats = await getIPUsageStats(workspaceId);
      return NextResponse.json({ stats });
    }

    // Get all workspace IPs with health status
    const { data: pools } = await supabase
      .from('ip_pools')
      .select('id, name')
      .eq('workspace_id', workspaceId);

    if (!pools || pools.length === 0) {
      return NextResponse.json({ ips: [], pools: [] });
    }

    const poolIds = pools.map((p) => p.id);

    const { data: ips } = await supabase
      .from('sending_ips')
      .select(`
        id,
        pool_id,
        ip_address,
        is_active,
        is_healthy,
        reputation_score,
        priority,
        max_per_hour,
        max_per_day,
        current_per_hour,
        current_per_day,
        total_sent,
        total_delivered,
        total_bounced,
        last_used_at
      `)
      .in('pool_id', poolIds)
      .order('reputation_score', { ascending: false });

    return NextResponse.json({
      ips: ips || [],
      pools,
    });
  } catch (error) {
    console.error('Error fetching IP reputation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch IP reputation' },
      { status: 500 }
    );
  }
}

// POST /api/reputation/ips - IP reputation actions
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
    const {
      action,
      workspaceId,
      ipId,
      ipAddress,
      ruleId,
      rule,
      fromDomain,
      recipientDomain,
    } = body;

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
      case 'checkBlacklists': {
        if (!ipId || !ipAddress) {
          return NextResponse.json(
            { error: 'IP ID and address required' },
            { status: 400 }
          );
        }
        const results = await checkIPBlacklists(ipId, ipAddress);
        return NextResponse.json({ results });
      }

      case 'checkAllBlacklists': {
        const result = await checkWorkspaceIPBlacklists(workspaceId);
        return NextResponse.json(result);
      }

      case 'scheduleChecks': {
        await scheduleBlacklistChecks();
        return NextResponse.json({ success: true });
      }

      case 'selectIP': {
        const selected = await selectIP(workspaceId, {
          fromDomain,
          recipientDomain,
          preferredIPId: ipId,
        });
        if (!selected) {
          return NextResponse.json(
            { error: 'No eligible IPs available' },
            { status: 404 }
          );
        }
        return NextResponse.json(selected);
      }

      case 'createRule': {
        if (!rule) {
          return NextResponse.json({ error: 'Rule required' }, { status: 400 });
        }
        const ruleData: Omit<IPRotationRule, 'id'> = {
          ...rule,
          workspaceId,
        };
        const result = await createRotationRule(ruleData);
        return NextResponse.json(result);
      }

      case 'updateRule': {
        if (!ruleId || !rule) {
          return NextResponse.json(
            { error: 'Rule ID and updates required' },
            { status: 400 }
          );
        }
        const result = await updateRotationRule(ruleId, rule);
        return NextResponse.json(result);
      }

      case 'deleteRule': {
        if (!ruleId) {
          return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });
        }
        const result = await deleteRotationRule(ruleId);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing IP action:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
