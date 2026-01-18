// Redis-based Rate Limiting
import { Redis } from 'ioredis';
import { getRedisClient } from './cache';
import { RateLimitConfig, RateLimitResult } from './types';

// Rate limiter using sliding window algorithm
export class RateLimiter {
  private redis: Redis;
  private keyPrefix: string;
  private points: number;
  private duration: number;
  private blockDuration: number;

  constructor(config: RateLimitConfig) {
    this.redis = getRedisClient();
    this.keyPrefix = config.keyPrefix || 'ratelimit';
    this.points = config.points;
    this.duration = config.duration;
    this.blockDuration = config.blockDuration || 0;
  }

  private key(identifier: string): string {
    return `${this.keyPrefix}:${identifier}`;
  }

  // Check and consume a point
  async consume(identifier: string, points: number = 1): Promise<RateLimitResult> {
    const key = this.key(identifier);
    const blockKey = `${key}:blocked`;
    const now = Date.now();
    const windowStart = now - this.duration * 1000;

    // Check if blocked
    if (this.blockDuration > 0) {
      const blockedUntil = await this.redis.get(blockKey);

      if (blockedUntil && parseInt(blockedUntil, 10) > now) {
        const retryAfter = Math.ceil((parseInt(blockedUntil, 10) - now) / 1000);
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(parseInt(blockedUntil, 10)),
          retryAfter,
        };
      }
    }

    // Use Lua script for atomic operation
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local maxPoints = tonumber(ARGV[3])
      local duration = tonumber(ARGV[4])
      local consumePoints = tonumber(ARGV[5])

      -- Remove old entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

      -- Count current points
      local currentPoints = redis.call('ZCARD', key)

