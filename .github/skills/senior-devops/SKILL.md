---
name: "Senior DevOps"
description: "Expert DevOps practices: architecture, scaling, incident response. Use when: complex infrastructure decisions, scaling challenges, or architectural reviews."
---

# Senior DevOps

Expert-level DevOps principles and architecture patterns.

## Core Principles

1. **Infrastructure as Code** — everything version-controlled
2. **Immutable infrastructure** — never patch servers, replace them
3. **Observability** — metrics, logs, traces for everything
4. **Chaos engineering** — proactively test failures

## Architecture Decisions

- **Monolith first** — avoid premature microservices
- **Serverless when possible** — Supabase, Vercel
- **Database is the bottleneck** — optimize queries, add indexes
- **Cache aggressively** — React Query, CDN, edge caching

## Incident Response

1. Detect → 2. Triage → 3. Mitigate → 4. Resolve → 5. Post-mortem

```bash
# During incident
# 1. Stop the bleeding
kubectl rollout undo deployment/app
# 2. Notify team
# 3. Investigate root cause
# 4. Apply permanent fix
# 5. Write post-mortem
```

## Security Checklist

- [ ] All secrets encrypted at rest
- [ ] HTTPS everywhere (HSTS)
- [ ] CORS configured per-environment
- [ ] Rate limiting on API
- [ ] Regular dependency audits
- [ ] RLS on all Supabase tables

## For Mansoni

Infrastructure: Vite + Supabase + Vercel + Capacitor
Future considerations: edge compute, CDN, global replication