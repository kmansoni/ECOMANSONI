# Phase 1 EPIC M Deployment Guide

**Date:** 2026-02-24  
**EPIC:** M - Observability v1 (SLO/Guardrails + Kill-Switch + Incident Playbooks)  
**Status:** Ready for Production Deployment

---

## Overview

Phase 1 EPIC M extends Phase 0 observability baseline with:
- **Metrics Registry**: Catalog of all observable metrics with SLO targets
- **Guardrails**: Automated thresholds that trigger alerts or auto-rollback
- **Kill-Switches**: Feature flags for graceful degradation
- **Incident Playbooks**: Step-by-step guides for common Phase 1 scenarios

**Deployment Strategy:** Database-first → Frontend → Monitoring activation

---

## Prerequisites

✅ **Phase 0 EPIC F (P0F)** deployed (observability baseline)  
✅ **Phase 1 EPIC L** deployed (feature_flags table exists)  
✅ Supabase project linked: `lfkbgnbjxskspsownvjm`  
✅ `SUPABASE_SERVICE_ROLE_KEY` available for deployment

---

## Deployment Steps

### Step 1: Database Migrations (Zero-Downtime)

**What:** Deploy observability schema and RPC functions

**Files:**
- `supabase/migrations/20260224020007_phase1_observability_schema.sql`
- `supabase/migrations/20260224020008_phase1_observability_rpc.sql`

**Command:**
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\supabase-db-push.ps1 -Yes
```

**Verification:**
1. Check migrations applied:
   ```powershell
   & "C:\Users\manso\AppData\Local\supabase-cli\v2.75.0\supabase.exe" migration list --project-ref lfkbgnbjxskspsownvjm
   ```

   **Expected output:**
   ```
   ✅ 20260224020007_phase1_observability_schema.sql
   ✅ 20260224020008_phase1_observability_rpc.sql
   ```

2. Verify tables created via Supabase Dashboard SQL Editor:
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('metrics_registry', 'guardrails_config', 'metrics_samples')
   ORDER BY table_name;
   ```

   **Expected output:**
   ```
   guardrails_config
   metrics_registry
   metrics_samples
   ```

3. Verify seed data:
   ```sql
   SELECT COUNT(*) as metrics_count FROM metrics_registry;
   SELECT COUNT(*) as guardrails_count FROM guardrails_config;
   ```

   **Expected output:**
   ```
   metrics_count: 15 (Phase 0 + Phase 1 EPIC L + EPIC M)
   guardrails_count: 6 (Phase 0 + Phase 1 EPIC L)
   ```

4. Verify RPC functions exist:
   ```sql
   SELECT routine_name
   FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name LIKE '%guardrail%' OR routine_name LIKE '%slo%'
   ORDER BY routine_name;
   ```

   **Expected output:**
   ```
   cleanup_old_metric_samples_v1
   evaluate_guardrails_v1
   get_active_guardrail_breaches_v1
   get_metric_samples_v1
   get_slo_status_v1
   ```

**Rollback (if needed):**
```sql
-- Emergency rollback: drop tables
DROP TABLE IF EXISTS metrics_samples CASCADE;
DROP TABLE IF EXISTS guardrails_config CASCADE;
DROP TABLE IF EXISTS metrics_registry CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS evaluate_guardrails_v1(TEXT, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS get_slo_status_v1(TEXT, INT);
DROP FUNCTION IF EXISTS get_active_guardrail_breaches_v1(INT);
DROP FUNCTION IF EXISTS get_metric_samples_v1(TEXT, INT, INT);
DROP FUNCTION IF EXISTS cleanup_old_metric_samples_v1(INT);
```

---

### Step 2: Frontend Deployment (Observability Client)

**What:** Deploy TypeScript types and API client

**Files:**
- `src/lib/observability/types.ts`
- `src/lib/observability/api.ts`

