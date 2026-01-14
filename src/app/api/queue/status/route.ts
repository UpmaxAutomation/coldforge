import { NextRequest, NextResponse } from 'next/server'
import { getAllQueueStatuses, getJobCounts, QUEUES, type QueueName } from '@/lib/queue'
import { checkRedisHealth, getRedisInfo } from '@/lib/redis'

/**
 * GET /api/queue/status
 * Get status of all queues or a specific queue
 *
 * Query params:
 * - queue: specific queue name (optional)
 */
export async function GET(request: NextRequest) {
  try {
    // Check Redis health first
    const redisHealthy = await checkRedisHealth()
    if (!redisHealthy) {
      return NextResponse.json(
        {
          error: 'Redis connection unavailable',
          status: 'unhealthy',
        },
        { status: 503 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const queueParam = searchParams.get('queue')

    // If specific queue requested
    if (queueParam) {
      // Validate queue name
      const queueKey = Object.keys(QUEUES).find(
        key => QUEUES[key as QueueName] === queueParam
      ) as QueueName | undefined

      if (!queueKey) {
        return NextResponse.json(
          {
            error: 'Invalid queue name',
            validQueues: Object.values(QUEUES),
          },
          { status: 400 }
        )
      }

      const counts = await getJobCounts(queueKey)
      return NextResponse.json({
        queue: queueParam,
        counts,
        status: 'healthy',
      })
    }

    // Get all queue statuses
    const [queueStatuses, redisInfo] = await Promise.all([
      getAllQueueStatuses(),
      getRedisInfo(),
    ])

    // Calculate totals
    const totals = queueStatuses.reduce(
      (acc, q) => ({
        waiting: acc.waiting + q.counts.waiting,
        active: acc.active + q.counts.active,
        completed: acc.completed + q.counts.completed,
        failed: acc.failed + q.counts.failed,
        delayed: acc.delayed + q.counts.delayed,
        paused: acc.paused + q.counts.paused,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 }
    )

    return NextResponse.json({
      status: 'healthy',
      redis: redisInfo,
      queues: queueStatuses,
      totals,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[QueueStatus] Error fetching queue status:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch queue status',
        message: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
      },
      { status: 500 }
    )
  }
}
