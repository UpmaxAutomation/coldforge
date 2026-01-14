import { Worker, Job, WorkerOptions, Processor } from 'bullmq'
import { getRedis } from '../redis'
import { QUEUES } from './index'
import { processEmailJob, type EmailJobData } from './processors/email'
import { processWarmupJob, type WarmupJobData } from './processors/warmup'
import { processCampaignJob, type CampaignJobData } from './processors/campaign'

// Store worker instances
const workers = new Map<string, Worker>()

// Default worker options
const defaultWorkerOptions: Partial<WorkerOptions> = {
  concurrency: 5,
  limiter: {
    max: 100,
    duration: 1000, // Max 100 jobs per second
  },
  lockDuration: 30000, // 30 second lock
  stalledInterval: 30000, // Check for stalled jobs every 30 seconds
}

/**
 * Create a worker for processing jobs from a queue
 */
export function createWorker<T>(
  queueName: string,
  processor: Processor<T>,
  options?: Partial<WorkerOptions>
): Worker<T> {
  const connection = getRedis()

  const worker = new Worker<T>(queueName, processor, {
    connection,
    ...defaultWorkerOptions,
    ...options,
  })

  // Set up event handlers
  worker.on('completed', (job: Job<T>) => {
    console.log(`[Worker:${queueName}] Job ${job.id} completed`)
  })

  worker.on('failed', (job: Job<T> | undefined, error: Error) => {
    console.error(`[Worker:${queueName}] Job ${job?.id} failed:`, error.message)
  })

  worker.on('error', (error: Error) => {
    console.error(`[Worker:${queueName}] Worker error:`, error.message)
  })

  worker.on('stalled', (jobId: string) => {
    console.warn(`[Worker:${queueName}] Job ${jobId} stalled`)
  })

  workers.set(queueName, worker)
  console.log(`[Worker:${queueName}] Worker started with concurrency ${options?.concurrency || defaultWorkerOptions.concurrency}`)

  return worker
}

/**
 * Create email sending worker
 */
export function createEmailWorker(options?: Partial<WorkerOptions>): Worker<EmailJobData> {
  return createWorker<EmailJobData>(
    QUEUES.EMAIL_SEND,
    processEmailJob,
    {
      concurrency: 10, // Higher concurrency for email sending
      ...options,
    }
  )
}

/**
 * Create warmup worker
 */
export function createWarmupWorker(options?: Partial<WorkerOptions>): Worker<WarmupJobData> {
  return createWorker<WarmupJobData>(
    QUEUES.WARMUP,
    processWarmupJob,
    {
      concurrency: 5,
      ...options,
    }
  )
}

/**
 * Create campaign processing worker
 */
export function createCampaignWorker(options?: Partial<WorkerOptions>): Worker<CampaignJobData> {
  return createWorker<CampaignJobData>(
    QUEUES.CAMPAIGN,
    processCampaignJob,
    {
      concurrency: 3, // Lower concurrency for campaign operations
      ...options,
    }
  )
}

/**
 * Create webhook processing worker
 */
export function createWebhookWorker(
  processor: Processor,
  options?: Partial<WorkerOptions>
): Worker {
  return createWorker(
    QUEUES.WEBHOOK,
    processor,
    {
      concurrency: 10,
      ...options,
    }
  )
}

/**
 * Create analytics processing worker
 */
export function createAnalyticsWorker(
  processor: Processor,
  options?: Partial<WorkerOptions>
): Worker {
  return createWorker(
    QUEUES.ANALYTICS,
    processor,
    {
      concurrency: 5,
      ...options,
    }
  )
}

/**
 * Get a worker by queue name
 */
export function getWorker(queueName: string): Worker | undefined {
  return workers.get(queueName)
}

/**
 * Pause a worker
 */
export async function pauseWorker(queueName: string): Promise<void> {
  const worker = workers.get(queueName)
  if (worker) {
    await worker.pause()
    console.log(`[Worker:${queueName}] Worker paused`)
  }
}

/**
 * Resume a paused worker
 */
export async function resumeWorker(queueName: string): Promise<void> {
  const worker = workers.get(queueName)
  if (worker) {
    worker.resume()
    console.log(`[Worker:${queueName}] Worker resumed`)
  }
}

/**
 * Close all workers gracefully
 */
export async function closeAllWorkers(): Promise<void> {
  const closePromises = Array.from(workers.values()).map((worker) => worker.close())
  await Promise.all(closePromises)
  workers.clear()
  console.log('[Workers] All workers closed')
}

/**
 * Start all default workers
 */
export function startAllWorkers(): {
  email: Worker<EmailJobData>
  warmup: Worker<WarmupJobData>
  campaign: Worker<CampaignJobData>
} {
  return {
    email: createEmailWorker(),
    warmup: createWarmupWorker(),
    campaign: createCampaignWorker(),
  }
}
