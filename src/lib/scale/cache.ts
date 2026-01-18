// Redis Cache Implementation
import { Redis } from 'ioredis';
import { CacheConfig, CacheEntry, CacheStats } from './types';

// Redis client singleton
let redisClient: Redis | null = null;

// Get or create Redis client
export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });
  }

  return redisClient;
}

// Close Redis connection
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Cache class
export class Cache {
  private redis: Redis;
  private namespace: string;
  private defaultTtl: number;
  private stats: { hits: number; misses: number; evictions: number };

  constructor(config: CacheConfig = { defaultTtl: 3600 }) {
    this.redis = getRedisClient();
    this.namespace = config.namespace || 'cache';
    this.defaultTtl = config.defaultTtl;
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  private key(k: string): string {
    return `${this.namespace}:${k}`;
  }

  // Get a value from cache
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(this.key(key));

      if (data) {
        this.stats.hits++;
        return JSON.parse(data) as T;
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Set a value in cache
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTtl;

      if (expiry > 0) {
        await this.redis.setex(this.key(key), expiry, serialized);
      } else {
        await this.redis.set(this.key(key), serialized);
      }

      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  // Get or set (cache-aside pattern)
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  // Delete a key
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(this.key(key));
      if (result > 0) {
        this.stats.evictions++;
      }
      return result > 0;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  // Delete by pattern
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(this.key(pattern));

      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);
      this.stats.evictions += result;
      return result;
    } catch (error) {
      console.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  // Delete by tags
  async deleteByTags(tags: string[]): Promise<number> {
    try {
      let deleted = 0;

      for (const tag of tags) {
        const tagKey = `${this.namespace}:tag:${tag}`;
        const members = await this.redis.smembers(tagKey);

        if (members.length > 0) {
          deleted += await this.redis.del(...members);
          await this.redis.del(tagKey);
        }
      }

      this.stats.evictions += deleted;
      return deleted;
    } catch (error) {
      console.error('Cache delete by tags error:', error);
      return 0;
    }
  }

  // Set with tags
  async setWithTags<T>(
    key: string,
    value: T,
    tags: string[],
    ttl?: number
  ): Promise<boolean> {
    try {
      const fullKey = this.key(key);
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTtl;

      const pipeline = this.redis.pipeline();

      if (expiry > 0) {
        pipeline.setex(fullKey, expiry, serialized);
      } else {
        pipeline.set(fullKey, serialized);
      }

      // Add key to tag sets
      for (const tag of tags) {
        const tagKey = `${this.namespace}:tag:${tag}`;
        pipeline.sadd(tagKey, fullKey);
        if (expiry > 0) {
          pipeline.expire(tagKey, expiry);
        }
      }

      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Cache setWithTags error:', error);
      return false;
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(this.key(key));
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  // Get TTL for a key
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(this.key(key));
    } catch (error) {
      console.error('Cache ttl error:', error);
      return -1;
    }
  }

  // Increment a counter
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(this.key(key), amount);
    } catch (error) {
      console.error('Cache increment error:', error);
      return 0;
    }
  }

  // Decrement a counter
  async decrement(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.decrby(this.key(key), amount);
    } catch (error) {
      console.error('Cache decrement error:', error);
      return 0;
    }
  }

  // Get multiple keys
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map((k) => this.key(k));
      const results = await this.redis.mget(...fullKeys);

      return results.map((data) => {
        if (data) {
          this.stats.hits++;
          return JSON.parse(data) as T;
        }
        this.stats.misses++;
        return null;
      });
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  // Set multiple keys
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const fullKey = this.key(entry.key);
        const serialized = JSON.stringify(entry.value);
        const expiry = entry.ttl || this.defaultTtl;

        if (expiry > 0) {
          pipeline.setex(fullKey, expiry, serialized);
        } else {
          pipeline.set(fullKey, serialized);
        }
      }

      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Cache mset error:', error);
      return false;
    }
  }

  // Clear all keys in namespace
  async clear(): Promise<number> {
    try {
      const keys = await this.redis.keys(`${this.namespace}:*`);

      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);
      this.stats.evictions += result;
      return result;
    } catch (error) {
      console.error('Cache clear error:', error);
      return 0;
    }
  }

  // Get cache stats
  async getStats(): Promise<CacheStats> {
    try {
      const keys = await this.redis.keys(`${this.namespace}:*`);
      const size = keys.length;
      const hitRate =
        this.stats.hits + this.stats.misses > 0
          ? this.stats.hits / (this.stats.hits + this.stats.misses)
          : 0;

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        size,
        hitRate,
        evictions: this.stats.evictions,
      };
    } catch (error) {
      console.error('Cache getStats error:', error);
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        size: 0,
        hitRate: 0,
        evictions: this.stats.evictions,
      };
    }
  }

  // Reset stats
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }
}

// Singleton cache instances
const cacheInstances: Map<string, Cache> = new Map();

export function getCache(namespace: string = 'default', config?: CacheConfig): Cache {
  if (!cacheInstances.has(namespace)) {
    cacheInstances.set(
      namespace,
      new Cache({ defaultTtl: 3600, ...config, namespace })
    );
  }
  return cacheInstances.get(namespace)!;
}

// Common cache namespaces
export const caches = {
  // User data cache
  users: () => getCache('users', { defaultTtl: 300 }),

  // Workspace data cache
  workspaces: () => getCache('workspaces', { defaultTtl: 300 }),

  // Campaign data cache
  campaigns: () => getCache('campaigns', { defaultTtl: 60 }),

  // Analytics cache
  analytics: () => getCache('analytics', { defaultTtl: 900 }),

  // API responses cache
  api: () => getCache('api', { defaultTtl: 60 }),

  // Session cache
  sessions: () => getCache('sessions', { defaultTtl: 86400 }),

  // Rate limiting cache
  rateLimit: () => getCache('rateLimit', { defaultTtl: 60 }),

  // Feature flags cache
  features: () => getCache('features', { defaultTtl: 300 }),
};

// Cache decorators/helpers

// Simple function memoization with cache
export function cached<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: {
    namespace?: string;
    ttl?: number;
    keyGenerator?: (...args: Parameters<T>) => string;
  } = {}
): T {
  const cache = getCache(options.namespace || 'memoized');
  const keyGenerator = options.keyGenerator || ((...args) => JSON.stringify(args));

  return (async (...args: Parameters<T>) => {
    const key = keyGenerator(...args);
    return cache.getOrSet(key, () => fn(...args), options.ttl);
  }) as T;
}

// Cache key generators
export const cacheKeys = {
  user: (userId: string) => `user:${userId}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
  campaign: (campaignId: string) => `campaign:${campaignId}`,
  leads: (workspaceId: string, page: number) => `leads:${workspaceId}:${page}`,
  analytics: (workspaceId: string, period: string) => `analytics:${workspaceId}:${period}`,
  apiKey: (keyPrefix: string) => `apiKey:${keyPrefix}`,
  rateLimit: (identifier: string, window: string) => `rateLimit:${identifier}:${window}`,
};
