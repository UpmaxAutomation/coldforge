// Reporting and Export Module
import { createClient } from '@/lib/supabase/server';
import type {
  ReportConfig,
  ReportType,
  ScheduledReport,
  ExportFormat,
  ExportRequest,
  ExportResult,
  DateRange,
  TimeRange,
} from './types';
import { getEmailMetrics, getCampaignMetrics, getWorkspaceMetrics } from './metrics';
import { resolveDateRange } from './events';

// ============================================
// Scheduled Reports
// ============================================

// Create Scheduled Report
export async function createScheduledReport(
  workspaceId: string,
  userId: string,
  config: Omit<ReportConfig, 'type'> & { type: ReportType }
): Promise<ScheduledReport> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scheduled_reports')
    .insert({
      workspace_id: workspaceId,
      name: config.name,
      description: config.description,
      report_type: config.type,
      config: {
        timeRange: config.timeRange,
        customDateRange: config.customDateRange,
        campaignIds: config.campaignIds,
        mailboxIds: config.mailboxIds,
        leadTags: config.leadTags,
        groupBy: config.groupBy,
        metrics: config.metrics,
      },
      schedule_enabled: config.schedule?.enabled || false,
      schedule_frequency: config.schedule?.frequency,
      recipients: config.schedule?.recipients || [],
      export_format: config.schedule?.format || 'pdf',
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  return mapScheduledReport(data);
}

// Get Scheduled Report
export async function getScheduledReport(
  reportId: string
): Promise<ScheduledReport | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scheduled_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error || !data) return null;

  return mapScheduledReport(data);
}

// List Scheduled Reports
export async function listScheduledReports(
  workspaceId: string,
  options: {
    type?: ReportType;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ reports: ScheduledReport[]; total: number }> {
  const supabase = await createClient();
  const { type, enabled, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('scheduled_reports')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) {
    query = query.eq('report_type', type);
  }

  if (enabled !== undefined) {
    query = query.eq('schedule_enabled', enabled);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    reports: (data || []).map(mapScheduledReport),
    total: count || 0,
  };
}

// Update Scheduled Report
export async function updateScheduledReport(
  reportId: string,
  updates: Partial<ReportConfig>
): Promise<ScheduledReport> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;

  if (updates.timeRange || updates.customDateRange || updates.campaignIds ||
      updates.mailboxIds || updates.leadTags || updates.groupBy || updates.metrics) {
    // Get current config and merge
    const { data: current } = await supabase
      .from('scheduled_reports')
      .select('config')
      .eq('id', reportId)
      .single();

    updateData.config = {
      ...(current?.config || {}),
      ...(updates.timeRange && { timeRange: updates.timeRange }),
      ...(updates.customDateRange && { customDateRange: updates.customDateRange }),
      ...(updates.campaignIds && { campaignIds: updates.campaignIds }),
      ...(updates.mailboxIds && { mailboxIds: updates.mailboxIds }),
      ...(updates.leadTags && { leadTags: updates.leadTags }),
      ...(updates.groupBy && { groupBy: updates.groupBy }),
      ...(updates.metrics && { metrics: updates.metrics }),
    };
  }

  if (updates.schedule) {
    if (updates.schedule.enabled !== undefined) {
      updateData.schedule_enabled = updates.schedule.enabled;
    }
    if (updates.schedule.frequency) {
      updateData.schedule_frequency = updates.schedule.frequency;
    }
    if (updates.schedule.recipients) {
      updateData.recipients = updates.schedule.recipients;
    }
    if (updates.schedule.format) {
      updateData.export_format = updates.schedule.format;
    }
  }

  const { data, error } = await supabase
    .from('scheduled_reports')
    .update(updateData)
    .eq('id', reportId)
    .select()
    .single();

  if (error) throw error;

  return mapScheduledReport(data);
}

// Delete Scheduled Report
export async function deleteScheduledReport(reportId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scheduled_reports')
    .delete()
    .eq('id', reportId);

  if (error) throw error;
}

// ============================================
// Report Generation
// ============================================

