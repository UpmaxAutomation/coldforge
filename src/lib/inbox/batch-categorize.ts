/**
 * Batch Categorization Service
 *
 * Handles background processing of email categorization using a queue system.
 * Designed for efficient processing of large volumes of messages.
 */

import { Queue, Worker, Job } from 'bullmq'
import { getRedis } from '../redis'
import { createClient } from '../supabase/server'
import { categorizeMessage, shouldAutoApply } from './categorization'
import type {
  CategoryResult,
  CategorizationInput,
} from './types'

// Queue name for categorization jobs
export const CATEGORIZATION_QUEUE = 'inbox-categorization'

// Job types
export const JOB_TYPES = {
  CATEGORIZE_SINGLE: 'categorize-single',
  CATEGORIZE_BATCH: 'categorize-batch',
  RECATEGORIZE_THREAD: 'recategorize-thread',
} as const

// Queue configuration
const QUEUE_CONFIG = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60, // 24 hours
      count: 5000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60, // 7 days
    },
  },
}

// Job data types
export interface SingleCategorizationJob {
  type: typeof JOB_TYPES.CATEGORIZE_SINGLE
  messageId: string
  organizationId: string
  message: CategorizationInput
  autoApply?: boolean
}

export interface BatchCategorizationJob {
  type: typeof JOB_TYPES.CATEGORIZE_BATCH
  organizationId: string
  messageIds: string[]
  autoApply?: boolean
}

export interface RecategorizeThreadJob {
  type: typeof JOB_TYPES.RECATEGORIZE_THREAD
  threadId: string
  organizationId: string
}

export type CategorizationJob =
  | SingleCategorizationJob
  | BatchCategorizationJob
  | RecategorizeThreadJob

// Queue instance (singleton)
let categorizationQueue: Queue | null = null

/**
 * Get or create the categorization queue
 */
export function getCategorizationQueue(): Queue {
  if (!categorizationQueue) {
    const connection = getRedis()
    categorizationQueue = new Queue(CATEGORIZATION_QUEUE, {
      connection,
      ...QUEUE_CONFIG,
    })

    categorizationQueue.on('error', (error) => {
      console.error('[CategorizationQueue] Error:', error.message)
    })
  }

  return categorizationQueue
}

/**
 * Add a single message to the categorization queue
 */
export async function queueCategorizationJob(
  messageId: string,
  organizationId: string,
  message: CategorizationInput,
  options?: {
    autoApply?: boolean
    priority?: number
    delay?: number
  }
): Promise<Job<SingleCategorizationJob>> {
  const queue = getCategorizationQueue()

  const jobData: SingleCategorizationJob = {
    type: JOB_TYPES.CATEGORIZE_SINGLE,
    messageId,
    organizationId,
    message,
    autoApply: options?.autoApply ?? true,
  }

  return queue.add(JOB_TYPES.CATEGORIZE_SINGLE, jobData, {
    priority: options?.priority ?? 0,
    delay: options?.delay,
  })
}

/**
 * Add multiple messages to the categorization queue as a batch
 */
export async function queueBatchCategorization(
  organizationId: string,
  messageIds: string[],
  options?: {
    autoApply?: boolean
    priority?: number
  }
): Promise<Job<BatchCategorizationJob>> {
  const queue = getCategorizationQueue()

  const jobData: BatchCategorizationJob = {
    type: JOB_TYPES.CATEGORIZE_BATCH,
    organizationId,
    messageIds,
    autoApply: options?.autoApply ?? true,
  }

  return queue.add(JOB_TYPES.CATEGORIZE_BATCH, jobData, {
    priority: options?.priority ?? 5, // Lower priority than single jobs
  })
}

/**
 * Queue a job to recategorize all messages in a thread
 */
export async function queueThreadRecategorization(
  threadId: string,
  organizationId: string
): Promise<Job<RecategorizeThreadJob>> {
  const queue = getCategorizationQueue()

  const jobData: RecategorizeThreadJob = {
    type: JOB_TYPES.RECATEGORIZE_THREAD,
    threadId,
    organizationId,
  }

  return queue.add(JOB_TYPES.RECATEGORIZE_THREAD, jobData)
}

