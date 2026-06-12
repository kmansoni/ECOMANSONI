# 🚀 Phase 1 EPIC L: Production Canary Rollout — READY TO ENABLE

## ✅ Deployment Status

| Component | Status |
|-----------|--------|
| Database migrations | ✅ Deployed (4 migrations pushed) |
| Edge Functions | ✅ Deployed (`dm-send-delegated`, `media-upload-authorize` with canary check) |
| Frontend | ✅ Built (429 handling, rate limit UI) |
| E2E tests | ✅ Passed (429 triggered on 6th request) |
| Feature flag | ⏸️ **DISABLED** (awaiting activation) |

---

## 🎯 Next Action: Enable 1% Canary Rollout

### Step 1: Open Supabase SQL Editor

**URL**: https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/sql/new

---

### Step 2: Execute SQL

```sql
-- ============================================================
-- Phase 1 EPIC L: Enable rate limiting for 1% of users
-- ============================================================

-- 1. Enable canary rollout at 1%
update public.feature_flags
set enabled = true, 
    rollout_percentage = 1, 
    updated_at = now()
where flag_name = 'rate_limit_enforcement';

-- 2. Verify update
select 
  flag_name,
  enabled,
  rollout_percentage,
  config,
  updated_at
from public.feature_flags 
where flag_name = 'rate_limit_enforcement';
```

**Expected output**:
```
flag_name               | enabled | rollout_percentage | updated_at
rate_limit_enforcement  | true    | 1                  | 2026-02-24 14:30:00+00
```

✅ **After execution**: 1% of users (deterministic hash-based) will experience rate limiting.

---

## 📊 Step 3: Monitor for 1 Hour

### Query 1: Top 10 rate-limited users

```sql
select
  actor_type,
  actor_id,
  action,
  count(*) filter (where allowed = false) as blocked_count,
  count(*) filter (where allowed = true) as allowed_count,
  round(100.0 * count(*) filter (where allowed = false) / count(*), 2) as block_rate_pct
from public.rate_limit_audits
where created_at > now() - interval '1 hour'
group by actor_type, actor_id, action
having count(*) filter (where allowed = false) > 0
order by blocked_count desc
limit 10;
```

### Query 2: 429 rate by action

```sql
select
  action,
  count(*) filter (where allowed = false) as blocked,
  count(*) as total,
  round(100.0 * count(*) filter (where allowed = false) / count(*), 2) as block_rate_pct
from public.rate_limit_audits
where created_at > now() - interval '1 hour'
group by action
order by action;
```

### Query 3: Recent 429 events (last 10)

```sql
select
  audit_id,
  actor_type,
  actor_id,
  action,
  allowed,
  created_at
from public.rate_limit_audits
where allowed = false
  and created_at > now() - interval '1 hour'
order by created_at desc
limit 10;
```

---

## ✅ Acceptance Criteria (After 1 Hour)

| Metric | Target | Check |
|--------|--------|-------|
| False positive rate | < 1% | Check if legitimate users blocked |
| Total 429 rate | < 5% | Most users within tier limits |
| Support tickets | 0 | No complaints about "can't upload" |
| Edge Function errors | 0 | No 500s from rate limit code |

**If all criteria met** → Proceed to 10% rollout (Step 4)  
**If any criteria failed** → Rollback (Step 6)

---

## 🚀 Step 4: Gradual Ramp-Up (1% → 100%)

### Ramp to 10% (after 1 hour at 1%)

```sql
update public.feature_flags
set rollout_percentage = 10, updated_at = now()
where flag_name = 'rate_limit_enforcement';
```

**Wait 1 hour, re-check metrics.**

---

### Ramp to 25% (after 1 hour at 10%)

```sql
update public.feature_flags
set rollout_percentage = 25, updated_at = now()
where flag_name = 'rate_limit_enforcement';
```

**Wait 2 hours, re-check metrics.**

---

### Ramp to 50% (after 2 hours at 25%)

```sql
update public.feature_flags
set rollout_percentage = 50, updated_at = now()
where flag_name = 'rate_limit_enforcement';
```

**Wait 4 hours, re-check metrics.**

---

### Full Rollout: 100% (after 4 hours at 50%)

```sql
update public.feature_flags
set rollout_percentage = 100, updated_at = now()
where flag_name = 'rate_limit_enforcement';
```

🎉 **Congratulations!** Rate limiting is now active for 100% of users.

---

## 🔴 Step 5: Emergency Rollback (If Needed)

If you observe:
- High false positive rate (legitimate users blocked)
- Support ticket spike ("can't send messages", "can't upload photos")
- Unexpected 429 errors in critical user flows

