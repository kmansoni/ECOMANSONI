# Phase 1 Incident Playbooks

**Date:** 2026-02-24  
**Scope:** Phase 1 features (Trust, Moderation, Discovery, Ranking v2)  
**Dependencies:** [Phase 0 Observability (P0F)](../specs/phase0/P0F-observability-slo-killswitch.md)

---

## Overview

This document provides incident response playbooks for Phase 1 features. Each playbook includes:
- **Trigger**: Metric threshold or alert that indicates an incident
- **Symptoms**: Observable user-facing or system-level issues
- **Runbook**: Step-by-step mitigation and investigation steps
- **Prevention**: Long-term fixes to prevent recurrence

**Severity Levels:**
- **P0 (Critical)**: Product unavailable or major degradation affecting all users
- **P1 (High)**: Significant degradation affecting subset of users
- **P2 (Medium)**: Partial degradation, limited impact
- **P3 (Low)**: Minor bugs, no user impact

---

## Playbook 1: Rate Limit Spike (P1)

**EPIC:** L (Trust & Rate Limiting)  
**Trigger:** `rate_limit_trigger_rate` > 10% for 5 minutes  
**Guardrail:** `rate_limit_spike` → auto-rollback `rate_limit_enforcement` flag

### Symptoms
- High rate of 429 responses across multiple endpoints
- User complaints: "Too many requests, try again later"
- `rate_limit_audits` table growing >1000 rows/min
- Tier B/C users affected (legitimate traffic)

### Immediate Mitigation (Auto-rollback)
Guardrail should auto-disable `rate_limit_enforcement` flag:
```sql
-- Verify auto-rollback happened
SELECT flag_name, enabled, rollout_percentage, updated_at
FROM feature_flags
WHERE flag_name = 'rate_limit_enforcement';
```

**Expected:** `enabled = false, rollout_percentage = 0`

If auto-rollback didn't trigger:
```sql
-- Manual rollback
UPDATE feature_flags
SET enabled = false, rollout_percentage = 0, updated_at = now()
WHERE flag_name = 'rate_limit_enforcement';
```

### Investigation Steps

**1. Check rate limit audit patterns:**
```sql
SELECT
  action,
  tier,
  allowed,
  COUNT(*) as events,
  COUNT(DISTINCT actor_id) as unique_users
FROM rate_limit_audits
WHERE created_at > now() - interval '10 minutes'
GROUP BY action, tier, allowed
ORDER BY events DESC;
```

**2. Identify spike pattern:**
- **Specific action spike** (e.g., `send_message`): Possible attack or viral content
- **Specific tier spike** (e.g., Tier D): Bot/scraper attack
- **Global spike**: Bug in rate limit config (limits too restrictive)

**3. Check rate limit configs:**
```sql
SELECT tier, action, limit_value, window_seconds, enabled
FROM rate_limit_configs
WHERE enabled = true
ORDER BY tier, action;
```

**4. Check trust score distribution:**
```sql
SELECT risk_tier, COUNT(*) as user_count
FROM trust_profiles
GROUP BY risk_tier
ORDER BY risk_tier;
```

### Resolution

**Scenario A: Legitimate traffic spike (viral content)**
- Increase rate limits for Tier B/C:
  ```sql
  UPDATE rate_limit_configs
  SET limit_value = limit_value * 2
  WHERE tier IN ('B', 'C') AND action = 'send_message';
  ```
- Re-enable at 10% canary:
  ```sql
  UPDATE feature_flags
  SET enabled = true, rollout_percentage = 10
  WHERE flag_name = 'rate_limit_enforcement';
  ```
- Monitor for 30 minutes, ramp to 50% → 100%

**Scenario B: Bot attack (Tier D spike)**
- Tighten Tier D limits:
  ```sql
  UPDATE rate_limit_configs
  SET limit_value = limit_value / 2
  WHERE tier = 'D';
  ```
- Re-enable at 1% canary, monitor closely

**Scenario C: Bug in rate limit config**
- Fix config (e.g., `limit_value = 0` typo):
  ```sql
  UPDATE rate_limit_configs
  SET limit_value = 30
  WHERE action = 'send_message' AND tier = 'B';
  ```
- Re-enable at 10% canary