/**
 * Process a single categorization job
 */
async function processSingleCategorization(
  job: Job<SingleCategorizationJob>
): Promise<CategoryResult> {
  const { messageId, organizationId, message, autoApply } = job.data

  console.log(`[Categorization] Processing message ${messageId}`)

  const result = await categorizeMessage(message)

  // Update database with result
  const supabase = await createClient()

  // Update the reply record with categorization
  const updateData: Record<string, unknown> = {
    ai_category: result.category,
    ai_confidence: result.confidence,
    ai_sentiment: result.sentiment,
    ai_signals: result.signals,
    categorized_at: new Date().toISOString(),
  }

  // Auto-apply category if enabled and confidence is high enough
  if (autoApply && shouldAutoApply(result)) {
    updateData.category = result.category
    updateData.sentiment = result.sentiment
    updateData.is_auto_detected = true
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('replies') as any)
    .update(updateData)
    .eq('id', messageId)
    .eq('organization_id', organizationId)

  if (error) {
    console.error(`[Categorization] Failed to update message ${messageId}:`, error)
    throw error
  }

  // Also update the thread's category if this is the latest reply
  await updateThreadCategory(supabase, messageId, result)

  console.log(
    `[Categorization] Completed message ${messageId}: ${result.category} (${result.confidence.toFixed(2)})`
  )

  return result
}

/**
 * Process a batch categorization job
 */
async function processBatchCategorization(
  job: Job<BatchCategorizationJob>
): Promise<{ processed: number; failed: number }> {
  const { organizationId, messageIds, autoApply } = job.data
  const supabase = await createClient()

  let processed = 0
  let failed = 0

  // Fetch messages from database
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: messages, error: fetchError } = await (supabase.from('replies') as any)
    .select('id, from_email, from_name, subject, body_text')
    .in('id', messageIds)
    .eq('organization_id', organizationId) as {
      data: Array<{
        id: string
        from_email: string
        from_name: string | null
        subject: string | null
        body_text: string | null
      }> | null
      error: Error | null
    }

  if (fetchError || !messages) {
    throw new Error(`Failed to fetch messages: ${fetchError?.message}`)
  }

  // Process each message (with progress updates)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg) continue

    try {
      const input: CategorizationInput = {
        id: msg.id,
        from: msg.from_email,
        fromName: msg.from_name,
        subject: msg.subject || '',
        bodyText: msg.body_text || '',
      }

      const result = await categorizeMessage(input)

      // Update database
      const updateData: Record<string, unknown> = {
        ai_category: result.category,
        ai_confidence: result.confidence,
        ai_sentiment: result.sentiment,
        ai_signals: result.signals,
        categorized_at: new Date().toISOString(),
      }

      if (autoApply && shouldAutoApply(result)) {
        updateData.category = result.category
        updateData.sentiment = result.sentiment
        updateData.is_auto_detected = true
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('replies') as any)
        .update(updateData)
        .eq('id', msg.id)

      processed++
    } catch (error) {
      console.error(`[Categorization] Failed to categorize ${msg.id}:`, error)
      failed++
    }

    // Update job progress
    await job.updateProgress((i + 1) / messages.length * 100)
  }

  return { processed, failed }
}

/**
 * Process thread recategorization job
 */
async function processThreadRecategorization(
  job: Job<RecategorizeThreadJob>
): Promise<void> {
  const { threadId, organizationId } = job.data
  const supabase = await createClient()

  // Fetch all replies in the thread
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: replies, error: fetchError } = await (supabase.from('replies') as any)
    .select('id')
    .eq('thread_id', threadId)
    .eq('organization_id', organizationId)
    .order('received_at', { ascending: true }) as {
      data: Array<{ id: string }> | null
      error: Error | null
    }

  if (fetchError || !replies) {
    throw new Error(`Failed to fetch thread replies: ${fetchError?.message}`)
  }

  // Queue individual categorization jobs for each reply
  for (const reply of replies) {
    await queueCategorizationJob(reply.id, organizationId, {
      id: reply.id,
      from: '',
      subject: '',
      bodyText: '',
    })
  }

  console.log(`[Categorization] Queued ${replies.length} replies for thread ${threadId}`)
}

