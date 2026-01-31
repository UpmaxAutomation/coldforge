import { Queue, Job, JobsOptions, QueueOptions, QueueEvents, Worker } from 'bullmq'
import { getRedis } from '../redis'
import { createAdminClient } from '../supabase/admin'

// Queue names for different job types
export const QUEUES = {
  EMAIL_SEND: 'email-send',
  WARMUP: 'warmup',
  CAMPAIGN: 'campaign',
  WEBHOOK: 'webhook',
  ANALYTICS: 'analytics',
  INBOX_CATEGORIZATION: 'inbox-categorization',
  DEAD_LETTER: 'dead-letter', // Dead letter queue for failed jobs
} as const

export type QueueName = keyof typeof QUEUES

// Dead letter queue handler - stores failed jobs for inspection
async function handleFailedJob(
  queueName: string,
  jobId: string,
  jobName: string,
  jobData: Record<string, unknown>,
  error: Error,
  attempts: number
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('dead_letter_queue').insert({
      queue_name: queueName,
      job_id: jobId,
      job_name: jobName,
      job_data: jobData,
      error_message: error.message,
      error_stack: error.stack,
      attempts,
      max_attempts: 3,
      organization_id: (jobData as { organizationId?: string }).organizationId || null,
      status: 'failed',
    })
    console.log(`[DLQ] Job ${jobId} from ${queueName} added to dead letter queue`)
  } catch (dlqError) {
    console.error(`[DLQ] Failed to add job to dead letter queue:`, dlqError)
  }
}

// Default queue options with dead letter queue
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
    removeOnFail: false, // Don't remove failed jobs - send to DLQ instead
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

/**
 * Setup dead letter queue handling for a worker
 * Call this when creating workers to automatically send failed jobs to DLQ
 */
export function setupDeadLetterQueue(queueName: QueueName): QueueEvents {
  const name = QUEUES[queueName]
  const connection = getRedis()

  const queueEvents = new QueueEvents(name, { connection })

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
    try {
      const queue = getQueue(queueName)
      const job = await queue.getJob(jobId)

      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        // Job has exhausted all retries, send to DLQ
        await handleFailedJob(
          name,
          jobId,
          job.name,
          job.data as Record<string, unknown>,
          new Error(failedReason),
          job.attemptsMade
        )
      }
    } catch (error) {
      console.error(`[DLQ] Error handling failed job:`, error)
    }
  })

  console.log(`[Queue] Dead letter queue handler setup for ${name}`)
  return queueEvents
}

/**
 * Retry a job from the dead letter queue
 */
export async function retryFromDLQ(dlqEntryId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { data: entry, error } = await supabase
    .from('dead_letter_queue')
    .select('*')
    .eq('id', dlqEntryId)
    .single()

  if (error || !entry) {
    console.error(`[DLQ] Entry not found: ${dlqEntryId}`)
    return false
  }

  // Find the queue name
  const queueKey = Object.keys(QUEUES).find(
    (key) => QUEUES[key as QueueName] === entry.queue_name
  ) as QueueName | undefined

  if (!queueKey) {
    console.error(`[DLQ] Unknown queue: ${entry.queue_name}`)
    return false
  }

  // Re-add the job to the original queue
  await addJob(queueKey, entry.job_name, entry.job_data as object, {
    attempts: 3,
  })

  // Mark the DLQ entry as retried
  await supabase
    .from('dead_letter_queue')
    .update({
      status: 'retried',
      processed_at: new Date().toISOString(),
      processed_by: 'system',
    })
    .eq('id', dlqEntryId)

  console.log(`[DLQ] Job ${entry.job_id} retried from DLQ`)
  return true
}

/**
 * Get dead letter queue entries
 */
export async function getDLQEntries(options?: {
  queueName?: string
  status?: 'failed' | 'retried' | 'discarded'
  limit?: number
}): Promise<unknown[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('dead_letter_queue')
    .select('*')
    .order('failed_at', { ascending: false })

  if (options?.queueName) {
    query = query.eq('queue_name', options.queueName)
  }

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data } = await query
  return data || []
}
