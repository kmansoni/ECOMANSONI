# Phase 1 EPIC M — Observability v1 Implementation Spec

**Date:** 2026-02-24  
**Status:** Implementation Ready  
**Dependencies:** Phase 0 EPIC F (P0F), Phase 1 EPIC L (feature_flags table)

---

## 0) Overview

**Goal:** Extend Phase 0 observability baseline with guardrails, auto-rollback, and kill-switches for Phase 1 features (Trust, Moderation, Discovery, Ranking v2).

**Scope:** 
- M1. SLO/Guardrails registry expansion (metrics + thresholds)
- M2. Kill-switch coverage (disable trust enforcement, disable discovery, strict safety mode)
- M3. Incident playbooks (Phase 1 scenarios: trust spike, moderation lag, ranking degradation)

**Non-Goals (deferred to later phases):**
- Real-time anomaly detection ML models
- Multi-region observability
- Advanced distributed tracing (OpenTelemetry)

---

## 1) Database Schema

### 1.1 Metrics Registry

**Purpose:** Source of truth for all observable metrics with metadata (thresholds, alert contacts, SLO targets).

**Migration:** `20260224020007_phase1_observability_schema.sql`

```sql
-- metrics_registry: catalog of all observable metrics
CREATE TABLE IF NOT EXISTS public.metrics_registry (
  id BIGSERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL UNIQUE,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'summary')),
  description TEXT NOT NULL,
  unit TEXT, -- 'ms', 'percent', 'count', 'bytes'
  phase TEXT NOT NULL CHECK (phase IN ('phase0', 'phase1', 'phase2', 'phase3', 'phase4')),
  epic TEXT, -- 'L', 'K', 'M', 'I', 'G', 'H', 'J', NULL for phase0
  domain TEXT NOT NULL, -- 'feed', 'playback', 'events', 'trust', 'moderation', 'discovery', 'ranking'
  slo_target JSONB, -- e.g. {"p95": 800, "p99": 1500} for latency, {"threshold": 0.01} for error_rate
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_registry_domain_enabled ON metrics_registry(domain, enabled);
CREATE INDEX idx_metrics_registry_phase_epic ON metrics_registry(phase, epic);

-- Example seed data (Phase 0 + Phase 1 EPIC L)
INSERT INTO metrics_registry (metric_name, metric_type, description, unit, phase, epic, domain, slo_target) VALUES
  -- Phase 0 (existing from P0F)
  ('feed_page_latency_ms', 'histogram', 'Feed page response time', 'ms', 'phase0', NULL, 'feed', '{"p50": 250, "p95": 800}'),
  ('feed_error_rate', 'gauge', 'Feed 5xx error rate', 'percent', 'phase0', NULL, 'feed', '{"threshold": 0.005}'),
  ('playback_start_failure_rate', 'gauge', 'Playback start failure rate', 'percent', 'phase0', NULL, 'playback', '{"threshold": 0.01}'),
  ('event_dedup_hit_rate', 'gauge', 'Event deduplication hit rate', 'percent', 'phase0', NULL, 'events', '{"max": 0.20}'),
  
  -- Phase 1 EPIC L (Trust & Rate Limiting)
  ('rate_limit_trigger_rate', 'gauge', 'Rate limit 429 response rate', 'percent', 'phase1', 'L', 'trust', '{"max": 0.05}'),
  ('rate_limit_audits_per_minute', 'counter', 'Rate limit audit events per minute', 'count', 'phase1', 'L', 'trust', NULL),
  ('trust_score_distribution', 'histogram', 'Trust score distribution', 'score', 'phase1', 'L', 'trust', NULL),
  ('suspected_bot_session_rate', 'gauge', 'Suspected bot session rate', 'percent', 'phase1', 'L', 'trust', '{"max": 0.10}')
ON CONFLICT (metric_name) DO NOTHING;

-- guardrails_config: thresholds that trigger auto-rollback
CREATE TABLE IF NOT EXISTS public.guardrails_config (
  id BIGSERIAL PRIMARY KEY,
  guardrail_name TEXT NOT NULL UNIQUE,
  metric_name TEXT NOT NULL REFERENCES metrics_registry(metric_name),
  condition TEXT NOT NULL, -- 'gt', 'lt', 'gte', 'lte', 'eq'
  threshold_value NUMERIC NOT NULL,
  window_minutes INT NOT NULL DEFAULT 5,
  severity TEXT NOT NULL CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
  action TEXT NOT NULL CHECK (action IN ('alert', 'rollback', 'kill_switch')),
  kill_switch_flag TEXT, -- reference to feature_flags.flag_name
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_guardrails_enabled ON guardrails_config(enabled, severity);
CREATE INDEX idx_guardrails_metric ON guardrails_config(metric_name);

-- Example guardrails (Phase 1 EPIC L)
INSERT INTO guardrails_config (guardrail_name, metric_name, condition, threshold_value, window_minutes, severity, action, kill_switch_flag) VALUES
  ('rate_limit_spike', 'rate_limit_trigger_rate', 'gt', 0.10, 5, 'P1', 'rollback', 'rate_limit_enforcement'),
  ('feed_latency_critical', 'feed_page_latency_ms', 'gt', 2000, 5, 'P0', 'kill_switch', 'personalized_ranking'),
  ('playback_failure_critical', 'playback_start_failure_rate', 'gt', 0.05, 5, 'P0', 'alert', NULL),
  ('bot_session_anomaly', 'suspected_bot_session_rate', 'gt', 0.20, 10, 'P1', 'alert', NULL)
ON CONFLICT (guardrail_name) DO NOTHING;

-- metrics_samples: time-series storage (simple, no external TSDB yet)
CREATE TABLE IF NOT EXISTS public.metrics_samples (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  labels JSONB NOT NULL DEFAULT '{}', -- e.g. {"tier": "B", "action": "send_message"}
  aggregation TEXT, -- 'p50', 'p95', 'p99', 'avg', 'sum', 'count'
  window_minutes INT, -- aggregation window
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_samples_metric_ts ON metrics_samples(metric_name, ts DESC);
CREATE INDEX idx_metrics_samples_ts ON metrics_samples(ts DESC);

-- Partition by date (optional, for future scaling)
-- CREATE TABLE metrics_samples_YYYYMMDD PARTITION OF metrics_samples
-- FOR VALUES FROM ('YYYY-MM-DD') TO ('YYYY-MM-DD + 1 day');

ALTER TABLE metrics_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardrails_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_samples ENABLE ROW LEVEL SECURITY;

-- RLS: service_role can read/write, authenticated can read registry only
CREATE POLICY metrics_registry_read ON metrics_registry FOR SELECT USING (true);
CREATE POLICY guardrails_config_read ON guardrails_config FOR SELECT USING (true);
CREATE POLICY metrics_samples_service_only ON metrics_samples FOR ALL USING (auth.role() = 'service_role');
```