**Command:**
```bash
# No deployment needed - frontend already deployed via Netlify/Vercel
# Files are bundled automatically on next deployment
```

**Verification:**
1. Check TypeScript compilation:
   ```bash
   npm run build
   ```

   **Expected:** No TypeScript errors related to observability types

2. (Optional) Test locally:
   ```bash
   npm run dev
   ```

   Open browser console and test:
   ```javascript
   import { getSLOStatus } from './src/lib/observability/api.ts';
   const status = await getSLOStatus('trust', 60);
   console.log(status);
   ```

---

### Step 3: E2E Testing

**What:** Verify guardrail auto-rollback works end-to-end

**Command:**
```bash
node scripts/phase1/test-observability.mjs
```

**Expected Output:**
```
🧪 Phase 1 EPIC M: Observability E2E Tests
==========================================

🔄 Resetting test state...
✅ Test state reset

========================================
Test 1: Guardrail Breach Detection
========================================

✅ Guardrail exists: rate_limit_spike
   - Metric: rate_limit_trigger_rate
   - Threshold: 0.1
   - Action: rollback
   - Kill Switch: rate_limit_enforcement

📊 Simulating metric spike: rate_limit_trigger_rate = 0.15 (10 samples)
✅ Reported 10 samples

Initial flag state: enabled=true, rollout=100%
Final flag state: enabled=false, rollout=0%
✅ Auto-rollback triggered successfully!

📋 Auto-rollback logs (1 entries):
   1. 2026-02-24T...: {"guardrail":"rate_limit_spike","flag":"rate_limit_enforcement",...}

========================================
Test 2: SLO Status Query
========================================

📊 SLO Status for domain: trust
   Lookback: 60 minutes
   Checked at: 2026-02-24T...
   Metrics (4):
   1. ✅ rate_limit_trigger_rate (gauge)
      - Avg: 0.15
      - SLO: {"max":0.05}
      - Samples: 10
   ...

========================================
✅ All tests passed!
========================================
```

**If tests fail:**
- Check database migrations deployed correctly
- Verify `SUPABASE_SERVICE_ROLE_KEY` environment variable set
- Check Supabase Dashboard logs for RPC errors

---

### Step 4: Enable Guardrails (Production)

**What:** Enable automated guardrail evaluation

**Default State:** Guardrails are `enabled=true` in seed data, but monitoring needs activation

**Activation:**
1. Verify guardrails configuration via Supabase Dashboard:
   ```sql
   SELECT
     guardrail_name,
     metric_name,
     condition,
     threshold_value,
     window_minutes,
     severity,
     action,
     kill_switch_flag,
     enabled
   FROM guardrails_config
   ORDER BY severity, guardrail_name;
   ```

2. Guardrails are **passive** until metrics are reported. No action needed.

3. To **disable** a specific guardrail:
   ```sql
   UPDATE guardrails_config
   SET enabled = false
   WHERE guardrail_name = 'rate_limit_spike';
   ```

4. To **adjust** a threshold:
   ```sql
   UPDATE guardrails_config
   SET threshold_value = 0.15  -- Increase from 0.10 to 0.15 (15%)
   WHERE guardrail_name = 'rate_limit_spike';
   ```

**Monitoring Plan:**
- **Day 1-7:** Monitor guardrail breaches daily via:
  ```sql
  SELECT * FROM get_active_guardrail_breaches_v1(60);
  ```
- **Week 2+:** Set up automated alerts (email/Slack) for P0/P1 breaches (future enhancement)

---

### Step 5: Feature Flag Verification

**What:** Verify new kill-switches created

**Command (Supabase Dashboard SQL Editor):**
```sql
SELECT
  flag_name,
  description,
  enabled,
  rollout_percentage,
  updated_at
FROM feature_flags
WHERE flag_name IN (
  'personalized_ranking',
  'discovery_surface',
  'hashtag_trends',
  'moderation_queue_processing',
  'appeals_flow',
  'strict_safety_mode'
)
ORDER BY flag_name;
```

