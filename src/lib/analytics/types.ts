// Analytics Types and Interfaces

// Event Types
export type AnalyticsEventType =
  // Email Events
  | 'email_sent'
  | 'email_delivered'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'email_bounced'
  | 'email_unsubscribed'
  | 'email_marked_spam'
  // Campaign Events
  | 'campaign_started'
  | 'campaign_paused'
  | 'campaign_resumed'
  | 'campaign_completed'
  | 'campaign_archived'
  // Lead Events
  | 'lead_created'
  | 'lead_imported'
  | 'lead_exported'
  | 'lead_status_changed'
  | 'lead_tagged'
  | 'lead_contacted'
  // Sequence Events
  | 'sequence_started'
  | 'sequence_step_completed'
  | 'sequence_completed'
  | 'sequence_stopped'
  // Mailbox Events
  | 'mailbox_connected'
  | 'mailbox_disconnected'
  | 'mailbox_warmup_started'
  | 'mailbox_warmup_completed'
  | 'mailbox_health_changed'
  // User Events
  | 'user_login'
  | 'user_signup'
  | 'workspace_created'
  | 'team_member_added';

// Analytics Event
export interface AnalyticsEvent {
  id: string;
  workspaceId: string;
  eventType: AnalyticsEventType;
  timestamp: Date;

  // Context
  userId?: string;
  campaignId?: string;
  leadId?: string;
  mailboxId?: string;
  sequenceId?: string;
  emailId?: string;

  // Additional data
  metadata?: Record<string, unknown>;

  // Tracking info
  ipAddress?: string;
  userAgent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
}

// Time Ranges
export type TimeRange =
  | 'today'
  | 'yesterday'
  | '7d'
  | '14d'
  | '30d'
  | '90d'
  | '12m'
  | 'all'
  | 'custom';

// Date Range
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// Aggregation Periods
export type AggregationPeriod = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

// Metrics
export interface EmailMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  markedSpam: number;

  // Rates (percentages)
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  spamRate: number;
}

export interface CampaignMetrics extends EmailMetrics {
  campaignId: string;
  campaignName: string;
  status: string;
  startedAt?: Date;
  completedAt?: Date;

  // Additional metrics
  totalLeads: number;
  activeLeads: number;
  contactedLeads: number;
  respondedLeads: number;
  sequenceStepsCompleted: number;
  avgResponseTime?: number; // in hours
}

export interface WorkspaceMetrics {
  // Email metrics
  totalEmailsSent: number;
  totalEmailsDelivered: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  totalBounces: number;

  // Rates
  avgOpenRate: number;
  avgClickRate: number;
  avgReplyRate: number;
  avgBounceRate: number;

  // Counts
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  activeLeads: number;
  totalMailboxes: number;
  activeMailboxes: number;

  // Health
  avgMailboxHealth: number;
  avgDomainHealth: number;
}

// Time Series Data Point
export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface TimeSeriesData {
  metric: string;
  period: AggregationPeriod;
  data: TimeSeriesDataPoint[];
  total: number;
  average: number;
  min: number;
  max: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

// Breakdown Types
export interface BreakdownItem {
  label: string;
  value: number;
  percentage: number;
  change?: number;
  changePercentage?: number;
}

export interface MetricBreakdown {
  metric: string;
  items: BreakdownItem[];
  total: number;
}

// A/B Testing Types
export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export interface ABTestVariant {
  id: string;
  testId: string;
  name: string;
  type: 'subject' | 'body' | 'sender' | 'timing';

  // Variant content
  content: {
    subject?: string;
    body?: string;
    senderName?: string;
    senderEmail?: string;
    sendTime?: string;
  };

  // Allocation
  weight: number; // percentage of traffic

  // Results
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;

  // Calculated
  openRate: number;
  clickRate: number;
  replyRate: number;
}

export interface ABTest {
  id: string;
  workspaceId: string;
  campaignId: string;
  name: string;
  description?: string;
  status: ABTestStatus;

  // Test configuration
  testType: 'subject' | 'body' | 'sender' | 'timing';
  winningMetric: 'opens' | 'clicks' | 'replies';
  confidenceLevel: number; // e.g., 0.95 for 95%

  // Variants
  variants: ABTestVariant[];

  // Winner
  winningVariantId?: string;
  winnerDeterminedAt?: Date;

  // Auto-select winner
  autoSelectWinner: boolean;
  minimumSampleSize: number;

  // Timing
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface ABTestResult {
  testId: string;
  variants: ABTestVariant[];
  winner?: ABTestVariant;
  confidence: number;
  isStatisticallySignificant: boolean;
  sampleSizeReached: boolean;
  recommendation: string;
}

// Report Types
export type ReportType =
  | 'campaign_performance'
  | 'email_deliverability'
  | 'lead_engagement'
  | 'mailbox_health'
  | 'ab_test_results'
  | 'team_activity'
  | 'workspace_overview';

export interface ReportConfig {
  type: ReportType;
  name: string;
  description?: string;

  // Date range
  timeRange: TimeRange;
  customDateRange?: DateRange;

  // Filters
  campaignIds?: string[];
  mailboxIds?: string[];
  leadTags?: string[];

  // Grouping
  groupBy?: 'campaign' | 'mailbox' | 'day' | 'week' | 'month';

  // Metrics to include
  metrics: string[];

  // Scheduling
  schedule?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    format: 'pdf' | 'csv' | 'xlsx';
  };
}

export interface ScheduledReport {
  id: string;
  workspaceId: string;
  config: ReportConfig;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
  createdBy: string;
}

// Dashboard Types
export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'list';
  title: string;
  config: {
    metric?: string;
    chartType?: 'line' | 'bar' | 'pie' | 'area';
    timeRange?: TimeRange;
    filters?: Record<string, unknown>;
  };
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface Dashboard {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// Export Types
export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'pdf';

export interface ExportRequest {
  type: 'events' | 'metrics' | 'report';
  format: ExportFormat;
  filters: {
    timeRange?: TimeRange;
    customDateRange?: DateRange;
    eventTypes?: AnalyticsEventType[];
    campaignIds?: string[];
  };
  columns?: string[];
}

export interface ExportResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: Date;
  recordCount?: number;
  error?: string;
}

// Comparison Types
export interface MetricComparison {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercentage: number;
  trend: 'up' | 'down' | 'stable';
  isPositive: boolean; // whether the change is good (e.g., more opens = good, more bounces = bad)
}

export interface PeriodComparison {
  currentPeriod: DateRange;
  previousPeriod: DateRange;
  metrics: MetricComparison[];
}

// Funnel Types
export interface FunnelStep {
  name: string;
  count: number;
  percentage: number; // percentage of total that reached this step
  dropoff: number; // percentage that dropped off before next step
}

export interface FunnelData {
  name: string;
  steps: FunnelStep[];
  totalStarted: number;
  totalCompleted: number;
  conversionRate: number;
}

// Cohort Types
export interface CohortData {
  cohort: string; // e.g., "Week 1", "Jan 2024"
  size: number;
  retention: number[]; // retention percentages for each period
}

export interface CohortAnalysis {
  cohorts: CohortData[];
  periods: string[]; // e.g., ["Week 0", "Week 1", ...]
  metric: string;
}