---

### 1.2 RPC Functions

**Migration:** `20260224020008_phase1_observability_rpc.sql`

```sql
-- Evaluate guardrails for a given metric sample
CREATE OR REPLACE FUNCTION evaluate_guardrails_v1(
  p_metric_name TEXT,
  p_value NUMERIC,
  p_labels JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_triggered JSONB := '[]'::JSONB;
  v_guardrail RECORD;
  v_avg_value NUMERIC;
  v_breach BOOLEAN;
BEGIN
  -- Store sample
  INSERT INTO metrics_samples (metric_name, value, labels)
  VALUES (p_metric_name, p_value, p_labels);

  -- Check each guardrail for this metric
  FOR v_guardrail IN
    SELECT *
    FROM guardrails_config
    WHERE metric_name = p_metric_name
      AND enabled = true
  LOOP
    -- Calculate avg value in window
    SELECT AVG(value) INTO v_avg_value
    FROM metrics_samples
    WHERE metric_name = p_metric_name
      AND ts > now() - (v_guardrail.window_minutes || ' minutes')::INTERVAL;

    -- Evaluate condition
    v_breach := CASE v_guardrail.condition
      WHEN 'gt' THEN v_avg_value > v_guardrail.threshold_value
      WHEN 'lt' THEN v_avg_value < v_guardrail.threshold_value
      WHEN 'gte' THEN v_avg_value >= v_guardrail.threshold_value
      WHEN 'lte' THEN v_avg_value <= v_guardrail.threshold_value
      WHEN 'eq' THEN v_avg_value = v_guardrail.threshold_value
      ELSE false
    END;

    -- If breached, add to triggered list
    IF v_breach THEN
      v_triggered := v_triggered || jsonb_build_object(
        'guardrail_name', v_guardrail.guardrail_name,
        'severity', v_guardrail.severity,
        'action', v_guardrail.action,
        'kill_switch_flag', v_guardrail.kill_switch_flag,
        'avg_value', v_avg_value,
        'threshold', v_guardrail.threshold_value,
        'window_minutes', v_guardrail.window_minutes
      );

      -- Auto-rollback: disable feature flag if action = 'rollback' or 'kill_switch'
      IF v_guardrail.action IN ('rollback', 'kill_switch') AND v_guardrail.kill_switch_flag IS NOT NULL THEN
        UPDATE feature_flags
        SET enabled = false,
            rollout_percentage = 0,
            updated_at = now()
        WHERE flag_name = v_guardrail.kill_switch_flag;

        -- Log rollback incident
        INSERT INTO metrics_samples (metric_name, value, labels)
        VALUES ('guardrail_auto_rollback', 1, jsonb_build_object(
          'guardrail', v_guardrail.guardrail_name,
          'flag', v_guardrail.kill_switch_flag,
          'reason', 'breach'
        ));
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'metric_name', p_metric_name,
    'value', p_value,
    'triggered', v_triggered
  );
END;
$$;

-- Get current SLO status for a domain
CREATE OR REPLACE FUNCTION get_slo_status_v1(
  p_domain TEXT DEFAULT NULL,
  p_lookback_minutes INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics JSONB := '[]'::JSONB;
  v_metric RECORD;
  v_avg_value NUMERIC;
  v_p95_value NUMERIC;
  v_slo_met BOOLEAN;
BEGIN
  FOR v_metric IN
    SELECT *
    FROM metrics_registry
    WHERE (p_domain IS NULL OR domain = p_domain)
      AND enabled = true
      AND slo_target IS NOT NULL
  LOOP
    -- Calculate aggregate based on metric_type
    IF v_metric.metric_type = 'histogram' THEN
      -- Calculate P95 for histogram metrics
      SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) INTO v_p95_value
      FROM metrics_samples
      WHERE metric_name = v_metric.metric_name
        AND ts > now() - (p_lookback_minutes || ' minutes')::INTERVAL;

      v_slo_met := CASE
        WHEN v_metric.slo_target ? 'p95' THEN v_p95_value <= (v_metric.slo_target->>'p95')::NUMERIC
        ELSE true
      END;

      v_metrics := v_metrics || jsonb_build_object(
        'metric', v_metric.metric_name,
        'type', v_metric.metric_type,
        'p95', v_p95_value,
        'slo_target', v_metric.slo_target,
        'met', v_slo_met
      );
    ELSE
      -- Calculate AVG for gauge/counter metrics
      SELECT AVG(value) INTO v_avg_value
      FROM metrics_samples
      WHERE metric_name = v_metric.metric_name
        AND ts > now() - (p_lookback_minutes || ' minutes')::INTERVAL;

      v_slo_met := CASE
        WHEN v_metric.slo_target ? 'threshold' THEN v_avg_value <= (v_metric.slo_target->>'threshold')::NUMERIC
        WHEN v_metric.slo_target ? 'max' THEN v_avg_value <= (v_metric.slo_target->>'max')::NUMERIC
        ELSE true
      END;

      v_metrics := v_metrics || jsonb_build_object(
        'metric', v_metric.metric_name,
        'type', v_metric.metric_type,
        'avg', v_avg_value,
        'slo_target', v_metric.slo_target,
        'met', v_slo_met
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'domain', p_domain,
    'lookback_minutes', p_lookback_minutes,
    'metrics', v_metrics,
    'checked_at', now()
  );
END;
$$;

-- Get active guardrail breaches
CREATE OR REPLACE FUNCTION get_active_guardrail_breaches_v1(
  p_lookback_minutes INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_breaches JSONB := '[]'::JSONB;
  v_guardrail RECORD;
  v_avg_value NUMERIC;
  v_breach BOOLEAN;
BEGIN
  FOR v_guardrail IN
    SELECT *
    FROM guardrails_config
    WHERE enabled = true
  LOOP
    -- Calculate avg value in window
    SELECT AVG(value) INTO v_avg_value
    FROM metrics_samples
    WHERE metric_name = v_guardrail.metric_name
      AND ts > now() - (v_guardrail.window_minutes || ' minutes')::INTERVAL;

    -- Evaluate condition
    v_breach := CASE v_guardrail.condition
      WHEN 'gt' THEN v_avg_value > v_guardrail.threshold_value
      WHEN 'lt' THEN v_avg_value < v_guardrail.threshold_value
      WHEN 'gte' THEN v_avg_value >= v_guardrail.threshold_value
      WHEN 'lte' THEN v_avg_value <= v_guardrail.threshold_value
      WHEN 'eq' THEN v_avg_value = v_guardrail.threshold_value
      ELSE false
    END;

    IF v_breach THEN
      v_breaches := v_breaches || jsonb_build_object(
        'guardrail', v_guardrail.guardrail_name,
        'metric', v_guardrail.metric_name,
        'severity', v_guardrail.severity,
        'action', v_guardrail.action,
        'avg_value', v_avg_value,
        'threshold', v_guardrail.threshold_value,
        'breach_pct', ROUND((v_avg_value - v_guardrail.threshold_value) / v_guardrail.threshold_value * 100, 2)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'lookback_minutes', p_lookback_minutes,
    'breaches', v_breaches,
    'checked_at', now()
  );
END;
$$;
```

