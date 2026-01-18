// IP Rotation System
// Intelligent IP selection based on rotation rules, health, and performance

import { createClient } from '../supabase/server';
import type {
  IPRotationRule,
  RotationRuleType,
  IPSelectionResult,
} from './types';

// Get rotation rules for a workspace
export async function getRotationRules(workspaceId: string): Promise<IPRotationRule[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ip_rotation_rules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    ruleType: r.rule_type as RotationRuleType,
    isActive: r.is_active,
    priority: r.priority,
    config: r.config || {},
    ipWeights: r.ip_weights,
    domainMappings: r.domain_mappings,
    recipientPatterns: r.recipient_patterns,
    maxPerHour: r.max_per_hour,
    maxPerDay: r.max_per_day,
  }));
}

// Create a new rotation rule
export async function createRotationRule(
  rule: Omit<IPRotationRule, 'id'>
): Promise<{ success: boolean; ruleId?: string; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ip_rotation_rules')
    .insert({
      workspace_id: rule.workspaceId,
      name: rule.name,
      description: rule.description,
      rule_type: rule.ruleType,
      is_active: rule.isActive ?? true,
      priority: rule.priority ?? 10,
      config: rule.config || {},
      ip_weights: rule.ipWeights,
      domain_mappings: rule.domainMappings,
      recipient_patterns: rule.recipientPatterns,
      max_per_hour: rule.maxPerHour,
      max_per_day: rule.maxPerDay,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, ruleId: data.id };
}

// Update rotation rule
export async function updateRotationRule(
  ruleId: string,
  updates: Partial<IPRotationRule>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.ruleType !== undefined) updateData.rule_type = updates.ruleType;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  if (updates.config !== undefined) updateData.config = updates.config;
  if (updates.ipWeights !== undefined) updateData.ip_weights = updates.ipWeights;
  if (updates.domainMappings !== undefined) updateData.domain_mappings = updates.domainMappings;
  if (updates.recipientPatterns !== undefined) updateData.recipient_patterns = updates.recipientPatterns;
  if (updates.maxPerHour !== undefined) updateData.max_per_hour = updates.maxPerHour;
  if (updates.maxPerDay !== undefined) updateData.max_per_day = updates.maxPerDay;

  const { error } = await supabase
    .from('ip_rotation_rules')
    .update(updateData)
    .eq('id', ruleId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Delete rotation rule
export async function deleteRotationRule(ruleId: string): Promise<{ success: boolean }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('ip_rotation_rules')
    .delete()
    .eq('id', ruleId);

  return { success: !error };
}

// Get available IPs for a workspace
async function getAvailableIPs(workspaceId: string): Promise<Array<{
  id: string;
  ipAddress: string;
  priority: number;
  reputationScore: number;
  lastUsedAt: Date | null;
  currentPerHour: number;
  currentPerDay: number;
  maxPerHour: number;
  maxPerDay: number;
}>> {
  const supabase = await createClient();

  const { data: pools } = await supabase
    .from('ip_pools')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (!pools || pools.length === 0) return [];

  const poolIds = pools.map((p) => p.id);

  const { data: ips, error } = await supabase
    .from('sending_ips')
    .select(`
      id,
      ip_address,
      priority,
      reputation_score,
      last_used_at,
      current_per_hour,
      current_per_day,
      max_per_hour,
      max_per_day
    `)
    .in('pool_id', poolIds)
    .eq('is_active', true)
    .eq('is_healthy', true);

  if (error || !ips) return [];

  return ips.map((ip) => ({
    id: ip.id,
    ipAddress: ip.ip_address,
    priority: ip.priority || 10,
    reputationScore: ip.reputation_score || 50,
    lastUsedAt: ip.last_used_at ? new Date(ip.last_used_at) : null,
    currentPerHour: ip.current_per_hour || 0,
    currentPerDay: ip.current_per_day || 0,
    maxPerHour: ip.max_per_hour || 1000,
    maxPerDay: ip.max_per_day || 10000,
  }));
}

// Select best IP using rotation rules
export async function selectIP(
  workspaceId: string,
  options: {
    fromDomain?: string;
    recipientDomain?: string;
    preferredIPId?: string;
  } = {}
): Promise<IPSelectionResult | null> {
  const supabase = await createClient();
  const { fromDomain, recipientDomain, preferredIPId } = options;

  // Get available IPs
  const availableIPs = await getAvailableIPs(workspaceId);
  if (availableIPs.length === 0) {
    return null;
  }

  // Filter IPs that haven't exceeded rate limits
  const eligibleIPs = availableIPs.filter((ip) => {
    return ip.currentPerHour < ip.maxPerHour && ip.currentPerDay < ip.maxPerDay;
  });

  if (eligibleIPs.length === 0) {
    return null;
  }

  // Check if preferred IP is available
  if (preferredIPId) {
    const preferred = eligibleIPs.find((ip) => ip.id === preferredIPId);
    if (preferred) {
      await recordIPSelection(workspaceId, preferred.id, 'preferred');
      return {
        ipId: preferred.id,
        ipAddress: preferred.ipAddress,
        reason: 'Preferred IP specified',
      };
    }
  }

  // Get rotation rules
  const rules = await getRotationRules(workspaceId);

  // Apply rules in priority order
  for (const rule of rules) {
    const selected = await applyRotationRule(rule, eligibleIPs, {
      fromDomain,
      recipientDomain,
    });

    if (selected) {
      await recordIPSelection(workspaceId, selected.id, rule.name, rule.id);
      return {
        ipId: selected.id,
        ipAddress: selected.ipAddress,
        reason: `Selected by rule: ${rule.name}`,
        rotationRule: rule.name,
      };
    }
  }

  // Default: Round-robin by last used
  const sorted = eligibleIPs.sort((a, b) => {
    if (!a.lastUsedAt) return -1;
    if (!b.lastUsedAt) return 1;
    return a.lastUsedAt.getTime() - b.lastUsedAt.getTime();
  });

  const selected = sorted[0];
  await recordIPSelection(workspaceId, selected.id, 'round_robin_default');

  return {
    ipId: selected.id,
    ipAddress: selected.ipAddress,
    reason: 'Default round-robin selection',
  };
}

// Apply a specific rotation rule
async function applyRotationRule(
  rule: IPRotationRule,
  eligibleIPs: Array<{
    id: string;
    ipAddress: string;
    priority: number;
    reputationScore: number;
    lastUsedAt: Date | null;
  }>,
  context: {
    fromDomain?: string;
    recipientDomain?: string;
  }
): Promise<{ id: string; ipAddress: string } | null> {
  switch (rule.ruleType) {
    case 'domain_based':
      if (context.fromDomain && rule.domainMappings?.[context.fromDomain]) {
        const targetIPId = rule.domainMappings[context.fromDomain];
        const ip = eligibleIPs.find((ip) => ip.id === targetIPId);
        if (ip) return { id: ip.id, ipAddress: ip.ipAddress };
      }
      break;

    case 'recipient_based':
      if (context.recipientDomain && rule.recipientPatterns) {
        for (const [pattern, ipId] of Object.entries(rule.recipientPatterns)) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          if (regex.test(context.recipientDomain)) {
            const ip = eligibleIPs.find((ip) => ip.id === ipId);
            if (ip) return { id: ip.id, ipAddress: ip.ipAddress };
          }
        }
      }
      break;

    case 'weighted':
      if (rule.ipWeights) {
        const weightedIPs = eligibleIPs
          .filter((ip) => rule.ipWeights![ip.id] !== undefined)
          .map((ip) => ({
            ...ip,
            weight: rule.ipWeights![ip.id] || 0,
          }));

        if (weightedIPs.length > 0) {
          const totalWeight = weightedIPs.reduce((sum, ip) => sum + ip.weight, 0);
          let random = Math.random() * totalWeight;

          for (const ip of weightedIPs) {
            random -= ip.weight;
            if (random <= 0) {
              return { id: ip.id, ipAddress: ip.ipAddress };
            }
          }
        }
      }
      break;

    case 'failover':
      // Use IPs in priority order
      const sortedByPriority = [...eligibleIPs].sort((a, b) => a.priority - b.priority);
      if (sortedByPriority.length > 0) {
        return {
          id: sortedByPriority[0].id,
          ipAddress: sortedByPriority[0].ipAddress,
        };
      }
      break;

    case 'round_robin':
    default:
      // Sort by last used, pick least recently used
      const sortedByUsage = [...eligibleIPs].sort((a, b) => {
        if (!a.lastUsedAt) return -1;
        if (!b.lastUsedAt) return 1;
        return a.lastUsedAt.getTime() - b.lastUsedAt.getTime();
      });

      if (sortedByUsage.length > 0) {
        return {
          id: sortedByUsage[0].id,
          ipAddress: sortedByUsage[0].ipAddress,
        };
      }
      break;
  }

  return null;
}

