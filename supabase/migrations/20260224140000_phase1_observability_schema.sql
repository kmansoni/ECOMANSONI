-- Phase 1 EPIC M: Observability v1 - Schema
-- Purpose: SLO/Guardrails registry + metrics samples + kill-switch expansion
-- Dependencies: 20260224130000_phase1_l_feature_flags.sql (feature_flags table)

-- ============================================================================
-- 1) Metrics Registry (catalog of observable metrics)
-- ============================================================================

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

COMMENT ON TABLE metrics_registry IS 'Phase 1 EPIC M: Source of truth for all observable metrics with SLO targets';
COMMENT ON COLUMN metrics_registry.slo_target IS 'JSON: {"p95": 800} for latency, {"threshold": 0.01} for error_rate, {"max": 0.20} for hit_rate';

-- ============================================================================
-- 2) Seed Metrics (Phase 0 + Phase 1 EPIC L)
-- ============================================================================

INSERT INTO metrics_registry (metric_name, metric_type, description, unit, phase, epic, domain, slo_target) VALUES
  -- Phase 0 (existing from P0F)
  ('feed_page_latency_ms', 'histogram', 'Feed page response time', 'ms', 'phase0', NULL, 'feed', '{"p50": 250, "p95": 800}'),
  ('feed_error_rate', 'gauge', 'Feed 5xx error rate', 'percent', 'phase0', NULL, 'feed', '{"threshold": 0.005}'),
  ('empty_first_page_rate', 'gauge', 'Empty first page rate', 'percent', 'phase0', NULL, 'feed', '{"max": 0.01}'),
  ('playback_start_failure_rate', 'gauge', 'Playback start failure rate', 'percent', 'phase0', NULL, 'playback', '{"threshold": 0.01}'),
  ('first_frame_time_ms', 'histogram', 'First frame time', 'ms', 'phase0', NULL, 'playback', '{"p50": 400, "p95": 1200}'),
  ('event_dedup_hit_rate', 'gauge', 'Event deduplication hit rate', 'percent', 'phase0', NULL, 'events', '{"max": 0.20}'),
  ('invalid_sequence_reject_rate', 'gauge', 'Invalid event sequence reject rate', 'percent', 'phase0', NULL, 'events', '{"max": 0.002}'),
  ('create_reel_success_rate', 'gauge', 'Create reel success rate', 'percent', 'phase0', NULL, 'create', '{"threshold": 0.97}'),
  ('upload_success_rate', 'gauge', 'Upload success rate', 'percent', 'phase0', NULL, 'create', '{"threshold": 0.98}'),
  
  -- Phase 1 EPIC L (Trust & Rate Limiting)
  ('rate_limit_trigger_rate', 'gauge', 'Rate limit 429 response rate', 'percent', 'phase1', 'L', 'trust', '{"max": 0.05}'),
  ('rate_limit_audits_per_minute', 'counter', 'Rate limit audit events per minute', 'count', 'phase1', 'L', 'trust', NULL),
  ('trust_score_distribution', 'histogram', 'Trust score distribution', 'score', 'phase1', 'L', 'trust', NULL),
  ('suspected_bot_session_rate', 'gauge', 'Suspected bot session rate', 'percent', 'phase1', 'L', 'trust', '{"max": 0.10}'),
  
  -- Phase 1 EPIC M (Observability)
  ('guardrail_auto_rollback', 'counter', 'Guardrail auto-rollback events', 'count', 'phase1', 'M', 'observability', NULL),
  ('slo_breach_count', 'counter', 'SLO breach events', 'count', 'phase1', 'M', 'observability', NULL)
ON CONFLICT (metric_name) DO NOTHING;

