import Redis, { RedisOptions } from 'ioredis'

// Redis configuration from environment
const config: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: true,
  retryStrategy: (times: number) => {
    if (times > 10) {
      // Stop retrying after 10 attempts
      return null
    }
    // Exponential backoff with max 3 second delay
    return Math.min(times * 100, 3000)
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
    return targetErrors.some(e => err.message.includes(e))
  },
}

// Singleton Redis connection
let redisInstance: Redis | null = null

/**
 * Create a new Redis connection with configured options
 */
export function createRedisConnection(): Redis {
  return new Redis(config)
}

/**
 * Get singleton Redis connection
 * Creates new connection if one doesn't exist
 */
export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = createRedisConnection()

    // Handle connection events
    redisInstance.on('connect', () => {
      console.log('[Redis] Connected to Redis server')
    })

    redisInstance.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
    })

    redisInstance.on('close', () => {
      console.log('[Redis] Connection closed')
    })

    redisInstance.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...')
    })
  }

  return redisInstance
}

/**
 * Close the Redis connection
 * Used for cleanup during shutdown
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit()
    redisInstance = null
    console.log('[Redis] Connection closed gracefully')
  }
}

/**
 * Check Redis connection health
 * Returns true if connection is healthy
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = getRedis()
    const result = await redis.ping()
    return result === 'PONG'
  } catch (error) {
    console.error('[Redis] Health check failed:', error)
    return false
  }
}

/**
 * Get Redis connection info
 * Useful for debugging and monitoring
 */
export async function getRedisInfo(): Promise<{
  connected: boolean
  host: string
  port: number
  memory?: string
  clients?: string
}> {
  const redis = getRedis()
  const connected = redis.status === 'ready'

  const info = {
    connected,
    host: config.host || 'localhost',
    port: config.port || 6379,
    memory: undefined as string | undefined,
    clients: undefined as string | undefined,
  }

  if (connected) {
    try {
      const redisInfo = await redis.info('memory')
      const memoryMatch = redisInfo.match(/used_memory_human:(\S+)/)
      if (memoryMatch) {
        info.memory = memoryMatch[1]
      }

      const clientInfo = await redis.info('clients')
      const clientMatch = clientInfo.match(/connected_clients:(\d+)/)
      if (clientMatch) {
        info.clients = clientMatch[1]
      }
    } catch {
      // Info retrieval failed, return basic info
    }
  }

  return info
}

export type { Redis }
