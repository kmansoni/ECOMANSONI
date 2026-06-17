---
name: "Monitoring Stack"
description: "Observability infrastructure: metrics, logs, traces, alerts. Use when: setting up monitoring, creating dashboards, or configuring alerts."
---

# Monitoring Stack

Observability infrastructure for production systems.

## Three Pillars

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Metrics │    │  Logs   │    │  Traces │
│  (How)  │    │ (What)  │    │ (Why)   │
└────┬────┘    └────┬────┘    └────┬────┘
     │                │                │
     ▼                ▼                ▼
  Prometheus       Loki/ELK        Jaeger
  Grafana          Grafana          Grafana
```

## For Mansoni Platform

### Metrics to Track

| Category | Metrics |
|----------|---------|
| **Frontend** | FCP, LCP, CLS, TTFB, Error rate |
| **API** | Request latency p50/p95/p99, Error rate, Throughput |
| **Database** | Query latency, Connection pool, Replication lag |
| **Infrastructure** | CPU, Memory, Disk I/O, Network |

### Key Dashboards

1. **SLO Dashboard**
   - API Availability: 99.9%
   - Error Budget: 10 min/week
   - P50/P95/P99 Latency

2. **User Experience**
   - Core Web Vitals distribution
   - Conversion funnel drop-off
   - Feature adoption

3. **Business Metrics**
   - DAU/MAU
   - Revenue per user
   - Support tickets

## Alerting Rules

```yaml
# Example Prometheus alerting
groups:
  - name: mansoni
    rules:
      - alert: HighErrorRate
        expr: rate(http_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected

      - alert: SlowAPI
        expr: histogram_quantile(0.95, api_latency) > 2
        for: 10m
        labels:
          severity: warning
```

## For Supabase

Monitor via Supabase Dashboard:
- Database metrics
- Auth usage
- Storage usage
- Edge function invocations
- Realtime connections

## For Mansoni

Current stack:
- Sentry (errors + performance)
- Supabase Dashboard (backend metrics)
- Vercel Analytics (frontend performance)