---

## 2) Kill-Switch Expansion

**Phase 1 kill-switches** extend the feature_flags table (already created in EPIC L).

### 2.1 New Feature Flags

**Migration:** Part of `20260224020007_phase1_observability_schema.sql`

```sql
-- Extend feature_flags with Phase 1 kill-switches
INSERT INTO feature_flags (flag_name, description, enabled, rollout_percentage) VALUES
  -- EPIC M: Observability
  ('personalized_ranking', 'Enable personalized ranking (vs recency fallback)', true, 100),
  ('discovery_surface', 'Enable Explore/Discovery UI', false, 0),
  ('hashtag_trends', 'Enable hashtag trends calculation', false, 0),
  
  -- EPIC K: Moderation
  ('moderation_queue_processing', 'Enable moderation queue processing', true, 100),
  ('appeals_flow', 'Enable user appeals for moderation decisions', false, 0),
  
  -- Strict safety mode (fallback)
  ('strict_safety_mode', 'Enable strict safety mode (disable UGC, read-only)', false, 0)
ON CONFLICT (flag_name) DO NOTHING;
```

### 2.2 Kill-Switch Middleware (Backend)

**File:** `server/observability/kill-switch.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function killSwitchMiddleware(
  flagName: string,
  fallbackMode: 'error' | 'bypass' | 'recency' = 'error'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check feature flag status
      const { data: flag, error } = await supabase
        .from('feature_flags')
        .select('enabled, rollout_percentage')
        .eq('flag_name', flagName)
        .single();

      if (error || !flag) {
        console.error(`[kill-switch] flag not found: ${flagName}`, error);
        return res.status(503).json({ error: 'service_unavailable' });
      }

      if (!flag.enabled) {
        // Feature is disabled globally
        if (fallbackMode === 'error') {
          return res.status(503).json({
            error: 'feature_disabled',
            reason: `${flagName} is currently disabled`,
          });
        } else if (fallbackMode === 'bypass') {
          // Skip this middleware, continue to next
          return next();
        } else if (fallbackMode === 'recency') {
          // Set flag for recency fallback downstream
          req.headers['x-fallback-mode'] = 'recency';
          return next();
        }
      }

      // Feature is enabled, proceed
      next();
    } catch (err) {
      console.error(`[kill-switch] error checking ${flagName}:`, err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
```

