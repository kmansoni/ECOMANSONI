# Canary Rollout Guide: Rate Limiting (Phase 1 EPIC L)

## Overview
This document describes how to safely enable **Phase 1 EPIC L rate limiting** in production using a **canary rollout** (gradual % deployment).

**What is canary rollout?**
- Start at **1%** (only 1% of users see rate limiting)
- Monitor metrics (429 count, false positives)
- Gradually increase to **10% → 25% → 50% → 100%**
- Roll back instantly if issues arise

---

## Prerequisites
- **Database**: Migration `20260224130000_phase1_l_feature_flags.sql` deployed
- **Backend**: `dm-send-delegated`, `media-upload-authorize` Edge Functions deployed with `trust-lite.ts` canary check
- **Monitoring**: Access to Supabase Dashboard → Logs, Database → `rate_limit_audits` table

---

## Step 1: Initial State (Disabled)
By default, `rate_limit_enforcement` flag is **disabled** (`enabled=false`, `rollout_percentage=0`).

Verify in **Supabase Dashboard → SQL Editor**:
\`\`\`sql
select * from public.feature_flags where flag_name = 'rate_limit_enforcement';
\`\`\`

Expected:
\`\`\`
flag_name               | enabled | rollout_percentage
rate_limit_enforcement  | false   | 0
\`\`\`

---

## Step 2: Enable at 1% Rollout

### SQL (Supabase Dashboard → SQL Editor)
\`\`\`sql
update public.feature_flags
set enabled = true, rollout_percentage = 1
where flag_name = 'rate_limit_enforcement';
\`\`\`

### What this does:
- **1% of users** (deterministic hash-based bucketing) will experience rate limiting
- **99% of users** pass through without enforcement (fail-open)

---

## Step 3: Monitor Metrics

### Check 429 Rate (Supabase Dashboard → Functions → Logs)
Search for `status: 429` in `dm-send-delegated` / `media-upload-authorize` logs.

### Check Rate Limit Audits
\`\`\`sql
select
  action,
  allowed,
  count(*) as event_count
from public.rate_limit_audits
where created_at > now() - interval '1 hour'
group by action, allowed
order by action, allowed desc;
\`\`\`

Expected output:
\`\`\`
action         | allowed | event_count
media_upload   | true    | 450
media_upload   | false   | 12  -- 429 blocked
send_message   | true    | 230
\`\`\`

### Acceptable Metrics:
- **False positive rate < 1%** (legitimate users blocked by mistake)
- **429 rate < 5%** (most users within limits)
- **No support tickets** about "can't upload photos"

---

## Step 4: Gradual Ramp-Up

If **Step 3 metrics are acceptable**, increase rollout:

### 1% → 10%
\`\`\`sql
update public.feature_flags
set rollout_percentage = 10
where flag_name = 'rate_limit_enforcement';
\`\`\`

Wait **1 hour**, re-check metrics.

### 10% → 25%
\`\`\`sql
update public.feature_flags
set rollout_percentage = 25
where flag_name = 'rate_limit_enforcement';
\`\`\`

Wait **2 hours**, re-check metrics.

### 25% → 50%
\`\`\`sql
update public.feature_flags
set rollout_percentage = 50
where flag_name = 'rate_limit_enforcement';
\`\`\`

Wait **4 hours**, re-check metrics.

### 50% → 100% (Full Rollout)
\`\`\`sql
update public.feature_flags
set rollout_percentage = 100
where flag_name = 'rate_limit_enforcement';
\`\`\`

**Congratulations!** Rate limiting is now active for 100% of users.

---

## Step 5: Rollback (Emergency Disable)

If you observe:
- **High false positive rate** (legitimate users blocked)
- **Support tickets spike** ("can't send messages")
- **Unexpected 429 errors** in critical flows

**Immediately disable**:
\`\`\`sql
update public.feature_flags
set enabled = false, rollout_percentage = 0
where flag_name = 'rate_limit_enforcement';
\`\`\`

Backend will **fail-open** (allow all requests) within **1 second** (Edge Function reads DB on each request).

---

## Step 6: Adjust Limits (If Needed)

If **rollback was due to too-strict limits** (e.g., Tier B `media_upload` 5/60s too low for power users):

1. **Disable flag** (Step 5)
2. **Update config**:
\`\`\`sql
update public.rate_limit_configs
set limit_value = 10, window_seconds = 60
where scope = 'tier' and tier = 'B' and action = 'media_upload';
\`\`\`
3. **Re-enable at 1%** (Step 2)
4. **Repeat ramp-up** (Step 4)

---

## Testing Canary Logic (SQL Smoke Test)

Run `scripts/phase1/test-canary-rollout.sql` in **Supabase Dashboard → SQL Editor**:

1. Verify `rollout_percentage=0` → all users disabled
2. Enable at 50%, verify ~50% of random UUIDs enabled
3. Enable at 100%, verify all users enabled
4. Verify deterministic bucketing (same user_id = same enabled/disabled)

Expected output:
\`\`\`
enabled_count | total_count | enabled_percentage
500           | 1000        | 50.00
\`\`\`

---

## Production Checklist

| Step | Status | Timestamp | Operator | Notes |
|------|--------|-----------|----------|-------|
| Migration deployed | ☑️ | 2026-02-24 13:00 UTC | AI | `20260224130000_phase1_l_feature_flags.sql` |
| Edge Functions deployed | ☑️ | 2026-02-24 13:05 UTC | AI | `dm-send-delegated`, `media-upload-authorize` |
| Enabled at 1% | ☐ | TBD | Human | Monitor for 1 hour |
| Ramped to 10% | ☐ | TBD | Human | Monitor for 1 hour |
| Ramped to 25% | ☐ | TBD | Human | Monitor for 2 hours |
| Ramped to 50% | ☐ | TBD | Human | Monitor for 4 hours |
| Ramped to 100% | ☐ | TBD | Human | Full production rollout |

---

## Monitoring Queries

### Top 10 rate-limited actors (last 24h)
\`\`\`sql
select
  actor_type,
  actor_id,
  action,
  count(*) filter (where allowed = false) as blocked_count,
  count(*) filter (where allowed = true) as allowed_count
from public.rate_limit_audits
where created_at > now() - interval '24 hours'
group by actor_type, actor_id, action
having count(*) filter (where allowed = false) > 0
order by blocked_count desc
limit 10;
\`\`\`

### 429 rate by hour
\`\`\`sql
select
  date_trunc('hour', created_at) as hour,
  action,
  count(*) filter (where allowed = false) as blocked_count,
  count(*) as total_count,
  round(100.0 * count(*) filter (where allowed = false) / count(*), 2) as block_rate_pct
from public.rate_limit_audits
where created_at > now() - interval '24 hours'
group by date_trunc('hour', created_at), action
order by hour desc, action;
\`\`\`

---

## FAQ

**Q: What if I want to disable rate limiting for a specific user (VIP, support testing)?**  
A: Use trust tier override:
\`\`\`sql
-- Upgrade user to Tier A (trusted, higher limits)
insert into public.trust_profiles (actor_type, actor_id, trust_score, risk_tier, enforcement_level)
values ('user', '<user_uuid>', 95.0, 'A', 'E1')
on conflict (actor_type, actor_id) do update
set risk_tier = 'A', trust_score = 95.0, enforcement_level = 'E1';
\`\`\`

**Q: Can I rollout different actions at different %?**  
A: Not yet. Current implementation uses single global `rate_limit_enforcement` flag. To do per-action rollout, modify `feature_flags.config` JSON to include action-specific `rollout_percentage` and update `is_feature_enabled_for_user_v1` to parse it.

**Q: What if backend caching causes stale flag state?**  
A: Edge Functions read `feature_flags` on **every request** (no caching). Changes take effect within **1 second**.

---

## Next Steps (Post-100% Rollout)

1. **Monitor for 1 week** → look for edge cases, false positives
2. **Tune limits** based on `rate_limit_audits` data (increase limits if legitimate users blocked)
3. **Expand to more actions**: `create_post`, `follow`, `search` (currently only `send_message`, `media_upload` enforced)
4. **ML-based trust scoring** (Phase 2 roadmap) → dynamic tier assignment based on behavior

---

## References
- **Migration**: `supabase/migrations/20260224130000_phase1_l_feature_flags.sql`
- **Backend**: `supabase/functions/_shared/trust-lite.ts`
- **Test Script**: `scripts/phase1/test-canary-rollout.sql`
- **Rate Limit Configs**: `supabase/migrations/20260224020010_phase1_l_tier_limits_seed.sql`
