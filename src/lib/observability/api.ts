// Phase 1 EPIC M: Observability v1 - API Client
// Purpose: Frontend client for metrics, guardrails, and SLO monitoring

import { supabase } from '@/integrations/supabase/client';
import type {
  MetricSample,
  GuardrailBreachesResponse,
  SLOStatus,
  EvaluateGuardrailsResponse,
  MetricSampleRow,
} from './types';

/**
 * Report a metric sample and evaluate guardrails
 * 
 * @param metricName - Metric name from metrics_registry
 * @param value - Metric value
 * @param labels - Optional labels for filtering (e.g., {tier: 'B', action: 'send_message'})
 * @returns Evaluation result with triggered guardrails
 */
export async function reportMetric(
  metricName: string,
  value: number,
  labels?: Record<string, string | number>
): Promise<EvaluateGuardrailsResponse | null> {
  try {
    const { data, error } = await supabase.rpc('evaluate_guardrails_v1', {
      p_metric_name: metricName,
      p_value: value,
      p_labels: labels || {},
    });

    if (error) {
      console.error(`[observability] reportMetric(${metricName}) failed:`, error);
      return null;
    }

    return data as EvaluateGuardrailsResponse;
  } catch (err) {
    console.error(`[observability] reportMetric(${metricName}) exception:`, err);
    return null;
  }
}

/**
 * Get active guardrail breaches
 * 
 * @param lookbackMinutes - Lookback window (default: 15 minutes)
 * @returns List of active guardrail breaches
 */
export async function getActiveGuardrailBreaches(
  lookbackMinutes: number = 15
): Promise<GuardrailBreachesResponse | null> {
  try {
    const { data, error } = await supabase.rpc(
      'get_active_guardrail_breaches_v1',
      { p_lookback_minutes: lookbackMinutes }
    );

    if (error) {
      console.error('[observability] getActiveGuardrailBreaches failed:', error);
      return null;
    }

    return data as GuardrailBreachesResponse;
  } catch (err) {
    console.error('[observability] getActiveGuardrailBreaches exception:', err);
    return null;
  }
}

/**
 * Get SLO status for a domain (or all domains)
 * 
 * @param domain - Optional domain filter (feed, playback, events, etc.)
 * @param lookbackMinutes - Lookback window (default: 60 minutes)
 * @returns SLO status with metric aggregates
 */
export async function getSLOStatus(
  domain?: string,
  lookbackMinutes: number = 60
): Promise<SLOStatus | null> {
  try {
    const { data, error } = await supabase.rpc('get_slo_status_v1', {
      p_domain: domain || null,
      p_lookback_minutes: lookbackMinutes,
    });

    if (error) {
      console.error('[observability] getSLOStatus failed:', error);
      return null;
    }

    return data as SLOStatus;
  } catch (err) {
    console.error('[observability] getSLOStatus exception:', err);
    return null;
  }
}

/**
 * Get recent metric samples (for debugging/charting)
 * 
 * @param metricName - Metric name to query
 * @param lookbackMinutes - Lookback window (default: 60 minutes)
 * @param limit - Max samples to return (default: 100)
 * @returns Array of metric samples
 */
export async function getMetricSamples(
  metricName: string,
  lookbackMinutes: number = 60,
  limit: number = 100
): Promise<MetricSampleRow[]> {
  try {
    const { data, error } = await supabase.rpc('get_metric_samples_v1', {
      p_metric_name: metricName,
      p_lookback_minutes: lookbackMinutes,
      p_limit: limit,
    });

    if (error) {
      console.error(`[observability] getMetricSamples(${metricName}) failed:`, error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error(`[observability] getMetricSamples(${metricName}) exception:`, err);
    return [];
  }
}

/**
 * Helper: Report feed page latency
 */
export async function reportFeedLatency(latencyMs: number): Promise<void> {
  await reportMetric('feed_page_latency_ms', latencyMs);
}

/**
 * Helper: Report playback start failure
 */
export async function reportPlaybackFailure(reelId: string): Promise<void> {
  await reportMetric('playback_start_failure_rate', 1, { reel_id: reelId });
}

/**
 * Helper: Report rate limit trigger
 */
export async function reportRateLimitTrigger(
  action: string,
  tier: string
): Promise<void> {
  await reportMetric('rate_limit_trigger_rate', 1, { action, tier });
}

/**
 * Helper: Check if any P0 breaches are active
 * 
 * @returns True if P0 breach detected
 */
export async function hasP0Breaches(): Promise<boolean> {
  const breaches = await getActiveGuardrailBreaches(5);
  if (!breaches) return false;

  return breaches.breaches.some((b) => b.severity === 'P0');
}

/**
 * Helper: Get overall health status
 * 
 * @returns 'healthy' | 'degraded' | 'critical'
 */
export async function getHealthStatus(): Promise<'healthy' | 'degraded' | 'critical'> {
  const breaches = await getActiveGuardrailBreaches(15);
  if (!breaches) return 'healthy';

  const hasP0 = breaches.breaches.some((b) => b.severity === 'P0');
  const hasP1 = breaches.breaches.some((b) => b.severity === 'P1');

  if (hasP0) return 'critical';
  if (hasP1) return 'degraded';
  return 'healthy';
}
