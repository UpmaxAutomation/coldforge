// Bulk Mailbox Provisioning API
// POST /api/mailboxes/bulk - Provision multiple mailboxes at once

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { bulkProvisionMailboxes, BulkProvisioningOptions } from '@/lib/mailbox/provisioner';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      workspaceId,
      providerConfigId,
      domain,
      count,
      nameGender,
      nameRegion,
      generateAliases = true,
      aliasCount = 2,
      setProfilePhoto = true,
      setSignature = true,
      signatureTemplateId,
      startWarmup = true,
    } = body;

    // Validate required fields
    if (!workspaceId || !providerConfigId || !domain || !count) {
      return NextResponse.json(
        { error: 'workspaceId, providerConfigId, domain, and count are required' },
        { status: 400 }
      );
    }

    // Validate count
    if (count < 1 || count > 100) {
      return NextResponse.json(
        { error: 'count must be between 1 and 100' },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Only owners and admins can provision
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Check provider config limits
    const { data: providerConfig, error: configError } = await supabase
      .from('email_provider_configs')
      .select('mailbox_limit, mailboxes_created')
      .eq('id', providerConfigId)
      .single();

    if (configError || !providerConfig) {
      return NextResponse.json(
        { error: 'Provider configuration not found' },
        { status: 404 }
      );
    }

    const availableSlots = (providerConfig.mailbox_limit || 100) - (providerConfig.mailboxes_created || 0);
    if (count > availableSlots) {
      return NextResponse.json(
        {
          error: `Insufficient mailbox quota. Available: ${availableSlots}, Requested: ${count}`,
          availableSlots,
        },
        { status: 400 }
      );
    }

    // Execute bulk provisioning
    const options: BulkProvisioningOptions = {
      workspaceId,
      providerConfigId,
      domain,
      count,
      nameGender,
      nameRegion,
      generateAliases,
      aliasCount,
      setProfilePhoto,
      setSignature,
      signatureTemplateId,
      startWarmup,
    };

    const result = await bulkProvisionMailboxes(options);

    // Return results
    return NextResponse.json({
      success: result.success,
      jobId: result.jobId,
      summary: {
        total: result.totalCount,
        completed: result.completedCount,
        failed: result.failedCount,
      },
      mailboxes: result.mailboxes.map(m => ({
        email: m.email,
        password: m.password,
        aliases: m.aliases,
        success: m.success,
        error: m.error,
      })),
    });
  } catch (error) {
    console.error('Bulk mailbox provision error:', error);
    return NextResponse.json(
      { error: 'Failed to provision mailboxes' },
      { status: 500 }
    );
  }
}

// GET /api/mailboxes/bulk - Get bulk job status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const workspaceId = searchParams.get('workspaceId');

    if (!jobId && !workspaceId) {
      return NextResponse.json(
        { error: 'jobId or workspaceId is required' },
        { status: 400 }
      );
    }

    if (jobId) {
      // Get specific job
      const { data: job, error } = await supabase
        .from('bulk_provisioning_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error || !job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json({
        job: {
          id: job.id,
          status: job.status,
          totalCount: job.total_count,
          completedCount: job.completed_count,
          failedCount: job.failed_count,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          errors: job.errors,
        },
      });
    }

    // List jobs for workspace
    const { data: jobs, error } = await supabase
      .from('bulk_provisioning_jobs')
      .select('id, name, status, total_count, completed_count, failed_count, started_at, completed_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }

    return NextResponse.json({
      jobs: (jobs || []).map(j => ({
        id: j.id,
        name: j.name,
        status: j.status,
        totalCount: j.total_count,
        completedCount: j.completed_count,
        failedCount: j.failed_count,
        startedAt: j.started_at,
        completedAt: j.completed_at,
      })),
    });
  } catch (error) {
    console.error('Get bulk jobs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bulk jobs' },
      { status: 500 }
    );
  }
}
