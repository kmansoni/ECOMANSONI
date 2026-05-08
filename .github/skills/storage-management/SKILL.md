# Skill: Storage Management & Quotas

**Domain:** LocalStorage, IndexedDB, media cache, offline queue, database archiving  
**Files:** `src/lib/storage/`, `src/hooks/useCache/`, `src/lib/chat/messageOutbox.ts`  
**When to apply:** Local data persistence, cache eviction, quota management

---

## Knowledge

### Browser Storage Limits
- **LocalStorage**: 5MB per origin (synchronous, blocking)
- **IndexedDB**: 50MB+ (async, recommended for large data)
- **CacheStorage**: 6% of disk space (origin)
- **SessionStorage**: 5MB (tab-lifetime)

### Eviction Policies
- **LRU** (Least Recently Used): evict oldest accessed item
- **LFU** (Least Frequently Used): evict least frequently used
- **FIFO**: first-in-first-out (no recency tracking)
- **Size-based**: when total > N MB, trim oldest until < threshold
- **TTL**: time-to-live per item (absolute expiry)

### Storage Quotas
- **Messages cache**: 1000 recent messages (per chat)
- **Media thumbnails**: 5MB total (LRU)
- **Offline outbox**: 100 messages max (FIFO drop oldest)
- **User settings**: unlimited (LocalStorage, < 1KB)
- **Drafts**: indexedDB, 10 per chat

### Compression & Dedup
- **Message deduplication**: by server_id + client_local_id
- **Media dedup**: identical image hash → store once, multiple refs
- **Compression**: gzip/brotli for large text (chat export)
- **Delta sync**: send only changed bytes

### Database Archiving
- **Hot storage**: last 30 days messages (fast queries)
- **Warm storage**: 30–365 days (partitioned, slower)
- **Cold storage**: > 1 year (object storage S3/R2, rarely queried)
- **Tombstones**: soft-delete marker (allow sync, hide UI)
- **Vacuum**: reclaim space after deletes

---

## Quality Gates

1. **LocalStorage < 4.8MB** (leave headroom)
2. **IndexedDB < 45MB** (prevent quota exceeded)
3. **Cache hit rate** > 80% (messages)
4. **Eviction latency** < 100ms (cleanup)
5. **Offline queue drain** < 30s after reconnect
6. **No memory leaks** (heap stable over 1h chat session)

---

## When to Apply

- New persistent data structure
- Large dataset (chat history, media)
- Offline-first feature implementation
- Storage quota exceeded bug reports
- Cache invalidation logic
- Database migration (archiving strategy)
- Mobile app storage budgeting
