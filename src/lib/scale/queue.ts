// Job Queue Implementation
import { Redis } from 'ioredis';
import { getRedisClient } from './cache';
import {
  Job,
  JobOptions,
  JobStatus,
  JobPriority,
  QueueStats,
} from './types';

// Priority values
const PRIORITY_VALUES: Record<JobPriority, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

// Job processor type
type JobProcessor<T = unknown, R = unknown> = (job: Job<T>) => Promise<R>;

// Queue class
export class Queue<T = unknown> {
  private redis: Redis;
  private name: string;
  private processors: Map<string, JobProcessor<T>>;
  private isProcessing: boolean;
  private concurrency: number;
  private activeJobs: number;

  constructor(name: string, options: { concurrency?: number } = {}) {
    this.redis = getRedisClient();
    this.name = name;
    this.processors = new Map();
    this.isProcessing = false;
    this.concurrency = options.concurrency || 1;
    this.activeJobs = 0;
  }

  private key(suffix: string): string {
    return `queue:${this.name}:${suffix}`;
  }

  // Add a job to the queue
  async add(name: string, data: T, options: JobOptions = {}): Promise<Job<T>> {
    const jobId = options.jobId || this.generateJobId();
    const priority = PRIORITY_VALUES[options.priority || 'normal'];
    const now = Date.now();

    const job: Job<T> = {
      id: jobId,
      name,
      data,
      status: options.delay ? 'delayed' : 'waiting',
      progress: 0,
      attempts: 0,
      maxAttempts: options.attempts || 3,
      createdAt: new Date(now),
    };

    const jobData = JSON.stringify({
      ...job,
      options: {
        backoff: options.backoff,
        removeOnComplete: options.removeOnComplete,
        removeOnFail: options.removeOnFail,
        timeout: options.timeout,
      },
    });

    const pipeline = this.redis.pipeline();

    // Store job data
    pipeline.set(this.key(`job:${jobId}`), jobData);

    // Add to appropriate queue
    if (options.delay) {
      const processAt = now + options.delay;
      pipeline.zadd(this.key('delayed'), processAt, jobId);
    } else {
      // Use priority queue (sorted set with priority as score)
      pipeline.zadd(this.key('waiting'), priority, jobId);
    }

    // Add to all jobs set
    pipeline.sadd(this.key('jobs'), jobId);

    await pipeline.exec();

    return job;
  }

  // Add multiple jobs
  async addBulk(
    jobs: Array<{ name: string; data: T; options?: JobOptions }>
  ): Promise<Job<T>[]> {
    const results: Job<T>[] = [];

    for (const { name, data, options } of jobs) {
      const job = await this.add(name, data, options);
      results.push(job);
    }

    return results;
  }

  // Get a job by ID
  async getJob(jobId: string): Promise<Job<T> | null> {
    const data = await this.redis.get(this.key(`job:${jobId}`));

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  // Get jobs by status
  async getJobs(
    status: JobStatus | JobStatus[],
    options: { start?: number; end?: number } = {}
  ): Promise<Job<T>[]> {
    const statuses = Array.isArray(status) ? status : [status];
    const { start = 0, end = -1 } = options;
    const jobs: Job<T>[] = [];

    for (const s of statuses) {
      let jobIds: string[] = [];

      switch (s) {
        case 'waiting':
          jobIds = await this.redis.zrange(this.key('waiting'), start, end);
          break;
        case 'active':
          jobIds = await this.redis.lrange(this.key('active'), start, end);
          break;
        case 'completed':
          jobIds = await this.redis.zrange(this.key('completed'), start, end);
          break;
        case 'failed':
          jobIds = await this.redis.zrange(this.key('failed'), start, end);
          break;
        case 'delayed':
          jobIds = await this.redis.zrange(this.key('delayed'), start, end);
          break;
      }

      for (const jobId of jobIds) {
        const job = await this.getJob(jobId);
        if (job) {
          jobs.push(job);
        }
      }
    }

    return jobs;
  }

  // Register a processor for a job type
  process(name: string, processor: JobProcessor<T>): void {
    this.processors.set(name, processor);
  }

  // Start processing jobs
  async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Move delayed jobs
    this.scheduleDelayedJobMover();

    // Start processing loop
    this.processLoop();
  }

