import { logger } from '@/lib/logger';

export type NavBackendService = 'routing' | 'traffic';
export type NavBackendStatus = 'ok' | 'degraded' | 'open' | 'disabled';

const ROUTE_BUILD_GATE_MS = 2500;
const REROUTE_GATE_MS = 1800;
const PIPELINE_CONFIDENCE_GATE = 0.6;
const MAX_SAMPLES = 60;

type KpiListener = () => void;

interface BackendRuntimeState {
  status: NavBackendStatus;
  lastError: string | null;
  openUntil: number | null;
  updatedAt: number;
}

interface KpiState {
  routeBuildLatencies: number[];
  rerouteLatencies: number[];
  confidenceSamples: number[];
  routeFallbackCount: number;
  trafficFallbackCount: number;
  pipelineFallbackCount: number;
  lastRouteBuildSource: string | null;
  lastRerouteSource: string | null;
  backends: Record<NavBackendService, BackendRuntimeState>;
  lastFallbackReason: string | null;
  lastPipelineFallbackKey: string | null;
  lastPipelineFallbackAt: number;
  updatedAt: number;
}

const listeners = new Set<KpiListener>();

const state: KpiState = {
  routeBuildLatencies: [],
  rerouteLatencies: [],
  confidenceSamples: [],
  routeFallbackCount: 0,
  trafficFallbackCount: 0,
  pipelineFallbackCount: 0,
  lastRouteBuildSource: null,
  lastRerouteSource: null,
  backends: {
    routing: { status: 'disabled', lastError: null, openUntil: null, updatedAt: Date.now() },
    traffic: { status: 'disabled', lastError: null, openUntil: null, updatedAt: Date.now() },
  },
  lastFallbackReason: null,
  lastPipelineFallbackKey: null,
  lastPipelineFallbackAt: 0,
  updatedAt: Date.now(),
};

function pushSample(target: number[], value: number) {
  target.push(value);
  if (target.length > MAX_SAMPLES) {
    target.splice(0, target.length - MAX_SAMPLES);
  }
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function emit() {
  state.updatedAt = Date.now();
  for (const listener of listeners) listener();
}

export function recordRouteBuildLatency(latencyMs: number, source: string): void {
  pushSample(state.routeBuildLatencies, latencyMs);
  state.lastRouteBuildSource = source;
  logger.info('[navigationKpi] route_build_latency', { latencyMs: Math.round(latencyMs), source });
  emit();
}

export function recordRerouteLatency(latencyMs: number, source: string): void {
  pushSample(state.rerouteLatencies, latencyMs);
  state.lastRerouteSource = source;
  logger.info('[navigationKpi] reroute_latency', { latencyMs: Math.round(latencyMs), source });
  emit();
}

export function recordFallbackUsage(kind: 'routing' | 'traffic' | 'pipeline', reason: string): void {
  if (kind === 'routing') state.routeFallbackCount += 1;
  if (kind === 'traffic') state.trafficFallbackCount += 1;
  if (kind === 'pipeline') state.pipelineFallbackCount += 1;
  state.lastFallbackReason = reason;
  logger.warn('[navigationKpi] fallback_usage', { kind, reason });
  emit();
}

export function recordPipelineConfidence(confidence: number, source: string, usedFallback: boolean, note?: string): void {
  const clamped = Math.max(0, Math.min(1, confidence));
  pushSample(state.confidenceSamples, clamped);
  logger.info('[navigationKpi] pipeline_confidence', {
    source,
    confidence: Number(clamped.toFixed(3)),
    usedFallback,
    note,
  });
  if (usedFallback) {
    const key = `${source}:${note ?? 'fallback'}`;
    const now = Date.now();
    const shouldCount = state.lastPipelineFallbackKey !== key || now - state.lastPipelineFallbackAt > 15_000;
    if (shouldCount) {
      state.lastPipelineFallbackKey = key;
      state.lastPipelineFallbackAt = now;
      recordFallbackUsage('pipeline', key);
      return;
    }
    emit();
    return;
  }
  emit();
}

export function recordBackendStatus(
  service: NavBackendService,
  status: NavBackendStatus,
  detail?: { error?: string | null; openUntil?: number | null },
): void {
  const previous = state.backends[service];
  const nextError = detail?.error === undefined ? previous.lastError : detail.error;
  const nextOpenUntil = detail?.openUntil === undefined
    ? (status === 'ok' ? null : previous.openUntil)
    : detail.openUntil;

  if (
    previous.status === status &&
    previous.lastError === nextError &&
    previous.openUntil === nextOpenUntil
  ) {
    return;
  }

  state.backends[service] = {
    status,
    lastError: nextError,
    openUntil: nextOpenUntil,
    updatedAt: Date.now(),
  };
  emit();
}

export function getNavigationKpiSnapshot() {
  const routeBuildP95 = percentile(state.routeBuildLatencies, 0.95);
  const rerouteP95 = percentile(state.rerouteLatencies, 0.95);
  const confidenceAvg = average(state.confidenceSamples);
  const confidenceLast = state.confidenceSamples[state.confidenceSamples.length - 1] ?? null;
  return {
    routeBuild: {
      lastMs: state.routeBuildLatencies[state.routeBuildLatencies.length - 1] ?? null,
      p95Ms: routeBuildP95,
      gateMs: ROUTE_BUILD_GATE_MS,
      passGate: routeBuildP95 == null ? true : routeBuildP95 <= ROUTE_BUILD_GATE_MS,
      source: state.lastRouteBuildSource,
    },
    reroute: {
      lastMs: state.rerouteLatencies[state.rerouteLatencies.length - 1] ?? null,
      p95Ms: rerouteP95,
      gateMs: REROUTE_GATE_MS,
      passGate: rerouteP95 == null ? true : rerouteP95 <= REROUTE_GATE_MS,
      source: state.lastRerouteSource,
    },
    fallback: {
      routing: state.routeFallbackCount,
      traffic: state.trafficFallbackCount,
      pipeline: state.pipelineFallbackCount,
      lastReason: state.lastFallbackReason,
    },
    confidence: {
      last: confidenceLast,
      avg: confidenceAvg,
      gate: PIPELINE_CONFIDENCE_GATE,
      passGate: confidenceAvg == null ? true : confidenceAvg >= PIPELINE_CONFIDENCE_GATE,
      samples: state.confidenceSamples.length,
    },
    backends: state.backends,
    updatedAt: state.updatedAt,
  };
}

export function subscribeNavigationKpi(listener: KpiListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
