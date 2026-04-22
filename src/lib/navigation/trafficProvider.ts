/**
 * trafficProvider.ts — Получение реальных данных о пробках.
 *
 * Источники (каскад):
 * 1. navigation_server traffic API — приоритетный backend
 * 2. Supabase (crowdsourced GPS от пользователей) — fallback
 * 3. Детерминированная оценка по времени суток — fallback
 *
 * Обновляет данные каждые 2 минуты для текущей области карты.
 */
import { dbLoose } from '@/lib/supabase';
import type { LatLng } from '@/types/taxi';
import type { TrafficLevel } from '@/types/navigation';
import { attemptBackendRequest, getBooleanEnv, getNavigationServerAuthHeaders, getNavigationServerBaseUrl, getNumberEnv } from '@/lib/navigation/backendAvailability';
import { recordFallbackUsage } from '@/lib/navigation/navigationKpi';
import { navText } from '@/lib/navigation/navigationUi';
import { logger } from '@/lib/logger';

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const NAV_SERVER_URL = getNavigationServerBaseUrl(ENV.VITE_NAV_SERVER_URL);
const NAV_SERVER_ENABLED = getBooleanEnv(ENV.VITE_NAV_SERVER_ENABLED, Boolean((ENV.VITE_NAV_SERVER_URL ?? '').trim()));
const NAV_SERVER_TIMEOUT_MS = getNumberEnv(ENV.VITE_NAV_SERVER_TIMEOUT_MS, 1800);
const NAV_SERVER_RETRIES = getNumberEnv(ENV.VITE_NAV_SERVER_RETRIES, 1);
const NAV_SERVER_RETRY_DELAY_MS = getNumberEnv(ENV.VITE_NAV_SERVER_RETRY_DELAY_MS, 250);
const NAV_SERVER_CB_FAILURE_THRESHOLD = getNumberEnv(ENV.VITE_NAV_SERVER_CB_FAILURE_THRESHOLD, 3);
const NAV_SERVER_CB_COOLDOWN_MS = getNumberEnv(ENV.VITE_NAV_SERVER_CB_COOLDOWN_MS, 30_000);

export type TrafficFetchSource = 'navigation_server' | 'supabase' | 'cache' | 'time_estimate';

interface TrafficRuntimeDiagnostics {
  source: TrafficFetchSource;
  degradationReason: string | null;
  updatedAt: number;
}

function classifyTrafficErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown');
  const normalized = message.toLowerCase();

  if (normalized.includes('circuit_open')) return 'circuit_open';
  if (normalized.includes('disabled')) return 'disabled';
  if (normalized.includes('missing_url')) return 'missing_url';
  if (normalized.includes('timeout') || normalized.includes('abort')) return 'timeout';
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror') || normalized.includes('load failed')) return 'network';
  if (normalized.includes('traffic_no_data')) return 'no_data';
  if (normalized.includes('rpc')) return 'rpc_error';
  if (/(401|403|404|408|409|422|429|500|502|503|504)/.test(normalized)) return 'http_error';
  return 'unexpected';
}

function updateTrafficDiagnostics(source: TrafficFetchSource, degradationReason: string | null): void {
  _runtimeDiagnostics = {
    source,
    degradationReason,
    updatedAt: Date.now(),
  };
}

function buildTrafficFallbackReason(selectedSource: TrafficFetchSource, reasons: string[]): string {
  return `selected=${selectedSource};causes=${reasons.join('|')}`;
}

// ── Типы ────────────────────────────────────────────────────────────────────
export interface TrafficSegment {
  h3Index: string;
  avgSpeedKmh: number;
  medianSpeedKmh: number | null;
  freeFlowKmh: number;
  congestionLevel: TrafficLevel;
  sampleCount: number;
  confidence: number;
  centerLat: number;
  centerLon: number;
  updatedAt: string;
}

export interface TrafficOverview {
  /** Средний балл пробок 0-10 (как Яндекс) */
  score: number;
  /** Текстовое описание */
  label: string;
  /** Цвет индикатора */
  color: string;
  /** Количество сегментов с данными */
  segmentCount: number;
  /** Фактический источник данных */
  source: TrafficFetchSource;
  /** Причина деградации, если был fallback */
  degradationReason: string | null;
}