### Prevention
- Add monitoring alert for `rate_limit_configs` changes (config audit log)
- Add gradual config rollout (test on 1% before 100%)
- Add unit tests for rate limit configs (no zero values, tier ordering)

---

## Playbook 2: Feed Latency Spike (P0)

**EPIC:** M (Observability) / D (Ranking)  
**Trigger:** `feed_page_latency_ms` P95 > 2000ms for 5 minutes  
**Guardrail:** `feed_latency_critical` → auto-rollback `personalized_ranking` flag

### Symptoms
- Feed loading >2s (spinner visible)
- Timeouts (504 Gateway Timeout)
- User session drop (users leave app)

### Immediate Mitigation (Auto-rollback)
Guardrail should auto-disable `personalized_ranking` → fallback to recency:
```sql
-- Verify auto-rollback
SELECT flag_name, enabled, rollout_percentage
FROM feature_flags
WHERE flag_name = 'personalized_ranking';
```

**Expected:** `enabled = false` → feed switches to recency-only mode

If auto-rollback didn't trigger:
```sql
-- Manual rollback
UPDATE feature_flags
SET enabled = false, rollout_percentage = 0
WHERE flag_name = 'personalized_ranking';
```

### Investigation Steps

**1. Check database load:**
```sql
SELECT
  pid,
  usename,
  application_name,
  state,
  query_start,
  state_change,
  LEFT(query, 100) as query_preview
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY query_start ASC;
```

**2. Check slow queries (if available):**
```sql
-- Supabase: check pg_stat_statements extension
SELECT
  calls,
  mean_exec_time,
  max_exec_time,
  LEFT(query, 100) as query_preview
FROM pg_stat_statements
WHERE query LIKE '%reels_cache_v2%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**3. Check reels_cache_v2 table size:**
```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename = 'reels_cache_v2';
```

**4. Check indexes:**
```sql
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'reels_cache_v2';
```

### Resolution

**Scenario A: Missing index**
- Add index:
  ```sql
  CREATE INDEX CONCURRENTLY idx_reels_cache_viewer_score
  ON reels_cache_v2(viewer_id, weighted_score DESC);
  ```
- Re-enable ranking at 10% canary

**Scenario B: Database resource limits**
- Upgrade Supabase plan (more CPU/RAM)
- Add read replica (if Supabase supports)
- Optimize query (reduce JSONB operations)

**Scenario C: Ranking algorithm too complex**
- Simplify scoring formula (fewer JSONB extractions)
- Pre-compute expensive signals in background job
- Re-enable at 10% canary

### Prevention
- Add index coverage monitoring (missing index alerts)
- Add query performance regression tests
- Add database resource alerts (CPU >80%, connections >80%)

---

## Playbook 3: Playback Failure Spike (P0)

**EPIC:** Phase 0 (Playback)  
**Trigger:** `playback_start_failure_rate` > 5% for 5 minutes  
**Guardrail:** `playback_failure_critical` → alert only (no auto-rollback)

### Symptoms
- Videos won't play (black screen)
- "Video unavailable" error message
- High bounce rate (users skip non-playing reels)

### Investigation Steps

**1. Check CDN/Storage health:**
- Visit Supabase Status page: https://status.supabase.com
- Check storage bucket access:
  ```bash
  curl -I https://lfkbgnbjxskspsownvjm.supabase.co/storage/v1/object/public/reels/test-reel.mp4
  ```

**2. Check recent reels for broken URLs:**
```sql
SELECT
  id,
  video_url,
  status,
  created_at
FROM reels
WHERE created_at > now() - interval '1 hour'
  AND status = 'published'
ORDER BY created_at DESC
LIMIT 20;
```

**3. Test video URL patterns:**
```bash
# Replace with actual video_url from query above
curl -I "https://lfkbgnbjxskspsownvjm.supabase.co/storage/v1/object/public/reels/..."
```

**4. Check playback events:**
```sql
SELECT
  event_type,
  COUNT(*) as count
