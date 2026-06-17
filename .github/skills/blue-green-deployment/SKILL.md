---
name: "Blue-Green Deployment"
description: "Zero-downtime deployment strategy with instant rollback capability. Use when: planning production deployments, implementing blue-green infrastructure, or setting up traffic switching."
---

# Blue-Green Deployment

Zero-downtime deployment strategy using two identical environments.

## When to Use

- Production deployments requiring zero downtime
- High-availability requirements
- Database migrations with backward compatibility
- Canary testing before full rollout

## Architecture

```
┌─────────────┐     ┌─────────────┐
│   GREEN     │     │   BLUE      │
│  (current) │     │  (staging) │
└──────┬──────┘     └──────┬──────┘
       │                    │
       └────────┬─────────┘
                ▼
         ┌───────────┐
         │  Load     │
         │  Balancer │
         └───────────┘
```

## Implementation Checklist

- [ ] Two identical environments provisioned
- [ ] Database schema migrations backward-compatible
- [ ] Traffic switching mechanism configured
- [ ] Health checks for both environments
- [ ] Rollback procedure documented
- [ ] Smoke tests defined

## Rollback Procedure

```bash
# Instant rollback to green
kubectl rollout undo deployment/app-green
# OR for load balancer switch
aws elbv2 modify-listener --weights TargetGroupArn=green
```

## For Supabase

Supabase doesn't support traditional blue-green. Use feature flags instead.