---

## 3) Incident Playbooks (M3)

**File:** `docs/ops/PHASE1_INCIDENT_PLAYBOOKS.md`

### Playbook 1: Rate Limit Spike (P1)

**Trigger:** `rate_limit_trigger_rate` > 10% for 5 minutes

**Symptoms:**
- High rate of 429 responses
- User complaints about "try again later"
- `rate_limit_audits` table growing rapidly

**Runbook:**
1. Check `get_active_guardrail_breaches_v1()` for auto-rollback status
2. Query rate_limit_audits: `SELECT action, tier, COUNT(*) FROM rate_limit_audits WHERE created_at > now() - interval '10 minutes' GROUP BY action, tier;`
3. Identify spike pattern (specific action/tier or global)
4. **Immediate mitigation:** Disable rate_limit_enforcement flag: `UPDATE feature_flags SET enabled=false WHERE flag_name='rate_limit_enforcement';`
5. Investigate: mass attack, bug in limit config, legitimate traffic spike?
6. **Resolution:** Adjust rate_limit_configs if needed, re-enable at 1% canary

**Prevention:** Add guardrail for `rate_limit_trigger_rate` > 15% → auto-rollback

---

### Playbook 2: Feed Latency Spike (P0)

**Trigger:** `feed_page_latency_ms` P95 > 2000ms for 5 minutes