// Generate Report Data
export async function generateReportData(
  workspaceId: string,
  config: ReportConfig
): Promise<Record<string, unknown>> {
  const { dateRange } = resolveDateRange(config.customDateRange, config.timeRange);

  switch (config.type) {
    case 'campaign_performance':
      return generateCampaignPerformanceReport(workspaceId, dateRange, config);
    case 'email_deliverability':
      return generateDeliverabilityReport(workspaceId, dateRange, config);
    case 'lead_engagement':
      return generateLeadEngagementReport(workspaceId, dateRange, config);
    case 'mailbox_health':
      return generateMailboxHealthReport(workspaceId, config);
    case 'ab_test_results':
      return generateABTestReport(workspaceId, dateRange, config);
    case 'team_activity':
      return generateTeamActivityReport(workspaceId, dateRange);
    case 'workspace_overview':
      return generateWorkspaceOverviewReport(workspaceId, dateRange);
    default:
      throw new Error(`Unknown report type: ${config.type}`);
  }
}

// Campaign Performance Report
async function generateCampaignPerformanceReport(
  workspaceId: string,
  dateRange: DateRange,
  config: ReportConfig
): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  // Get campaigns
  let campaignQuery = supabase
    .from('campaigns')
    .select('id, name, status, created_at')
    .eq('workspace_id', workspaceId);

  if (config.campaignIds?.length) {
    campaignQuery = campaignQuery.in('id', config.campaignIds);
  }

  const { data: campaigns } = await campaignQuery;

  // Get metrics for each campaign
  const campaignMetrics = await Promise.all(
    (campaigns || []).map(async (campaign) => {
      const metrics = await getCampaignMetrics(campaign.id);
      return {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
        },
        metrics,
      };
    })
  );

  // Get overall metrics
  const overallMetrics = await getEmailMetrics(workspaceId, { dateRange });

  return {
    reportType: 'campaign_performance',
    dateRange,
    generatedAt: new Date().toISOString(),
    summary: overallMetrics,
    campaigns: campaignMetrics,
    totalCampaigns: campaigns?.length || 0,
  };
}

// Deliverability Report
async function generateDeliverabilityReport(
  workspaceId: string,
  dateRange: DateRange,
  config: ReportConfig
): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  // Get mailbox stats
  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('id, email, provider, health_score, warmup_status, daily_limit')
    .eq('workspace_id', workspaceId);

  // Get bounce data by type
  const { data: bounces } = await supabase
    .from('analytics_events')
    .select('metadata')
    .eq('workspace_id', workspaceId)
    .eq('event_type', 'email_bounced')
    .gte('timestamp', dateRange.startDate.toISOString())
    .lte('timestamp', dateRange.endDate.toISOString());

  // Categorize bounces
  const bounceCategories: Record<string, number> = {
    hard_bounce: 0,
    soft_bounce: 0,
    invalid_email: 0,
    mailbox_full: 0,
    other: 0,
  };

  (bounces || []).forEach((b) => {
    const type = (b.metadata as Record<string, string>)?.bounce_type || 'other';
    if (bounceCategories[type] !== undefined) {
      bounceCategories[type]++;
    } else {
      bounceCategories['other']++;
    }
  });

  // Get spam complaints
  const { count: spamCount } = await supabase
    .from('analytics_events')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('event_type', 'email_marked_spam')
    .gte('timestamp', dateRange.startDate.toISOString())
    .lte('timestamp', dateRange.endDate.toISOString());

  // Get overall metrics
  const metrics = await getEmailMetrics(workspaceId, { dateRange });

  return {
    reportType: 'email_deliverability',
    dateRange,
    generatedAt: new Date().toISOString(),
    metrics: {
      deliveryRate: metrics.deliveryRate,
      bounceRate: metrics.bounceRate,
      spamRate: metrics.spamRate,
    },
    bounceBreakdown: bounceCategories,
    spamComplaints: spamCount || 0,
    mailboxHealth: (mailboxes || []).map((m) => ({
      email: m.email,
      provider: m.provider,
      healthScore: m.health_score,
      warmupStatus: m.warmup_status,
      dailyLimit: m.daily_limit,
    })),
  };
}