**Expected Output:**
```
personalized_ranking        | Enable personalized ranking...     | true  | 100 | 2026-02-24...
discovery_surface           | Enable Explore/Discovery UI        | false | 0   | 2026-02-24...
hashtag_trends              | Enable hashtag trends calculation  | false | 0   | 2026-02-24...
moderation_queue_processing | Enable moderation queue...         | true  | 100 | 2026-02-24...
appeals_flow                | Enable user appeals...             | false | 0   | 2026-02-24...
strict_safety_mode          | Enable strict safety mode...       | false | 0   | 2026-02-24...
```

**Notes:**
- `personalized_ranking`: Enabled by default (Phase 0 ranking active)
- `discovery_surface`, `hashtag_trends`, `appeals_flow`: Disabled (future EPICs)
- `strict_safety_mode`: Emergency kill-switch (disabled)

---

### Step 6: Incident Playbook Review

**What:** Familiarize team with incident response procedures

**Documentation:**
- [docs/ops/PHASE1_INCIDENT_PLAYBOOKS.md](../ops/PHASE1_INCIDENT_PLAYBOOKS.md)

**Key Playbooks:**
1. **Rate Limit Spike (P1)** - Guardrail auto-rollback → manual investigation
2. **Feed Latency Spike (P0)** - Ranking kill-switch → recency fallback
3. **Playback Failure Spike (P0)** - Alert only (CDN/storage issue)
4. **Bot Session Anomaly (P1)** - Trust tier analysis → rate limit adjustment

**Team Training:**
- [ ] Product Owner reads all playbooks
- [ ] Engineering team practices dry-run incident response
- [ ] On-call rotation established (if applicable)

---

## Post-Deployment Monitoring

### Day 1: Initial Monitoring

**1. Check guardrail breaches (every 4 hours):**
```sql
SELECT * FROM get_active_guardrail_breaches_v1(15);
```

**2. Check SLO status (daily):**
```sql
SELECT * FROM get_slo_status_v1(NULL, 1440); -- Last 24 hours
```

**3. Check auto-rollback events:**
```sql
SELECT
  ts,
  labels->>'guardrail' as guardrail,
  labels->>'flag' as flag,
  labels->>'metric' as metric
FROM metrics_samples
WHERE metric_name = 'guardrail_auto_rollback'
  AND ts > now() - interval '24 hours'
ORDER BY ts DESC;
```

**Expected:** Zero auto-rollbacks (no breaches under normal load)

### Week 1: Baseline Establishment

**1. Review metrics distribution:**
```sql
SELECT
  metric_name,
  COUNT(*) as sample_count,
  AVG(value) as avg_value,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95_value
FROM metrics_samples
WHERE ts > now() - interval '7 days'
  AND metric_name IN (
    'feed_page_latency_ms',
    'playback_start_failure_rate',
    'rate_limit_trigger_rate'
  )
GROUP BY metric_name;
```

**2. Tune guardrail thresholds if needed:**
- If `feed_page_latency_ms` P95 is 1200ms (below 2000ms threshold), consider lowering to 1500ms for tighter SLO
- If `rate_limit_trigger_rate` baseline is 2% (below 10% threshold), threshold is appropriate

### Month 1: Continuous Improvement

**1. Add new metrics for Phase 1 EPICs (K, I, G, H):**
```sql
INSERT INTO metrics_registry (metric_name, metric_type, description, unit, phase, epic, domain, slo_target)
VALUES
  ('moderation_queue_lag_minutes', 'gauge', 'Moderation queue lag', 'minutes', 'phase1', 'K', 'moderation', '{"max": 120}'),
  ('discovery_error_rate', 'gauge', 'Discovery surface error rate', 'percent', 'phase1', 'G', 'discovery', '{"threshold": 0.05}');
```

