/**
 * Pedestrian Safety Score — оценка безопасности маршрута для пешеходов.
 * Факторы: освещение (OSM lit=yes/no), плотность населения, исторические инциденты,
 * время суток, тип дороги, наличие камер.
 */

import type { LatLng } from '@/types/taxi';
import { dbLoose } from '@/lib/supabase';

// ── Типы ──

export interface SafetyFactor {
  name: string;
  score: number;     // 0..1
  weight: number;    // вес фактора
  detail: string;    // человеческое описание
  icon: string;
}

export interface SafetyAssessment {
  overallScore: number;           // 0..1 (1 = max safety)
  label: 'safe' | 'moderate' | 'caution' | 'unsafe';
  color: string;
  factors: SafetyFactor[];
  recommendations: string[];
  darkSegments: Array<{ from: LatLng; to: LatLng; reason: string }>;
}

interface OSMEdgeSafety {
  highway: string;
  lit: boolean | null;
  surface: string | null;
  sidewalk: boolean;
  crossing: boolean;
  maxspeed: number | null;
}

// ── Весовые коэффициенты ──

const FACTOR_WEIGHTS = {
  lighting: 0.30,
  roadType: 0.20,
  timeOfDay: 0.15,
  incidents: 0.15,
  infrastructure: 0.10,
  populationDensity: 0.10,
};

// Безопасность по типу дороги (для пешехода)
const HIGHWAY_SAFETY: Record<string, number> = {
  'footway': 0.95,
  'pedestrian': 0.98,
  'path': 0.7,
  'cycleway': 0.8,
  'living_street': 0.9,
  'residential': 0.75,
  'service': 0.6,
  'unclassified': 0.5,
  'tertiary': 0.45,
  'secondary': 0.35,
  'primary': 0.25,
  'trunk': 0.15,
  'motorway': 0.05,
};

// ── Утилиты ──

function getTimeOfDaySafety(hour: number): { score: number; detail: string } {
  // Safe hours: 7-20
  if (hour >= 7 && hour < 20) return { score: 0.95, detail: 'Светлое время суток' };
  // Dusk/dawn: 5-7, 20-22
  if ((hour >= 5 && hour < 7) || (hour >= 20 && hour < 22)) return { score: 0.65, detail: 'Сумерки' };
  // Night: 22-5
  return { score: 0.35, detail: 'Ночное время' };
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, val));
}

// ── Главные функции ──

/**
 * Оценить безопасность маршрута по массиву точек.
 * @param routePoints - массив точек маршрута
 * @param edgeData - данные о каждом сегменте (из OSM)
 * @param hour - текущий час (0-23)
 */
