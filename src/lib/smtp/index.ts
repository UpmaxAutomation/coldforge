// SMTP Module
// Unified exports for email sending infrastructure

export * from './types';
export * from './client';
export * from './queue';
export { processWebhook, processWebhookBatch } from './webhooks';
export {
  generateTrackingPixel,
  generateClickWrapper,
  processTrackingEvent,
  recordEmailOpen,
  recordEmailClick,
  addTrackingToEmail,
  getTrackingStats,
} from './tracking';
export {
  sendWarmupEmail,
  processWarmupBatch,
  getWarmupStatus,
  getWarmupLimits,
  addToWarmupPool,
  removeFromWarmupPool,
  resetDailyWarmupCounters,
} from './warmup';
