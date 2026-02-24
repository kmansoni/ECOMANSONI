// Phase 1 EPIC M: Observability v1 - TypeScript Types
// Purpose: Type definitions for metrics, guardrails, and SLO monitoring

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';
export type GuardrailSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type GuardrailAction = 'alert' | 'rollback' | 'kill_switch';
export type GuardrailCondition = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
export type MetricPhase = 'phase0' | 'phase1' | 'phase2' | 'phase3' | 'phase4';
export type MetricDomain = 'feed' | 'playback' | 'events' | 'trust' | 'moderation' | 'discovery' | 'ranking' | 'create' | 'observability';

/**
 * Metric sample data point
 */
export interface MetricSample {
  metric_name: string;
  value: number;
  labels?: Record<string, string | number>;
  ts?: string;
}

/**
 * Metric registry entry (catalog of all metrics)
 */
export interface MetricRegistry {
  id: number;
  metric_name: string;
  metric_type: MetricType;
  description: string;
  unit?: string; // 'ms', 'percent', 'count', 'bytes'
  phase: MetricPhase;
  epic?: string; // 'L', 'K', 'M', 'I', 'G', 'H', 'J'
  domain: MetricDomain;
  slo_target?: Record<string, number>; // {"p95": 800} or {"threshold": 0.01}
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Guardrail configuration (threshold + action)
 */
export interface GuardrailConfig {
  id: number;
  guardrail_name: string;
  metric_name: string;
  condition: GuardrailCondition;
  threshold_value: number;
  window_minutes: number;
  severity: GuardrailSeverity;
  action: GuardrailAction;
  kill_switch_flag?: string; // feature_flags.flag_name
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Active guardrail breach
 */
export interface GuardrailBreach {
  guardrail: string;
  metric: string;
  severity: GuardrailSeverity;
  action: GuardrailAction;
  kill_switch_flag?: string;
  avg_value: number;
  threshold: number;
  condition: GuardrailCondition;
  window_minutes: number;
  breach_pct: number;
  sample_count: number;
}

/**
 * SLO metric status
 */
export interface SLOMetricStatus {
  metric: string;
  type: MetricType;
  domain: MetricDomain;
  // Histogram metrics
  p50?: number;
  p95?: number;
  p99?: number;
  // Gauge/counter metrics
  avg?: number;
  slo_target: Record<string, number>;
  met: boolean;
  sample_count: number;
}

/**
 * SLO status response
 */
export interface SLOStatus {
  domain?: string;
  lookback_minutes: number;
  metrics: SLOMetricStatus[];
  checked_at: string;
}

/**
 * Guardrail breaches response
 */
export interface GuardrailBreachesResponse {
  lookback_minutes: number;
  breaches: GuardrailBreach[];
  breach_count: number;
  checked_at: string;
}

/**
 * Evaluate guardrails response
 */
export interface EvaluateGuardrailsResponse {
  metric_name: string;
  value: number;
  avg_value: number;
  triggered: Array<Omit<GuardrailBreach, 'sample_count'>>;
  rollback_count: number;
  checked_at: string;
}

/**
 * Metric sample query result
 */
export interface MetricSampleRow {
  ts: string;
  value: number;
  labels: Record<string, string | number>;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  deleted_count: number;
  retention_days: number;
  cleaned_at: string;
}
