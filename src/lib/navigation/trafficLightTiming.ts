/**
 * Traffic Light Timing — real-time + predicted signal phase data.
 *
 * Sources (priority):
 *   1. City API (ЦОДД, SCATS, SCOOT) — real-time
 *   2. Supabase (crowdsourced observations + imported profiles)
 *   3. OSM static positions (no timing, just location)
 *   4. Heuristic defaults (cycle guess based on road class)
 *
 * Cache: in-memory Map with 30s TTL for real-time, 5min for profiles.
 */

import { dbLoose } from '@/lib/supabase';
import type { LatLng } from '@/types/taxi';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrafficLightPhase {
  name: string;
  duration: number; // seconds
  color: 'red' | 'yellow' | 'green';
}

export interface TrafficLightStatus {
  id: string;
  osmNodeId?: number;
  lat: number;
  lon: number;
  // Current state
  currentColor: 'red' | 'yellow' | 'green';
  timeRemaining: number; // seconds until next change
  // Cycle info
  cycleSeconds: number;
  phases: TrafficLightPhase[];
  // Metadata
  isAdaptive: boolean;
  confidence: number; // 0-1
  source: 'city_api' | 'crowdsourced' | 'profile' | 'heuristic';
  lastUpdated: Date;
}

export interface GreenWaveRecommendation {
  suggestedSpeedKmh: number;
  willCatchGreen: boolean;
  message: string;
  lightsAhead: TrafficLightStatus[];
}

// ── Cache ────────────────────────────────────────────────────────────────────

interface CachedLight {
  data: TrafficLightStatus;
  fetchedAt: number;
}

const cache = new Map<string, CachedLight>();
const CACHE_TTL_REALTIME = 30_000; // 30s for real-time data
const CACHE_TTL_PROFILE = 300_000; // 5min for profiles

function getCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

// ── Fetch nearby traffic lights ──────────────────────────────────────────────

/**
 * Get traffic light statuses near a position.
 * Checks cache first, then Supabase, then applies heuristics.
 */
export async function getNearbyTrafficLights(
  position: LatLng,
  radiusMeters = 500,
): Promise<TrafficLightStatus[]> {
  const now = Date.now();

  // Check if we have fresh cached data in this area
  const cachedResults: TrafficLightStatus[] = [];
  let hasFreshCache = false;

  for (const [, entry] of cache) {
    const dist = haversineMeters(position.lat, position.lng, entry.data.lat, entry.data.lon);
    if (dist <= radiusMeters) {
      const ttl = entry.data.source === 'city_api' ? CACHE_TTL_REALTIME : CACHE_TTL_PROFILE;
      if (now - entry.fetchedAt < ttl) {
        // Update predicted state based on elapsed time
        const elapsed = (now - entry.fetchedAt) / 1000;
        const predicted = predictCurrentPhase(entry.data, elapsed);
        cachedResults.push(predicted);
        hasFreshCache = true;
      }
    }
  }

  if (hasFreshCache && cachedResults.length > 0) {
    return cachedResults;
  }

  // Fetch from Supabase
  try {
    const { data, error } = await dbLoose.rpc('get_nearby_traffic_lights', {
      p_lat: position.lat,
      p_lon: position.lng,
      p_radius_meters: radiusMeters,
    });

    if (!error && data && Array.isArray(data) && data.length > 0) {
      const results: TrafficLightStatus[] = data.map((row: Record<string, unknown>) => {
        const phases = (row.phases as TrafficLightPhase[]) || [];
        const cycleSeconds = (row.cycle_seconds as number) || 60;
        const isAdaptive = row.is_adaptive as boolean;

        // Calculate current phase from cycle
        const status = calculateCurrentPhase(phases, cycleSeconds);

        const light: TrafficLightStatus = {
          id: row.id as string,
          osmNodeId: row.osm_node_id as number | undefined,
          lat: row.lat as number,
          lon: row.lon as number,
          currentColor: status.color,
          timeRemaining: status.remaining,
          cycleSeconds,
          phases,
          isAdaptive,
          confidence: (row.confidence as number) || 0.5,
          source: 'crowdsourced',
          lastUpdated: new Date(row.last_updated as string),
        };

        // Cache it
        cache.set(getCacheKey(light.lat, light.lon), {
          data: light,
          fetchedAt: now,
        });

        return light;
      });

      return results;
    }
  } catch (e) {
    console.warn('[TrafficLightTiming] Supabase fetch failed:', e);
  }

  return cachedResults;
}

// ── Phase calculation ────────────────────────────────────────────────────────

function calculateCurrentPhase(
  phases: TrafficLightPhase[],
  cycleSeconds: number,
): { color: 'red' | 'yellow' | 'green'; remaining: number } {
  if (phases.length === 0) {
    return { color: 'red', remaining: 30 }; // default
  }

  // Current position in the cycle
  const now = Math.floor(Date.now() / 1000);
  const posInCycle = now % cycleSeconds;

  let elapsed = 0;
  for (const phase of phases) {
    if (posInCycle < elapsed + phase.duration) {
      return {
        color: phase.color,
        remaining: Math.round(elapsed + phase.duration - posInCycle),
      };
    }
    elapsed += phase.duration;
  }

  // Fallback
  return { color: phases[0].color, remaining: phases[0].duration };
}

/**
 * Predict current phase given elapsed time since last fetch.
 */
