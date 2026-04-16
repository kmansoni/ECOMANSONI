/**
 * Crisis Mesh — Haversine distance для SOS radius.
 */

const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Великое круговое расстояние между двумя точками в километрах.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Проверка: точка внутри радиуса.
 */
export function isWithinRadius(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusKm: number,
): boolean {
  return haversineKm(lat1, lon1, lat2, lon2) <= radiusKm;
}

/**
 * Bounding box для быстрой pre-filtering перед haversine.
 * Возвращает [minLat, maxLat, minLon, maxLon].
 */
export function boundingBox(
  lat: number,
  lon: number,
  radiusKm: number,
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const deltaLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const deltaLon = deltaLat / Math.cos(toRadians(lat));
  return {
    minLat: lat - deltaLat,
    maxLat: lat + deltaLat,
    minLon: lon - deltaLon,
    maxLon: lon + deltaLon,
  };
}