/**
 * Update thread category based on latest categorized reply
 */
async function updateThreadCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messageId: string,
  result: CategoryResult
): Promise<void> {
  // Get the reply to find its thread
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reply } = await (supabase.from('replies') as any)
    .select('thread_id, received_at')
    .eq('id', messageId)
    .single() as {
      data: { thread_id: string | null; received_at: string } | null
    }

  if (!reply?.thread_id) return

  // Check if this is the latest reply in the thread
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latestReply } = await (supabase.from('replies') as any)
    .select('id')
    .eq('thread_id', reply.thread_id)
    .order('received_at', { ascending: false })
    .limit(1)
    .single() as {
      data: { id: string } | null
    }

  // Only update thread if this is the latest reply
  if (latestReply?.id === messageId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads') as any)
      .update({
        category: result.category,
        sentiment: result.sentiment,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reply.thread_id)
  }
}

/**
 * Create and start the categorization worker
 */
export function startCategorizationWorker(
  options?: {
    concurrency?: number
  }
): Worker {
  const connection = getRedis()
  const concurrency = options?.concurrency ?? 5

  const worker = new Worker<CategorizationJob>(
    CATEGORIZATION_QUEUE,
    async (job) => {
      switch (job.data.type) {
        case JOB_TYPES.CATEGORIZE_SINGLE:
          return processSingleCategorization(job as Job<SingleCategorizationJob>)

        case JOB_TYPES.CATEGORIZE_BATCH:
          return processBatchCategorization(job as Job<BatchCategorizationJob>)

        case JOB_TYPES.RECATEGORIZE_THREAD:
          return processThreadRecategorization(job as Job<RecategorizeThreadJob>)

        default:
          throw new Error(`Unknown job type: ${(job.data as CategorizationJob).type}`)
      }
    },
    {
      connection,
      concurrency,
      limiter: {
        max: 50, // Max 50 jobs per minute (rate limit for Claude API)
        duration: 60000,
      },
    }
  )

  worker.on('completed', (job, result) => {
    console.log(`[CategorizationWorker] Job ${job.id} completed:`, result)
  })

  worker.on('failed', (job, error) => {
    console.error(`[CategorizationWorker] Job ${job?.id} failed:`, error.message)
  })

  worker.on('error', (error) => {
    console.error('[CategorizationWorker] Error:', error.message)
  })

  console.log(`[CategorizationWorker] Started with concurrency ${concurrency}`)

  return worker
}

/**
 * Get queue statistics for categorization
 */
export async function getCategorizationQueueStats(): Promise<{
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}> {
  const queue = getCategorizationQueue()
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed'
  )

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  }
}

/**
 * Get recent categorization jobs for monitoring
 */
export async function getRecentCategorizationJobs(
  status: 'completed' | 'failed' | 'active' | 'waiting' = 'completed',
  count: number = 20
): Promise<Job<CategorizationJob>[]> {
  const queue = getCategorizationQueue()
  return queue.getJobs([status], 0, count - 1)
}

/**
 * Retry failed categorization jobs
 */
export async function retryFailedJobs(): Promise<number> {
  const queue = getCategorizationQueue()
  const failedJobs = await queue.getJobs(['failed'], 0, 100)

  let retriedCount = 0

  for (const job of failedJobs) {
    const state = await job.getState()
    if (state === 'failed') {
      await job.retry()
      retriedCount++
    }
  }

  return retriedCount
}

/**
 * Clean old completed categorization jobs
 */
export async function cleanOldJobs(
  olderThanMs: number = 24 * 60 * 60 * 1000 // 24 hours
): Promise<string[]> {
  const queue = getCategorizationQueue()
  return queue.clean(olderThanMs, 1000, 'completed')
}

/**
 * Close the categorization queue
 */
export async function closeCategorizationQueue(): Promise<void> {
  if (categorizationQueue) {
    await categorizationQueue.close()
    categorizationQueue = null
    console.log('[CategorizationQueue] Closed')
  }
}
