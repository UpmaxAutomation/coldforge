// Integration Sync API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getIntegration, getIntegrationCredentials } from '@/lib/integrations';
import * as HubSpot from '@/lib/integrations/providers/hubspot';

interface RouteParams {
  params: Promise<{ integrationId: string }>;
}

// POST /api/integrations/[integrationId]/sync - Trigger sync
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { integrationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integration = await getIntegration(integrationId);

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', integration.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (integration.status !== 'connected') {
      return NextResponse.json(
        { error: 'Integration is not connected' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { direction = 'bidirectional', leadIds } = body;

    // Create sync job using admin client to bypass RLS
    const adminClient = createAdminClient();
    const { data: syncJob, error: createError } = await adminClient
      .from('sync_jobs')
      .insert({
        integration_id: integrationId,
        workspace_id: integration.workspaceId,
        direction,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createError) {
      return NextResponse.json(
        { error: 'Failed to create sync job' },
        { status: 500 }
      );
    }

    // Execute sync based on provider
    let result;
    const fieldMappings = integration.syncSettings?.fieldMappings || [];

    try {
      switch (integration.provider) {
        case 'hubspot':
          if (direction === 'inbound' || direction === 'bidirectional') {
            const inboundResult = await HubSpot.syncContactsFromHubSpot(
              integrationId,
              integration.workspaceId,
              fieldMappings
            );
            result = inboundResult;
          }

          if (direction === 'outbound' || direction === 'bidirectional') {
            const outboundResult = await HubSpot.syncLeadsToHubSpot(
              integrationId,
              integration.workspaceId,
              fieldMappings,
              leadIds
            );

            if (result) {
              result.recordsCreated += outboundResult.recordsCreated;
              result.recordsUpdated += outboundResult.recordsUpdated;
              result.recordsFailed += outboundResult.recordsFailed;
              result.errors.push(...outboundResult.errors);
            } else {
              result = outboundResult;
            }
          }
          break;

        case 'salesforce':
        case 'pipedrive':
          // Placeholder for other CRM integrations
          return NextResponse.json(
            { error: `${integration.provider} sync not yet implemented` },
            { status: 501 }
          );

        default:
          return NextResponse.json(
            { error: 'Provider does not support sync' },
            { status: 400 }
          );
      }

      // Update sync job with results using admin client
      await adminClient
        .from('sync_jobs')
        .update({
          status: result?.success ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          records_created: result?.recordsCreated || 0,
          records_updated: result?.recordsUpdated || 0,
          records_deleted: result?.recordsDeleted || 0,
          records_failed: result?.recordsFailed || 0,
          errors: result?.errors || [],
        })
        .eq('id', syncJob.id);

      return NextResponse.json({
        success: result?.success ?? false,
        syncJobId: syncJob.id,
        recordsCreated: result?.recordsCreated || 0,
        recordsUpdated: result?.recordsUpdated || 0,
        recordsDeleted: result?.recordsDeleted || 0,
        recordsFailed: result?.recordsFailed || 0,
        errors: result?.errors || [],
      });
    } catch (syncError) {
      // Update sync job as failed using admin client
      await adminClient
        .from('sync_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          errors: [
            {
              message: syncError instanceof Error ? syncError.message : 'Sync failed',
              code: 'SYNC_ERROR',
            },
          ],
        })
        .eq('id', syncJob.id);

      throw syncError;
    }
  } catch (error) {
    console.error('Error triggering sync:', error);
    return NextResponse.json(
      { error: 'Failed to trigger sync' },
      { status: 500 }
    );
  }
}

// GET /api/integrations/[integrationId]/sync - Get sync history
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { integrationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integration = await getIntegration(integrationId);

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', integration.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get sync jobs
    const { data: syncJobs, error: fetchError, count } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact' })
      .eq('integration_id', integrationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      throw fetchError;
    }

    // Get stats
    const { data: stats } = await supabase.rpc('get_integration_sync_stats', {
      p_integration_id: integrationId,
      p_days: 30,
    });

    return NextResponse.json({
      syncJobs: syncJobs || [],
      total: count || 0,
      stats: stats?.[0] || null,
    });
  } catch (error) {
    console.error('Error fetching sync history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync history' },
      { status: 500 }
    );
  }
}
