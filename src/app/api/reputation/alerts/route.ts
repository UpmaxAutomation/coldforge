// Reputation Alerts API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getActiveAlerts,
  getAlert,
  resolveAlert,
  bulkResolveAlerts,
  getAlertStats,
  checkThresholdAlerts,
  autoResolveAlerts,
  getAlertHistory,
} from '@/lib/reputation';
import type { EntityType, AlertSeverity } from '@/lib/reputation/types';

// GET /api/reputation/alerts - Get alerts
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
    const alertId = searchParams.get('alertId');
    const entityType = searchParams.get('entityType') as EntityType | null;
    const severity = searchParams.get('severity') as AlertSeverity | null;
    const resolved = searchParams.get('resolved') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

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

    // Get single alert
    if (alertId) {
      const alert = await getAlert(alertId);
      if (!alert) {
        return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
      }
      return NextResponse.json(alert);
    }

    // Get alert history (resolved alerts)
    if (resolved) {
      const history = await getAlertHistory(workspaceId, { limit });
      return NextResponse.json({ alerts: history, total: history.length });
    }

    // Get active alerts
    const { alerts, total } = await getActiveAlerts(workspaceId, {
      entityType: entityType || undefined,
      severity: severity || undefined,
      limit,
      offset,
    });

    // Get stats
    const stats = await getAlertStats(workspaceId);

    return NextResponse.json({
      alerts,
      total,
      stats,
      pagination: {
        limit,
        offset,
        hasMore: offset + alerts.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

// POST /api/reputation/alerts - Actions on alerts
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
    const { action, workspaceId, alertId, alertIds, notes } = body;

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
      case 'resolve': {
        if (!alertId) {
          return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
        }
        const result = await resolveAlert(alertId, {
          resolvedBy: user.id,
          notes,
        });
        return NextResponse.json(result);
      }

      case 'bulkResolve': {
        if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
          return NextResponse.json({ error: 'Alert IDs required' }, { status: 400 });
        }
        const result = await bulkResolveAlerts(alertIds, {
          resolvedBy: user.id,
          notes,
        });
        return NextResponse.json(result);
      }

      case 'checkThresholds': {
        const result = await checkThresholdAlerts(workspaceId);
        return NextResponse.json(result);
      }

      case 'autoResolve': {
        const resolved = await autoResolveAlerts(workspaceId);
        return NextResponse.json({ resolved });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing alert action:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
