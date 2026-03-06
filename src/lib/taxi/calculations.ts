import type { Tariff, TariffEstimate, LatLng } from '@/types/taxi';

/**
 * Вычисляет расстояние между двумя точками (формула Haversine), км
 */
export function calculateDistance(from: LatLng, to: LatLng): number {
  const R = 6371; // радиус Земли, км
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Оценивает время поездки по расстоянию (упрощённо, с учётом пробок)
 * Средняя скорость в городе — 25 км/ч
 */
export function estimateDuration(distanceKm: number): number {
  const avgSpeedKmH = 25;
  const durationHours = distanceKm / avgSpeedKmH;
  const durationMinutes = durationHours * 60;
  // Добавим traffic factor: +20% для городского трафика
  return Math.round(durationMinutes * 1.2);
}

/**
 * Рассчитывает стоимость поездки для тарифа
 * Формула: base + distance * pricePerKm + duration * pricePerMin
 */
export function calculateTripPrice(
  tariff: Tariff,
  distanceKm: number,
  durationMin: number
): number {
  const raw =
    tariff.basePrice +
    distanceKm * tariff.pricePerKm +
    durationMin * tariff.pricePerMin;

  const withSurge = raw * tariff.surgeMultiplier;
  const final = Math.max(withSurge, tariff.minPrice);
  return Math.round(final);
}

/**
 * Рассчитывает оценки стоимости для всех тарифов
 */
export function estimateAllTariffs(
  tariffs: Tariff[],
  from: LatLng,
  to: LatLng
): TariffEstimate[] {
  const distanceKm = calculateDistance(from, to);
  // Добавим коэффициент маршрута: реальный путь ~30% длиннее прямой
  const routeDistance = distanceKm * 1.3;
  const durationMin = estimateDuration(routeDistance);

  return tariffs.map((tariff) => ({
    ...tariff,
    estimatedPrice: calculateTripPrice(tariff, routeDistance, durationMin),
    estimatedDuration: durationMin,
    estimatedDistance: routeDistance,
  }));
}

/**
 * Генерирует случайный surge-мультипликатор с вероятностями
 */
export function generateSurgeMultiplier(): number {
  const rand = Math.random();
  if (rand < 0.6) return 1.0;   // 60% — нет surge
  if (rand < 0.8) return 1.2;   // 20% — небольшой surge
  if (rand < 0.92) return 1.5;  // 12% — средний surge
  return 2.0;                   // 8% — высокий surge
}

/**
 * Рассчитывает стоимость чаевых из набора предустановленных значений
 */
export const TIPS_PRESETS = [0, 50, 100, 150, 200];

/**
 * Рассчитывает рекомендуемую сумму чаевых (10% от стоимости)
 */
export function recommendedTip(price: number): number {
  return Math.round(price * 0.1 / 50) * 50; // Округляем до 50 руб
}

/**
 * Интерполирует позицию по маршруту для анимации движения водителя
 */
export function interpolatePosition(
  from: LatLng,
  to: LatLng,
  progress: number // 0..1
): LatLng {
  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress,
  };
}

/**
 * Генерирует промежуточные точки маршрута для симуляции движения
 */
export function generateRoutePoints(from: LatLng, to: LatLng, steps = 20): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    // Добавим небольшое отклонение для реалистичности маршрута
    const noise = 0.001 * Math.sin(progress * Math.PI * 3);
    points.push({
      lat: from.lat + (to.lat - from.lat) * progress + noise,
      lng: from.lng + (to.lng - from.lng) * progress + noise * 0.5,
    });
  }
  return points;
}
