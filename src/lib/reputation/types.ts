// Reputation Management Types

export type HealthStatus = 'good' | 'warning' | 'critical';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType =
  | 'blacklist'
  | 'high_bounce'
  | 'high_complaint'
  | 'reputation_drop'
  | 'authentication_fail'
  | 'rate_limit_exceeded'
  | 'consecutive_failures';

export type EntityType = 'ip' | 'domain' | 'mailbox';

export type RotationRuleType =
  | 'round_robin'
  | 'weighted'
  | 'failover'
  | 'domain_based'
  | 'recipient_based';

export type RecoveryType =
  | 'delisting'
  | 'warmup_reset'
  | 'rate_reduction'
  | 'quarantine';

export type RecoveryStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface BlacklistProvider {
  id: string;
  name: string;
  checkUrl: string;
  checkType: 'dns' | 'http' | 'api';
  priority: number;
  isActive: boolean;
}

export interface BlacklistCheck {
  id: string;
  ipId?: string;
  ipAddress: string;
  providerId: string;
  providerName?: string;
  isListed: boolean;
  listingReason?: string;
  checkedAt: Date;
  delistingUrl?: string;
  autoDelistAt?: Date;
}

export interface IPHealth {
  ipId: string;
  ipAddress: string;
  isHealthy: boolean;
  blacklistCount: number;
  blacklists: string[];
  reputationScore: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  lastCheck: Date;
}

export interface DomainReputation {
  id: string;
  workspaceId: string;
  domain: string;
  reputationScore: number;
  googleReputation: string;
  microsoftReputation: string;
  yahooReputation: string;
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalComplaints: number;
  bounceRate: number;
  complaintRate: number;
  openRate: number;
  clickRate: number;
  inboxPlacementRate: number;
  spfStatus: string;
  dkimStatus: string;
  dmarcStatus: string;
  lastCheckAt?: Date;
}

export interface MailboxReputation {
  id: string;
  mailboxId: string;
  workspaceId: string;
  email: string;
  reputationScore: number;
  healthStatus: HealthStatus;
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalComplaints: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  bounceRate: number;
  complaintRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  lastSentAt?: Date;
  lastBouncedAt?: Date;
  lastComplaintAt?: Date;
  consecutiveBounces: number;
  isQuarantined: boolean;
  quarantineReason?: string;
  quarantineUntil?: Date;
}

export interface IPRotationRule {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  ruleType: RotationRuleType;
  isActive: boolean;
  priority: number;
  config: Record<string, unknown>;
  ipWeights?: Record<string, number>;
  domainMappings?: Record<string, string>;
  recipientPatterns?: Record<string, string>;
  maxPerHour?: number;
  maxPerDay?: number;
}

export interface ReputationAlert {
  id: string;
  workspaceId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  entityType: EntityType;
  entityId: string;
  entityValue?: string;
  message: string;
  details: Record<string, unknown>;
  isResolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
  createdAt: Date;
}

export interface RecoveryTask {
  id: string;
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  entityValue?: string;
  recoveryType: RecoveryType;
  status: RecoveryStatus;
  priority: number;
  startedAt?: Date;
  completedAt?: Date;
  actionsTaken: Array<{
    action: string;
    timestamp: Date;
    result: string;
  }>;
  result: Record<string, unknown>;
}

export interface ReputationOverview {
  workspaceId: string;
  overallScore: number;
  healthStatus: HealthStatus;
  totalIPs: number;
  healthyIPs: number;
  blacklistedIPs: number;
  totalDomains: number;
  healthyDomains: number;
  totalMailboxes: number;
  healthyMailboxes: number;
  quarantinedMailboxes: number;
  activeAlerts: number;
  criticalAlerts: number;
  pendingRecoveryTasks: number;
}

export interface IPSelectionResult {
  ipId: string;
  ipAddress: string;
  reason: string;
  rotationRule?: string;
}