// Record IP selection for auditing
async function recordIPSelection(
  workspaceId: string,
  ipId: string,
  reason: string,
  ruleId?: string
): Promise<void> {
  const supabase = await createClient();

  // Update IP usage
  await supabase.rpc('increment_ip_usage', { p_ip_id: ipId });

  // Record in history (optional, for debugging)
  await supabase.from('ip_assignment_history').insert({
    workspace_id: workspaceId,
    ip_id: ipId,
    rotation_rule_id: ruleId,
    assignment_reason: reason,
    assigned_at: new Date().toISOString(),
  });
}

// Reset hourly IP counters (called by cron)
export async function resetHourlyIPCounters(): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('sending_ips')
    .update({ current_per_hour: 0 })
    .gt('current_per_hour', 0);
}

// Reset daily IP counters (called by cron)
export async function resetDailyIPCounters(): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('sending_ips')
    .update({ current_per_day: 0 })
    .gt('current_per_day', 0);
}

// Get IP usage statistics
export async function getIPUsageStats(
  workspaceId: string
): Promise<Array<{
  ipId: string;
  ipAddress: string;
  currentPerHour: number;
  currentPerDay: number;
  maxPerHour: number;
  maxPerDay: number;
  utilizationPercent: number;
}>> {
  const supabase = await createClient();

  const { data: pools } = await supabase
    .from('ip_pools')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (!pools || pools.length === 0) return [];

  const poolIds = pools.map((p) => p.id);

  const { data: ips } = await supabase
    .from('sending_ips')
    .select(`
      id,
      ip_address,
      current_per_hour,
      current_per_day,
      max_per_hour,
      max_per_day
    `)
    .in('pool_id', poolIds)
    .eq('is_active', true);

  if (!ips) return [];

  return ips.map((ip) => ({
    ipId: ip.id,
    ipAddress: ip.ip_address,
    currentPerHour: ip.current_per_hour || 0,
    currentPerDay: ip.current_per_day || 0,
    maxPerHour: ip.max_per_hour || 1000,
    maxPerDay: ip.max_per_day || 10000,
    utilizationPercent: ((ip.current_per_day || 0) / (ip.max_per_day || 10000)) * 100,
  }));
}
