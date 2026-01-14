# ADR-003: In-Memory Caching with TTL

## Status
Accepted

## Context
The application makes frequent database queries for:
- User settings and preferences
- Account health scores
- Domain DNS status
- Campaign statistics

These queries are expensive and the data changes infrequently.

## Decision
Implement in-memory caching with Time-To-Live (TTL) expiration for frequently accessed, slowly-changing data.

## Cache Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| User settings | 5 min | Rarely changes |
| Account health | 1 min | Updates with sends |
| Domain DNS status | 15 min | DNS changes are slow |
| Campaign stats | 30 sec | Real-time-ish updates |

## Implementation

```typescript
// lib/cache/index.ts
interface CacheEntry<T> {
  data: T;
  expires: number;
}

class Cache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expires: Date.now() + ttlMs,
    });
  }
}
```

## Consequences

### Positive
- **Performance**: Reduces database load significantly
- **Latency**: Sub-millisecond cache hits vs ~10ms database queries
- **Simplicity**: No external cache service needed (Redis separate for queues)

### Negative
- **Memory usage**: Cache grows with active users
- **Staleness**: Data may be up to TTL seconds old
- **Server restarts**: Cache lost on deployment (acceptable for short TTLs)

## Cache Invalidation

Explicit invalidation for user-triggered changes:

```typescript
// When user updates settings
cache.delete(`user:${userId}:settings`);

// When account sends email
cache.delete(`account:${accountId}:health`);
```

## Future Considerations

If memory becomes an issue:
1. Add LRU eviction
2. Move to Redis cache
3. Implement cache size limits