// ── Кэш ─────────────────────────────────────────────────────────────────────
let _cachedSegments: TrafficSegment[] = [];
let _lastFetchTime = 0;
let _lastBbox: [number, number, number, number] | null = null;
const CACHE_TTL_MS = 120_000; // 2 минуты
let _runtimeDiagnostics: TrafficRuntimeDiagnostics = {
  source: 'time_estimate',
  degradationReason: null,
  updatedAt: Date.now(),
};

export function getTrafficRuntimeDiagnostics(): TrafficRuntimeDiagnostics {
  return _runtimeDiagnostics;
}

// ── Маппинг уровней из БД в клиентские ─────────────────────────────────────
function mapCongestion(level: string): TrafficLevel {
  switch (level) {
    case 'free': return 'free';
    case 'free_flow': return 'free';
    case 'light': return 'moderate';
    case 'moderate': return 'moderate';
    case 'slow': return 'slow';
    case 'heavy': return 'congested';
    case 'standstill': return 'congested';
    case 'congested': return 'congested';
    default: return 'unknown';
  }
}

function averageCenterFromGeometry(geometry: unknown): { lat: number; lon: number } {
  const coords = (geometry as { coordinates?: unknown[] } | null)?.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) {
    return { lat: 0, lon: 0 };
  }

  const pairs: Array<[number, number]> = [];
  const collectPairs = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      pairs.push([value[0], value[1]]);
      return;
    }
    for (const child of value) collectPairs(child);
  };
  collectPairs(coords);

  if (pairs.length === 0) {
    return { lat: 0, lon: 0 };
  }

  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  for (const point of pairs) {
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    latSum += lat;
    lonSum += lon;
    count += 1;
  }
  if (count === 0) return { lat: 0, lon: 0 };
  return { lat: latSum / count, lon: lonSum / count };
}

function mapNavServerRow(row: Record<string, unknown>): TrafficSegment {
  const center = averageCenterFromGeometry(row.geometry);
  const speed = Number(row.speed_kmh ?? row.avg_speed_kmh ?? 0);
  const freeFlow = Number(row.free_flow_speed_kmh ?? row.free_flow_kmh ?? 60);
  return {
    h3Index: String(row.h3_cell ?? row.h3_index ?? row.road_segment_id ?? ''),
    avgSpeedKmh: speed,
    medianSpeedKmh: row.median_speed_kmh != null ? Number(row.median_speed_kmh) : (Number.isFinite(speed) ? speed : null),
    freeFlowKmh: freeFlow,
    congestionLevel: mapCongestion(String(row.congestion_level ?? 'unknown')),
    sampleCount: Number(row.sample_count ?? 0),
    confidence: Number(row.confidence ?? 0),
    centerLat: Number(row.center_lat ?? center.lat ?? 0),
    centerLon: Number(row.center_lon ?? center.lon ?? 0),
    updatedAt: String(row.measured_at ?? row.updated_at ?? new Date().toISOString()),
  };
}

async function fetchTrafficFromNavigationServer(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number,
): Promise<TrafficSegment[]> {
  const response = await attemptBackendRequest<{ success?: boolean; segments?: Record<string, unknown>[] }>({
    service: 'traffic',
    enabled: NAV_SERVER_ENABLED,
    baseUrl: NAV_SERVER_URL,
    timeoutMs: NAV_SERVER_TIMEOUT_MS,
    retries: NAV_SERVER_RETRIES,
    retryDelayMs: NAV_SERVER_RETRY_DELAY_MS,
    failureThreshold: NAV_SERVER_CB_FAILURE_THRESHOLD,
    cooldownMs: NAV_SERVER_CB_COOLDOWN_MS,
    request: async (signal) => {
      const params = new URLSearchParams({
        min_lat: String(minLat),
        min_lng: String(minLon),
        max_lat: String(maxLat),
        max_lng: String(maxLon),
      });
      const res = await fetch(`${NAV_SERVER_URL}/api/v1/nav/traffic/area?${params.toString()}`, {
        method: 'GET',
        headers: await getNavigationServerAuthHeaders(),
        signal,
      });
      if (!res.ok) {
        throw new Error(`navigation_server_traffic_${res.status}`);
      }
      return res.json() as Promise<{ success?: boolean; segments?: Record<string, unknown>[] }>;
    },
  });

  if (!response.ok || !response.data?.success || !Array.isArray(response.data.segments)) {
    const reason = response.reason ?? 'traffic_no_data';
    throw new Error(`navigation_server_traffic_unavailable:${reason}`);
  }

  return response.data.segments.map(mapNavServerRow);
}

