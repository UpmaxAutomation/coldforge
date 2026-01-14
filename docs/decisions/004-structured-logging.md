# ADR-004: Structured Logging with Pino

## Status
Accepted

## Context
A cold email platform needs comprehensive logging for:
- Debugging send failures
- Tracking deliverability issues
- Monitoring system health
- Audit trails for compliance

Traditional text logs are hard to parse and aggregate at scale.

## Decision
Use Pino for structured JSON logging with contextual metadata.

## Log Structure

```json
{
  "level": "info",
  "time": 1705123456789,
  "msg": "Email sent successfully",
  "traceId": "abc123",
  "userId": "user_xyz",
  "accountId": "acc_456",
  "campaignId": "camp_789",
  "recipient": "redacted@example.com",
  "provider": "google",
  "latencyMs": 245
}
```

## Log Levels

| Level | Usage |
|-------|-------|
| `fatal` | Application crash |
| `error` | Failed operations (bounces, auth failures) |
| `warn` | Degraded performance, rate limits |
| `info` | Successful operations, state changes |
| `debug` | Detailed debugging info (dev only) |
| `trace` | Very verbose (local debugging) |

## Implementation

```typescript
// lib/logger/index.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: ['email', 'password', 'token'],
});

// lib/logger/context.ts
export function createRequestLogger(traceId: string, userId?: string) {
  return logger.child({ traceId, userId });
}
```

## Redaction

Sensitive fields are automatically redacted:
- Email addresses (except domain)
- Passwords and credentials
- OAuth tokens
- API keys

## Consequences

### Positive
- **Searchable**: JSON can be indexed and queried
- **Aggregatable**: Easy to count errors, measure latency
- **Contextual**: Every log includes trace ID for request correlation
- **Fast**: Pino is one of the fastest Node.js loggers

### Negative
- **Verbose**: JSON takes more space than text
- **Readability**: Raw JSON harder for humans (use pino-pretty in dev)

## Integration Points

```typescript
// API routes
const log = createRequestLogger(traceId, userId);
log.info({ campaignId }, 'Starting campaign');

// Background workers
const log = logger.child({ worker: 'email-sender' });
log.error({ err, jobId }, 'Send failed');
```
