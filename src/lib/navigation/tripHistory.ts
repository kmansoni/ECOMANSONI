/**
 * Trip History Tracker — records navigation trips with full metadata.
 *
 * Tracks:
 *   - Start/end time, positions, addresses
 *   - Distance, duration, avg/max speed
 *   - Route geometry (simplified)
 *   - Traffic conditions
 *
 * Storage: Supabase (authenticated) + localStorage (anonymous fallback)
 */

import { dbLoose, supabase } from '@/lib/supabase';
import type { LatLng } from '@/types/taxi';
import type { NavRoute, SavedPlace } from '@/types/navigation';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TripRecord {
  id: string;
  originName: string;
  originAddress: string;
  originLat: number;
  originLon: number;
  destinationName: string;
  destinationAddress: string;
  destinationLat: number;
  destinationLon: number;
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  trafficScore: number | null;
  vehicleType: string;
  routeType: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
  status: 'active' | 'completed' | 'cancelled';
}

export interface ActiveTrip {
  startTime: number;
  origin: LatLng;
  originName: string;
  originAddress: string;
  destination: SavedPlace;
  route: NavRoute;
  // Live tracking
  positions: Array<{ lat: number; lon: number; ts: number; speed: number }>;
  maxSpeed: number;
  totalDistance: number;
}

// ── Active trip state ────────────────────────────────────────────────────────

let activeTrip: ActiveTrip | null = null;
const POSITION_SAMPLE_INTERVAL = 5000; // 5s between samples
let lastSampleTime = 0;

/**
 * Start recording a new trip.
 */
export function startTripRecording(
  origin: LatLng,
  originName: string,
  originAddress: string,
  destination: SavedPlace,
  route: NavRoute,
): void {
  activeTrip = {
    startTime: Date.now(),
    origin,
    originName,
    originAddress,
    destination,
    route,
    positions: [{
      lat: origin.lat,
      lon: origin.lng,
      ts: Date.now(),
      speed: 0,
    }],
    maxSpeed: 0,
    totalDistance: 0,
  };
  lastSampleTime = Date.now();
  console.log('[TripHistory] Recording started:', originName, '→', destination.name);
}

/**
 * Update trip with current position (called from navigation loop).
 */
export function updateTripPosition(position: LatLng, speed: number): void {
  if (!activeTrip) return;

  const now = Date.now();
  if (now - lastSampleTime < POSITION_SAMPLE_INTERVAL) return;

  const lastPos = activeTrip.positions[activeTrip.positions.length - 1];

  // Calculate distance from last point
  const dist = haversine(lastPos.lat, lastPos.lon, position.lat, position.lng);
  activeTrip.totalDistance += dist;

  if (speed > activeTrip.maxSpeed) {
    activeTrip.maxSpeed = speed;
  }

  activeTrip.positions.push({
    lat: position.lat,
    lon: position.lng,
    ts: now,
    speed,
  });

  lastSampleTime = now;
}

/**
 * End trip and save to storage.
 */
export async function endTripRecording(
  status: 'completed' | 'cancelled' = 'completed',
  trafficScore?: number,
): Promise<string | null> {
  if (!activeTrip) return null;

  const trip = activeTrip;
  activeTrip = null;

  const endTime = Date.now();
  const durationSeconds = Math.round((endTime - trip.startTime) / 1000);
  const avgSpeed = durationSeconds > 0
    ? Math.round((trip.totalDistance / 1000) / (durationSeconds / 3600) * 10) / 10
    : 0;

  // Simplify route geometry for storage (every 10th point)
  const geometry = trip.positions
    .filter((_, i) => i % 10 === 0 || i === trip.positions.length - 1)
    .map(p => [p.lon, p.lat]);

  const record: TripRecord = {
    id: crypto.randomUUID(),
    originName: trip.originName,
    originAddress: trip.originAddress,
    originLat: trip.origin.lat,
    originLon: trip.origin.lng,
    destinationName: trip.destination.name,
    destinationAddress: trip.destination.address,
    destinationLat: trip.destination.coordinates.lat,
    destinationLon: trip.destination.coordinates.lng,
    distanceMeters: Math.round(trip.totalDistance),
    durationSeconds,
    avgSpeedKmh: avgSpeed,
    maxSpeedKmh: Math.round(trip.maxSpeed),
    trafficScore: trafficScore ?? null,
    vehicleType: 'car',
    routeType: 'fastest',
    startedAt: new Date(trip.startTime).toISOString(),
    endedAt: new Date(endTime).toISOString(),
    status,
  };

  // Try Supabase first
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    try {
      const { data } = await dbLoose.rpc('save_trip', {
        p_origin_name: record.originName,
        p_origin_address: record.originAddress,
        p_origin_lat: record.originLat,
        p_origin_lon: record.originLon,
        p_dest_name: record.destinationName,
        p_dest_address: record.destinationAddress,
        p_dest_lat: record.destinationLat,
        p_dest_lon: record.destinationLon,
        p_distance_meters: record.distanceMeters,
        p_duration_seconds: record.durationSeconds,
        p_avg_speed: record.avgSpeedKmh,
        p_max_speed: record.maxSpeedKmh,
        p_route_geometry: geometry,
        p_traffic_score: record.trafficScore,
        p_vehicle_type: record.vehicleType,
        p_route_type: record.routeType,
      });

      if (data) {
        record.id = data as string;
      }
    } catch (e) {
      console.warn('[TripHistory] Supabase save failed, using localStorage:', e);
      saveToLocalStorage(record);
    }
  } else {
    saveToLocalStorage(record);
  }

  console.log('[TripHistory] Trip saved:', record.id, status);
  return record.id;
}

