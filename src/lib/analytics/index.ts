// Analytics Module
// Comprehensive analytics, A/B testing, and reporting system

// Types
export * from './types';

// Event Tracking
export {
  trackEvent,
  trackEvents,
  getEvents,
  countEventsByType,
  getEventTimeSeries,
  trackEmailOpen,
  trackEmailClick,
  resolveDateRange,
} from './events';

// Metrics
export {
  getEmailMetrics,
  getCampaignMetrics,
  getWorkspaceMetrics,
  getMetricsTimeSeries,
  getPeriodComparison,
  getEmailFunnel,
  getMetricBreakdown,
  getTopCampaigns,
} from './metrics';

// A/B Testing
export {
  createABTest,
  getABTest,
  listABTests,
  addVariant,
  updateVariant,
  deleteVariant,
  startTest,
  pauseTest,
  resumeTest,
  completeTest,
  recordVariantEvent,
  selectVariantForEmail,
  calculateTestResults,
  checkAndSelectWinner,
  deleteTest,
  applyVariantContent,
} from './ab-testing';

// Reports
export {
  createScheduledReport,
  getScheduledReport,
  listScheduledReports,
  updateScheduledReport,
  deleteScheduledReport,
  generateReportData,
  createExport,
  getExport,
  listExports,
} from './reports';