// ── Получить трафик из Supabase ─────────────────────────────────────────────
export async function fetchTrafficInBbox(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number,
): Promise<TrafficSegment[]> {
  // Проверяем кэш
  const now = Date.now();
  if (
    _cachedSegments.length > 0 &&
    now - _lastFetchTime < CACHE_TTL_MS &&
    _lastBbox &&
    _lastBbox[0] <= minLat && _lastBbox[1] <= minLon &&
    _lastBbox[2] >= maxLat && _lastBbox[3] >= maxLon
  ) {
    updateTrafficDiagnostics('cache', _runtimeDiagnostics.degradationReason);
    return _cachedSegments;
  }

  const degradationReasons: string[] = [];

  try {
    const serverSegments = await fetchTrafficFromNavigationServer(minLat, minLon, maxLat, maxLon);
    _cachedSegments = serverSegments;
    _lastFetchTime = now;
    _lastBbox = [minLat, minLon, maxLat, maxLon];
    updateTrafficDiagnostics('navigation_server', null);
    return serverSegments;
  } catch (serverErr) {
    const reason = `navigation_server:${classifyTrafficErrorReason(serverErr)}`;
    degradationReasons.push(reason);
    logger.warn('[trafficProvider] navigation_server traffic unavailable', { error: serverErr, reason });
  }

  try {
    const { data, error } = await dbLoose.rpc('get_traffic_in_bbox', {
      min_lat: minLat,
      min_lon: minLon,
      max_lat: maxLat,
      max_lon: maxLon,
    });

    if (error) {
      const reason = `supabase:${classifyTrafficErrorReason(error.message)}`;
      degradationReasons.push(reason);
      logger.warn('[trafficProvider] Traffic RPC returned an error', { reason, message: error.message });
      if (_cachedSegments.length > 0) {
        const fallbackReason = buildTrafficFallbackReason('cache', degradationReasons);
        recordFallbackUsage('traffic', fallbackReason);
        updateTrafficDiagnostics('cache', fallbackReason);
        return _cachedSegments;
      }
      const fallbackReason = buildTrafficFallbackReason('time_estimate', degradationReasons);
      recordFallbackUsage('traffic', fallbackReason);
      updateTrafficDiagnostics('time_estimate', fallbackReason);
      return [];
    }

    const segments: TrafficSegment[] = (data ?? []).map((row: Record<string, unknown>) => ({
      h3Index: String(row.h3_index ?? ''),
      avgSpeedKmh: Number(row.avg_speed_kmh ?? 0),
      medianSpeedKmh: row.median_speed_kmh != null ? Number(row.median_speed_kmh) : null,
      freeFlowKmh: Number(row.free_flow_kmh ?? 60),
      congestionLevel: mapCongestion(String(row.congestion_level ?? 'free')),
      sampleCount: Number(row.sample_count ?? 0),
      confidence: Number(row.confidence ?? 0),
      centerLat: Number(row.center_lat ?? 0),
      centerLon: Number(row.center_lon ?? 0),
      updatedAt: String(row.updated_at ?? ''),
    }));

    _cachedSegments = segments;
    _lastFetchTime = now;
    _lastBbox = [minLat, minLon, maxLat, maxLon];
    updateTrafficDiagnostics('supabase', degradationReasons.length > 0 ? buildTrafficFallbackReason('supabase', degradationReasons) : null);

    return segments;
  } catch (err) {
    const reason = `supabase:${classifyTrafficErrorReason(err)}`;
    degradationReasons.push(reason);
    logger.warn('[trafficProvider] Traffic RPC network failure', { error: err, reason });
    if (_cachedSegments.length > 0) {
      const fallbackReason = buildTrafficFallbackReason('cache', degradationReasons);
      recordFallbackUsage('traffic', fallbackReason);
      updateTrafficDiagnostics('cache', fallbackReason);
      return _cachedSegments;
    }
    const fallbackReason = buildTrafficFallbackReason('time_estimate', degradationReasons);
    recordFallbackUsage('traffic', fallbackReason);
    updateTrafficDiagnostics('time_estimate', fallbackReason);
    return [];
  }
}