  // Stop processing
  stopProcessing(): void {
    this.isProcessing = false;
  }

  // Processing loop
  private async processLoop(): Promise<void> {
    while (this.isProcessing) {
      if (this.activeJobs >= this.concurrency) {
        await this.sleep(100);
        continue;
      }

      try {
        // Get next job from waiting queue
        const result = await this.redis.zpopmin(this.key('waiting'));

        if (!result || result.length === 0) {
          await this.sleep(100);
          continue;
        }

        const jobId = result[0];
        const job = await this.getJob(jobId);

        if (!job) {
          continue;
        }

        // Process job
        this.activeJobs++;
        this.processJob(job).finally(() => {
          this.activeJobs--;
        });
      } catch (error) {
        console.error('Queue processing error:', error);
        await this.sleep(1000);
      }
    }
  }

  // Process a single job
  private async processJob(job: Job<T>): Promise<void> {
    const processor = this.processors.get(job.name);

    if (!processor) {
      console.error(`No processor registered for job type: ${job.name}`);
      await this.failJob(job, `No processor for job type: ${job.name}`);
      return;
    }

    // Move to active
    job.status = 'active';
    job.attempts++;
    job.processedAt = new Date();

    await this.redis.lpush(this.key('active'), job.id);
    await this.updateJob(job);

    try {
      // Execute processor with timeout
      const timeout = (job as unknown as { options?: { timeout?: number } }).options?.timeout || 30000;
      const result = await Promise.race([
        processor(job),
        this.createTimeout(timeout),
      ]);

      // Job completed successfully
      await this.completeJob(job, result);
    } catch (error) {
      // Job failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (job.attempts < job.maxAttempts) {
        // Retry with backoff
        await this.retryJob(job, errorMessage);
      } else {
        // Max attempts reached
        await this.failJob(job, errorMessage);
      }
    } finally {
      // Remove from active
      await this.redis.lrem(this.key('active'), 1, job.id);
    }
  }

  // Complete a job
  private async completeJob(job: Job<T>, result: unknown): Promise<void> {
    job.status = 'completed';
    job.finishedAt = new Date();
    job.returnValue = result;
    job.progress = 100;

    await this.redis.zadd(this.key('completed'), Date.now(), job.id);
    await this.updateJob(job);

    // Remove job data if configured
    const jobData = job as unknown as { options?: { removeOnComplete?: boolean | number } };
    if (jobData.options?.removeOnComplete === true) {
      await this.removeJob(job.id);
    }
  }

  // Fail a job
  private async failJob(job: Job<T>, reason: string): Promise<void> {
    job.status = 'failed';
    job.finishedAt = new Date();
    job.failedReason = reason;

    await this.redis.zadd(this.key('failed'), Date.now(), job.id);
    await this.updateJob(job);

    // Remove job data if configured
    const jobData = job as unknown as { options?: { removeOnFail?: boolean | number } };
    if (jobData.options?.removeOnFail === true) {
      await this.removeJob(job.id);
    }
  }

  // Retry a job
  private async retryJob(job: Job<T>, reason: string): Promise<void> {
    job.status = 'delayed';
    job.failedReason = reason;

    // Calculate backoff delay
    const jobData = job as unknown as {
      options?: { backoff?: { type: string; delay: number } };
    };
    const backoff = jobData.options?.backoff || { type: 'exponential', delay: 1000 };
    let delay: number;

    if (backoff.type === 'exponential') {
      delay = backoff.delay * Math.pow(2, job.attempts - 1);
    } else {
      delay = backoff.delay;
    }

    const processAt = Date.now() + delay;
    await this.redis.zadd(this.key('delayed'), processAt, job.id);
    await this.updateJob(job);
  }

  // Update job progress
  async updateProgress(jobId: string, progress: number): Promise<void> {
    const job = await this.getJob(jobId);

    if (job) {
      job.progress = Math.min(100, Math.max(0, progress));
      await this.updateJob(job);
    }
  }

  // Update job in Redis
  private async updateJob(job: Job<T>): Promise<void> {
    await this.redis.set(this.key(`job:${job.id}`), JSON.stringify(job));
  }

  // Remove a job
  async removeJob(jobId: string): Promise<boolean> {
    const pipeline = this.redis.pipeline();

    pipeline.del(this.key(`job:${jobId}`));
    pipeline.srem(this.key('jobs'), jobId);
    pipeline.zrem(this.key('waiting'), jobId);
    pipeline.lrem(this.key('active'), 0, jobId);
    pipeline.zrem(this.key('completed'), jobId);
    pipeline.zrem(this.key('failed'), jobId);
    pipeline.zrem(this.key('delayed'), jobId);

    await pipeline.exec();
    return true;
  }

  // Get queue stats
  async getStats(): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.redis.zcard(this.key('waiting')),
      this.redis.llen(this.key('active')),
      this.redis.zcard(this.key('completed')),
      this.redis.zcard(this.key('failed')),
      this.redis.zcard(this.key('delayed')),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: 0,
    };
  }

  // Pause the queue
  async pause(): Promise<void> {
    await this.redis.set(this.key('paused'), '1');
  }

  // Resume the queue
  async resume(): Promise<void> {
    await this.redis.del(this.key('paused'));
  }

  // Check if paused
  async isPaused(): Promise<boolean> {
    const result = await this.redis.get(this.key('paused'));
    return result === '1';
  }

  // Clean old jobs
  async clean(
    status: 'completed' | 'failed',
    olderThan: number = 24 * 60 * 60 * 1000
  ): Promise<number> {
    const threshold = Date.now() - olderThan;
    const jobs = await this.redis.zrangebyscore(
      this.key(status),
      '-inf',
      threshold
    );

    for (const jobId of jobs) {
      await this.removeJob(jobId);
    }

    return jobs.length;
  }

  // Empty the queue
  async empty(): Promise<void> {
    const jobIds = await this.redis.smembers(this.key('jobs'));

    for (const jobId of jobIds) {
      await this.removeJob(jobId);
    }
  }

  // Schedule delayed job mover
  private scheduleDelayedJobMover(): void {
    const moveDelayedJobs = async () => {
      if (!this.isProcessing) {
        return;
      }

      try {
        const now = Date.now();
        const jobIds = await this.redis.zrangebyscore(
          this.key('delayed'),
          '-inf',
          now
        );

        for (const jobId of jobIds) {
          const job = await this.getJob(jobId);

          if (job) {
            // Move to waiting queue
            const pipeline = this.redis.pipeline();
            pipeline.zrem(this.key('delayed'), jobId);
            pipeline.zadd(this.key('waiting'), PRIORITY_VALUES['normal'], jobId);
            await pipeline.exec();

            job.status = 'waiting';
            await this.updateJob(job);
          }
        }
      } catch (error) {
        console.error('Error moving delayed jobs:', error);
      }

      // Schedule next check
      setTimeout(moveDelayedJobs, 1000);
    };

    moveDelayedJobs();
  }

  // Helper methods
  private generateJobId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Job timeout')), ms);
    });
  }
}