**2. Review incident playbooks against actual incidents**
- Update playbooks based on lessons learned
- Add new scenarios as they occur

---

## Acceptance Criteria

EPIC M deployment is **COMPLETE** when:
- ✅ Database migrations applied (3 tables, 5 RPC functions)
- ✅ Frontend observability client deployed (types.ts, api.ts)
- ✅ E2E tests passed (guardrail auto-rollback verified)
- ✅ Guardrails enabled and monitoring active
- ✅ Feature flags created (6 new kill-switches)
- ✅ Incident playbooks reviewed by team
- ✅ Post-deployment monitoring in place (Day 1 checks)

---

## Rollback Plan

### Emergency Rollback (if critical issue detected)

**Scenario:** Guardrails causing false positives, auto-rollback too aggressive

**Steps:**
1. **Disable all guardrails:**
   ```sql
   UPDATE guardrails_config SET enabled = false;
   ```

2. **Re-enable feature flags:**
   ```sql
   UPDATE feature_flags
   SET enabled = true, rollout_percentage = 100
   WHERE flag_name IN ('rate_limit_enforcement', 'personalized_ranking');
   ```

3. **Stop metric reporting (frontend):**
   - Comment out `reportMetric()` calls in observability/api.ts
   - Redeploy frontend

4. **Investigate root cause:**
   - Check guardrail thresholds (too tight?)
   - Check metrics_samples data (anomalies?)
   - Review auto-rollback logs

5. **Fix and re-enable:**
   - Adjust guardrail thresholds
   - Re-enable guardrails one by one
   - Monitor for 24 hours before full activation

---

## Known Issues / Limitations

**1. No External TSDB Integration**
- Metrics stored in PostgreSQL (metrics_samples table)
- Retention: 7 days by default
- **Mitigation:** Run `cleanup_old_metric_samples_v1(7)` daily via cron/scheduled function

**2. No Alerting Integration**
- Guardrail breaches logged to database only
- No email/Slack notifications
- **Mitigation:** Phase 2 enhancement - integrate with alerting service

**3. No Real-Time Dashboard**
- SLO status queried via SQL only
- No visual charts/graphs
- **Mitigation:** Future enhancement - build admin observability dashboard

**4. Single-Region Metrics**
- No multi-region aggregation
- All metrics from single Supabase instance
- **Mitigation:** Not applicable until multi-region deployment (Phase 3)

---

## Next Steps (Post-Deployment)

**Phase 1 EPIC I (Ranking v2):**
- Add guardrails for ranking metrics:
  - `creator_diversity_index`
  - `repeat_item_rate`
  - `not_interested_effectiveness`

**Phase 1 EPIC K (Moderation v1):**
- Add moderation-specific metrics:
  - `moderation_queue_lag_minutes`
  - `appeal_turnaround_hours`
  - `borderline_content_rate`

**Phase 1 EPIC G (Discovery):**
- Add discovery metrics:
  - `discovery_error_rate`
  - `explore_to_watch_rate`
  - `discovery_session_length`

**External Integrations (Phase 2):**
- Export metrics to Prometheus/Grafana
- Integrate Slack/email alerts for P0/P1 breaches
- Build admin observability dashboard

---

## Support & Escalation

**Owner:** Engineering Team  
**Incident Response:** See [PHASE1_INCIDENT_PLAYBOOKS.md](../ops/PHASE1_INCIDENT_PLAYBOOKS.md)  
**Supabase Support:** support@supabase.io  
**Production Database:** lfkbgnbjxskspsownvjm.supabase.co

---

**Deployment Checklist:**
- [ ] Database migrations applied
- [ ] E2E tests passed
- [ ] Guardrails enabled
- [ ] Feature flags verified
- [ ] Incident playbooks reviewed
- [ ] Day 1 monitoring active
- [ ] Team trained on incident response

**Status:** ✅ Ready for Production  
**Deployed:** [Date to be filled after deployment]
