import type { LatLng } from '@/types/taxi';
import type { SpeedCamera } from '@/types/navigation';
import { calculateDistance } from '@/lib/taxi/calculations';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// Камеры Москвы и СПб — статичный набор, расширяется через nav_speed_cameras в Supabase
const BUILTIN_CAMERAS: SpeedCamera[] = [
  { id: 'cam-1', location: { lat: 55.7558, lng: 37.6173 }, speedLimit: 60, direction: 0, type: 'fixed' },
  { id: 'cam-2', location: { lat: 55.7620, lng: 37.6250 }, speedLimit: 60, direction: 90, type: 'fixed' },
  { id: 'cam-3', location: { lat: 55.7510, lng: 37.6100 }, speedLimit: 80, direction: 180, type: 'fixed' },
  { id: 'cam-4', location: { lat: 55.7700, lng: 37.5950 }, speedLimit: 60, direction: 270, type: 'fixed' },
  { id: 'cam-5', location: { lat: 55.7450, lng: 37.6300 }, speedLimit: 40, direction: 45, type: 'fixed' },
  { id: 'cam-6', location: { lat: 55.7800, lng: 37.6500 }, speedLimit: 60, direction: 135, type: 'fixed' },
  { id: 'cam-7', location: { lat: 55.7350, lng: 37.5800 }, speedLimit: 80, direction: 0, type: 'fixed' },
  { id: 'cam-8', location: { lat: 55.7900, lng: 37.5600 }, speedLimit: 60, direction: 90, type: 'fixed' },
  { id: 'cam-9', location: { lat: 55.7650, lng: 37.5700 }, speedLimit: 60, direction: 180, type: 'average' },
  { id: 'cam-10', location: { lat: 55.7400, lng: 37.6600 }, speedLimit: 60, direction: 270, type: 'fixed' },
  { id: 'cam-11', location: { lat: 59.9343, lng: 30.3351 }, speedLimit: 60, direction: 0, type: 'fixed' },
  { id: 'cam-12', location: { lat: 59.9400, lng: 30.3150 }, speedLimit: 80, direction: 90, type: 'fixed' },
  { id: 'cam-13', location: { lat: 59.9250, lng: 30.3500 }, speedLimit: 60, direction: 180, type: 'fixed' },
];

let _cameras: SpeedCamera[] = BUILTIN_CAMERAS;
let _loaded = false;

/** Загружает камеры из Supabase (таблица nav_speed_cameras). Если таблица не существует — fallback на встроенные */
export async function loadSpeedCameras(): Promise<SpeedCamera[]> {
  if (_loaded) return _cameras;
  try {
    // ⚠️ таблица может не существовать, поэтому обходим строгую типизацию
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client.from('nav_speed_cameras')
      .select('id, lat, lng, speed_limit, direction, type')
      .limit(500);
    if (error) throw error;
    if (data?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _cameras = (data as any[]).map((row) => ({
        id: String(row.id),
        location: { lat: Number(row.lat), lng: Number(row.lng) },
        speedLimit: Number(row.speed_limit),
        direction: Number(row.direction),
        type: (String(row.type) as SpeedCamera['type']) || 'fixed',
      }));
    }
  } catch (err) {
    logger.debug('[speedCameras] nav_speed_cameras недоступна, используем встроенные', err);
  }
  _loaded = true;
  return _cameras;
}

const WARN_RADIUS_KM = 0.8; // warn 800m ahead
const ALERT_RADIUS_KM = 0.3; // alert within 300m

export function getNearbyCamera(position: LatLng, heading: number): SpeedCamera | null {
  let closest: SpeedCamera | null = null;
  let closestDist = Infinity;

  for (const cam of _cameras) {
    const dist = calculateDistance(position, cam.location);
    if (dist > WARN_RADIUS_KM) continue;

    // камера впереди? (±60° от курса)
    const bearing = getBearing(position, cam.location);
    const diff = Math.abs(normalizeDeg(bearing - heading));
    if (diff > 60) continue;

    if (dist < closestDist) {
      closestDist = dist;
      closest = cam;
    }
  }

  return closest;
}

export function getCameraDistance(position: LatLng, camera: SpeedCamera): number {
  return calculateDistance(position, camera.location) * 1000; // meters
}

export function isCameraAlert(position: LatLng, camera: SpeedCamera): boolean {
  return calculateDistance(position, camera.location) <= ALERT_RADIUS_KM;
}

export function getCamerasOnRoute(routePoints: LatLng[]): SpeedCamera[] {
  const result: SpeedCamera[] = [];
  for (const cam of _cameras) {
    for (const point of routePoints) {
      if (calculateDistance(point, cam.location) < 0.1) { // within 100m of route
        result.push(cam);
        break;
      }
    }
  }
  return result;
}

function getBearing(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