**Symptoms:**
- Slow feed loading
- Timeouts
- User session drop

**Runbook:**
1. Check `get_active_guardrail_breaches_v1()` - should auto-disable `personalized_ranking`
2. Verify fallback mode activated: query feature_flags
3. Check DB load: `SELECT * FROM pg_stat_activity WHERE state = 'active';`
4. Check reels_cache_v2 table size/indexes
5. **Immediate mitigation:** If auto-rollback didn't trigger, manually disable: `UPDATE feature_flags SET enabled=false WHERE flag_name='personalized_ranking';`
6. Investigate: slow query, missing index, DB resource limits?
7. **Resolution:** Fix query/index, re-enable ranking at 1% canary

**Prevention:** Already has guardrail with auto-rollback

---

### Playbook 3: Playback Failure Spike (P0)

**Trigger:** `playback_start_failure_rate` > 5% for 5 minutes

**Symptoms:**
- Videos won't play
- Black screen
- "Video unavailable" errors

**Runbook:**
1. Check CDN/storage health (Supabase Storage status page)
2. Query recent reels: `SELECT status, COUNT(*) FROM reels WHERE created_at > now() - interval '1 hour' GROUP BY status;`
3. Check for malformed video_url patterns
4. **Immediate mitigation:** None (read-only issue, no kill-switch)
5. Investigate: CDN outage, broken video URLs, encoding issues?
6. **Resolution:** Fix video_url generation, re-process broken reels

**Prevention:** Add storage health check before returning feed

---

### Playbook 4: Bot Session Anomaly (P1)

**Trigger:** `suspected_bot_session_rate` > 20% for 10 minutes

**Symptoms:**
- High rate_limit_audits for new users
- Trust tier D spike
- Unusual traffic patterns

**Runbook:**
1. Query trust_profiles: `SELECT risk_tier, COUNT(*) FROM trust_profiles GROUP BY risk_tier;`
2. Query risk_events: `SELECT event_type, COUNT(*) FROM risk_events WHERE ts > now() - interval '1 hour' GROUP BY event_type ORDER BY COUNT(*) DESC;`
3. Identify attack vector (signup spam, API abuse, etc.)
4. **Immediate mitigation:** Tighten rate limits for tier D: `UPDATE rate_limit_configs SET limit_value = limit_value / 2 WHERE tier = 'D';`
5. Investigate: coordinated attack, compromised API key, scraper?
6. **Resolution:** Block IPs, invalidate delegation tokens, restore rate limits

**Prevention:** Add IP-based rate limiting (future enhancement)

---

## 4) Frontend Integration

### 4.1 Observability Types

**File:** `src/lib/observability/types.ts`

```typescript
export interface MetricSample {
  metric_name: string;
  value: number;
  labels?: Record<string, string | number>;
  ts?: string;
}

export interface GuardrailBreach {
  guardrail: string;
  metric: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  action: 'alert' | 'rollback' | 'kill_switch';
  avg_value: number;
  threshold: number;
  breach_pct: number;
}

export interface SLOStatus {
  domain: string;
  lookback_minutes: number;
  metrics: Array<{
    metric: string;
    type: 'counter' | 'gauge' | 'histogram' | 'summary';
    avg?: number;
    p95?: number;
    slo_target: any;
    met: boolean;
  }>;
  checked_at: string;
}
```

### 4.2 Observability API Client

**File:** `src/lib/observability/api.ts`