**Execute immediately**:

```sql
-- ============================================================
-- EMERGENCY ROLLBACK: Disable rate limiting for ALL users
-- ============================================================

update public.feature_flags
set enabled = false, 
    rollout_percentage = 0, 
    updated_at = now()
where flag_name = 'rate_limit_enforcement';

-- Verify rollback
select * from public.feature_flags where flag_name = 'rate_limit_enforcement';
```

✅ **After execution**: Backend returns to **fail-open mode** (all requests allowed) within 1 second.

---

## 🔧 Step 6: Adjust Limits (If Rollback Due to Too-Strict Limits)

Example: If Tier B `media_upload` limit (5/60s) is too low for power users:

```sql
-- Increase media_upload limit to 10/60s for Tier B
update public.rate_limit_configs
set limit_value = 10, window_seconds = 60, updated_at = now()
where scope = 'tier' 
  and tier = 'B' 
  and action = 'media_upload';

-- Verify update
select * from public.rate_limit_configs 
where tier = 'B' and action = 'media_upload';
```

After adjusting limits:
1. Disable flag (Step 5)
2. Re-enable at 1% (Step 2)
3. Repeat ramp-up (Step 4)

---

## 📈 Dashboard Links

- **SQL Editor**: https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/sql/new
- **Table Editor (feature_flags)**: https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/editor
- **Edge Function Logs**: https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/functions
- **Database Logs**: https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/logs/postgres-logs

---

## 📋 Deployment Checklist

| Step | Status | Timestamp | Notes |
|------|--------|-----------|-------|
| ✅ Database migrations deployed | Done | 2026-02-24 13:00 | All 4 migrations pushed |
| ✅ Edge Functions deployed | Done | 2026-02-24 13:05 | `dm-send-delegated`, `media-upload-authorize` |
| ✅ Frontend built | Done | 2026-02-24 13:10 | 429 handling + rate limit UI |
| ✅ E2E tests passed | Done | 2026-02-24 13:15 | 429 on 6th request verified |
| ⏸️ Enable 1% canary | **TODO** | ⏳ Awaiting | Execute SQL in Step 2 |
| ⏸️ Monitor 1 hour | Pending | ⏳ After 1% | Check metrics in Step 3 |
| ⏸️ Ramp to 10% | Pending | ⏳ After 1h | Execute SQL in Step 4 |
| ⏸️ Ramp to 25% | Pending | ⏳ After 2h | Execute SQL in Step 4 |
| ⏸️ Ramp to 50% | Pending | ⏳ After 4h | Execute SQL in Step 4 |
| ⏸️ Full rollout (100%) | Pending | ⏳ After 8h | Execute SQL in Step 4 |

---

## 🎯 Success Criteria (Final Validation at 100%)

- [x] **Code complete**: All migrations, Edge Functions, frontend deployed
- [x] **Tests passing**: E2E smoke test validates 429 enforcement
- [ ] **Production validated**: 100% rollout with < 1% false positives
- [ ] **No incidents**: Zero P0/P1 tickets related to rate limiting
- [ ] **Metrics healthy**: < 5% total 429 rate across all actions

---

## 📚 Related Documentation

- **Canary Rollout Guide**: [docs/ops/CANARY_ROLLOUT_GUIDE.md](../ops/CANARY_ROLLOUT_GUIDE.md)
- **Deployment Summary**: [docs/ops/PHASE1_EPIC_L_DEPLOYMENT_SUMMARY.md](../ops/PHASE1_EPIC_L_DEPLOYMENT_SUMMARY.md)
- **CHANGELOG**: [CHANGELOG.md](../../CHANGELOG.md)

---

## 🚦 Current State

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1 EPIC L: Trust & Rate Limiting                       │
├─────────────────────────────────────────────────────────────┤
│ Status: ✅ READY FOR PRODUCTION CANARY ROLLOUT               │
│ Feature Flag: 🔴 DISABLED (enabled=false, rollout=0%)       │
│ Next Action: Execute Step 2 SQL in Supabase Dashboard       │
└─────────────────────────────────────────────────────────────┘
```

**Copy SQL from Step 2 → Paste into Supabase Dashboard → Execute → Monitor 1 hour**

---

**Deployed by**: AI Agent  
**Deployment Date**: 2026-02-24 13:30 UTC  
**Project Ref**: `lfkbgnbjxskspsownvjm`  
**Repository**: `kmansoni/ECOMANSONI`  
**Commit**: `f0f3383` (feat: phase1-epic-l trust & rate limiting)