// ── Получить трафик вокруг позиции ──────────────────────────────────────────
export async function fetchTrafficAround(
  position: LatLng,
  radiusKm: number = 5,
): Promise<TrafficSegment[]> {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos(position.lat * Math.PI / 180));

  return fetchTrafficInBbox(
    position.lat - dLat,
    position.lng - dLon,
    position.lat + dLat,
    position.lng + dLon,
  );
}

// ── Получить трафик для точки маршрута ───────────────────────────────────────
export function getTrafficAtPoint(
  lat: number,
  lon: number,
  segments: TrafficSegment[],
): TrafficLevel {
  // Ищем ближайший сегмент (в ячейке ~200м)
  const threshold = 0.003; // ~330м
  let best: TrafficSegment | null = null;
  let bestDist = Infinity;

  for (const seg of segments) {
    const dLat = Math.abs(seg.centerLat - lat);
    const dLon = Math.abs(seg.centerLon - lon);
    if (dLat > threshold || dLon > threshold) continue;

    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }

  if (best && best.confidence >= 0.3) {
    return best.congestionLevel;
  }

  // Fallback: детерминированная оценка по времени суток
  return estimateTrafficByTime();
}

// ── Fallback: оценка по времени суток ───────────────────────────────────────
function estimateTrafficByTime(hour: number = new Date().getHours()): TrafficLevel {
  if ((hour >= 7 && hour < 10) || (hour >= 17 && hour < 20)) return 'slow';
  if (hour >= 10 && hour < 17) return 'moderate';
  if (hour >= 22 || hour < 6) return 'free';
  return 'moderate';
}

// ── Общий обзор трафика (баллы как Яндекс) ──────────────────────────────────
export function calculateTrafficOverview(segments: TrafficSegment[]): TrafficOverview {
  const diagnostics = getTrafficRuntimeDiagnostics();
  if (segments.length === 0) {
    const fallback = estimateTrafficByTime();
    return {
      score: fallback === 'free' ? 1 : fallback === 'moderate' ? 4 : 7,
      label: fallback === 'free' ? navText('Свободно', 'Clear') : fallback === 'moderate' ? navText('Умеренно', 'Moderate') : navText('Пробки', 'Congested'),
      color: fallback === 'free' ? '#00E676' : fallback === 'moderate' ? '#FFAB00' : '#FF6D00',
      segmentCount: 0,
      source: diagnostics.source,
      degradationReason: diagnostics.degradationReason,
    };
  }

  // Взвешенный балл по количеству проб
  let totalWeight = 0;
  let weightedScore = 0;

  for (const seg of segments) {
    const weight = seg.sampleCount * seg.confidence;
    const levelScore = seg.congestionLevel === 'free' ? 1
      : seg.congestionLevel === 'moderate' ? 4
      : seg.congestionLevel === 'slow' ? 7
      : 10; // congested
    
    weightedScore += levelScore * weight;
    totalWeight += weight;
  }

  const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 1;
  const clampedScore = Math.max(1, Math.min(10, score));

  let label: string;
  let color: string;

  if (clampedScore <= 2) { label = navText('Свободно', 'Clear'); color = '#00E676'; }
  else if (clampedScore <= 4) { label = navText('Почти свободно', 'Mostly clear'); color = '#76FF03'; }
  else if (clampedScore <= 6) { label = navText('Затруднения', 'Delays'); color = '#FFAB00'; }
  else if (clampedScore <= 8) { label = navText('Пробки', 'Congested'); color = '#FF6D00'; }
  else { label = navText('Серьёзные пробки', 'Severe congestion'); color = '#F44336'; }

  return {
    score: clampedScore,
    label,
    color,
    segmentCount: segments.length,
    source: diagnostics.source,
    degradationReason: diagnostics.degradationReason,
  };
}

// ── Очистить кэш ───────────────────────────────────────────────────────────
export function clearTrafficCache(): void {
  _cachedSegments = [];
  _lastFetchTime = 0;
  _lastBbox = null;
  updateTrafficDiagnostics('time_estimate', null);
}
