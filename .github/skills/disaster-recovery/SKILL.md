---
name: "Disaster Recovery"
description: "Business continuity and data recovery procedures. Use when: planning DR scenarios, creating backup strategies, or defining RTO/RPO."
---

# Disaster Recovery

Business continuity planning and data recovery procedures.

## Key Metrics

| Metric | Target | Definition |
|---------|--------|------------|
| RTO | 4 hours | Recovery Time Objective |
| RPO | 1 hour | Recovery Point Objective |

## Backup Strategy

```bash
# Supabase: Point-in-time recovery
# Automatic - enabled by default
# Retention: 7 days (free), 30 days (pro)

# Manual backup
supabase db dump --db-url $DATABASE_URL > backup.sql

# Files storage backup
s3 sync s3://mansoni-storage s3://mansoni-backup --delete
```

## Recovery Procedures

### 1. Database Recovery
```bash
# Restore from backup
supabase db restore <backup-timestamp>
```

### 2. Storage Recovery
```bash
# Restore specific bucket
s3 cp s3://mansoni-backup/bucket/ s3://mansoni-storage/bucket/ --recursive
```

### 3. Full DR Scenario
```bash
# 1. Provision new Supabase project
# 2. Restore from PITR
# 3. Redeploy edge functions
# 4. Restore storage from S3 backup
# 5. Update DNS
# 6. Verify all services
```

## DR Runbook Template

```
INCIDENT: [Description]
SEVERITY: P0/P1/P2
STARTED: [Timestamp]

IMMEDIATE ACTIONS:
1. [ ] Notify team
2. [ ] Assess scope
3. [ ] Initiate rollback if needed

RECOVERY STEPS:
1. [ ] Step 1
2. [ ] Step 2

VERIFICATION:
- [ ] Health checks pass
- [ ] Data integrity verified
- [ ] Customers notified

POST-MORTEM: scheduled for 48h after resolution
```

## For Mansoni Platform

Critical systems requiring DR:
- User authentication (Supabase Auth)
- Chat messages (Supabase DB)
- File uploads (Supabase Storage)
- Payment data (external Stripe)
