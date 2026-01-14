# ADR-002: Circuit Breaker Pattern for External Services

## Status
Accepted

## Context
InstantScale integrates with multiple external services:
- Domain registrars (Cloudflare, Namecheap, Porkbun)
- Mailbox providers (Google Workspace, Microsoft 365)
- SMTP servers for sending
- IMAP servers for reply detection

These services can experience outages, rate limits, or degraded performance. Without protection, failures cascade through the system.

## Decision
Implement the Circuit Breaker pattern for all external service calls.

## Circuit States

```
CLOSED (normal)
    │
    │ failure threshold exceeded
    ▼
OPEN (failing)
    │
    │ reset timeout elapsed
    ▼
HALF-OPEN (testing)
    │
    ├─── success ──► CLOSED
    │
    └─── failure ──► OPEN
```

## Configuration

```typescript
interface CircuitBreakerConfig {
  failureThreshold: 5,      // Failures before opening
  resetTimeout: 60000,      // ms before trying again (1 min)
  halfOpenSuccesses: 2,     // Successes to close
}
```

## Consequences

### Positive
- **Fail fast**: Don't wait for timeouts on known-bad services
- **Self-healing**: Automatically recovers when service returns
- **Resource protection**: Don't exhaust connections to failing service
- **User experience**: Fast error responses instead of hanging requests

### Negative
- **Complexity**: Additional layer of abstraction
- **False positives**: Temporary blips may open circuit unnecessarily
- **Monitoring needed**: Must track circuit states

## Implementation

```typescript
// lib/circuit-breaker/index.ts
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new CircuitOpenError();
    }
    // ... implementation
  }
}
```

## Services Using Circuit Breakers

| Service | Threshold | Reset Timeout |
|---------|-----------|---------------|
| Cloudflare API | 5 | 60s |
| Namecheap API | 5 | 60s |
| Google Admin SDK | 3 | 30s |
| Microsoft Graph | 3 | 30s |
| SMTP Connections | 10 | 120s |