FROM playback_events
WHERE ts > now() - interval '1 hour'
GROUP BY event_type
ORDER BY count DESC;
```

### Resolution

**Scenario A: CDN outage**
- Wait for Supabase to restore service
- Communicate to users (status banner: "Video service temporarily unavailable")
- No code changes needed

**Scenario B: Broken video URLs (encoding issue)**
- Identify broken pattern:
  ```sql
  SELECT DISTINCT LEFT(video_url, 100) as url_pattern, COUNT(*)
  FROM reels
  WHERE created_at > now() - interval '1 hour'
  GROUP BY url_pattern;
  ```
- Re-process broken reels:
  ```sql
  UPDATE reels
  SET status = 'processing'
  WHERE video_url LIKE '%broken-pattern%';
  ```

**Scenario C: Storage permissions issue**
- Check RLS policies on storage.objects table
- Verify bucket is public:
  ```sql
  SELECT bucket_id, public
  FROM storage.buckets
  WHERE bucket_id = 'reels';
  ```
- Fix permissions if needed

### Prevention
- Add pre-flight check before adding reel to feed (test video URL accessibility)
- Add storage health check endpoint (synthetic monitoring)
- Add video URL validation in create workflow

---

## Playbook 4: Bot Session Anomaly (P1)

**EPIC:** L (Trust & Rate Limiting)  
**Trigger:** `suspected_bot_session_rate` > 20% for 10 minutes  
**Guardrail:** `bot_session_anomaly` → alert only

### Symptoms
- High rate_limit_audits for new users
- Trust tier D spike
- Unusual traffic patterns (same user agent, IP spam)
- High signup rate from single IP range

### Investigation Steps

**1. Check trust tier distribution:**
```sql
SELECT risk_tier, COUNT(*) as user_count
FROM trust_profiles
GROUP BY risk_tier
ORDER BY risk_tier;
```

**2. Check recent risk events:**
```sql
SELECT
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT actor_id) as unique_actors
FROM risk_events
WHERE ts > now() - interval '1 hour'
GROUP BY event_type
ORDER BY event_count DESC
LIMIT 10;
```

**3. Check signup patterns (if available):**
```sql
SELECT
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as signups
FROM auth.users
WHERE created_at > now() - interval '1 hour'
GROUP BY minute
ORDER BY minute DESC;
```

**4. Check delegation token usage:**
```sql
SELECT
  action,
  COUNT(*) as requests
FROM delegation_tokens
WHERE created_at > now() - interval '1 hour'
GROUP BY action
ORDER BY requests DESC;
```

### Resolution

**Scenario A: Coordinated bot attack**
- Tighten Tier D rate limits:
  ```sql
  UPDATE rate_limit_configs
  SET limit_value = GREATEST(1, limit_value / 4)
  WHERE tier = 'D';
  ```
- Block suspicious IPs (manual, via firewall or Supabase dashboard)
- Invalidate delegation tokens:
  ```sql
  DELETE FROM delegation_tokens
  WHERE actor_id IN (
    SELECT actor_id FROM trust_profiles WHERE risk_tier = 'D'
  );
  ```

**Scenario B: Compromised API key**
- Rotate Supabase anon key (emergency)
- Investigate access logs for leaked key usage
- Deploy new frontend with new anon key

**Scenario C: Legitimate traffic (marketing campaign)**
- Create temporary rate limit override for campaign:
  ```sql
  INSERT INTO rate_limit_configs (scope, actor_type, actor_id, action, algo, limit_value, window_seconds)
  VALUES ('actor_override', 'user', 'campaign-user-id', 'send_message', 'token_bucket', 100, 60);
  ```

### Prevention
- Add IP-based rate limiting (future Phase 2)
- Add CAPTCHA for signup (if bot problem persists)
- Add anomaly detection ML model (Phase 3)
- Add API key rotation schedule (quarterly)

---

## Playbook 5: Moderation Queue Lag (P1)

**EPIC:** K (Moderation v1)  
**Trigger:** Moderation queue lag > 2 hours (future metric)  
**Guardrail:** TBD (depends on EPIC K implementation)

### Symptoms
- Reported content not reviewed within SLA
- Toxic content visible in feed
- User complaints about reports being ignored

### Investigation Steps

**1. Check moderation queue size (future):**
```sql
-- Placeholder: depends on EPIC K schema
SELECT
  queue_name,
  COUNT(*) as queue_depth,
  AVG(EXTRACT(EPOCH FROM (now() - created_at))) as avg_wait_seconds
FROM moderation_queue
WHERE status = 'pending'
GROUP BY queue_name;
```

**2. Check moderator capacity:**
```sql
-- Placeholder: depends on EPIC K schema
SELECT
  moderator_id,
  COUNT(*) as reviews_today