```typescript
import { supabase } from '@/integrations/supabase/client';
import type { GuardrailBreach, SLOStatus } from './types';

export async function getActiveGuardrailBreaches(
  lookbackMinutes: number = 15
): Promise<GuardrailBreach[]> {
  const { data, error } = await supabase.rpc(
    'get_active_guardrail_breaches_v1',
    { p_lookback_minutes: lookbackMinutes }
  );

  if (error) {
    console.error('[observability] getActiveGuardrailBreaches failed:', error);
    return [];
  }

  return data?.breaches || [];
}

export async function getSLOStatus(
  domain?: string,
  lookbackMinutes: number = 60
): Promise<SLOStatus | null> {
  const { data, error } = await supabase.rpc('get_slo_status_v1', {
    p_domain: domain || null,
    p_lookback_minutes: lookbackMinutes,
  });

  if (error) {
    console.error('[observability] getSLOStatus failed:', error);
    return null;
  }

  return data;
}

export async function reportMetric(
  metricName: string,
  value: number,
  labels?: Record<string, string | number>
): Promise<void> {
  const { error } = await supabase.rpc('evaluate_guardrails_v1', {
    p_metric_name: metricName,
    p_value: value,
    p_labels: labels || {},
  });

  if (error) {
    console.error(`[observability] reportMetric(${metricName}) failed:`, error);
  }
}
```

---

## 5) Acceptance Criteria

EPIC M считается завершённым, если:
- ✅ Database migrations deployed (metrics_registry, guardrails_config, metrics_samples)
- ✅ RPC functions work: `evaluate_guardrails_v1`, `get_slo_status_v1`, `get_active_guardrail_breaches_v1`
- ✅ Guardrails tested: breach triggers auto-rollback of feature flags
- ✅ Kill-switch middleware integrated in backend
- ✅ Frontend observability API client created
- ✅ Incident playbooks documented (Phase 1 scenarios)
- ✅ E2E test: trigger guardrail → verify auto-rollback
- ✅ Production deployment guide created

---

## 6) Rollout Plan

**Prerequisites:**
- Phase 0 EPIC F (P0F) complete
- Phase 1 EPIC L (feature_flags table) deployed

**Deployment sequence:**
1. **DB migrations** (additive, zero-downtime):
   - Deploy `20260224020007_phase1_observability_schema.sql`
   - Deploy `20260224020008_phase1_observability_rpc.sql`
   - Verify seed data: `SELECT * FROM metrics_registry;`
   - Verify guardrails: `SELECT * FROM guardrails_config;`

2. **Backend** (kill-switch middleware):
   - Deploy kill-switch.middleware.ts
   - Integrate in feed/playback/events endpoints
   - Test with disabled flags (503 responses)

3. **Frontend** (observability client):
   - Deploy observability/types.ts + api.ts
   - Optional: create admin dashboard for SLO status (future enhancement)

4. **E2E testing:**
   - Run guardrail trigger test (simulate metric spike → verify auto-rollback)
   - Run kill-switch test (disable flag → verify 503 or fallback)

5. **Production monitoring:**
   - Enable guardrails: `UPDATE guardrails_config SET enabled=true;`
   - Monitor for first 24 hours
   - Tune thresholds based on production traffic

**Emergency rollback:**
```sql
-- Disable all guardrails
UPDATE guardrails_config SET enabled = false;

-- Reset all feature flags to 100% enabled
UPDATE feature_flags SET enabled = true, rollout_percentage = 100
WHERE flag_name IN ('personalized_ranking', 'moderation_queue_processing');
```

---

## 7) Open Questions

- [ ] Do we need external TSDB (Prometheus/InfluxDB) for long-term metrics storage?
  - **Decision:** Start with PostgreSQL metrics_samples, evaluate after 1 month of production data

- [ ] Should guardrail auto-rollback send alerts (email/Slack)?
  - **Decision:** Phase 1 = database-only, Phase 2 = integrate alert channels

- [ ] Do we partition metrics_samples by date?
  - **Decision:** Not in v1, add partitioning when table > 10M rows

---

## 8) Dependencies

**Blocks:** 
- Phase 1 EPIC I (Ranking v2) - needs guardrails for safe experimentation
- Phase 1 EPIC G (Discovery) - needs kill-switch for rollback
- Phase 1 EPIC H (Trends) - needs metrics for anomaly detection

**Blocked by:** 
- Phase 1 EPIC L (feature_flags table) ✅ DONE

---

## 9) Estimated Timeline

- **M1 (SLO Registry):** 2-3 days (DB schema + RPC + seed data)
- **M2 (Kill-switch):** 1-2 days (middleware + frontend client)
- **M3 (Playbooks):** 1 day (documentation)
- **Testing + Deployment:** 1-2 days
- **Total:** 5-8 days (1-1.5 weeks)

---

**Status:** Ready for implementation  
**Next Step:** Execute Todo #2 (Database migrations)