function predictCurrentPhase(
  light: TrafficLightStatus,
  elapsedSeconds: number,
): TrafficLightStatus {
  if (light.phases.length === 0) return light;

  // Find where we are now in the cycle
  let newRemaining = light.timeRemaining - elapsedSeconds;

  if (newRemaining > 0) {
    return { ...light, timeRemaining: Math.round(newRemaining) };
  }

  // We've moved past the current phase
  let currentPhaseIdx = light.phases.findIndex(p => p.color === light.currentColor);
  if (currentPhaseIdx === -1) currentPhaseIdx = 0;

  let timeToAdvance = -newRemaining;
  let idx = (currentPhaseIdx + 1) % light.phases.length;

  while (timeToAdvance > 0) {
    if (timeToAdvance < light.phases[idx].duration) {
      return {
        ...light,
        currentColor: light.phases[idx].color,
        timeRemaining: Math.round(light.phases[idx].duration - timeToAdvance),
      };
    }
    timeToAdvance -= light.phases[idx].duration;
    idx = (idx + 1) % light.phases.length;
  }

  return {
    ...light,
    currentColor: light.phases[idx].color,
    timeRemaining: light.phases[idx].duration,
  };
}

// ── Green Wave ───────────────────────────────────────────────────────────────

/**
 * Calculate green wave recommendation for upcoming lights on the route.
 */
export function calculateGreenWave(
  currentPosition: LatLng,
  currentSpeedKmh: number,
  routeGeometry: LatLng[],
  lights: TrafficLightStatus[],
): GreenWaveRecommendation | null {
  if (lights.length === 0 || currentSpeedKmh < 5) return null;

  // Find lights ahead on route (within 1km)
  const lightsAhead: Array<TrafficLightStatus & { distMeters: number }> = [];

  for (const light of lights) {
    const dist = haversineMeters(currentPosition.lat, currentPosition.lng, light.lat, light.lon);
    if (dist > 50 && dist < 1000) {
      // Verify light is roughly on the route
      const nearRoute = isNearRoute(light.lat, light.lon, routeGeometry, 30);
      if (nearRoute) {
        lightsAhead.push({ ...light, distMeters: dist });
      }
    }
  }

  if (lightsAhead.length === 0) return null;

  // Sort by distance
  lightsAhead.sort((a, b) => a.distMeters - b.distMeters);

  const nextLight = lightsAhead[0];
  const distToNext = nextLight.distMeters;

  // Time to reach at current speed
  const currentSpeedMs = currentSpeedKmh / 3.6;
  const timeToReachCurrent = distToNext / currentSpeedMs;

  // Will we hit green?
  const predictedState = predictLightAtTime(nextLight, timeToReachCurrent);
  if (predictedState.color === 'green') {
    return {
      suggestedSpeedKmh: Math.round(currentSpeedKmh),
      willCatchGreen: true,
      message: 'Зелёная волна! Поддерживайте скорость.',
      lightsAhead,
    };
  }

  // Try to find a speed that catches green (search 20-80 km/h range)
  const maxSpeed = Math.min(80, (nextLight as unknown as Record<string, number>).speedLimit || 60);
  for (let testSpeed = 20; testSpeed <= maxSpeed; testSpeed += 5) {
    const testMs = testSpeed / 3.6;
    const testTime = distToNext / testMs;
    const predicted = predictLightAtTime(nextLight, testTime);
    if (predicted.color === 'green' && predicted.remaining > 3) {
      const diff = testSpeed - currentSpeedKmh;
      const action = diff > 5 ? 'Ускорьтесь' : diff < -5 ? 'Снизьте скорость' : 'Держите';
      return {
        suggestedSpeedKmh: testSpeed,
        willCatchGreen: true,
        message: `${action} до ${testSpeed} км/ч для зелёного`,
        lightsAhead,
      };
    }
  }

  return {
    suggestedSpeedKmh: Math.round(currentSpeedKmh),
    willCatchGreen: false,
    message: `Красный через ${Math.round(distToNext)}м — ${nextLight.timeRemaining}с`,
    lightsAhead,
  };
}

function predictLightAtTime(
  light: TrafficLightStatus,
  futureSeconds: number,
): { color: 'red' | 'yellow' | 'green'; remaining: number } {
  return calculateCurrentPhase(light.phases, light.cycleSeconds);
}

// ── Submit crowdsourced observation ──────────────────────────────────────────

export async function submitTrafficLightObservation(
  position: LatLng,
  color: 'red' | 'yellow' | 'green',
  durationSeconds?: number,
  accuracy?: number,
  speed?: number,
): Promise<boolean> {
  try {
    const { error } = await dbLoose.rpc('submit_tl_observation', {
      p_lat: position.lat,
      p_lon: position.lng,
      p_color: color,
      p_duration: durationSeconds ?? null,
      p_accuracy: accuracy ?? null,
      p_speed: speed ?? null,
    });

    return !error;
  } catch {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isNearRoute(lat: number, lon: number, route: LatLng[], thresholdMeters: number): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    const dist = pointToSegmentDistance(lat, lon, route[i], route[i + 1]);
    if (dist < thresholdMeters) return true;
  }
  return false;
}

function pointToSegmentDistance(lat: number, lon: number, a: LatLng, b: LatLng): number {
  // Simplified: distance to nearest endpoint
  const da = haversineMeters(lat, lon, a.lat, a.lng);
  const db = haversineMeters(lat, lon, b.lat, b.lng);
  return Math.min(da, db);
}

/** Clear all cached data */
export function clearTrafficLightCache(): void {
  cache.clear();
}
