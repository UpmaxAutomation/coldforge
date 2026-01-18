// Reputation Recovery System
// Manage recovery tasks for reputation issues

import { createClient } from '../supabase/server';
import type {
  RecoveryTask,
  RecoveryType,
  RecoveryStatus,
  EntityType,
} from './types';
import { getDelistingInstructions } from './blacklist';

// Get recovery tasks for a workspace
export async function getRecoveryTasks(
  workspaceId: string,
  options: {
    status?: RecoveryStatus | RecoveryStatus[];
    entityType?: EntityType;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ tasks: RecoveryTask[]; total: number }> {
  const supabase = await createClient();
  const { status, entityType, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('reputation_recovery_tasks')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (status) {
    if (Array.isArray(status)) {
      query = query.in('status', status);
    } else {
      query = query.eq('status', status);
    }
  }

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error || !data) {
    return { tasks: [], total: 0 };
  }

  const tasks: RecoveryTask[] = data.map(mapRecoveryTask);
  return { tasks, total: count || 0 };
}

// Get single recovery task
export async function getRecoveryTask(taskId: string): Promise<RecoveryTask | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reputation_recovery_tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error || !data) return null;

  return mapRecoveryTask(data);
}

// Create recovery task
export async function createRecoveryTask(
  task: Omit<RecoveryTask, 'id' | 'actionsTaken' | 'result' | 'startedAt' | 'completedAt'>
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  const supabase = await createClient();

  // Check for existing active task
  const { data: existing } = await supabase
    .from('reputation_recovery_tasks')
    .select('id')
    .eq('workspace_id', task.workspaceId)
    .eq('entity_id', task.entityId)
    .eq('recovery_type', task.recoveryType)
    .in('status', ['pending', 'in_progress'])
    .single();

  if (existing) {
    return { success: true, taskId: existing.id };
  }

  const { data, error } = await supabase
    .from('reputation_recovery_tasks')
    .insert({
      workspace_id: task.workspaceId,
      entity_type: task.entityType,
      entity_id: task.entityId,
      entity_value: task.entityValue,
      recovery_type: task.recoveryType,
      status: task.status,
      priority: task.priority,
      actions_taken: [],
      result: {},
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, taskId: data.id };
}

// Start recovery task
export async function startRecoveryTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('reputation_recovery_tasks')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('status', 'pending');

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Add action to recovery task
export async function addRecoveryAction(
  taskId: string,
  action: {
    action: string;
    result: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Get current task
  const { data: task, error: fetchError } = await supabase
    .from('reputation_recovery_tasks')
    .select('actions_taken')
    .eq('id', taskId)
    .single();

  if (fetchError || !task) {
    return { success: false, error: 'Task not found' };
  }

  const actionsTaken = task.actions_taken || [];
  actionsTaken.push({
    ...action,
    timestamp: new Date().toISOString(),
  });

  const { error } = await supabase
    .from('reputation_recovery_tasks')
    .update({
      actions_taken: actionsTaken,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Complete recovery task
export async function completeRecoveryTask(
  taskId: string,
  result: {
    success: boolean;
    notes?: string;
    data?: Record<string, unknown>;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('reputation_recovery_tasks')
    .update({
      status: result.success ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      result: {
        success: result.success,
        notes: result.notes,
        ...result.data,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Auto-create recovery tasks based on issues
export async function autoCreateRecoveryTasks(
  workspaceId: string
): Promise<{ created: number; tasks: string[] }> {
  const supabase = await createClient();
  const createdTasks: string[] = [];

  // Get blacklisted IPs that need delisting
  const { data: pools } = await supabase
    .from('ip_pools')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (pools && pools.length > 0) {
    const poolIds = pools.map((p) => p.id);

    const { data: blacklistedIps } = await supabase
      .from('sending_ips')
      .select('id, ip_address')
      .in('pool_id', poolIds)
      .eq('is_healthy', false)
      .eq('is_active', true);

    if (blacklistedIps) {
      for (const ip of blacklistedIps) {
        const result = await createRecoveryTask({
          workspaceId,
          entityType: 'ip',
          entityId: ip.id,
          entityValue: ip.ip_address,
          recoveryType: 'delisting',
          status: 'pending',
          priority: 1, // High priority
        });
        if (result.taskId) createdTasks.push(result.taskId);
      }
    }
  }

  // Get mailboxes with high bounce rates that need warmup reset
  const { data: mailboxes } = await supabase
    .from('mailbox_reputation')
    .select('mailbox_id, email, bounce_rate, consecutive_bounces')
    .eq('workspace_id', workspaceId)
    .or('bounce_rate.gt.10,consecutive_bounces.gte.5');

  if (mailboxes) {
    for (const mb of mailboxes) {
      const result = await createRecoveryTask({
        workspaceId,
        entityType: 'mailbox',
        entityId: mb.mailbox_id,
        entityValue: mb.email,
        recoveryType: 'warmup_reset',
        status: 'pending',
        priority: 2,
      });
      if (result.taskId) createdTasks.push(result.taskId);
    }
  }

  // Get mailboxes that should be quarantined
  const { data: criticalMailboxes } = await supabase
    .from('mailbox_reputation')
    .select('mailbox_id, email, complaint_rate')
    .eq('workspace_id', workspaceId)
    .gt('complaint_rate', 0.3)
    .eq('is_quarantined', false);

  if (criticalMailboxes) {
    for (const mb of criticalMailboxes) {
      const result = await createRecoveryTask({
        workspaceId,
        entityType: 'mailbox',
        entityId: mb.mailbox_id,
        entityValue: mb.email,
        recoveryType: 'quarantine',
        status: 'pending',
        priority: 1,
      });
      if (result.taskId) createdTasks.push(result.taskId);
    }
  }

  return { created: createdTasks.length, tasks: createdTasks };
}

// Execute recovery task
export async function executeRecoveryTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Get task details
  const task = await getRecoveryTask(taskId);
  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  // Start the task
  await startRecoveryTask(taskId);

  try {
    switch (task.recoveryType) {
      case 'delisting':
        return await executeDelistingRecovery(task, supabase);

      case 'warmup_reset':
        return await executeWarmupResetRecovery(task, supabase);

      case 'rate_reduction':
        return await executeRateReductionRecovery(task, supabase);

      case 'quarantine':
        return await executeQuarantineRecovery(task, supabase);

      default:
        return { success: false, error: 'Unknown recovery type' };
    }
  } catch (error) {
    await completeRecoveryTask(taskId, {
      success: false,
      notes: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: 'Recovery execution failed' };
  }
}

// Execute delisting recovery
async function executeDelistingRecovery(
  task: RecoveryTask,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ success: boolean; error?: string }> {
  // Get blacklist information
  const { data: checks } = await supabase
    .from('ip_blacklist_checks')
    .select(`
      is_listed,
      blacklist_providers(name)
    `)
    .eq('ip_id', task.entityId)
    .eq('is_listed', true);

  if (!checks || checks.length === 0) {
    // No longer blacklisted
    await completeRecoveryTask(task.id, {
      success: true,
      notes: 'IP is no longer blacklisted',
    });
    return { success: true };
  }

  // Get delisting instructions for each blacklist
  const blacklists = checks.map((c) => c.blacklist_providers?.name).filter(Boolean) as string[];
  const instructions: Array<{ blacklist: string; instructions: string; url?: string }> = [];

  for (const blacklist of blacklists) {
    const info = getDelistingInstructions(blacklist);
    instructions.push({
      blacklist,
      instructions: info.instructions,
      url: info.url,
    });

    await addRecoveryAction(task.id, {
      action: `Generated delisting instructions for ${blacklist}`,
      result: info.instructions,
    });
  }

  // Mark as in progress (requires manual action)
  await supabase
    .from('reputation_recovery_tasks')
    .update({
      result: { instructions, blacklists },
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  return { success: true };
}

// Execute warmup reset recovery
async function executeWarmupResetRecovery(
  task: RecoveryTask,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ success: boolean; error?: string }> {
  // Reset mailbox warmup progress
  const { error: warmupError } = await supabase
    .from('email_warmup_pool')
    .update({
      warmup_day: 1,
      emails_sent_today: 0,
      max_daily_emails: 5, // Start low
      warmup_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('mailbox_id', task.entityId);

  if (warmupError) {
    await addRecoveryAction(task.id, {
      action: 'Reset warmup progress',
      result: `Failed: ${warmupError.message}`,
    });
    await completeRecoveryTask(task.id, {
      success: false,
      notes: warmupError.message,
    });
    return { success: false, error: warmupError.message };
  }

  await addRecoveryAction(task.id, {
    action: 'Reset warmup progress',
    result: 'Warmup reset to day 1 with 5 emails/day limit',
  });

  // Reset reputation metrics
  const { error: repError } = await supabase
    .from('mailbox_reputation')
    .update({
      consecutive_bounces: 0,
      health_status: 'warning',
      is_quarantined: false,
      updated_at: new Date().toISOString(),
    })
    .eq('mailbox_id', task.entityId);

  if (repError) {
    await addRecoveryAction(task.id, {
      action: 'Reset reputation metrics',
      result: `Failed: ${repError.message}`,
    });
  } else {
    await addRecoveryAction(task.id, {
      action: 'Reset reputation metrics',
      result: 'Consecutive bounces reset, health status set to warning',
    });
  }

  await completeRecoveryTask(task.id, {
    success: true,
    notes: 'Warmup reset completed. Mailbox will gradually rebuild reputation.',
  });

  return { success: true };
}

// Execute rate reduction recovery
async function executeRateReductionRecovery(
  task: RecoveryTask,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ success: boolean; error?: string }> {
  if (task.entityType === 'ip') {
    // Reduce IP sending limits
    const { data: ip } = await supabase
      .from('sending_ips')
      .select('max_per_hour, max_per_day')
      .eq('id', task.entityId)
      .single();

    if (ip) {
      const newMaxPerHour = Math.floor((ip.max_per_hour || 1000) * 0.5);
      const newMaxPerDay = Math.floor((ip.max_per_day || 10000) * 0.5);

      await supabase
        .from('sending_ips')
        .update({
          max_per_hour: newMaxPerHour,
          max_per_day: newMaxPerDay,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.entityId);

      await addRecoveryAction(task.id, {
        action: 'Reduced IP sending limits',
        result: `New limits: ${newMaxPerHour}/hour, ${newMaxPerDay}/day`,
      });
    }
  } else if (task.entityType === 'mailbox') {
    // Reduce mailbox warmup limits
    const { data: warmup } = await supabase
      .from('email_warmup_pool')
      .select('max_daily_emails')
      .eq('mailbox_id', task.entityId)
      .single();

    if (warmup) {
      const newMax = Math.floor((warmup.max_daily_emails || 50) * 0.5);

      await supabase
        .from('email_warmup_pool')
        .update({
          max_daily_emails: Math.max(5, newMax),
          updated_at: new Date().toISOString(),
        })
        .eq('mailbox_id', task.entityId);

      await addRecoveryAction(task.id, {
        action: 'Reduced mailbox sending limits',
        result: `New daily limit: ${Math.max(5, newMax)}`,
      });
    }
  }

  await completeRecoveryTask(task.id, {
    success: true,
    notes: 'Sending rates reduced by 50% to allow reputation recovery.',
  });

  return { success: true };
}

// Execute quarantine recovery
async function executeQuarantineRecovery(
  task: RecoveryTask,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ success: boolean; error?: string }> {
  const quarantineEnd = new Date();
  quarantineEnd.setDate(quarantineEnd.getDate() + 7); // 7-day quarantine

  // Quarantine the mailbox
  const { error } = await supabase
    .from('mailbox_reputation')
    .update({
      is_quarantined: true,
      quarantine_reason: 'High complaint rate - automatic quarantine',
      quarantine_until: quarantineEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('mailbox_id', task.entityId);

  if (error) {
    await completeRecoveryTask(task.id, {
      success: false,
      notes: error.message,
    });
    return { success: false, error: error.message };
  }

  // Pause warmup
  await supabase
    .from('email_warmup_pool')
    .update({
      warmup_status: 'paused',
      updated_at: new Date().toISOString(),
    })
    .eq('mailbox_id', task.entityId);

  await addRecoveryAction(task.id, {
    action: 'Quarantined mailbox',
    result: `Quarantine until ${quarantineEnd.toISOString()}`,
  });

  await completeRecoveryTask(task.id, {
    success: true,
    notes: `Mailbox quarantined for 7 days. Will auto-release on ${quarantineEnd.toDateString()}.`,
  });

  return { success: true };
}

// Helper to map database row to RecoveryTask type
function mapRecoveryTask(data: Record<string, unknown>): RecoveryTask {
  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    entityType: data.entity_type as EntityType,
    entityId: data.entity_id as string,
    entityValue: data.entity_value as string | undefined,
    recoveryType: data.recovery_type as RecoveryType,
    status: data.status as RecoveryStatus,
    priority: (data.priority as number) || 10,
    startedAt: data.started_at ? new Date(data.started_at as string) : undefined,
    completedAt: data.completed_at ? new Date(data.completed_at as string) : undefined,
    actionsTaken: ((data.actions_taken as Array<{
      action: string;
      timestamp: string;
      result: string;
    }>) || []).map((a) => ({
      action: a.action,
      timestamp: new Date(a.timestamp),
      result: a.result,
    })),
    result: (data.result as Record<string, unknown>) || {},
  };
}