// Lead Engagement Report
async function generateLeadEngagementReport(
  workspaceId: string,
  dateRange: DateRange,
  config: ReportConfig
): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  // Get lead stats
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  // Get leads by status
  const { data: statusBreakdown } = await supabase
    .from('leads')
    .select('status')
    .eq('workspace_id', workspaceId);

  const statusCounts: Record<string, number> = {};
  (statusBreakdown || []).forEach((l) => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });

  // Get engagement events
  const { data: engagementEvents } = await supabase
    .from('analytics_events')
    .select('event_type, lead_id')
    .eq('workspace_id', workspaceId)
    .in('event_type', ['email_opened', 'email_clicked', 'email_replied'])
    .gte('timestamp', dateRange.startDate.toISOString())
    .lte('timestamp', dateRange.endDate.toISOString());

  // Count unique engaged leads
  const engagedLeads = new Set<string>();
  const openedLeads = new Set<string>();
  const clickedLeads = new Set<string>();
  const repliedLeads = new Set<string>();

  (engagementEvents || []).forEach((e) => {
    if (e.lead_id) {
      engagedLeads.add(e.lead_id);
      if (e.event_type === 'email_opened') openedLeads.add(e.lead_id);
      if (e.event_type === 'email_clicked') clickedLeads.add(e.lead_id);
      if (e.event_type === 'email_replied') repliedLeads.add(e.lead_id);
    }
  });

  // Get top engaged leads
  const { data: topLeads } = await supabase
    .from('leads')
    .select('id, email, first_name, last_name, company')
    .eq('workspace_id', workspaceId)
    .in('id', Array.from(repliedLeads).slice(0, 10));

  return {
    reportType: 'lead_engagement',
    dateRange,
    generatedAt: new Date().toISOString(),
    totalLeads: totalLeads || 0,
    statusBreakdown: statusCounts,
    engagement: {
      totalEngaged: engagedLeads.size,
      opened: openedLeads.size,
      clicked: clickedLeads.size,
      replied: repliedLeads.size,
      engagementRate: totalLeads ? (engagedLeads.size / totalLeads) * 100 : 0,
    },
    topEngagedLeads: topLeads || [],
  };
}

// Mailbox Health Report
async function generateMailboxHealthReport(
  workspaceId: string,
  config: ReportConfig
): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  let query = supabase
    .from('mailboxes')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (config.mailboxIds?.length) {
    query = query.in('id', config.mailboxIds);
  }

  const { data: mailboxes } = await query;

  // Calculate health stats
  const healthStats = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
  };

  (mailboxes || []).forEach((m) => {
    const score = m.health_score || 0;
    if (score >= 90) healthStats.excellent++;
    else if (score >= 70) healthStats.good++;
    else if (score >= 50) healthStats.fair++;
    else healthStats.poor++;
  });

  // Get warmup status breakdown
  const warmupStats: Record<string, number> = {};
  (mailboxes || []).forEach((m) => {
    const status = m.warmup_status || 'none';
    warmupStats[status] = (warmupStats[status] || 0) + 1;
  });

  return {
    reportType: 'mailbox_health',
    generatedAt: new Date().toISOString(),
    totalMailboxes: mailboxes?.length || 0,
    healthDistribution: healthStats,
    warmupStatus: warmupStats,
    averageHealthScore:
      (mailboxes || []).reduce((sum, m) => sum + (m.health_score || 0), 0) /
      (mailboxes?.length || 1),
    mailboxes: (mailboxes || []).map((m) => ({
      id: m.id,
      email: m.email,
      provider: m.provider,
      healthScore: m.health_score,
      warmupStatus: m.warmup_status,
      dailyLimit: m.daily_limit,
      sentToday: m.sent_today,
      status: m.status,
    })),
  };
}

// A/B Test Results Report
async function generateABTestReport(
  workspaceId: string,
  dateRange: DateRange,
  config: ReportConfig
): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  let query = supabase
    .from('ab_tests')
    .select(`
      *,
      ab_test_variants (*)
    `)
    .eq('workspace_id', workspaceId);

  if (config.campaignIds?.length) {
    query = query.in('campaign_id', config.campaignIds);
  }

  const { data: tests } = await query;

  // Process tests
  const processedTests = (tests || []).map((test) => {
    const variants = (test.ab_test_variants || []).map((v: Record<string, unknown>) => {
      const sent = (v.sent as number) || 0;
      return {
        id: v.id,
        name: v.name,
        type: v.type,
        weight: v.weight,
        sent,
        delivered: v.delivered,
        opened: v.opened,
        clicked: v.clicked,
        replied: v.replied,
        openRate: sent > 0 ? ((v.opened as number) / sent) * 100 : 0,
        clickRate: sent > 0 ? ((v.clicked as number) / sent) * 100 : 0,
        replyRate: sent > 0 ? ((v.replied as number) / sent) * 100 : 0,
      };
    });

    return {
      id: test.id,
      name: test.name,
      status: test.status,
      testType: test.test_type,
      winningMetric: test.winning_metric,
      confidenceLevel: test.confidence_level,
      winningVariantId: test.winning_variant_id,
      variants,
      startedAt: test.started_at,
      endedAt: test.ended_at,
    };
  });

  return {
    reportType: 'ab_test_results',
    dateRange,
    generatedAt: new Date().toISOString(),
    totalTests: tests?.length || 0,
    completedTests: (tests || []).filter((t) => t.status === 'completed').length,
    tests: processedTests,
  };
}

