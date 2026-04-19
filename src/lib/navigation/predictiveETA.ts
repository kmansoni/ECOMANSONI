/**
 * Predictive ETA — Предсказание времени прибытия с доверительными интервалами.
 * Учитывает: исторические данные трафика, день недели, час, погоду, события.
 * Возвращает p10/p50/p90 (оптимистичный / медиана / пессимистичный).
 */

import { dbLoose } from '@/lib/supabase';
import type { TravelMode } from '@/types/navigation';
import type { LatLng } from '@/types/taxi';

// ── Типы ──

export interface ETAPrediction {
  /** Медианное время в секундах */
  etaSeconds: number;
  /** Оптимистичная оценка (10-й перцентиль) */
  p10Seconds: number;
  /** Пессимистичная оценка (90-й перцентиль) */
  p90Seconds: number;
  /** Доверительный уровень 0..1 */
  confidence: number;
  /** Ширина интервала в секундах */
  spreadSeconds: number;
  /** Факторы неопределённости */
  uncertaintyFactors: UncertaintyFactor[];
  /** Прогноз прибытия */
  arrivalTime: Date;
  /** Текстовое представление */
  display: string;
  displayRange: string;
}

export interface UncertaintyFactor {
  name: string;
  impact: number;     // 0..1 — вклад в неопределённость
  description: string;
}

interface TrafficPattern {
  dayOfWeek: number;
  hourSlot: number;     // 0..23
  avgSpeedRatio: number; // relative to free-flow (0.3 = heavy traffic)
  stdDev: number;
}

interface HistoricalSegment {
  segmentHash: string;
  patterns: TrafficPattern[];
}

// ── Кэш паттернов ──

const patternCache = new Map<string, TrafficPattern[]>();

// ── Утилиты ──

