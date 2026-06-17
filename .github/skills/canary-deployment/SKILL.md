---
name: "Canary Deployment"
description: "Gradual traffic shifting for safe production releases. Use when: releasing features incrementally, validating changes with real users, or A/B testing infrastructure."
---

# Canary Deployment

Gradual traffic shifting to validate changes before full rollout.

## Strategy

| Phase | Traffic | Duration | Purpose |
|-------|---------|----------|---------|
| 1 | 5% | 15 min | Basic smoke test |
| 2 | 25% | 30 min | Performance check |
| 3 | 50% | 1 hour | Monitoring |
| 4 | 100% | - | Full rollout |

## Implementation

```bash
# Kubernetes canary example
kubectl patch deployment app \
  -p '{"spec":{"template":{"metadata":{"annotations":{"canary":"true"}}}}'

# Route 10% to canary
istioctl virtualservice app \
  -w 10 -r canary -d stable
```

## Metrics to Monitor

- Error rate (should stay < 0.1%)
- Latency p95 (should not increase > 20%)
- Business metrics (conversions, engagement)

## Rollback Triggers

- Error rate spike > 1%
- Latency increase > 50%
- Any P0/P1 bug in canary

## For Supabase/Frontend

Frontend canary = feature flags + environment splitting.