// Team Activity Report
async function generateTeamActivityReport(
  workspaceId: string,
  dateRange: DateRange
): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  // Get team members
  const { data: members } = await supabase
    .from('workspace_members')
    .select(`
      user_id,
      role,
      users:auth.users(email)
    `)
    .eq('workspace_id', workspaceId);

  // Get activity by user
  const { data: activities } = await supabase
    .from('analytics_events')
    .select('event_type, user_id, timestamp')
    .eq('workspace_id', workspaceId)
    .gte('timestamp', dateRange.startDate.toISOString())
    .lte('timestamp', dateRange.endDate.toISOString())
    .not('user_id', 'is', null);

  // Aggregate by user
  const userActivity: Record<string, Record<string, number>> = {};
  (activities || []).forEach((a) => {
    if (a.user_id) {
      if (!userActivity[a.user_id]) {
        userActivity[a.user_id] = {};
      }
      userActivity[a.user_id][a.event_type] =
        (userActivity[a.user_id][a.event_type] || 0) + 1;
    }
  });

  return {
    reportType: 'team_activity',
    dateRange,
    generatedAt: new Date().toISOString(),
    teamSize: members?.length || 0,
    members: (members || []).map((m) => ({
      userId: m.user_id,
      role: m.role,
      activity: userActivity[m.user_id] || {},
      totalActions: Object.values(userActivity[m.user_id] || {}).reduce(
        (sum, count) => sum + count,
        0
      ),
    })),
  };
}

// Workspace Overview Report
async function generateWorkspaceOverviewReport(
  workspaceId: string,
  dateRange: DateRange
): Promise<Record<string, unknown>> {
  const metrics = await getWorkspaceMetrics(workspaceId, { dateRange });

  return {
    reportType: 'workspace_overview',
    dateRange,
    generatedAt: new Date().toISOString(),
    metrics,
  };
}

// ============================================
// Export
// ============================================

