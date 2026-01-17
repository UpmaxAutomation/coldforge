/**
 * Sync Scheduler
 *
 * Schedules and manages periodic email syncing for all accounts.
 * Uses BullMQ for reliable job scheduling and processing.
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import { syncAccount, syncAllAccounts, SyncOptions } from './sync'

// Redis connection for job queue
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
}

// Queue names
const QUEUE_NAME = 'inbox-sync'
const SCHEDULED_SYNC_JOB = 'scheduled-sync'
const MANUAL_SYNC_JOB = 'manual-sync'
const ORG_SYNC_JOB = 'org-sync'

// Sync intervals (in milliseconds)
export const SYNC_INTERVALS = {
  FREQUENT: 5 * 60 * 1000, // 5 minutes - for active accounts
  NORMAL: 15 * 60 * 1000, // 15 minutes - default
  SLOW: 60 * 60 * 1000, // 1 hour - for less active accounts
} as const

/**
 * Job data types
 */
interface AccountSyncJobData {
  type: 'account'
  accountId: string
  organizationId: string
  options?: SyncOptions
  priority?: 'high' | 'normal' | 'low'
}

interface OrgSyncJobData {
  type: 'organization'
  organizationId: string
  options?: SyncOptions
}

type SyncJobData = AccountSyncJobData | OrgSyncJobData

/**
 * Job result
 */
interface SyncJobResult {
  success: boolean
  accountId?: string
  organizationId?: string
  messagesAdded: number
  messagesUpdated: number
  errors: number
  duration: number
}

// Singleton instances
let syncQueue: Queue<SyncJobData, SyncJobResult> | null = null
let syncWorker: Worker<SyncJobData, SyncJobResult> | null = null
let queueEvents: QueueEvents | null = null

/**
 * Initialize the sync queue
 */
export function getSyncQueue(): Queue<SyncJobData, SyncJobResult> {
  if (!syncQueue) {
    syncQueue = new Queue<SyncJobData, SyncJobResult>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 60 * 60, // Keep completed jobs for 24 hours
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000, // Start with 30 seconds
        },
      },
    })
  }
  return syncQueue
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(): QueueEvents {
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnection(),
    })
  }
  return queueEvents
}

/**
 * Start the sync worker
 */
export function startSyncWorker(): Worker<SyncJobData, SyncJobResult> {
  if (syncWorker) {
    return syncWorker
  }

  syncWorker = new Worker<SyncJobData, SyncJobResult>(
    QUEUE_NAME,
    async (job: Job<SyncJobData, SyncJobResult>) => {
      const startTime = Date.now()

      try {
        if (job.data.type === 'account') {
          // Single account sync
          const result = await syncAccount(job.data.accountId, job.data.options)
          return {
            success: result.success,
            accountId: job.data.accountId,
            messagesAdded: result.messagesAdded,
            messagesUpdated: result.messagesUpdated,
            errors: result.errors.length,
            duration: Date.now() - startTime,
          }
        } else {
          // Organization-wide sync
          const result = await syncAllAccounts(
            job.data.organizationId,
            job.data.options
          )
          return {
            success: result.totalErrors === 0,
            organizationId: job.data.organizationId,
            messagesAdded: result.totalMessages,
            messagesUpdated: 0,
            errors: result.totalErrors,
            duration: Date.now() - startTime,
          }
        }
      } catch (error) {
        console.error(`Sync job ${job.id} failed:`, error)
        throw error
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 5, // Process up to 5 sync jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs per minute to avoid rate limits
        duration: 60000,
      },
    }
  )

  // Error handling
  syncWorker.on('failed', (job, error) => {
    console.error(`Sync job ${job?.id} failed:`, error.message)
  })

  syncWorker.on('completed', (job, result) => {
    console.log(
      `Sync job ${job.id} completed: ${result.messagesAdded} new messages`
    )
  })

  return syncWorker
}

/**
 * Stop the sync worker
 */
export async function stopSyncWorker(): Promise<void> {
  if (syncWorker) {
    await syncWorker.close()
    syncWorker = null
  }
  if (queueEvents) {
    await queueEvents.close()
    queueEvents = null
  }
  if (syncQueue) {
    await syncQueue.close()
    syncQueue = null
  }
}

/**
 * Schedule a sync for a single account
 */
