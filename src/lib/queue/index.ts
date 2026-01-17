import { Queue, Job, JobsOptions, QueueOptions } from 'bullmq'
import { getRedis } from '../redis'

// Queue names for different job types
export const QUEUES = {
  EMAIL_SEND: 'email-send',
  WARMUP: 'warmup',
  CAMPAIGN: 'campaign',
  WEBHOOK: 'webhook',
  ANALYTICS: 'analytics',
  INBOX_CATEGORIZATION: 'inbox-categorization',
} as const

export type QueueName = keyof typeof QUEUES

// Default queue options
const defaultQueueOptions: Partial<QueueOptions> = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60, // Keep completed jobs for 24 hours
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
    },
  },
}

// Store queue instances (singleton pattern)
const queues = new Map<string, Queue>()

/**
 * Create a new queue with default options
 */
export function createQueue(name: string, options?: Partial<QueueOptions>): Queue {
  const connection = getRedis()

  const queue = new Queue(name, {
    connection,
    ...defaultQueueOptions,
    ...options,
  })

  queue.on('error', (error) => {
    console.error(`[Queue:${name}] Error:`, error.message)
  })

  return queue
}

/**
 * Get queue instance (singleton pattern)
 * Creates queue if it doesn't exist
 */
export function getQueue(queueName: QueueName): Queue {
  const name = QUEUES[queueName]

  if (!queues.has(name)) {
    queues.set(name, createQueue(name))
  }

  return queues.get(name)!
}

/**
 * Add a job to a queue
 */
export async function addJob<T extends object>(
  queueName: QueueName,
  jobName: string,
  data: T,
  options?: JobsOptions
): Promise<Job<T>> {
  const queue = getQueue(queueName)
  return queue.add(jobName, data, options)
}

/**
 * Add a job scheduled to run at a specific time
 */
export async function addScheduledJob<T extends object>(
  queueName: QueueName,
  jobName: string,
  data: T,
  runAt: Date
): Promise<Job<T>> {
  const delay = Math.max(0, runAt.getTime() - Date.now())
  return addJob(queueName, jobName, data, { delay })
}

/**
 * Add a recurring job using cron expression
 */
export async function addRecurringJob<T extends object>(
  queueName: QueueName,
  jobName: string,
  data: T,
  cron: string,
  options?: Omit<JobsOptions, 'repeat'>
): Promise<void> {
  const queue = getQueue(queueName)
  await queue.add(jobName, data, {
    ...options,
    repeat: {
      pattern: cron,
    },
  })
}

/**
 * Remove a recurring job
 */
export async function removeRecurringJob(
  queueName: QueueName,
  jobName: string
): Promise<boolean> {
  const queue = getQueue(queueName)
  return queue.removeRepeatableByKey(`${jobName}:::${jobName}`)
}

/**
 * Get job counts for a queue
 */
export async function getJobCounts(queueName: QueueName): Promise<{
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
}> {
  const queue = getQueue(queueName)
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused')
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
  }
}

/**
 * Get all queue statuses
 */
export async function getAllQueueStatuses(): Promise<
  Array<{
    name: string
    counts: {
      waiting: number
      active: number
      completed: number
      failed: number
      delayed: number
      paused: number
    }
  }>
> {
  const statuses = await Promise.all(
    (Object.keys(QUEUES) as QueueName[]).map(async (key) => {
      const counts = await getJobCounts(key)
      return {
        name: QUEUES[key],
        counts,
      }
    })
  )
  return statuses
}

/**
 * Pause a queue
 */
export async function pauseQueue(queueName: QueueName): Promise<void> {
  const queue = getQueue(queueName)
  await queue.pause()
}

/**
 * Resume a paused queue
 */
export async function resumeQueue(queueName: QueueName): Promise<void> {
  const queue = getQueue(queueName)
  await queue.resume()
}

/**
 * Clean old jobs from a queue
 */
export async function cleanQueue(
  queueName: QueueName,
  grace: number = 24 * 60 * 60 * 1000, // 24 hours
  limit: number = 1000,
  status: 'completed' | 'failed' = 'completed'
): Promise<string[]> {
  const queue = getQueue(queueName)
  return queue.clean(grace, limit, status)
}

/**
 * Close all queue connections
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queues.values()).map((queue) => queue.close())
  await Promise.all(closePromises)
  queues.clear()
  console.log('[Queue] All queues closed')
}