// Create Export
export async function createExport(
  workspaceId: string,
  userId: string,
  request: ExportRequest
): Promise<ExportResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('report_exports')
    .insert({
      workspace_id: workspaceId,
      name: `Export - ${new Date().toISOString()}`,
      report_type: request.type === 'report' ? 'workspace_overview' : 'campaign_performance',
      format: request.format,
      status: 'pending',
      config: request.filters,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  // Queue the export job (in production, this would be a background job)
  processExport(data.id, workspaceId, request).catch(console.error);

  return {
    id: data.id,
    status: 'pending',
  };
}

// Process Export (background job)
async function processExport(
  exportId: string,
  workspaceId: string,
  request: ExportRequest
): Promise<void> {
  const supabase = await createClient();

  try {
    // Update status to processing
    await supabase
      .from('report_exports')
      .update({ status: 'processing' })
      .eq('id', exportId);

    // Generate data based on type
    let data: unknown[];

    switch (request.type) {
      case 'events':
        data = await exportEvents(workspaceId, request);
        break;
      case 'metrics':
        data = await exportMetrics(workspaceId, request);
        break;
      case 'report':
        data = [await generateReportData(workspaceId, {
          type: 'workspace_overview',
          name: 'Export',
          timeRange: request.filters.timeRange || '30d',
          customDateRange: request.filters.customDateRange,
          metrics: [],
        })];
        break;
      default:
        throw new Error(`Unknown export type: ${request.type}`);
    }

    // Format data
    const formatted = formatExportData(data, request.format, request.columns);

    // In production, upload to storage and get signed URL
    // For now, we'll store a reference
    const fileSize = JSON.stringify(formatted).length;

    // Update with result
    await supabase
      .from('report_exports')
      .update({
        status: 'completed',
        file_url: `/api/exports/${exportId}/download`,
        file_size: fileSize,
        record_count: data.length,
        completed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', exportId);
  } catch (error) {
    console.error('Export failed:', error);
    await supabase
      .from('report_exports')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', exportId);
  }
}

// Export Events
async function exportEvents(
  workspaceId: string,
  request: ExportRequest
): Promise<unknown[]> {
  const supabase = await createClient();
  const { dateRange } = resolveDateRange(
    request.filters.customDateRange,
    request.filters.timeRange
  );

  let query = supabase
    .from('analytics_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('timestamp', dateRange.startDate.toISOString())
    .lte('timestamp', dateRange.endDate.toISOString())
    .order('timestamp', { ascending: false })
    .limit(10000);

  if (request.filters.eventTypes?.length) {
    query = query.in('event_type', request.filters.eventTypes);
  }

  if (request.filters.campaignIds?.length) {
    query = query.in('campaign_id', request.filters.campaignIds);
  }

  const { data } = await query;
  return data || [];
}

// Export Metrics
async function exportMetrics(
  workspaceId: string,
  request: ExportRequest
): Promise<unknown[]> {
  const supabase = await createClient();
  const { dateRange } = resolveDateRange(
    request.filters.customDateRange,
    request.filters.timeRange
  );

  const { data } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('date', dateRange.startDate.toISOString().split('T')[0])
    .lte('date', dateRange.endDate.toISOString().split('T')[0])
    .order('date', { ascending: false });

  return data || [];
}

// Format Export Data
function formatExportData(
  data: unknown[],
  format: ExportFormat,
  columns?: string[]
): unknown {
  if (columns?.length) {
    data = data.map((row) => {
      const filtered: Record<string, unknown> = {};
      columns.forEach((col) => {
        if (row && typeof row === 'object' && col in row) {
          filtered[col] = (row as Record<string, unknown>)[col];
        }
      });
      return filtered;
    });
  }

  switch (format) {
    case 'json':
      return data;
    case 'csv':
      return convertToCSV(data);
    case 'xlsx':
      // In production, use a library like exceljs
      return convertToCSV(data);
    case 'pdf':
      // In production, use a library like puppeteer or pdfkit
      return JSON.stringify(data, null, 2);
    default:
      return data;
  }
}

// Convert to CSV
function convertToCSV(data: unknown[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0] as Record<string, unknown>);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = (row as Record<string, unknown>)[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      })
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

// Get Export
export async function getExport(exportId: string): Promise<ExportResult | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('report_exports')
    .select('*')
    .eq('id', exportId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    status: data.status,
    downloadUrl: data.file_url,
    expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
    recordCount: data.record_count,
    error: data.error_message,
  };
}

// List Exports
export async function listExports(
  workspaceId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ exports: ExportResult[]; total: number }> {
  const supabase = await createClient();
  const { limit = 50, offset = 0 } = options;

  const { data, error, count } = await supabase
    .from('report_exports')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    exports: (data || []).map((d) => ({
      id: d.id,
      status: d.status,
      downloadUrl: d.file_url,
      expiresAt: d.expires_at ? new Date(d.expires_at) : undefined,
      recordCount: d.record_count,
      error: d.error_message,
    })),
    total: count || 0,
  };
}

// Helper: Map scheduled report
function mapScheduledReport(data: Record<string, unknown>): ScheduledReport {
  const config = (data.config as Record<string, unknown>) || {};

  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    config: {
      type: data.report_type as ReportType,
      name: data.name as string,
      description: data.description as string | undefined,
      timeRange: (config.timeRange as TimeRange) || '30d',
      customDateRange: config.customDateRange as DateRange | undefined,
      campaignIds: config.campaignIds as string[] | undefined,
      mailboxIds: config.mailboxIds as string[] | undefined,
      leadTags: config.leadTags as string[] | undefined,
      groupBy: config.groupBy as 'campaign' | 'mailbox' | 'day' | 'week' | 'month' | undefined,
      metrics: (config.metrics as string[]) || [],
      schedule: {
        enabled: data.schedule_enabled as boolean,
        frequency: data.schedule_frequency as 'daily' | 'weekly' | 'monthly',
        recipients: (data.recipients as string[]) || [],
        format: (data.export_format as ExportFormat) || 'pdf',
      },
    },
    lastRunAt: data.last_run_at ? new Date(data.last_run_at as string) : undefined,
    nextRunAt: data.next_run_at ? new Date(data.next_run_at as string) : undefined,
    createdAt: new Date(data.created_at as string),
    createdBy: data.created_by as string,
  };
}