// Queue instances
const queues: Map<string, Queue<unknown>> = new Map();

export function getQueue<T = unknown>(name: string): Queue<T> {
  if (!queues.has(name)) {
    queues.set(name, new Queue<T>(name));
  }
  return queues.get(name) as Queue<T>;
}

// Pre-defined queues
export const queues_defined = {
  // Email sending queue
  email: () => getQueue<{ to: string; subject: string; body: string }>('email'),

  // Lead import queue
  leadImport: () =>
    getQueue<{ workspaceId: string; leads: unknown[]; source: string }>('lead-import'),

  // Campaign processing queue
  campaign: () =>
    getQueue<{ campaignId: string; action: string }>('campaign'),

  // Analytics calculation queue
  analytics: () =>
    getQueue<{ workspaceId: string; period: string; type: string }>('analytics'),

  // Webhook delivery queue
  webhooks: () =>
    getQueue<{ webhookId: string; event: string; payload: unknown }>('webhooks'),

  // Domain verification queue
  domainVerification: () =>
    getQueue<{ domainId: string }>('domain-verification'),

  // Scheduled tasks queue
  scheduled: () =>
    getQueue<{ task: string; params: unknown }>('scheduled'),

  // Cleanup tasks queue
  cleanup: () =>
    getQueue<{ type: string; olderThan: number }>('cleanup'),
};
