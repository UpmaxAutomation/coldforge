// Reputation Management Module
// Unified exports for IP, domain, and mailbox reputation management

// Types
export * from './types';

// Blacklist Monitoring
export {
  getBlacklistProviders,
  checkIPBlacklists,
  checkWorkspaceIPBlacklists,
  getIPHealth,
  getDelistingInstructions,
  scheduleBlacklistChecks,
} from './blacklist';

// IP Rotation
export {
  getRotationRules,
  createRotationRule,
  updateRotationRule,
  deleteRotationRule,
  selectIP,
  resetHourlyIPCounters,
  resetDailyIPCounters,
  getIPUsageStats,
} from './ip-rotation';

// Alerts
export {
  getActiveAlerts,
  getAlert,
  createAlert,
  resolveAlert,
  bulkResolveAlerts,
  getAlertStats,
  checkThresholdAlerts,
  autoResolveAlerts,
  getAlertHistory,
} from './alerts';

// Domain Reputation
export {
  getDomainReputation,
  getDomainReputationByName,
  getWorkspaceDomainReputations,
  upsertDomainReputation,
  checkSPF,
  checkDKIM,
  checkDMARC,
  checkDomainAuthentication,
  updateDomainAuthStatus,
  updateDomainReputationMetrics,
  getDomainHealthRecommendations,
  updateWorkspaceDomainReputations,
} from './domain';

// Overview
export {
  getReputationOverview,
  getReputationTrends,
  getTopReputationIssues,
  getSendingStatsSummary,
  getHealthBreakdown,
} from './overview';

// Recovery
export {
  getRecoveryTasks,
  getRecoveryTask,
  createRecoveryTask,
  startRecoveryTask,
  addRecoveryAction,
  completeRecoveryTask,
  autoCreateRecoveryTasks,
  executeRecoveryTask,
} from './recovery';
