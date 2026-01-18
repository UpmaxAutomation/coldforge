// Reputation Alerts System
// Monitor and manage reputation alerts for IPs, domains, and mailboxes

import { createClient } from '../supabase/server';
import type {
  ReputationAlert,
  AlertType,
  AlertSeverity,
  EntityType,
} from './types';

// Get active alerts for a workspace
export async function getActiveAlerts(
  workspaceId: string,
  options: {
    entityType?: EntityType;
    severity?: AlertSeverity;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ alerts: ReputationAlert[]; total: number }> {
  const supabase = await createClient();
  const { entityType, severity, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('reputation_alerts')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('is_resolved', false)
    .order('created_at', { ascending: false });

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  if (severity) {
    query = query.eq('severity', severity);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error || !data) {
    return { alerts: [], total: 0 };
  }

  const alerts: ReputationAlert[] = data.map((a) => ({
    id: a.id,
    workspaceId: a.workspace_id,
    alertType: a.alert_type as AlertType,
    severity: a.severity as AlertSeverity,
    entityType: a.entity_type as EntityType,
    entityId: a.entity_id,
    entityValue: a.entity_value,
    message: a.message,
    details: a.details || {},
    isResolved: a.is_resolved,
    resolvedAt: a.resolved_at ? new Date(a.resolved_at) : undefined,
    resolvedBy: a.resolved_by,
    resolutionNotes: a.resolution_notes,
    createdAt: new Date(a.created_at),
  }));

  return { alerts, total: count || 0 };
}

// Get alert by ID
export async function getAlert(alertId: string): Promise<ReputationAlert | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reputation_alerts')
    .select('*')
    .eq('id', alertId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    alertType: data.alert_type as AlertType,
    severity: data.severity as AlertSeverity,
    entityType: data.entity_type as EntityType,
    entityId: data.entity_id,
    entityValue: data.entity_value,
    message: data.message,
    details: data.details || {},
    isResolved: data.is_resolved,
    resolvedAt: data.resolved_at ? new Date(data.resolved_at) : undefined,
    resolvedBy: data.resolved_by,
    resolutionNotes: data.resolution_notes,
    createdAt: new Date(data.created_at),
  };
}

// Create a new alert
export async function createAlert(
  alert: Omit<ReputationAlert, 'id' | 'createdAt' | 'isResolved'>
): Promise<{ success: boolean; alertId?: string; error?: string }> {
  const supabase = await createClient();

  // Check for duplicate active alerts
  const { data: existing } = await supabase
    .from('reputation_alerts')
    .select('id')
    .eq('workspace_id', alert.workspaceId)
    .eq('alert_type', alert.alertType)
    .eq('entity_id', alert.entityId)
    .eq('is_resolved', false)
    .single();

  if (existing) {
    // Update existing alert instead of creating duplicate
    return { success: true, alertId: existing.id };
  }

  const { data, error } = await supabase
    .from('reputation_alerts')
    .insert({
      workspace_id: alert.workspaceId,
      alert_type: alert.alertType,
      severity: alert.severity,
      entity_type: alert.entityType,
      entity_id: alert.entityId,
      entity_value: alert.entityValue,
      message: alert.message,
      details: alert.details,
      is_resolved: false,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, alertId: data.id };
}

// Resolve an alert
export async function resolveAlert(
  alertId: string,
  resolution: {
    resolvedBy: string;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('reputation_alerts')
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolution.resolvedBy,
      resolution_notes: resolution.notes,
    })
    .eq('id', alertId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Bulk resolve alerts
export async function bulkResolveAlerts(
  alertIds: string[],
  resolution: {
    resolvedBy: string;
    notes?: string;
  }
): Promise<{ success: boolean; resolved: number; error?: string }> {
  const supabase = await createClient();

  const { error, count } = await supabase
    .from('reputation_alerts')
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolution.resolvedBy,
      resolution_notes: resolution.notes,
    })
    .in('id', alertIds);

  if (error) {
    return { success: false, resolved: 0, error: error.message };
  }

  return { success: true, resolved: count || 0 };
}

// Get alert statistics
export async function getAlertStats(workspaceId: string): Promise<{
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  byType: Record<AlertType, number>;
  byEntity: Record<EntityType, number>;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reputation_alerts')
    .select('severity, alert_type, entity_type')
    .eq('workspace_id', workspaceId)
    .eq('is_resolved', false);

  if (error || !data) {
    return {
      total: 0,
      bySeverity: { info: 0, warning: 0, critical: 0 },
      byType: {
        blacklist: 0,
        high_bounce: 0,
        high_complaint: 0,
        reputation_drop: 0,
        authentication_fail: 0,
        rate_limit_exceeded: 0,
        consecutive_failures: 0,
      },
      byEntity: { ip: 0, domain: 0, mailbox: 0 },
    };
  }

  const bySeverity: Record<AlertSeverity, number> = { info: 0, warning: 0, critical: 0 };
  const byType: Record<AlertType, number> = {
    blacklist: 0,
    high_bounce: 0,
    high_complaint: 0,
    reputation_drop: 0,
    authentication_fail: 0,
    rate_limit_exceeded: 0,
    consecutive_failures: 0,
  };
  const byEntity: Record<EntityType, number> = { ip: 0, domain: 0, mailbox: 0 };

  for (const alert of data) {
    bySeverity[alert.severity as AlertSeverity]++;
    byType[alert.alert_type as AlertType]++;
    byEntity[alert.entity_type as EntityType]++;
  }

  return {
    total: data.length,
    bySeverity,
    byType,
    byEntity,
  };
}

// Check and create alerts based on thresholds
export async function checkThresholdAlerts(
  workspaceId: string
): Promise<{ created: number; alerts: string[] }> {
  const supabase = await createClient();
  const createdAlerts: string[] = [];

  // Check mailbox thresholds
  const { data: mailboxes } = await supabase
    .from('mailbox_reputation')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (mailboxes) {
    for (const mb of mailboxes) {
      // High bounce rate alert
      if (mb.bounce_rate > 5) {
        const result = await createAlert({
          workspaceId,
          alertType: 'high_bounce',
          severity: mb.bounce_rate > 10 ? 'critical' : 'warning',
          entityType: 'mailbox',
          entityId: mb.mailbox_id,
          entityValue: mb.email,
          message: `High bounce rate: ${mb.bounce_rate.toFixed(1)}%`,
          details: {
            bounceRate: mb.bounce_rate,
            totalBounced: mb.total_bounced,
            totalSent: mb.total_sent,
          },
        });
        if (result.alertId) createdAlerts.push(result.alertId);
      }

      // High complaint rate alert
      if (mb.complaint_rate > 0.1) {
        const result = await createAlert({
          workspaceId,
          alertType: 'high_complaint',
          severity: mb.complaint_rate > 0.3 ? 'critical' : 'warning',
          entityType: 'mailbox',
          entityId: mb.mailbox_id,
          entityValue: mb.email,
          message: `High complaint rate: ${mb.complaint_rate.toFixed(2)}%`,
          details: {
            complaintRate: mb.complaint_rate,
            totalComplaints: mb.total_complaints,
            totalSent: mb.total_sent,
          },
        });
        if (result.alertId) createdAlerts.push(result.alertId);
      }

      // Consecutive bounces alert
      if (mb.consecutive_bounces >= 3) {
        const result = await createAlert({
          workspaceId,
          alertType: 'consecutive_failures',
          severity: mb.consecutive_bounces >= 5 ? 'critical' : 'warning',
          entityType: 'mailbox',
          entityId: mb.mailbox_id,
          entityValue: mb.email,
          message: `${mb.consecutive_bounces} consecutive bounces`,
          details: {
            consecutiveBounces: mb.consecutive_bounces,
          },
        });
        if (result.alertId) createdAlerts.push(result.alertId);
      }

      // Low reputation score alert
      if (mb.reputation_score < 30) {
        const result = await createAlert({
          workspaceId,
          alertType: 'reputation_drop',
          severity: mb.reputation_score < 20 ? 'critical' : 'warning',
          entityType: 'mailbox',
          entityId: mb.mailbox_id,
          entityValue: mb.email,
          message: `Low reputation score: ${mb.reputation_score}`,
          details: {
            reputationScore: mb.reputation_score,
            healthStatus: mb.health_status,
          },
        });
        if (result.alertId) createdAlerts.push(result.alertId);
      }
    }
  }

  // Check domain thresholds
  const { data: domains } = await supabase
    .from('domain_reputation')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (domains) {
    for (const domain of domains) {
      // High bounce rate for domain
      if (domain.bounce_rate > 5) {
        const result = await createAlert({
          workspaceId,
          alertType: 'high_bounce',
          severity: domain.bounce_rate > 10 ? 'critical' : 'warning',
          entityType: 'domain',
          entityId: domain.id,
          entityValue: domain.domain,
          message: `High domain bounce rate: ${domain.bounce_rate.toFixed(1)}%`,
          details: {
            bounceRate: domain.bounce_rate,
            totalBounced: domain.total_bounced,
            totalSent: domain.total_sent,
          },
        });
        if (result.alertId) createdAlerts.push(result.alertId);
      }

      // Authentication issues
      if (domain.spf_status !== 'pass' || domain.dkim_status !== 'pass') {
        const result = await createAlert({
          workspaceId,
          alertType: 'authentication_fail',
          severity: domain.dmarc_status !== 'pass' ? 'critical' : 'warning',
          entityType: 'domain',
          entityId: domain.id,
          entityValue: domain.domain,
          message: `Email authentication issues detected`,
          details: {
            spfStatus: domain.spf_status,
            dkimStatus: domain.dkim_status,
            dmarcStatus: domain.dmarc_status,
          },
        });
        if (result.alertId) createdAlerts.push(result.alertId);
      }
    }
  }

  return { created: createdAlerts.length, alerts: createdAlerts };
}

// Auto-resolve alerts that are no longer applicable
export async function autoResolveAlerts(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  let resolved = 0;

  // Get all active alerts
  const { data: alerts } = await supabase
    .from('reputation_alerts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_resolved', false);

  if (!alerts) return 0;

  for (const alert of alerts) {
    let shouldResolve = false;

    switch (alert.alert_type) {
      case 'high_bounce': {
        // Check if bounce rate is now below threshold
        const table = alert.entity_type === 'mailbox' ? 'mailbox_reputation' : 'domain_reputation';
        const idField = alert.entity_type === 'mailbox' ? 'mailbox_id' : 'id';

        const { data } = await supabase
          .from(table)
          .select('bounce_rate')
          .eq(idField, alert.entity_id)
          .single();

        if (data && data.bounce_rate < 5) {
          shouldResolve = true;
        }
        break;
      }

      case 'high_complaint': {
        const table = alert.entity_type === 'mailbox' ? 'mailbox_reputation' : 'domain_reputation';
        const idField = alert.entity_type === 'mailbox' ? 'mailbox_id' : 'id';

        const { data } = await supabase
          .from(table)
          .select('complaint_rate')
          .eq(idField, alert.entity_id)
          .single();

        if (data && data.complaint_rate < 0.1) {
          shouldResolve = true;
        }
        break;
      }

      case 'consecutive_failures': {
        const { data } = await supabase
          .from('mailbox_reputation')
          .select('consecutive_bounces')
          .eq('mailbox_id', alert.entity_id)
          .single();

        if (data && data.consecutive_bounces === 0) {
          shouldResolve = true;
        }
        break;
      }

      case 'reputation_drop': {
        const table = alert.entity_type === 'mailbox' ? 'mailbox_reputation' : 'domain_reputation';
        const idField = alert.entity_type === 'mailbox' ? 'mailbox_id' : 'id';

        const { data } = await supabase
          .from(table)
          .select('reputation_score')
          .eq(idField, alert.entity_id)
          .single();

        if (data && data.reputation_score >= 50) {
          shouldResolve = true;
        }
        break;
      }

      case 'authentication_fail': {
        const { data } = await supabase
          .from('domain_reputation')
          .select('spf_status, dkim_status, dmarc_status')
          .eq('id', alert.entity_id)
          .single();

        if (data && data.spf_status === 'pass' && data.dkim_status === 'pass') {
          shouldResolve = true;
        }
        break;
      }
    }

    if (shouldResolve) {
      await supabase
        .from('reputation_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: 'system',
          resolution_notes: 'Auto-resolved: condition no longer applies',
        })
        .eq('id', alert.id);
      resolved++;
    }
  }

  return resolved;
}

// Get alert history
export async function getAlertHistory(
  workspaceId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}
): Promise<ReputationAlert[]> {
  const supabase = await createClient();
  const { startDate, endDate, limit = 100 } = options;

  let query = supabase
    .from('reputation_alerts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_resolved', true)
    .order('resolved_at', { ascending: false })
    .limit(limit);

  if (startDate) {
    query = query.gte('created_at', startDate.toISOString());
  }

  if (endDate) {
    query = query.lte('created_at', endDate.toISOString());
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map((a) => ({
    id: a.id,
    workspaceId: a.workspace_id,
    alertType: a.alert_type as AlertType,
    severity: a.severity as AlertSeverity,
    entityType: a.entity_type as EntityType,
    entityId: a.entity_id,
    entityValue: a.entity_value,
    message: a.message,
    details: a.details || {},
    isResolved: a.is_resolved,
    resolvedAt: a.resolved_at ? new Date(a.resolved_at) : undefined,
    resolvedBy: a.resolved_by,
    resolutionNotes: a.resolution_notes,
    createdAt: new Date(a.created_at),
  }));
}
