# Skill: Database Performance Expert

**Domain:** Supabase/PostgreSQL optimization, query tuning, scaling  
**Files:** `src/lib/supabase/`, `migrations/`, `supabase/`  
**When to apply:** Any SQL query, new index, migration, or performance regression

---

## Knowledge

### Query Analysis
- **EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)**: read query plans
- **Seq Scan vs Index Scan**: cost, rows, width
- **Nested Loop vs Hash Join vs Merge Join**: choose optimal
- **Index-only scan**: covering index (INCLUDE clause)
- **Bitmap index scan**: multi-column filters
- **GIN/GiST indexes**: JSONB, full-text, array operators
- **BRIN indexes**: time-series, log data (range scans)
- **Partial indexes**: WHERE clause subset

### Index Strategies
- **Composite index order**: equality → range → sort
- **Index condition pushdown**: reduce heap fetches
- **Index-only covering**: INCLUDE (non-key columns)
- **Expression indexes**: LOWER(email), DATE(created_at)
- **Partial indexes**: WHERE deleted = false
- **Concurrent index creation**: avoid locks on prod

### Partitioning
- **Range partitioning**: по дате (created_at)
- **Hash partitioning**: равномерное распределение (user_id)
- **List partitioning**: по региону (country_code)
- **Sub-partitioning**: range + hash комбинация
- **Partition pruning**: exclude irrelevant partitions

### Vacuum & Autovacuum
- **autovacuum_vacuum_scale_factor**: auto vacuum threshold
- **autovacuum_analyze_scale_factor**: update statistics
- **VACUUM (FULL, FREEZE)**: manual когда нужно
- **REINDEX**: rebuild indexes after massive updates
- **pg_stat_statements**: slow query identification

### Connection Management
- **pgbouncer** (transaction pooling): reduce connections overhead
- **Connection limits per role**: prevent abuse
- **Prepared statements**: cache plans

### Row-Level Security (RLS) Performance
- **USING vs CHECK policies**: filter vs insert
- **Policy evaluation cost**: each row checked
- **Bypass RLS for service role**: когда безопасно

---

## Quality Gates

1. **Query time** < 100ms (p95) for chat messages list
2. **Index usage** > 95% for SELECT queries
3. **Sequential scans** < 5% of total queries
4. **Cache hit ratio** (pg_buffercache) > 95%
5. **Table bloat** (dead tuples) < 10%
6. **Index bloat** < 20%
7. **Vacuum lag** (last vacuum age) < 1 hour

---

## When to Apply

- Any new SELECT/INSERT/UPDATE/DELETE query
- New table creation (partition key choice)
- Adding index (validate necessity, cost/benefit)
- Migration review (DROP COLUMN → potentially slow)
- Query performance regression (slow query log)
- Setting up read replicas
- Connection pool sizing
- RLS policy review (performance impact)
- Large table archiving strategy