FROM moderation_actions
WHERE created_at > now() - interval '24 hours'
GROUP BY moderator_id;
```

### Resolution (Placeholder)
- Increase moderator capacity (hire more, or increase AI assist priority)
- Prioritize high-severity reports
- Temporarily disable low-priority review categories

### Prevention
- Add queue depth monitoring
- Add SLA alerts (P1 if queue lag > 2h, P0 if > 6h)
- Add auto-escalation for high-severity reports

---

## Playbook 6: Discovery Surface Errors (P2)

**EPIC:** G (Discovery)  
**Trigger:** `discovery_error_rate` > 5% (future metric)  
**Guardrail:** Auto-disable `discovery_surface` flag

### Symptoms
- Explore tab shows empty state
- Discovery recommendations not personalized (all users see same content)
- Error toast: "Unable to load recommendations"

### Resolution (Placeholder)
- Disable discovery surface:
  ```sql
  UPDATE feature_flags
  SET enabled = false
  WHERE flag_name = 'discovery_surface';
  ```
- Investigate candidate source failures (trending, topic clusters)
- Fix ranking issues in discovery pipeline

---

## General Incident Response Workflow

### 1. Detect
- Automated alert (Supabase metrics, guardrail breach)
- User report (support ticket, social media)
- Internal testing

### 2. Assess Severity
- P0: Product down, all users affected → immediate response
- P1: Significant degradation, subset of users → respond within 30 min
- P2: Partial degradation → respond within 2 hours
- P3: Minor bug → respond within 1 business day

### 3. Mitigate
- Check if auto-rollback triggered
- Manual rollback if needed (disable feature flag)
- Communicate to users (status banner, social media)

### 4. Investigate
- Follow playbook steps
- Collect evidence (query results, logs, screenshots)
- Identify root cause

### 5. Resolve
- Apply fix (code, config, infrastructure)
- Test in staging/canary
- Gradual rollout (1% → 10% → 50% → 100%)

### 6. Document
- Write postmortem (timeline, root cause, prevention tasks)
- Update playbook if new scenario discovered
- Share learnings with team

---

## Postmortem Template

```markdown
# Postmortem: [Incident Title]

**Date:** YYYY-MM-DD  
**Severity:** P0/P1/P2/P3  
**Duration:** X hours Y minutes  
**Impact:** X% of users affected, Y requests failed

## What Happened?
[Brief description of incident]

## Timeline
- HH:MM - Alert triggered (metric/guardrail)
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Mitigation applied
- HH:MM - Service restored
- HH:MM - Postmortem completed

## Root Cause
[Technical explanation of what caused the incident]

## Impact
- User-facing: [e.g., "Feed loading failed for 10% of users"]
- System: [e.g., "Database CPU spiked to 95%"]
- Business: [e.g., "Estimated 1000 lost sessions"]

## Detection
- How was the incident detected? (alert, user report, etc.)
- Was detection timely? (should we improve alerts?)

## Mitigation
- What actions were taken to restore service?
- Did auto-rollback work as expected?

## Prevention
- [ ] Task 1: [Owner] [Due date]
- [ ] Task 2: [Owner] [Due date]

## Lessons Learned
- What went well?
- What could be improved?
```

---

## Emergency Contacts

**On-Call Rotation:** TBD  
**Supabase Support:** support@supabase.io  
**Escalation:** [Product Owner Email]

---

## Appendix: Quick Reference SQL

### Disable All Features (Emergency Shutdown)
```sql
UPDATE feature_flags
SET enabled = false, rollout_percentage = 0
WHERE flag_name IN (
  'rate_limit_enforcement',
  'personalized_ranking',
  'discovery_surface',
  'hashtag_trends'
);
```

### Check All Active Guardrail Breaches
```sql
SELECT * FROM get_active_guardrail_breaches_v1(15);
```

### Check SLO Status (All Domains)
```sql
SELECT * FROM get_slo_status_v1(NULL, 60);
```

### Check Recent Auto-Rollbacks
```sql
SELECT
  ts,
  value,
  labels->>'guardrail' as guardrail,
  labels->>'flag' as flag,
  labels->>'metric' as metric
FROM metrics_samples
WHERE metric_name = 'guardrail_auto_rollback'
  AND ts > now() - interval '24 hours'
ORDER BY ts DESC;
```