export async function scheduleAccountSync(
  accountId: string,
  organizationId: string,
  options: SyncOptions = {},
  priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<Job<SyncJobData, SyncJobResult>> {
  const queue = getSyncQueue()

  // Priority mapping
  const priorityValue = { high: 1, normal: 5, low: 10 }[priority]

  return queue.add(
    MANUAL_SYNC_JOB,
    {
      type: 'account',
      accountId,
      organizationId,
      options,
      priority,
    },
    {
      priority: priorityValue,
      jobId: `account-sync-${accountId}-${Date.now()}`,
    }
  )
}

/**
 * Schedule a sync for all accounts in an organization
 */
export async function scheduleOrgSync(
  organizationId: string,
  options: SyncOptions = {}
): Promise<Job<SyncJobData, SyncJobResult>> {
  const queue = getSyncQueue()

  return queue.add(
    ORG_SYNC_JOB,
    {
      type: 'organization',
      organizationId,
      options,
    },
    {
      jobId: `org-sync-${organizationId}-${Date.now()}`,
    }
  )
}

/**
 * Set up recurring sync for an account
 */
export async function setupRecurringSync(
  accountId: string,
  organizationId: string,
  interval: keyof typeof SYNC_INTERVALS = 'NORMAL'
): Promise<void> {
  const queue = getSyncQueue()
  const repeatJobId = `recurring-sync-${accountId}`

  // Remove existing recurring job if any
  const existingJobs = await queue.getRepeatableJobs()
  for (const job of existingJobs) {
    if (job.id === repeatJobId) {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  // Add new recurring job
  await queue.add(
    SCHEDULED_SYNC_JOB,
    {
      type: 'account',
      accountId,
      organizationId,
    },
    {
      repeat: {
        every: SYNC_INTERVALS[interval],
      },
      jobId: repeatJobId,
    }
  )
}

/**
 * Remove recurring sync for an account
 */
export async function removeRecurringSync(accountId: string): Promise<void> {
  const queue = getSyncQueue()
  const repeatJobId = `recurring-sync-${accountId}`

  const existingJobs = await queue.getRepeatableJobs()
  for (const job of existingJobs) {
    if (job.id === repeatJobId) {
      await queue.removeRepeatableByKey(job.key)
    }
  }
}

/**
 * Set up recurring sync for all accounts in an organization
 */
export async function setupOrgRecurringSync(
  organizationId: string,
  interval: keyof typeof SYNC_INTERVALS = 'NORMAL'
): Promise<void> {
  const queue = getSyncQueue()
  const repeatJobId = `recurring-org-sync-${organizationId}`

  // Remove existing recurring job if any
  const existingJobs = await queue.getRepeatableJobs()
  for (const job of existingJobs) {
    if (job.id === repeatJobId) {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  // Add new recurring job
  await queue.add(
    SCHEDULED_SYNC_JOB,
    {
      type: 'organization',
      organizationId,
    },
    {
      repeat: {
        every: SYNC_INTERVALS[interval],
      },
      jobId: repeatJobId,
    }
  )
}

/**
 * Get sync status for an organization
 */
export async function getSyncJobStatus(organizationId: string): Promise<{
  pendingJobs: number
  activeJobs: number
  completedJobs: number
  failedJobs: number
  lastSyncTime: Date | null
  recurringScheduled: boolean
}> {
  const queue = getSyncQueue()

  // Get job counts
  const [waiting, active, completed, failed, repeatableJobs] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getRepeatableJobs(),
  ])

  // Check if recurring sync is scheduled
  const recurringScheduled = repeatableJobs.some(
    (job) => job.id?.includes(organizationId)
  )

  // Get last completed job time
  const completedJobsList = await queue.getCompleted(0, 1)
  const lastSyncTime = completedJobsList.length > 0 && completedJobsList[0]
    ? new Date(completedJobsList[0].finishedOn || Date.now())
    : null

  return {
    pendingJobs: waiting,
    activeJobs: active,
    completedJobs: completed,
    failedJobs: failed,
    lastSyncTime,
    recurringScheduled,
  }
}

/**
 * Pause all sync jobs
 */
export async function pauseAllSyncs(): Promise<void> {
  const queue = getSyncQueue()
  await queue.pause()
}

/**
 * Resume all sync jobs
 */
export async function resumeAllSyncs(): Promise<void> {
  const queue = getSyncQueue()
  await queue.resume()
}

/**
 * Clean up old jobs
 */
export async function cleanupOldJobs(olderThanHours: number = 24): Promise<{
  removed: number
}> {
  const queue = getSyncQueue()
  const grace = olderThanHours * 60 * 60 * 1000

  const [completed, failed] = await Promise.all([
    queue.clean(grace, 1000, 'completed'),
    queue.clean(grace * 7, 1000, 'failed'), // Keep failed jobs longer
  ])

  return {
    removed: completed.length + failed.length,
  }
}

/**
 * Get detailed sync stats
 */
export async function getSyncStats(): Promise<{
  queue: {
    name: string
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
    paused: boolean
  }
  repeatable: Array<{
    id: string | undefined
    pattern: string | undefined
    next: number
  }>
}> {
  const queue = getSyncQueue()

  const [waiting, active, completed, failed, delayed, repeatableJobs, isPaused] =
    await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getRepeatableJobs(),
      queue.isPaused(),
    ])

  return {
    queue: {
      name: QUEUE_NAME,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: isPaused,
    },
    repeatable: repeatableJobs.map((job) => ({
      id: job.id ?? undefined,
      pattern: job.pattern ?? undefined,
      next: job.next ?? 0,
    })),
  }
}

/**
 * Trigger immediate sync for all accounts (useful for webhooks)
 */
export async function triggerImmediateSync(
  organizationId: string,
  accountIds?: string[]
): Promise<string[]> {
  const queue = getSyncQueue()
  const jobIds: string[] = []

  if (accountIds && accountIds.length > 0) {
    // Sync specific accounts
    for (const accountId of accountIds) {
      const job = await queue.add(
        MANUAL_SYNC_JOB,
        {
          type: 'account',
          accountId,
          organizationId,
        },
        {
          priority: 1, // Highest priority
          jobId: `immediate-${accountId}-${Date.now()}`,
        }
      )
      jobIds.push(job.id || '')
    }
  } else {
    // Sync all org accounts
    const job = await queue.add(
      ORG_SYNC_JOB,
      {
        type: 'organization',
        organizationId,
      },
      {
        priority: 1,
        jobId: `immediate-org-${organizationId}-${Date.now()}`,
      }
    )
    jobIds.push(job.id || '')
  }

  return jobIds.filter(Boolean)
}
