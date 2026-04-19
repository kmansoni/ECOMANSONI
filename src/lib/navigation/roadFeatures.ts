/**
 * roadFeatures.ts — Загрузка и кэширование дорожных объектов:
 * светофоры, лежачие полицейские, дорожные знаки.
 * Данные загружаются из локальных JSON-файлов (скачиваются скриптом fetch-osm-data.mjs).
 */
import type { LatLng } from '@/types/taxi';
import type { NavRoute, NavigationMapObject, RouteObjectRelevance, SpeedCamera } from '@/types/navigation';
import { calculateDistance } from '@/lib/taxi/calculations';

export interface TrafficLight {
  id: string;
  lat: number;
  lon: number;
  type: string;
}

export interface SpeedBump {
  id: string;
  lat: number;
  lon: number;
  type: string; // bump | hump | table | cushion | rumble_strip
}

export interface RoadSign {
  id: string;
  lat: number;
  lon: number;
  type: string; // stop | give_way | crossing | traffic_sign
  value?: string;
}

export interface RoadPoi {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  address?: string | null;
  brand?: string | null;
}

let _trafficLights: TrafficLight[] = [];
let _speedBumps: SpeedBump[] = [];
let _roadSigns: RoadSign[] = [];
let _pois: RoadPoi[] = [];
let _loaded = false;

interface RelevantObjectsOptions {
  position: LatLng;
  route?: NavRoute | null;
  heading?: number;
  speedCameras?: SpeedCamera[];
  showTrafficLights?: boolean;
  showSpeedBumps?: boolean;
  showRoadSigns?: boolean;
  showSpeedCameras?: boolean;
  showPOI?: boolean;
  radiusKm?: number;
}

const PRIORITY_POI_CATEGORIES = new Set(['fuel', 'parking', 'cafe', 'restaurant', 'car_repair', 'hotel']);

let lastRelevantObjectsCache:
  | { key: string; value: NavigationMapObject[] }
  | null = null;

export async function loadRoadFeatures(): Promise<void> {
  if (_loaded) return;
  _loaded = true;

  const results = await Promise.allSettled([
    fetch('/data/osm/traffic_lights.json').then(r => r.ok ? r.json() : []),
    fetch('/data/osm/speed_bumps.json').then(r => r.ok ? r.json() : []),
    fetch('/data/osm/road_signs.json').then(r => r.ok ? r.json() : []),
    fetch('/data/osm/processed/pois.json').then(r => r.ok ? r.json() : []),
  ]);

  if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
    _trafficLights = results[0].value;
  }
  if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
    _speedBumps = results[1].value;
  }
  if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
    _roadSigns = results[2].value;
  }
  if (results[3].status === 'fulfilled' && Array.isArray(results[3].value)) {
    _pois = results[3].value;
  }

  console.log(`[roadFeatures] Загружено: ${_trafficLights.length} светофоров, ${_speedBumps.length} лежачих полицейских, ${_roadSigns.length} знаков, ${_pois.length} POI`);
}

export function getTrafficLights(): TrafficLight[] { return _trafficLights; }
export function getSpeedBumps(): SpeedBump[] { return _speedBumps; }
export function getRoadSigns(): RoadSign[] { return _roadSigns; }
export function getRoadPois(): RoadPoi[] { return _pois; }

/**
 * Возвращает объекты в радиусе (км) от позиции.
 * Оптимизировано через быстрый отброс по dLat/dLon.
 */
export function getNearbyFeatures(
  position: LatLng,
  radiusKm: number = 1
): { lights: TrafficLight[]; bumps: SpeedBump[]; signs: RoadSign[]; pois: RoadPoi[] } {
  const dLatMax = radiusKm / 111.32;
  const dLonMax = radiusKm / (111.32 * Math.cos(position.lat * Math.PI / 180));

  const lights = _trafficLights.filter(f => {
    const dLat = Math.abs(f.lat - position.lat);
    const dLon = Math.abs(f.lon - position.lng);
    return dLat < dLatMax && dLon < dLonMax;
  });

  const bumps = _speedBumps.filter(f => {
    const dLat = Math.abs(f.lat - position.lat);
    const dLon = Math.abs(f.lon - position.lng);
    return dLat < dLatMax && dLon < dLonMax;
  });

  const signs = _roadSigns.filter(f => {
    const dLat = Math.abs(f.lat - position.lat);
    const dLon = Math.abs(f.lon - position.lng);
    return dLat < dLatMax && dLon < dLonMax;
  });

  const pois = _pois.filter((poi) => {
    if (!PRIORITY_POI_CATEGORIES.has(poi.category)) return false;
    const dLat = Math.abs(poi.lat - position.lat);
    const dLon = Math.abs(poi.lon - position.lng);
    return dLat < dLatMax && dLon < dLonMax;
  });

  return { lights, bumps, signs, pois };
}

