// Email Warmup System
export * from './types'
export * from './templates'
export * from './scheduler'

// Comprehensive Warmup System (Phase 13.3)
export * from './pool-manager'
export * from './slow-ramp'
export * from './ai-replies'
export * from './engagement-engine'
export * from './postmaster-tools'
export * from './orchestrator'

// Re-export key types and functions for convenience
export { getPoolManager, initializePoolManager } from './pool-manager'
export { getSlowRampController, createSlowRampController } from './slow-ramp'
export { generateAIReply, batchGenerateReplies } from './ai-replies'
export { getEngagementEngine, createEngagementEngine } from './engagement-engine'
export { getPostmasterClient, initializePostmasterTools } from './postmaster-tools'
export { getWarmupOrchestrator, initializeWarmupOrchestrator } from './orchestrator'

import type { WarmupConfig, WarmupStats } from './types'
import {
  calculateWarmupStats,
  getDailySendLimit,
  shouldAdvanceStage,
  generateDailySchedule,
  processWarmupEmail,
} from './scheduler'

export interface WarmupMailbox {
  id: string
  email: string
  firstName: string
  lastName: string
  warmupStage: number
  warmupDaysInStage: number
  warmupEnabled: boolean
  emailsSentToday: number
}

// Main warmup manager class
export class WarmupManager {
  private config: WarmupConfig

  constructor(config: WarmupConfig) {
    this.config = config
  }

  // Get stats for a mailbox
  getStats(
    mailbox: WarmupMailbox,
    sentCount: number,
    receivedCount: number,
    repliedCount: number,
    todaySent: number,
    todayReceived: number,
    todayReplied: number
  ): WarmupStats {
    return calculateWarmupStats(
      mailbox,
      this.config,
      sentCount,
      receivedCount,
      repliedCount,
      todaySent,
      todayReceived,
      todayReplied
    )
  }

  // Get daily limit for a mailbox
  getDailyLimit(stage: number): number {
    return getDailySendLimit(stage, this.config)
  }

  // Check if mailbox should advance
  shouldAdvance(mailbox: WarmupMailbox, replyRate: number): boolean {
    return shouldAdvanceStage(mailbox, this.config, replyRate)
  }

  // Generate daily schedule
  generateSchedule(
    mailboxes: WarmupMailbox[],
    existingSentToday: Map<string, number>
  ) {
    return generateDailySchedule(mailboxes, this.config, existingSentToday)
  }

  // Process a warmup email
  processEmail(
    mailboxId: string,
    partnerMailboxId: string,
    senderMailbox: WarmupMailbox,
    receiverMailbox: WarmupMailbox,
    isReply: boolean = false
  ) {
    return processWarmupEmail(
      { id: '', mailboxId, partnerMailboxId, scheduledAt: '', direction: 'send', status: 'scheduled' },
      senderMailbox,
      receiverMailbox,
      isReply
    )
  }

  // Get config
  getConfig(): WarmupConfig {
    return this.config
  }

  // Update config
  updateConfig(updates: Partial<WarmupConfig>): void {
    this.config = { ...this.config, ...updates }
  }
}

// Create default warmup manager
export function createWarmupManager(config?: Partial<WarmupConfig>): WarmupManager {
  const DEFAULT_WARMUP_CONFIG_VALUE: WarmupConfig = {
    stages: [
      { stage: 1, daysInStage: 3, dailySendLimit: 5, dailyReplyTarget: 5, description: 'Initial warmup' },
      { stage: 2, daysInStage: 4, dailySendLimit: 10, dailyReplyTarget: 8, description: 'Building reputation' },
      { stage: 3, daysInStage: 5, dailySendLimit: 20, dailyReplyTarget: 15, description: 'Increasing volume' },
      { stage: 4, daysInStage: 7, dailySendLimit: 35, dailyReplyTarget: 25, description: 'Moderate volume' },
      { stage: 5, daysInStage: 7, dailySendLimit: 50, dailyReplyTarget: 35, description: 'High volume' },
      { stage: 6, daysInStage: 0, dailySendLimit: 75, dailyReplyTarget: 50, description: 'Maintenance (ongoing)' },
    ],
    targetReplyRate: 30,
    intervalHours: 4,
    useCustomTemplates: false,
    randomizeTime: true,
    sendingWindowStart: 8,
    sendingWindowEnd: 18,
  }

  return new WarmupManager({ ...DEFAULT_WARMUP_CONFIG_VALUE, ...config })
}

// Aggregate stats for multiple mailboxes
export function aggregateWarmupStats(stats: WarmupStats[]): {
  totalMailboxes: number
  activeMailboxes: number
  healthyMailboxes: number
  averageStage: number
  averageProgress: number
  averageReplyRate: number
  averageDeliverability: number
  totalSent: number
  totalReceived: number
  totalReplied: number
} {
  if (stats.length === 0) {
    return {
      totalMailboxes: 0,
      activeMailboxes: 0,
      healthyMailboxes: 0,
      averageStage: 0,
      averageProgress: 0,
      averageReplyRate: 0,
      averageDeliverability: 0,
      totalSent: 0,
      totalReceived: 0,
      totalReplied: 0,
    }
  }

  const activeStats = stats.filter(s => s.warmupProgress < 100)
  const healthyStats = stats.filter(s => s.isHealthy)

  return {
    totalMailboxes: stats.length,
    activeMailboxes: activeStats.length,
    healthyMailboxes: healthyStats.length,
    averageStage: Math.round((stats.reduce((sum, s) => sum + s.stage, 0) / stats.length) * 10) / 10,
    averageProgress: Math.round(stats.reduce((sum, s) => sum + s.warmupProgress, 0) / stats.length),
    averageReplyRate: Math.round((stats.reduce((sum, s) => sum + s.replyRate, 0) / stats.length) * 10) / 10,
    averageDeliverability: Math.round(stats.reduce((sum, s) => sum + s.deliverabilityScore, 0) / stats.length),
    totalSent: stats.reduce((sum, s) => sum + s.totalSent, 0),
    totalReceived: stats.reduce((sum, s) => sum + s.totalReceived, 0),
    totalReplied: stats.reduce((sum, s) => sum + s.totalReplied, 0),
  }
}
