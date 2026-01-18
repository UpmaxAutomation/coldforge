// Reputation Recovery Tasks API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getRecoveryTasks,
  getRecoveryTask,
  createRecoveryTask,
  startRecoveryTask,
  completeRecoveryTask,
  autoCreateRecoveryTasks,
  executeRecoveryTask,
} from '@/lib/reputation';
import type { RecoveryStatus, EntityType, RecoveryType } from '@/lib/reputation/types';

// GET /api/reputation/recovery - Get recovery tasks
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
    const taskId = searchParams.get('taskId');
    const status = searchParams.get('status') as RecoveryStatus | null;
    const entityType = searchParams.get('entityType') as EntityType | null;
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

    // Get single task
    if (taskId) {
      const task = await getRecoveryTask(taskId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json(task);
    }

    // Get all tasks with filters
    const { tasks, total } = await getRecoveryTasks(workspaceId, {
      status: status || undefined,
      entityType: entityType || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      tasks,
      total,
      pagination: {
        limit,
        offset,
        hasMore: offset + tasks.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching recovery tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recovery tasks' },
      { status: 500 }
    );
  }
}

// POST /api/reputation/recovery - Recovery task actions
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
      taskId,
      entityType,
      entityId,
      entityValue,
      recoveryType,
      priority,
      notes,
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
      case 'create': {
        if (!entityType || !entityId || !recoveryType) {
          return NextResponse.json(
            { error: 'Entity type, ID, and recovery type required' },
            { status: 400 }
          );
        }
        const result = await createRecoveryTask({
          workspaceId,
          entityType: entityType as EntityType,
          entityId,
          entityValue,
          recoveryType: recoveryType as RecoveryType,
          status: 'pending',
          priority: priority || 10,
        });
        return NextResponse.json(result);
      }

      case 'start': {
        if (!taskId) {
          return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
        }
        const result = await startRecoveryTask(taskId);
        return NextResponse.json(result);
      }

      case 'execute': {
        if (!taskId) {
          return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
        }
        const result = await executeRecoveryTask(taskId);
        return NextResponse.json(result);
      }

      case 'complete': {
        if (!taskId) {
          return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
        }
        const success = body.success !== false;
        const result = await completeRecoveryTask(taskId, {
          success,
          notes,
        });
        return NextResponse.json(result);
      }

      case 'autoCreate': {
        const result = await autoCreateRecoveryTasks(workspaceId);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing recovery action:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