export function evaluateRouteSafety(
  routePoints: LatLng[],
  edgeData: OSMEdgeSafety[],
  hour?: number
): SafetyAssessment {
  const currentHour = hour ?? new Date().getHours();
  const factors: SafetyFactor[] = [];
  const darkSegments: SafetyAssessment['darkSegments'] = [];
  const recommendations: string[] = [];

  // ── Factor 1: Освещение ──
  let litCount = 0;
  let totalEdges = edgeData.length || 1;

  for (let i = 0; i < edgeData.length; i++) {
    const edge = edgeData[i];
    if (edge.lit === true) {
      litCount++;
    } else if (edge.lit === false && i < routePoints.length - 1) {
      darkSegments.push({
        from: routePoints[i],
        to: routePoints[Math.min(i + 1, routePoints.length - 1)],
        reason: 'Нет освещения',
      });
    }
  }

  const lightingScore = totalEdges > 0 ? litCount / totalEdges : 0.5;
  factors.push({
    name: 'Освещение',
    score: lightingScore,
    weight: FACTOR_WEIGHTS.lighting,
    detail: lightingScore > 0.7 ? 'Хорошее освещение' : lightingScore > 0.4 ? 'Частичное освещение' : 'Плохое освещение',
    icon: lightingScore > 0.7 ? '💡' : '🌑',
  });

  if (lightingScore < 0.5 && currentHour >= 20) {
    recommendations.push('Рекомендуем использовать фонарик или выбрать освещённый маршрут');
  }

  // ── Factor 2: Тип дороги ──
  let roadSafetySum = 0;
  for (const edge of edgeData) {
    roadSafetySum += HIGHWAY_SAFETY[edge.highway] ?? 0.5;
  }
  const roadScore = totalEdges > 0 ? roadSafetySum / totalEdges : 0.5;
  factors.push({
    name: 'Тип дороги',
    score: roadScore,
    weight: FACTOR_WEIGHTS.roadType,
    detail: roadScore > 0.7 ? 'Пешеходные зоны' : roadScore > 0.4 ? 'Жилые улицы' : 'Оживлённые дороги',
    icon: roadScore > 0.7 ? '🚶' : '🚗',
  });

  if (roadScore < 0.4) {
    recommendations.push('Маршрут проходит по оживлённым дорогам — будьте осторожны');
  }

  // ── Factor 3: Время суток ──
  const timeSafety = getTimeOfDaySafety(currentHour);
  factors.push({
    name: 'Время суток',
    score: timeSafety.score,
    weight: FACTOR_WEIGHTS.timeOfDay,
    detail: timeSafety.detail,
    icon: timeSafety.score > 0.7 ? '☀️' : '🌙',
  });

  if (timeSafety.score < 0.5) {
    recommendations.push('В ночное время рекомендуем такси или хорошо освещённые маршруты');
  }

  // ── Factor 4: Инфраструктура (тротуары, переходы) ──
  let infraScore = 0;
  for (const edge of edgeData) {
    let edgeScore = 0.5;
    if (edge.sidewalk) edgeScore += 0.25;
    if (edge.crossing) edgeScore += 0.15;
    if (edge.surface === 'asphalt' || edge.surface === 'paving_stones') edgeScore += 0.1;
    infraScore += clamp(edgeScore);
  }
  infraScore = totalEdges > 0 ? infraScore / totalEdges : 0.5;

  factors.push({
    name: 'Инфраструктура',
    score: infraScore,
    weight: FACTOR_WEIGHTS.infrastructure,
    detail: infraScore > 0.7 ? 'Тротуары и переходы' : 'Ограниченная инфраструктура',
    icon: infraScore > 0.7 ? '✅' : '⚠️',
  });

  // ── Factor 5: Плотность населения (приближение) ──
  // Используем количество перекрёстков как прокси для плотности
  const crossingCount = edgeData.filter(e => e.crossing).length;
  const densityScore = clamp(crossingCount / Math.max(totalEdges * 0.3, 1));
  factors.push({
    name: 'Оживлённость',
    score: densityScore,
    weight: FACTOR_WEIGHTS.populationDensity,
    detail: densityScore > 0.5 ? 'Оживлённый район' : 'Малолюдный район',
    icon: densityScore > 0.5 ? '👥' : '🏚️',
  });

  if (densityScore < 0.3 && currentHour >= 21) {
    recommendations.push('Малолюдный район в вечернее время — будьте внимательны');
  }

  // ── Factor 6: Incidents (placeholder — загружается из базы) ──
  // По умолчанию 0.7 (нет данных = средний)
  factors.push({
    name: 'Инциденты',
    score: 0.7,
    weight: FACTOR_WEIGHTS.incidents,
    detail: 'Нет недавних инцидентов',
    icon: '🛡️',
  });

  // ── Overall Score ──
  const overallScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

  const label: SafetyAssessment['label'] =
    overallScore >= 0.75 ? 'safe' :
    overallScore >= 0.5 ? 'moderate' :
    overallScore >= 0.3 ? 'caution' : 'unsafe';

  const color =
    label === 'safe' ? '#22c55e' :
    label === 'moderate' ? '#eab308' :
    label === 'caution' ? '#f97316' : '#ef4444';

  return {
    overallScore: clamp(overallScore),
    label,
    color,
    factors,
    recommendations,
    darkSegments,
  };
}

/**
 * Загрузить инциденты из Supabase для зоны маршрута.
 * Обновляет factor "Инциденты" в assessment.
 */
export async function enrichSafetyWithIncidents(
  assessment: SafetyAssessment,
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number }
): Promise<SafetyAssessment> {
  try {
    const { data } = await dbLoose
      .from('road_events')
      .select('event_type, lat, lon')
      .gte('lat', bbox.minLat)
      .lte('lat', bbox.maxLat)
      .gte('lon', bbox.minLon)
      .lte('lon', bbox.maxLon)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // last 30 days
      .limit(100);

    if (!data || data.length === 0) return assessment;

    const dangerousTypes = ['accident', 'hazard', 'crime', 'unsafe_area'];
    const dangerousCount = data.filter((r: Record<string, unknown>) =>
      dangerousTypes.includes(String(r.event_type))
    ).length;

    const incidentScore = clamp(1 - (dangerousCount / 20)); // 20+ incidents = 0

    // Update the incidents factor
    const updated = { ...assessment, factors: [...assessment.factors] };
    const incidentIdx = updated.factors.findIndex(f => f.name === 'Инциденты');
    if (incidentIdx >= 0) {
      updated.factors[incidentIdx] = {
        ...updated.factors[incidentIdx],
        score: incidentScore,
        detail: dangerousCount > 0
          ? `${dangerousCount} инцидент(ов) за 30 дней`
          : 'Нет недавних инцидентов',
        icon: dangerousCount > 5 ? '🚨' : dangerousCount > 0 ? '⚠️' : '🛡️',
      };
    }

    // Recalculate overall
    updated.overallScore = clamp(updated.factors.reduce((s, f) => s + f.score * f.weight, 0));

    if (dangerousCount > 5) {
      updated.recommendations.push(`В этом районе ${dangerousCount} инцидентов за последний месяц`);
    }

    return updated;
  } catch {
    return assessment;
  }
}

/**
 * Быстрая оценка безопасности по координатам (без OSM edge data).
 * Используется когда нет детальных данных о дорогах.
 */
export function quickSafetyEstimate(
  routePoints: LatLng[],
  hour?: number
): SafetyAssessment {
  const fakeEdges: OSMEdgeSafety[] = routePoints.map(() => ({
    highway: 'residential',
    lit: null,
    surface: null,
    sidewalk: true,
    crossing: false,
    maxspeed: null,
  }));
  return evaluateRouteSafety(routePoints, fakeEdges, hour);
}
