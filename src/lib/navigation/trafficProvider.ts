/**
 * trafficProvider.ts — Получение реальных данных о пробках.
 *
 * Источники (каскад):
 * 1. Supabase (crowdsourced GPS от пользователей) — реальное время
 * 2. Детерминированная оценка по времени суток — fallback
 *
 * Обновляет данные каждые 2 минуты для текущей области карты.
 */
import { dbLoose } from '@/lib/supabase';
import type { LatLng } from '@/types/taxi';
import type { TrafficLevel } from '@/types/navigation';

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
}

// ── Кэш ─────────────────────────────────────────────────────────────────────
let _cachedSegments: TrafficSegment[] = [];
let _lastFetchTime = 0;
let _lastBbox: [number, number, number, number] | null = null;
const CACHE_TTL_MS = 120_000; // 2 минуты

// ── Маппинг уровней из БД в клиентские ─────────────────────────────────────
function mapCongestion(level: string): TrafficLevel {
  switch (level) {
    case 'free': return 'free';
    case 'moderate': return 'moderate';
    case 'slow': return 'slow';
    case 'congested': return 'congested';
    default: return 'unknown';
  }
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
    return _cachedSegments;
  }

  try {
    const { data, error } = await dbLoose.rpc('get_traffic_in_bbox', {
      min_lat: minLat,
      min_lon: minLon,
      max_lat: maxLat,
      max_lon: maxLon,
    });

    if (error) {
      console.warn('[trafficProvider] Ошибка запроса трафика:', error.message);
      return _cachedSegments; // Возвращаем кэш при ошибке
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

    return segments;
  } catch (err) {
    console.warn('[trafficProvider] Сетевая ошибка:', err);
    return _cachedSegments;
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
  if (segments.length === 0) {
    const fallback = estimateTrafficByTime();
    return {
      score: fallback === 'free' ? 1 : fallback === 'moderate' ? 4 : 7,
      label: fallback === 'free' ? 'Свободно' : fallback === 'moderate' ? 'Умеренно' : 'Пробки',
      color: fallback === 'free' ? '#00E676' : fallback === 'moderate' ? '#FFAB00' : '#FF6D00',
      segmentCount: 0,
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

  if (clampedScore <= 2) { label = 'Свободно'; color = '#00E676'; }
  else if (clampedScore <= 4) { label = 'Почти свободно'; color = '#76FF03'; }
  else if (clampedScore <= 6) { label = 'Затруднения'; color = '#FFAB00'; }
  else if (clampedScore <= 8) { label = 'Пробки'; color = '#FF6D00'; }
  else { label = 'Серьёзные пробки'; color = '#F44336'; }

  return {
    score: clampedScore,
    label,
    color,
    segmentCount: segments.length,
  };
}

// ── Очистить кэш ───────────────────────────────────────────────────────────
export function clearTrafficCache(): void {
  _cachedSegments = [];
  _lastFetchTime = 0;
  _lastBbox = null;
}