// ── Fetch history ────────────────────────────────────────────────────────────

/**
 * Get trip history, combining Supabase + localStorage.
 */
export async function getTripHistory(limit = 50, offset = 0): Promise<TripRecord[]> {
  const results: TripRecord[] = [];

  // Try Supabase
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    try {
      const { data } = await dbLoose.rpc('get_trip_history', {
        p_limit: limit,
        p_offset: offset,
      });

      if (data && Array.isArray(data)) {
        for (const row of data) {
          results.push({
            id: row.id,
            originName: row.origin_name,
            originAddress: row.origin_address || '',
            originLat: row.origin_lat,
            originLon: row.origin_lon,
            destinationName: row.destination_name,
            destinationAddress: row.destination_address || '',
            destinationLat: row.destination_lat,
            destinationLon: row.destination_lon,
            distanceMeters: row.distance_meters,
            durationSeconds: row.duration_seconds,
            avgSpeedKmh: Number(row.avg_speed_kmh),
            maxSpeedKmh: Number(row.max_speed_kmh),
            trafficScore: row.traffic_score,
            vehicleType: row.vehicle_type,
            routeType: row.route_type,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            status: row.status,
          });
        }
      }
    } catch {
      // Fall through to localStorage
    }
  }

  // Merge localStorage trips
  const localTrips = getFromLocalStorage();
  for (const lt of localTrips) {
    if (!results.some(r => r.id === lt.id)) {
      results.push(lt);
    }
  }

  // Sort by start time descending
  results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return results.slice(offset, offset + limit);
}

/**
 * Delete a trip from history.
 */
export async function deleteTrip(tripId: string): Promise<boolean> {
  // Try Supabase
  try {
    const { error } = await dbLoose.from('trip_history').delete().eq('id', tripId);
    if (!error) {
      removeFromLocalStorage(tripId);
      return true;
    }
  } catch { /* fall through */ }

  // localStorage fallback
  removeFromLocalStorage(tripId);
  return true;
}

// ── localStorage fallback ────────────────────────────────────────────────────

const LS_KEY = 'nav_trip_history';
const MAX_LOCAL_TRIPS = 100;

function saveToLocalStorage(record: TripRecord): void {
  try {
    const trips = getFromLocalStorage();
    trips.unshift(record);
    if (trips.length > MAX_LOCAL_TRIPS) trips.length = MAX_LOCAL_TRIPS;
    localStorage.setItem(LS_KEY, JSON.stringify(trips));
  } catch { /* quota exceeded */ }
}

function getFromLocalStorage(): TripRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function removeFromLocalStorage(tripId: string): void {
  try {
    const trips = getFromLocalStorage().filter(t => t.id !== tripId);
    localStorage.setItem(LS_KEY, JSON.stringify(trips));
  } catch { /* ignore */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Check if a trip is currently being recorded */
export function isRecording(): boolean {
  return activeTrip !== null;
}

/** Get active trip info */
export function getActiveTrip(): ActiveTrip | null {
  return activeTrip;
}