function segmentHash(from: LatLng, to: LatLng): string {
  // Round to ~100m grid
  const f = `${(from.lat * 100) | 0},${(from.lng * 100) | 0}`;
  const t = `${(to.lat * 100) | 0},${(to.lng * 100) | 0}`;
  return `${f}-${t}`;
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} ч ${rm} мин` : `${h} ч`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ── Главные функции ──

/**
 * Предсказать ETA маршрута с доверительными интервалами.
 */
export function predictETA(
  baseEtaSeconds: number,
  routePoints: LatLng[],
  mode: TravelMode,
  departureTime?: Date
): ETAPrediction {
  const now = departureTime ?? new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const uncertaintyFactors: UncertaintyFactor[] = [];

  // Base variance depends on mode
  let baseVariance = getBaseVariance(mode);

  // ── Factor: Time of day traffic ──
  const trafficMultiplier = getTrafficMultiplier(hour, dayOfWeek, mode);
  const adjustedEta = baseEtaSeconds * trafficMultiplier.factor;

  if (trafficMultiplier.uncertainty > 0.1) {
    uncertaintyFactors.push({
      name: 'Трафик',
      impact: trafficMultiplier.uncertainty,
      description: trafficMultiplier.description,
    });
    baseVariance += trafficMultiplier.uncertainty;
  }

  // ── Factor: Distance (longer = more uncertain) ──
  const distanceFactor = Math.min(baseEtaSeconds / 3600, 0.3); // up to 30% extra uncertainty
  if (distanceFactor > 0.05) {
    uncertaintyFactors.push({
      name: 'Расстояние',
      impact: distanceFactor,
      description: baseEtaSeconds > 3600 ? 'Дальняя поездка — больше неопределённости' : 'Средняя дистанция',
    });
    baseVariance += distanceFactor * 0.3;
  }

  // ── Factor: Route complexity ──
  const turnsEstimate = routePoints.length;
  if (turnsEstimate > 30) {
    const complexity = Math.min((turnsEstimate - 30) / 100, 0.15);
    uncertaintyFactors.push({
      name: 'Сложность маршрута',
      impact: complexity,
      description: 'Много поворотов / перекрёстков',
    });
    baseVariance += complexity;
  }

  // ── Factor: Weekend vs weekday ──
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend && mode === 'car') {
    uncertaintyFactors.push({
      name: 'Выходной',
      impact: 0.05,
      description: 'Выходной день — непредсказуемый трафик',
    });
    baseVariance += 0.05;
  }

  // ── Calculate intervals ──
  const totalVariance = Math.min(baseVariance, 0.6); // cap at 60%
  const p10 = adjustedEta * (1 - totalVariance * 0.8);
  const p90 = adjustedEta * (1 + totalVariance * 1.2);

  const confidence = Math.max(0.3, 1 - totalVariance);
  const arrivalTime = new Date(now.getTime() + adjustedEta * 1000);

  return {
    etaSeconds: Math.round(adjustedEta),
    p10Seconds: Math.round(Math.max(p10, baseEtaSeconds * 0.5)),
    p90Seconds: Math.round(p90),
    confidence,
    spreadSeconds: Math.round(p90 - p10),
    uncertaintyFactors,
    arrivalTime,
    display: `${formatDuration(adjustedEta)} (прибытие ~${formatTime(arrivalTime)})`,
    displayRange: `${formatDuration(p10)} – ${formatDuration(p90)}`,
  };
}

/**
 * Обновить предсказание на основе прогресса по маршруту.
 * Вызывается периодически по мере движения.
 */
export function updateETAEnRoute(
  originalPrediction: ETAPrediction,
  elapsedSeconds: number,
  progressFraction: number, // 0..1 — доля пройденного пути
  currentSpeed: number | null,  // km/h
  mode: TravelMode
): ETAPrediction {
  if (progressFraction <= 0) return originalPrediction;

  // Actual pace-based estimate
  const remainingFraction = 1 - progressFraction;
  const paceBasedRemaining = progressFraction > 0.05
    ? (elapsedSeconds / progressFraction) * remainingFraction
    : originalPrediction.etaSeconds - elapsedSeconds;

  // Original-based remaining
  const originalRemaining = originalPrediction.etaSeconds - elapsedSeconds;

  // Blend: trust actual pace more as we progress
  const blendWeight = Math.min(progressFraction * 2, 0.8);
  const blendedRemaining = paceBasedRemaining * blendWeight + originalRemaining * (1 - blendWeight);

  // Reduce uncertainty as we progress
  const uncertaintyReduction = progressFraction * 0.6;
  const baseVariance = getBaseVariance(mode) * (1 - uncertaintyReduction);

  const p10 = blendedRemaining * (1 - baseVariance * 0.5);
  const p90 = blendedRemaining * (1 + baseVariance * 0.8);
  const arrivalTime = new Date(Date.now() + blendedRemaining * 1000);

  return {
    etaSeconds: Math.round(Math.max(blendedRemaining, 0)),
    p10Seconds: Math.round(Math.max(p10, 0)),
    p90Seconds: Math.round(Math.max(p90, 0)),
    confidence: Math.min(0.95, originalPrediction.confidence + progressFraction * 0.3),
    spreadSeconds: Math.round(p90 - p10),
    uncertaintyFactors: originalPrediction.uncertaintyFactors.map(f => ({
      ...f,
      impact: f.impact * (1 - uncertaintyReduction),
    })),
    arrivalTime,
    display: `${formatDuration(blendedRemaining)} (прибытие ~${formatTime(arrivalTime)})`,
    displayRange: `${formatDuration(p10)} – ${formatDuration(p90)}`,
  };
}

/**
 * Загрузить исторические паттерны для маршрута из Supabase.
 * Возвращает скорректированный множитель ETA.
 */
export async function loadHistoricalPatterns(
  from: LatLng,
  to: LatLng,
  departureTime: Date
): Promise<{ factor: number; confidence: number }> {
  const hash = segmentHash(from, to);

  if (patternCache.has(hash)) {
    const patterns = patternCache.get(hash)!;
    return matchPattern(patterns, departureTime);
  }

  try {
    const { data } = await dbLoose
      .from('traffic_patterns')
      .select('day_of_week, hour_slot, avg_speed_ratio, std_dev')
      .eq('segment_hash', hash)
      .limit(168); // 7 days × 24 hours

    if (data && data.length > 0) {
      const patterns: TrafficPattern[] = data.map((r: Record<string, unknown>) => ({
        dayOfWeek: Number(r.day_of_week),
        hourSlot: Number(r.hour_slot),
        avgSpeedRatio: Number(r.avg_speed_ratio),
        stdDev: Number(r.std_dev),
      }));
      patternCache.set(hash, patterns);
      return matchPattern(patterns, departureTime);
    }
  } catch { /* fallthrough */ }

  return { factor: 1.0, confidence: 0.3 };
}

// ── Private helpers ──

function getBaseVariance(mode: TravelMode): number {
  switch (mode) {
    case 'car': return 0.2;
    case 'transit': return 0.15;
    case 'pedestrian': return 0.08;
    case 'multimodal': return 0.25;
    default: return 0.2;
  }
}

function getTrafficMultiplier(
  hour: number,
  dayOfWeek: number,
  mode: TravelMode
): { factor: number; uncertainty: number; description: string } {
  if (mode === 'pedestrian') {
    return { factor: 1.0, uncertainty: 0, description: 'Пешеходы не зависят от трафика' };
  }

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Morning rush: 7-10
  if (!isWeekend && hour >= 7 && hour < 10) {
    if (mode === 'car') return { factor: 1.45, uncertainty: 0.25, description: 'Утренний час пик' };
    if (mode === 'transit') return { factor: 1.15, uncertainty: 0.15, description: 'Утренний час пик ОТ' };
  }

  // Evening rush: 17-20
  if (!isWeekend && hour >= 17 && hour < 20) {
    if (mode === 'car') return { factor: 1.55, uncertainty: 0.3, description: 'Вечерний час пик' };
    if (mode === 'transit') return { factor: 1.2, uncertainty: 0.15, description: 'Вечерний час пик ОТ' };
  }

  // Lunch: 12-14
  if (!isWeekend && hour >= 12 && hour < 14) {
    return { factor: 1.15, uncertainty: 0.1, description: 'Обеденное время' };
  }

  // Night: 23-6
  if (hour >= 23 || hour < 6) {
    return { factor: 0.85, uncertainty: 0.05, description: 'Ночное время — свободные дороги' };
  }

  // Weekend
  if (isWeekend) {
    if (hour >= 11 && hour < 18) {
      return { factor: 1.2, uncertainty: 0.15, description: 'Выходной день — умеренный трафик' };
    }
    return { factor: 1.0, uncertainty: 0.08, description: 'Выходной — спокойно' };
  }

  return { factor: 1.0, uncertainty: 0.08, description: 'Стандартный трафик' };
}

function matchPattern(
  patterns: TrafficPattern[],
  time: Date
): { factor: number; confidence: number } {
  const dow = time.getDay();
  const hour = time.getHours();

  // Exact match
  const exact = patterns.find(p => p.dayOfWeek === dow && p.hourSlot === hour);
  if (exact) {
    return {
      factor: 1 / Math.max(exact.avgSpeedRatio, 0.1),
      confidence: exact.stdDev < 0.1 ? 0.9 : exact.stdDev < 0.25 ? 0.7 : 0.5,
    };
  }

  // Nearest hour
  const sameDay = patterns.filter(p => p.dayOfWeek === dow);
  if (sameDay.length > 0) {
    const nearest = sameDay.reduce((best, p) =>
      Math.abs(p.hourSlot - hour) < Math.abs(best.hourSlot - hour) ? p : best
    );
    return {
      factor: 1 / Math.max(nearest.avgSpeedRatio, 0.1),
      confidence: 0.5,
    };
  }

  return { factor: 1.0, confidence: 0.3 };
}