-- ============================================================================
-- 3) Guardrails Config (thresholds that trigger auto-rollback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.guardrails_config (
  id BIGSERIAL PRIMARY KEY,
  guardrail_name TEXT NOT NULL UNIQUE,
  metric_name TEXT NOT NULL REFERENCES metrics_registry(metric_name),
  condition TEXT NOT NULL CHECK (condition IN ('gt', 'lt', 'gte', 'lte', 'eq')),
  threshold_value NUMERIC NOT NULL,
  window_minutes INT NOT NULL DEFAULT 5 CHECK (window_minutes > 0),
  severity TEXT NOT NULL CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
  action TEXT NOT NULL CHECK (action IN ('alert', 'rollback', 'kill_switch')),
  kill_switch_flag TEXT, -- reference to feature_flags.flag_name
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_guardrails_enabled ON guardrails_config(enabled, severity);
CREATE INDEX idx_guardrails_metric ON guardrails_config(metric_name);

COMMENT ON TABLE guardrails_config IS 'Phase 1 EPIC M: Thresholds that trigger alerts or auto-rollback';
COMMENT ON COLUMN guardrails_config.action IS 'alert = notify only, rollback = disable feature flag, kill_switch = hard disable';

-- ============================================================================
-- 4) Seed Guardrails (Phase 0 + Phase 1)
-- ============================================================================

INSERT INTO guardrails_config (guardrail_name, metric_name, condition, threshold_value, window_minutes, severity, action, kill_switch_flag) VALUES
  -- Phase 0 guardrails
  ('feed_latency_critical', 'feed_page_latency_ms', 'gt', 2000, 5, 'P0', 'kill_switch', 'personalized_ranking'),
  ('feed_error_critical', 'feed_error_rate', 'gt', 0.02, 5, 'P0', 'alert', NULL),
  ('playback_failure_critical', 'playback_start_failure_rate', 'gt', 0.05, 5, 'P0', 'alert', NULL),
  ('empty_feed_warning', 'empty_first_page_rate', 'gt', 0.03, 10, 'P1', 'alert', NULL),
  
  -- Phase 1 EPIC L guardrails
  ('rate_limit_spike', 'rate_limit_trigger_rate', 'gt', 0.10, 5, 'P1', 'rollback', 'rate_limit_enforcement'),
  ('bot_session_anomaly', 'suspected_bot_session_rate', 'gt', 0.20, 10, 'P1', 'alert', NULL)
ON CONFLICT (guardrail_name) DO NOTHING;

-- ============================================================================
-- 5) Metrics Samples (time-series storage)
-- ============================================================================

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
CREATE INDEX idx_metrics_samples_labels_gin ON metrics_samples USING GIN (labels);

COMMENT ON TABLE metrics_samples IS 'Phase 1 EPIC M: Time-series storage for metrics (simple, no external TSDB yet)';
COMMENT ON COLUMN metrics_samples.labels IS 'JSONB labels for filtering: {"tier": "B", "action": "send_message", "region": "us-east"}';

-- ============================================================================
-- 6) Feature Flags Expansion (Phase 1 kill-switches)
-- ============================================================================

INSERT INTO feature_flags (flag_name, enabled, rollout_percentage, config) VALUES
  -- EPIC M: Observability
  ('personalized_ranking', true, 100, '{"description": "Enable personalized ranking (vs recency fallback)"}'::jsonb),
  ('discovery_surface', false, 0, '{"description": "Enable Explore/Discovery UI"}'::jsonb),
  ('hashtag_trends', false, 0, '{"description": "Enable hashtag trends calculation"}'::jsonb),
  
  -- EPIC K: Moderation
  ('moderation_queue_processing', true, 100, '{"description": "Enable moderation queue processing"}'::jsonb),
  ('appeals_flow', false, 0, '{"description": "Enable user appeals for moderation decisions"}'::jsonb),
  
  -- Strict safety mode (fallback)
  ('strict_safety_mode', false, 0, '{"description": "Enable strict safety mode (disable UGC, read-only)"}'::jsonb)
ON CONFLICT (flag_name) DO NOTHING;

-- ============================================================================
-- 7) Row Level Security
-- ============================================================================

ALTER TABLE metrics_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardrails_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_samples ENABLE ROW LEVEL SECURITY;

-- RLS: service_role can read/write, authenticated can read registry only
CREATE POLICY metrics_registry_read ON metrics_registry FOR SELECT USING (true);
CREATE POLICY metrics_registry_service_write ON metrics_registry FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY guardrails_config_read ON guardrails_config FOR SELECT USING (true);
CREATE POLICY guardrails_config_service_write ON guardrails_config FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY metrics_samples_service_only ON metrics_samples FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 8) Grants
-- ============================================================================

GRANT SELECT ON metrics_registry TO authenticated, anon;
GRANT SELECT ON guardrails_config TO authenticated, anon;
-- metrics_samples: service_role only (via RLS)
