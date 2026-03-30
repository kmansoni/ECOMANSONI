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

function generateTraffic(): TrafficLevel {
  const r = Math.random();
  if (r < 0.5) return 'free';
  if (r < 0.75) return 'moderate';
  if (r < 0.9) return 'slow';
  return 'congested';
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
        traffic: generateTraffic(),
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

export function generateFallbackRoute(from: LatLng, to: LatLng): NavRoute {
  const steps = 50;
  const points: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const jitter = i > 0 && i < steps ? (Math.random() - 0.5) * 0.002 : 0;
    points.push({
      lat: from.lat + (to.lat - from.lat) * t + jitter,
      lng: from.lng + (to.lng - from.lng) * t + jitter,
    });
  }

  const R = 6371000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dur = (dist / 1000 / 35) * 3600;

  return {
    id: 'fallback',
    segments: chunkRoute(points, 5),
    maneuvers: [
      { type: 'depart', instruction: '', streetName: '', distanceMeters: dist * 0.3, durationSeconds: dur * 0.3, location: from },
      { type: 'turn-right', instruction: '', streetName: '', distanceMeters: dist * 0.4, durationSeconds: dur * 0.4, location: points[Math.floor(steps * 0.3)] },
      { type: 'straight', instruction: '', streetName: '', distanceMeters: dist * 0.2, durationSeconds: dur * 0.2, location: points[Math.floor(steps * 0.7)] },
      { type: 'arrive', instruction: '', streetName: '', distanceMeters: dist * 0.1, durationSeconds: dur * 0.1, location: to },
    ],
    totalDistanceMeters: dist,
    totalDurationSeconds: dur,
    geometry: points,
  };
}