export function getRelevantMapObjects({
  position,
  route = null,
  heading = 0,
  speedCameras = [],
  showTrafficLights = true,
  showSpeedBumps = true,
  showRoadSigns = true,
  showSpeedCameras = true,
  showPOI = true,
  radiusKm = 1.5,
}: RelevantObjectsOptions): NavigationMapObject[] {
  const cacheKey = [
    position.lat.toFixed(3),
    position.lng.toFixed(3),
    Math.round(heading / 15),
    route?.id ?? 'no-route',
    Number(showTrafficLights),
    Number(showSpeedBumps),
    Number(showRoadSigns),
    Number(showSpeedCameras),
    Number(showPOI),
    speedCameras.length,
  ].join('|');

  if (lastRelevantObjectsCache?.key === cacheKey) {
    return lastRelevantObjectsCache.value;
  }

  const nearby = getNearbyFeatures(position, radiusKm);
  const collected: NavigationMapObject[] = [];

  if (showTrafficLights) {
    collected.push(...nearby.lights.map((light) => buildObject({
      id: `tl-${light.id}`,
      kind: 'traffic_light',
      title: 'Светофор',
      iconText: '🚦',
      location: { lat: light.lat, lng: light.lon },
      position,
      heading,
      route,
    })));
  }

  if (showSpeedBumps) {
    collected.push(...nearby.bumps.map((bump) => buildObject({
      id: `bump-${bump.id}`,
      kind: 'speed_bump',
      title: 'Неровность',
      subtitle: bump.type,
      iconText: '▲',
      location: { lat: bump.lat, lng: bump.lon },
      position,
      heading,
      route,
    })));
  }

  if (showRoadSigns) {
    collected.push(...nearby.signs.map((sign) => buildObject({
      id: `sign-${sign.id}`,
      kind: 'road_sign',
      title: getRoadSignTitle(sign),
      subtitle: sign.value ?? null,
      iconText: getRoadSignIcon(sign),
      location: { lat: sign.lat, lng: sign.lon },
      position,
      heading,
      route,
    })));
  }

  if (showSpeedCameras) {
    collected.push(...speedCameras.map((camera) => buildObject({
      id: `camera-${camera.id}`,
      kind: 'speed_camera',
      title: `Камера ${camera.speedLimit}`,
      subtitle: camera.type,
      iconText: `${camera.speedLimit}`,
      location: camera.location,
      position,
      heading,
      route,
      objectHeading: camera.direction,
    })));
  }

  if (showPOI) {
    collected.push(...nearby.pois.map((poi) => buildObject({
      id: `poi-${poi.id}`,
      kind: 'poi',
      title: poi.name || poi.brand || 'POI',
      subtitle: poi.category,
      iconText: getPoiIcon(poi.category),
      location: { lat: poi.lat, lng: poi.lon },
      position,
      heading,
      route,
    })));
  }

  const sorted = collected
    .sort((left, right) => scoreObject(right) - scoreObject(left))
    .slice(0, 36);

  lastRelevantObjectsCache = { key: cacheKey, value: sorted };
  return sorted;
}

function buildObject({
  id,
  kind,
  title,
  subtitle,
  iconText,
  location,
  position,
  heading,
  route,
  objectHeading,
}: {
  id: string;
  kind: NavigationMapObject['kind'];
  title: string;
  subtitle?: string | null;
  iconText: string;
  location: LatLng;
  position: LatLng;
  heading: number;
  route?: NavRoute | null;
  objectHeading?: number;
}): NavigationMapObject {
  const distanceMeters = calculateDistance(position, location) * 1000;
  const routeDistanceMeters = route ? getRouteDistanceMeters(route, location) : null;
  const ahead = isAhead(position, heading, location);
  const relevance = classifyRelevance(distanceMeters, routeDistanceMeters, ahead);

  return {
    id,
    kind,
    title,
    subtitle,
    iconText,
    location,
    relevance,
    severity: distanceMeters < 120 ? 'critical' : distanceMeters < 300 ? 'warn' : 'info',
    routeDistanceMeters,
    heading: objectHeading ?? null,
    metadata: {
      ahead,
      distanceMeters,
    },
  };
}

function classifyRelevance(
  distanceMeters: number,
  routeDistanceMeters: number | null,
  ahead: boolean,
): RouteObjectRelevance {
  if (ahead && distanceMeters < 450 && (routeDistanceMeters == null || routeDistanceMeters < 120)) {
    return 'primary';
  }

  if ((ahead && distanceMeters < 900) || (routeDistanceMeters != null && routeDistanceMeters < 250)) {
    return 'secondary';
  }

  return 'low';
}

function getRouteDistanceMeters(route: NavRoute, location: LatLng): number {
  let best = Number.POSITIVE_INFINITY;
  for (const point of route.geometry) {
    const distance = calculateDistance(point, location) * 1000;
    if (distance < best) best = distance;
  }
  return Number.isFinite(best) ? best : 999999;
}

function isAhead(position: LatLng, heading: number, target: LatLng): boolean {
  const bearingToTarget = getBearing(position, target);
  const delta = Math.abs((((bearingToTarget - heading) % 360) + 540) % 360 - 180);
  return delta <= 70;
}

function getBearing(from: LatLng, to: LatLng): number {
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function scoreObject(object: NavigationMapObject): number {
  const relevanceScore = object.relevance === 'primary' ? 300 : object.relevance === 'secondary' ? 180 : 60;
  const severityScore = object.severity === 'critical' ? 40 : object.severity === 'warn' ? 20 : 0;
  const routeDistanceScore = object.routeDistanceMeters != null ? Math.max(0, 120 - Math.min(object.routeDistanceMeters, 120)) : 0;
  return relevanceScore + severityScore + routeDistanceScore;
}

function getRoadSignTitle(sign: RoadSign): string {
  switch (sign.type) {
    case 'stop':
      return 'STOP';
    case 'give_way':
      return 'Уступите дорогу';
    case 'crossing':
      return 'Переход';
    default:
      return 'Дорожный знак';
  }
}

function getRoadSignIcon(sign: RoadSign): string {
  switch (sign.type) {
    case 'stop':
      return '🛑';
    case 'give_way':
      return '⚠';
    case 'crossing':
      return '🚸';
    default:
      return '🚧';
  }
}

function getPoiIcon(category: string): string {
  switch (category) {
    case 'fuel':
      return '⛽';
    case 'parking':
      return '🅿';
    case 'cafe':
    case 'restaurant':
      return '☕';
    case 'hotel':
      return '🛏';
    case 'car_repair':
      return '🔧';
    default:
      return '•';
  }
}
