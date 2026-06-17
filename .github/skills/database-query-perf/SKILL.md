---
name: "Database Query Performance"
description: "Supabase/PostgreSQL query optimization. Use when: optimizing slow queries, adding indexes, or improving database performance."
---

# Database Query Performance

Optimizing Supabase and PostgreSQL queries.

## Indexing

```sql
-- Check slow queries
SELECT query, calls, total_time, rows
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- Add missing indexes
CREATE INDEX idx_messages_channel_id
ON messages(channel_id);

-- Composite index for common queries
CREATE INDEX idx_messages_channel_created
ON messages(channel_id, created_at DESC);
```

## Query Optimization

```typescript
// ❌ N+1
const channels = await supabase.from('channels').select();
for (const channel of channels) {
  const messages = await supabase.from('messages').select().eq('channel_id', channel.id);
}

// ✅ Batch/join
const { data } = await supabase
  .from('channels')
  .select('*, messages(*)')
  .limit(10);
```

## Supabase Specific

- Use `.limit()` on all list queries
- Use `.single()` for single row lookups
- Prefer `select('column1, column2')` over `select('*')`
- Use RLS policies that leverage indexes

## For Mansoni

Hot queries: messages by channel, user profiles, channel list