---
name: "Performance Audit"
description: "Comprehensive performance auditing across frontend, backend, and infrastructure. Use when: full performance review, bottleneck identification, or optimization planning."
---

# Performance Audit

Systematic performance review across all layers.

## Audit Layers

| Layer | Tool | Metrics |
|-------|------|---------|
| Frontend | Lighthouse | LCP, FID, CLS, TTI, TBT |
| Network | DevTools | Request count, payload size |
| API | k6/artillery | RPS, latency p50/p95/p99 |
| Database | pg_stat_statements | Query time, index usage |
| Bundle | vite-bundle-visualizer | Total size, chunk sizes |

## Performance Budget

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| FID | < 100ms |
| CLS | < 0.1 |
| Bundle (gzip) | < 300KB |
| API p95 | < 500ms |
| DB queries | < 50ms |

## Reporting

Document performance findings with:
- Current vs target metrics
- Identified bottlenecks
- Prioritized fixes
- Expected improvement

## For Mansoni

Regular audit targets: chat interface, feed loading, media upload, map rendering