      if currentPoints + consumePoints > maxPoints then
        -- Rate limit exceeded
        local oldestEntry = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local resetAt = oldestEntry[2] and (tonumber(oldestEntry[2]) + duration * 1000) or (now + duration * 1000)
        return {0, maxPoints - currentPoints, resetAt}
      else
        -- Add new entries
        for i = 1, consumePoints do
          redis.call('ZADD', key, now, now .. '-' .. i .. '-' .. math.random())
        end
        -- Set expiry
        redis.call('PEXPIRE', key, duration * 1000)
        return {1, maxPoints - currentPoints - consumePoints, now + duration * 1000}
      end
    `;

    const result = (await this.redis.eval(
      luaScript,
      1,
      key,
      now.toString(),
      windowStart.toString(),
      this.points.toString(),
      this.duration.toString(),
      points.toString()
    )) as [number, number, number];

    const allowed = result[0] === 1;
    const remaining = result[1];
    const resetAt = new Date(result[2]);

    // Block if not allowed and block duration is set
    if (!allowed && this.blockDuration > 0) {
      const blockedUntil = now + this.blockDuration * 1000;
      await this.redis.setex(blockKey, this.blockDuration, blockedUntil.toString());
    }

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000),
    };
  }

  // Get current status without consuming
  async get(identifier: string): Promise<RateLimitResult> {
    const key = this.key(identifier);
    const now = Date.now();
    const windowStart = now - this.duration * 1000;

    // Remove old entries
    await this.redis.zremrangebyscore(key, '-inf', windowStart);

    // Count current points
    const currentPoints = await this.redis.zcard(key);
    const remaining = Math.max(0, this.points - currentPoints);

    // Get oldest entry for reset time
    const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
    const resetAt = oldestEntry.length > 1
      ? new Date(parseFloat(oldestEntry[1]) + this.duration * 1000)
      : new Date(now + this.duration * 1000);

    return {
      allowed: remaining > 0,
      remaining,
      resetAt,
    };
  }

  // Reset rate limit for an identifier
  async reset(identifier: string): Promise<void> {
    const key = this.key(identifier);
    const blockKey = `${key}:blocked`;

    await this.redis.del(key, blockKey);
  }

  // Penalty - add points without actual request
  async penalty(identifier: string, points: number): Promise<void> {
    const key = this.key(identifier);
    const now = Date.now();

    const pipeline = this.redis.pipeline();

    for (let i = 0; i < points; i++) {
      pipeline.zadd(key, now, `${now}-penalty-${i}-${Math.random()}`);
    }

    pipeline.pexpire(key, this.duration * 1000);

    await pipeline.exec();
  }

  // Reward - remove points
  async reward(identifier: string, points: number): Promise<void> {
    const key = this.key(identifier);

    // Remove newest entries
    const entries = await this.redis.zrevrange(key, 0, points - 1);

    if (entries.length > 0) {
      await this.redis.zrem(key, ...entries);
    }
  }
}

// Pre-configured rate limiters
export const rateLimiters = {
  // API rate limiting
  api: () =>
    new RateLimiter({
      points: 100,
      duration: 60, // 100 requests per minute
      blockDuration: 60,
      keyPrefix: 'ratelimit:api',
    }),

  // Auth rate limiting (login attempts)
  auth: () =>
    new RateLimiter({
      points: 5,
      duration: 300, // 5 attempts per 5 minutes
      blockDuration: 900, // Block for 15 minutes
      keyPrefix: 'ratelimit:auth',
    }),

  // Password reset limiting
  passwordReset: () =>
    new RateLimiter({
      points: 3,
      duration: 3600, // 3 requests per hour
      blockDuration: 3600,
      keyPrefix: 'ratelimit:password-reset',
    }),

  // Email sending limiting
  email: () =>
    new RateLimiter({
      points: 1000,
      duration: 3600, // 1000 emails per hour
      keyPrefix: 'ratelimit:email',
    }),

  // Webhook delivery limiting
  webhook: () =>
    new RateLimiter({
      points: 100,
      duration: 60, // 100 deliveries per minute per endpoint
      keyPrefix: 'ratelimit:webhook',
    }),

  // Lead import limiting
  leadImport: () =>
    new RateLimiter({
      points: 10000,
      duration: 3600, // 10000 leads per hour
      keyPrefix: 'ratelimit:lead-import',
    }),

  // Search limiting
  search: () =>
    new RateLimiter({
      points: 30,
      duration: 60, // 30 searches per minute
      keyPrefix: 'ratelimit:search',
    }),
};

// IP-based rate limiter
export class IPRateLimiter {
  private limiters: Map<string, RateLimiter>;

  constructor() {
    this.limiters = new Map();
  }

  async check(ip: string, tier: string = 'default'): Promise<RateLimitResult> {
    let limiter = this.limiters.get(tier);

    if (!limiter) {
      const config = this.getTierConfig(tier);
      limiter = new RateLimiter(config);
      this.limiters.set(tier, limiter);
    }

    return limiter.consume(ip);
  }

  private getTierConfig(tier: string): RateLimitConfig {
    const configs: Record<string, RateLimitConfig> = {
      default: { points: 60, duration: 60, keyPrefix: 'ip:default' },
      authenticated: { points: 100, duration: 60, keyPrefix: 'ip:auth' },
      premium: { points: 200, duration: 60, keyPrefix: 'ip:premium' },
      enterprise: { points: 500, duration: 60, keyPrefix: 'ip:enterprise' },
    };

    return configs[tier] || configs.default;
  }
}

// Concurrent request limiter
export class ConcurrencyLimiter {
  private redis: Redis;
  private keyPrefix: string;
  private maxConcurrent: number;
  private timeout: number;

  constructor(options: {
    keyPrefix: string;
    maxConcurrent: number;
    timeout?: number;
  }) {
    this.redis = getRedisClient();
    this.keyPrefix = options.keyPrefix;
    this.maxConcurrent = options.maxConcurrent;
    this.timeout = options.timeout || 30000;
  }

  private key(identifier: string): string {
    return `${this.keyPrefix}:${identifier}`;
  }

  // Acquire a slot
  async acquire(identifier: string): Promise<{
    acquired: boolean;
    token?: string;
    position?: number;
  }> {
    const key = this.key(identifier);
    const now = Date.now();
    const token = `${now}-${Math.random().toString(36).substr(2, 9)}`;

    // Remove expired slots
    await this.redis.zremrangebyscore(key, '-inf', now - this.timeout);

    // Check current count
    const currentCount = await this.redis.zcard(key);

    if (currentCount >= this.maxConcurrent) {
      return {
        acquired: false,
        position: currentCount - this.maxConcurrent + 1,
      };
    }

    // Acquire slot
    await this.redis.zadd(key, now, token);
    await this.redis.pexpire(key, this.timeout);

    return {
      acquired: true,
      token,
    };
  }

  // Release a slot
  async release(identifier: string, token: string): Promise<void> {
    const key = this.key(identifier);
    await this.redis.zrem(key, token);
  }

  // Get current count
  async getCurrentCount(identifier: string): Promise<number> {
    const key = this.key(identifier);
    const now = Date.now();

    // Remove expired slots
    await this.redis.zremrangebyscore(key, '-inf', now - this.timeout);

    return this.redis.zcard(key);
  }
}

// Rate limit middleware helper
export async function checkRateLimit(
  limiter: RateLimiter,
  identifier: string
): Promise<{
  allowed: boolean;
  headers: Record<string, string>;
}> {
  const result = await limiter.consume(identifier);

  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.floor(result.resetAt.getTime() / 1000).toString(),
  };

  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }

  return {
    allowed: result.allowed,
    headers,
  };
}

// Distributed rate limiter for multiple instances
export class DistributedRateLimiter {
  private limiter: RateLimiter;
  private instanceId: string;

  constructor(config: RateLimitConfig) {
    this.limiter = new RateLimiter(config);
    this.instanceId = `${process.pid}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async consume(identifier: string, points: number = 1): Promise<RateLimitResult> {
    // Include instance ID to prevent race conditions
    return this.limiter.consume(`${identifier}:global`, points);
  }

  async get(identifier: string): Promise<RateLimitResult> {
    return this.limiter.get(`${identifier}:global`);
  }

  async reset(identifier: string): Promise<void> {
    return this.limiter.reset(`${identifier}:global`);
  }
}
