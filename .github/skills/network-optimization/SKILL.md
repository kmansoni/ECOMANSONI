---
name: "Network Optimization"
description: "Network performance optimization for web apps. Use when: reducing latency, optimizing API calls, or improving data transfer."
---

# Network Optimization

Reducing network latency and improving data transfer.

## Strategies

| Technique | Impact | Effort |
|-----------|--------|--------|
| CDN | High | Medium |
| HTTP/2 | Medium | Low |
| Preconnect | Medium | Low |
| Compression | High | Low |
| Lazy loading | Medium | Medium |

## Preconnect

```html
<link rel="preconnect" href="https://api.mansoni.com">
<link rel="dns-prefetch" href="https://api.mansoni.com">
```

## Data Optimization

```typescript
// Batch API calls
const [messages, users] = await Promise.all([
  supabase.from('messages').select().limit(50),
  supabase.from('profiles').select('id, name, avatar'),
]);

// Pagination
const { data } = await supabase
  .from('messages')
  .select()
  .range(0, 19);
```

## For Mansoni

Key network optimizations:
- React Query cache for API calls
- Supabase Realtime for live updates
- Image optimization via CDN
- Preconnect to Supabase endpoints