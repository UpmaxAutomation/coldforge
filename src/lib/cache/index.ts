/**
 * In-memory cache implementation for frequently accessed, slowly-changing data.
 * Provides TTL-based expiration and pattern-based invalidation.
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>()

  /**
   * Get a cached value by key. Returns null if not found or expired.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * Set a cached value with TTL in milliseconds.
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    })
  }

  /**
   * Delete a specific cache entry.
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Delete all cache entries matching a regex pattern.
   */
  deletePattern(pattern: string): void {
    const regex = new RegExp(pattern)
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics.
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }
    return true
  }

  /**
   * Get remaining TTL for a key in milliseconds. Returns -1 if not found.
   */
  ttl(key: string): number {
    const entry = this.cache.get(key)
    if (!entry) return -1
    const remaining = entry.expiresAt - Date.now()
    if (remaining <= 0) {
      this.cache.delete(key)
      return -1
    }
    return remaining
  }
}

// Export singleton instance
export const cache = new MemoryCache()

// Cache key builders for consistent key naming
export const cacheKeys = {
  dashboardStats: (orgId: string) => `dashboard:${orgId}`,
  campaignList: (orgId: string) => `campaigns:${orgId}`,
  campaignListFiltered: (orgId: string, filters: string) => `campaigns:${orgId}:${filters}`,
  emailAccountList: (orgId: string) => `email_accounts:${orgId}`,
  leadList: (orgId: string) => `leads:${orgId}`,
  leadListFiltered: (orgId: string, filters: string) => `leads:${orgId}:${filters}`,
  analytics: (orgId: string, period: string) => `analytics:${orgId}:${period}`,
  analyticsWithCampaign: (orgId: string, period: string, campaignId: string) =>
    `analytics:${orgId}:${period}:${campaignId}`,
}

// TTL constants (in milliseconds)
export const TTL = {
  /** 30 seconds - for rapidly changing data */
  SHORT: 30 * 1000,
  /** 1 minute - for dashboard stats */
  MINUTE: 60 * 1000,
  /** 5 minutes - for list data */
  MEDIUM: 5 * 60 * 1000,
  /** 15 minutes - for analytics */
  LONG: 15 * 60 * 1000,
  /** 1 hour - for rarely changing data */
  HOUR: 60 * 60 * 1000,
}

// Export the class for testing purposes
export { MemoryCache }
