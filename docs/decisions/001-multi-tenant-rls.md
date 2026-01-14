# ADR-001: Multi-Tenant Architecture with Row-Level Security

## Status
Accepted

## Context
InstantScale is a multi-tenant SaaS platform where agencies and individual users manage their own email accounts, campaigns, and leads. We need a secure way to isolate tenant data without maintaining separate database instances.

## Decision
Use Supabase Row-Level Security (RLS) policies on all tenant-scoped tables. Each row contains a `user_id` column that references the authenticated user.

## Consequences

### Positive
- **Automatic isolation**: Database enforces data boundaries, not application code
- **Single database**: Simpler operations, no multi-database complexity
- **Cost effective**: One Supabase instance serves all tenants
- **Security by default**: Even bugs in application code cannot expose other tenants' data

### Negative
- **Query complexity**: Some queries require additional joins or context
- **Admin operations**: Superuser queries need explicit RLS bypass
- **Testing**: Must test with multiple users to verify isolation

## Implementation

```sql
-- All tenant tables include user_id
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  -- ...
);

-- RLS policy pattern
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own campaigns"
ON campaigns
FOR ALL
USING (user_id = auth.uid());
```

## Related
- Supabase Auth for user identity
- API routes use Supabase client with session context
