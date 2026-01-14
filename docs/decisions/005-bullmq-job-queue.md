# ADR-005: BullMQ for Job Queue Processing

## Status
Accepted

## Context
Email sending at scale requires:
- Scheduled delivery (timezone-aware)
- Retry logic for transient failures
- Concurrency control
- Priority queuing
- Dead letter handling

## Decision
Use BullMQ with Redis for reliable job queue processing.

## Queue Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Queues                               │
├─────────────────────────────────────────────────────────────┤
│  email:send      │ High priority email sending              │
│  email:warmup    │ Warmup email scheduling                  │
│  campaign:process│ Campaign step processing                 │
│  dns:check       │ DNS health monitoring                    │
│  bounce:process  │ Bounce handling                          │
└─────────────────────────────────────────────────────────────┘
```

## Job Configuration

```typescript
// lib/queue/index.ts
const emailQueue = new Queue('email:send', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: 1000, // Keep last 1000
    removeOnFail: 5000,     // Keep last 5000 failed
  },
});
```

## Worker Configuration

```typescript
// lib/queue/workers.ts
const emailWorker = new Worker('email:send', processor, {
  connection: redis,
  concurrency: 10, // Max parallel jobs
  limiter: {
    max: 100,      // Max jobs
    duration: 1000, // Per second
  },
});
```

## Consequences

### Positive
- **Reliability**: Jobs persist across restarts
- **Scalability**: Workers can scale horizontally
- **Observability**: Built-in metrics and events
- **Retry**: Automatic exponential backoff

### Negative
- **Redis dependency**: Another service to manage
- **Complexity**: Job serialization considerations
- **Memory**: Redis stores jobs in memory

## Job Processors

| Processor | Concurrency | Rate Limit | Description |
|-----------|-------------|------------|-------------|
| email.ts | 10 | 100/sec | Send individual emails |
| warmup.ts | 5 | 50/sec | Warmup operations |
| campaign.ts | 3 | 10/sec | Campaign orchestration |

## Error Handling

```typescript
// processors/email.ts
export async function processEmail(job: Job<EmailJob>) {
  try {
    await sendEmail(job.data);
  } catch (error) {
    if (isRetryable(error)) {
      throw error; // Will retry
    }
    // Move to dead letter queue
    await deadLetterQueue.add('failed-email', {
      ...job.data,
      error: error.message,
    });
  }
}
```
