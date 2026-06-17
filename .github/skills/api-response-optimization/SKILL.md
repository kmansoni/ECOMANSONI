---
name: "API Response Optimization"
description: "API response time improvement strategies. Use when: reducing API latency, optimizing response payloads, or improving API performance."
---

# API Response Optimization

Improving API response times.

## Strategies

1. **Pagination** — never return all records
2. **Field selection** — return only needed fields
3. **Caching** — React Query, CDN, HTTP caching
4. **Compression** — enable gzip/brotli
5. **Connection pooling** — reuse database connections

## Edge Functions

```typescript
// Optimize Deno edge functions
Deno.serve(async (req) => {
  // Cache headers
  const headers = new Headers({
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    'Content-Type': 'application/json',
  });

  const data = await supabase
    .from('messages')
    .select('id, content, created_at')
    .limit(20);

  return new Response(JSON.stringify(data), { headers });
});
```

## For Mansoni

API endpoints: Supabase queries, Edge Functions, notification-router, email-router