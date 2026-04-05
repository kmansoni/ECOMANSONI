import type { LatLng } from '@/types/taxi';
import type { NavRoute, RouteSegment, Maneuver, ManeuverType, TrafficLevel } from '@/types/navigation';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

interface OSRMStep {
  maneuver: {
    type: string;
    modifier?: string;
    location: [number, number];
  };
  name: string;
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

interface OSRMRoute {
  distance: number;
  duration: number;
  legs: Array<{
    steps: OSRMStep[];
  }>;
  geometry: { coordinates: [number, number][] };
}

function parseManeuverType(type: string, modifier?: string): ManeuverType {
  if (type === 'depart') return 'depart';
  if (type === 'arrive') return 'arrive';
  if (type === 'turn') {
    if (modifier === 'left') return 'turn-left';
    if (modifier === 'right') return 'turn-right';
    if (modifier === 'slight left') return 'turn-slight-left';
    if (modifier === 'slight right') return 'turn-slight-right';
    if (modifier === 'sharp left') return 'turn-sharp-left';
    if (modifier === 'sharp right') return 'turn-sharp-right';
    if (modifier === 'uturn') return 'uturn';
    return 'straight';
  }
  if (type === 'merge') return modifier === 'left' ? 'merge-left' : 'merge-right';
  if (type === 'fork') return modifier === 'left' ? 'fork-left' : 'fork-right';
  if (type === 'roundabout turn' || type === 'rotary') return 'roundabout';
  if (type === 'exit roundabout' || type === 'exit rotary') return 'exit-roundabout';
  if (type === 'on ramp') return modifier === 'left' ? 'ramp-left' : 'ramp-right';
  if (type === 'off ramp') return modifier === 'left' ? 'ramp-left' : 'ramp-right';
  if (type === 'continue') {
    if (modifier === 'left') return 'keep-left';
    if (modifier === 'right') return 'keep-right';
    return 'straight';
  }
  if (type === 'new name') return 'straight';
  if (type === 'end of road') return modifier === 'left' ? 'turn-left' : 'turn-right';
  return 'straight';
}

function estimateTraffic(hour: number = new Date().getHours()): TrafficLevel {
  const r = Math.random();

  if ((hour >= 7 && hour < 10) || (hour >= 17 && hour < 20)) {
    // час пик
    if (r < 0.1) return 'congested';
    if (r < 0.4) return 'slow';
    return 'moderate';
  }
  if (hour >= 10 && hour < 17) {
    if (r < 0.5) return 'free';
    if (r < 0.8) return 'moderate';
    return 'slow';
  }
  // ночь
  if (r < 0.7) return 'free';
  if (r < 0.9) return 'moderate';
  return 'slow';
}

function chunkRoute(points: LatLng[], segmentCount: number): RouteSegment[] {
  if (points.length < 2) return [];
  const chunkSize = Math.max(2, Math.floor(points.length / segmentCount));
  const segments: RouteSegment[] = [];

  for (let i = 0; i < points.length; i += chunkSize - 1) {
    const end = Math.min(i + chunkSize, points.length);
    const chunk = points.slice(i, end);
    if (chunk.length >= 2) {
      segments.push({
        points: chunk,
        traffic: estimateTraffic(),
        speedLimit: [40, 60, 80, 100][Math.floor(Math.random() * 4)],
      });
    }
    if (end >= points.length) break;
  }

  return segments;
}

function parseOSRMRoute(raw: OSRMRoute, id: string): NavRoute {
  const geometry = raw.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const maneuvers: Maneuver[] = [];

  for (const leg of raw.legs) {
    for (const step of leg.steps) {
      maneuvers.push({
        type: parseManeuverType(step.maneuver.type, step.maneuver.modifier),
        instruction: '',
        streetName: step.name || '',
        distanceMeters: step.distance,
        durationSeconds: step.duration,
        location: { lat: step.maneuver.location[1], lng: step.maneuver.location[0] },
      });
    }
  }

  const segmentCount = Math.max(5, Math.floor(geometry.length / 30));
  const segments = chunkRoute(geometry, segmentCount);

  return {
    id,
    segments,
    maneuvers,
    totalDistanceMeters: raw.distance,
    totalDurationSeconds: raw.duration,
    geometry,
  };
}

export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  alternatives = true
): Promise<{ main: NavRoute; alternatives: NavRoute[] }> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`OSRM error: ${resp.status}`);

  const data = await resp.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No route found');
  }

  const main = parseOSRMRoute(data.routes[0], 'main');
  const alts = (data.routes as OSRMRoute[])
    .slice(1, 4)
    .map((r, i) => parseOSRMRoute(r, `alt-${i}`));

  return { main, alternatives: alts };
}


