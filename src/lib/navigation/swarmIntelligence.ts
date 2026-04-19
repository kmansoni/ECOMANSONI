/**
 * Swarm Intelligence — Collective Route Optimization.
 *
 * Optimizes not just one user's route, but ALL users simultaneously.
 * Models the city as a multi-agent system where each user's choice
 * affects others (induced demand). Finds Nash equilibria where
 * no individual can improve without harming others.
 *
 * Includes gamification rewards for cooperative behavior.
 */

import type { LatLng } from '@/types/taxi';
import type { TravelMode } from '@/types/navigation';
import type {
  TravelIntention,
  SwarmRecommendation,
  GamificationReward,
  CityMetrics,
} from '@/types/quantum-transport';

// ══════════════════════════════════════════════════════════════════════════
// ZONE GRID (for anonymizing and aggregating travel patterns)
// ══════════════════════════════════════════════════════════════════════════

const ZONE_GRID_SIZE = 0.01; // ~1km zones

function latLngToZone(point: LatLng): string {
  const zLat = Math.floor(point.lat / ZONE_GRID_SIZE);
  const zLng = Math.floor(point.lng / ZONE_GRID_SIZE);
  return `z_${zLat}_${zLng}`;
}

function zoneToCenter(zoneId: string): LatLng {
  const parts = zoneId.split('_');
  const lat = (parseInt(parts[1], 10) + 0.5) * ZONE_GRID_SIZE;
  const lng = (parseInt(parts[2], 10) + 0.5) * ZONE_GRID_SIZE;
  return { lat, lng };
}

// ══════════════════════════════════════════════════════════════════════════
// DEMAND AGGREGATION
// ══════════════════════════════════════════════════════════════════════════

/** Aggregated demand for a zone pair in a time window */
interface ZoneDemand {
  fromZone: string;
  toZone: string;
  timeSlot: number;               // 15-min slot index (0..95)
  intentions: TravelIntention[];
  totalDemand: number;
  modeDistribution: Record<TravelMode, number>;
}

/** Network capacity model for a zone pair */
interface ZoneCapacity {
  fromZone: string;
  toZone: string;
  roadCapacity: number;           // vehicles/hour
  metroCapacity: number;          // passengers/hour
  busCapacity: number;            // passengers/hour
  currentLoad: Record<TravelMode, number>;
}

// In-memory store of current intentions (in production: Supabase Realtime)
const intentionStore = new Map<string, TravelIntention>();
const demandCache = new Map<string, ZoneDemand>();

// ══════════════════════════════════════════════════════════════════════════
// INTENTION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

/** Register user's travel intention (anonymous, opt-in) */
export function registerIntention(intention: TravelIntention): void {
  intentionStore.set(intention.anonymousId, intention);
  invalidateDemandCache(intention.fromZone, intention.toZone);
}

/** Remove user's intention (trip started or cancelled) */
export function removeIntention(anonymousId: string): void {
  const intention = intentionStore.get(anonymousId);
  if (intention) {
    invalidateDemandCache(intention.fromZone, intention.toZone);
    intentionStore.delete(anonymousId);
  }
}

function invalidateDemandCache(fromZone: string, toZone: string): void {
  for (const [key] of demandCache) {
    if (key.includes(fromZone) || key.includes(toZone)) {
      demandCache.delete(key);
    }
  }
}

/** Get aggregated demand for a zone pair */
function getZoneDemand(fromZone: string, toZone: string, timeSlot: number): ZoneDemand {
  const key = `${fromZone}:${toZone}:${timeSlot}`;
  const cached = demandCache.get(key);
  if (cached) return cached;

  const matching: TravelIntention[] = [];
  const modeDistribution: Record<TravelMode, number> = { car: 0, pedestrian: 0, transit: 0, multimodal: 0 };

  for (const [, intention] of intentionStore) {
    if (intention.fromZone !== fromZone || intention.toZone !== toZone) continue;

    // Check time overlap
    const slotStart = timeSlot * 900; // seconds
    const slotEnd = slotStart + 900;
    const [earliest, latest] = intention.departureWindow;
    if (latest < slotStart || earliest > slotEnd) continue;

    matching.push(intention);
    for (const mode of intention.preferredModes) {
      modeDistribution[mode] = (modeDistribution[mode] ?? 0) + 1;
    }
  }

  const demand: ZoneDemand = {
    fromZone,
    toZone,
    timeSlot,
    intentions: matching,
    totalDemand: matching.length,
    modeDistribution,
  };

  demandCache.set(key, demand);
  return demand;
}

// ══════════════════════════════════════════════════════════════════════════
// CAPACITY MODEL (simplified for real-time computation)
// ══════════════════════════════════════════════════════════════════════════

function getZoneCapacity(fromZone: string, toZone: string): ZoneCapacity {
  // In production: loaded from city's traffic model database.
  // Simplified: estimate based on Moscow averages.
  return {
    fromZone,
    toZone,
    roadCapacity: 2000,           // vehicles/hour (typical arterial road)
    metroCapacity: 5000,          // passengers/hour (single direction)
    busCapacity: 800,             // passengers/hour (4 buses × 200 pax)
    currentLoad: { car: 0, pedestrian: 0, transit: 0, multimodal: 0 },
  };
}

/** Compute load factor for a mode (0 = empty, 1 = at capacity, >1 = over capacity) */
function computeLoadFactor(demand: number, capacity: number): number {
  if (capacity <= 0) return 1;
  return demand / capacity;
}

// ══════════════════════════════════════════════════════════════════════════
// SWARM OPTIMIZATION (Nash Equilibrium Search)
// ══════════════════════════════════════════════════════════════════════════

/** Time cost function with congestion effects (BPR formula) */
function bprDelay(freeFlowTime: number, loadFactor: number): number {
  // Bureau of Public Roads formula: t = t_free × (1 + α(v/c)^β)
  const alpha = 0.15;
  const beta = 4;
  return freeFlowTime * (1 + alpha * Math.pow(Math.max(loadFactor, 0), beta));
}

/** Estimate base travel time between zones by mode (seconds) */
function baseTravelTime(fromZone: string, toZone: string, mode: TravelMode): number {
  const from = zoneToCenter(fromZone);
  const to = zoneToCenter(toZone);
  const distKm = haversineKm(from, to);

  const speedKmh: Record<TravelMode, number> = {
    car: 30,
    pedestrian: 5,
    transit: 25,
    multimodal: 22,
  };

  return (distKm / speedKmh[mode]) * 3600;
}

/** Estimate cost between zones by mode (rub) */
function baseTravelCost(fromZone: string, toZone: string, mode: TravelMode): number {
  const from = zoneToCenter(fromZone);
  const to = zoneToCenter(toZone);
  const distKm = haversineKm(from, to);

  const costPerKm: Record<TravelMode, number> = {
    car: 12,      // fuel + depreciation
    pedestrian: 0,
    transit: 3,   // average metro/bus fare per km
    multimodal: 5,
  };

  return distKm * costPerKm[mode];
}

/** CO2 per km by mode (grams) */
const CO2_PER_KM: Record<TravelMode, number> = {
  car: 120, pedestrian: 0, transit: 30, multimodal: 50,
};

/**
 * Compute swarm recommendation for an individual user.
 *
 * 1. Aggregate all intentions in the same corridor
 * 2. Simulate all-car vs mode-shifted scenario
 * 3. Find if shifting this user improves collective welfare
 * 4. If so, recommend shift + compute individual/collective benefits
 */
export function computeSwarmRecommendation(
  intention: TravelIntention
): SwarmRecommendation {
  const { fromZone, toZone, preferredModes } = intention;
  const now = new Date();
  const currentSlot = Math.floor((now.getHours() * 3600 + now.getMinutes() * 60) / 900);

  // Get demand in this corridor
  const demand = getZoneDemand(fromZone, toZone, currentSlot);
  const capacity = getZoneCapacity(fromZone, toZone);

  const originalMode = preferredModes[0] ?? 'car';

  // Compute current load factors
  const carDemand = demand.modeDistribution.car ?? 0;
  const transitDemand = (demand.modeDistribution.transit ?? 0) + (demand.modeDistribution.multimodal ?? 0);

  const roadLoad = computeLoadFactor(carDemand, capacity.roadCapacity);
  const metroLoad = computeLoadFactor(transitDemand, capacity.metroCapacity);

  // If road is near or over capacity, suggest mode shift
  const baseFreeFlowTime = baseTravelTime(fromZone, toZone, 'car');
  const congestedTime = bprDelay(baseFreeFlowTime, roadLoad);

  // Transit time is less affected by demand (until capacity)
  const transitBaseTime = baseTravelTime(fromZone, toZone, 'transit');
  const transitTime = metroLoad > 0.9
    ? transitBaseTime * 1.15 // slight delay when crowded
    : transitBaseTime;

  // Determine best suggestion
  let suggestedMode: TravelMode = originalMode;
  let suggestedDepartureShift = 0;

  if (originalMode === 'car' && roadLoad > 0.7 && metroLoad < 0.85) {
    // Switch to transit
    suggestedMode = 'transit';
  } else if (originalMode === 'car' && roadLoad > 0.85) {
    // Suggest earlier departure
    suggestedDepartureShift = -15; // leave 15 min earlier
    if (metroLoad < 0.8) {
      suggestedMode = 'transit';
    }
  }

  // Compute individual benefit
  const originalTime = originalMode === 'car' ? congestedTime : transitTime;
  const suggestedTime = suggestedMode === 'car'
    ? bprDelay(baseFreeFlowTime, Math.max(roadLoad - 1 / Math.max(carDemand, 1), 0))
    : transitTime;

  const originalCost = baseTravelCost(fromZone, toZone, originalMode);
  const suggestedCost = baseTravelCost(fromZone, toZone, suggestedMode);

  const distKm = haversineKm(zoneToCenter(fromZone), zoneToCenter(toZone));
  const originalCO2 = distKm * (CO2_PER_KM[originalMode] ?? 120);
  const suggestedCO2 = distKm * (CO2_PER_KM[suggestedMode] ?? 120);

  // Collective benefit: if 30% of car users switch, what's the improvement?
  const shiftRate = 0.3;
  const shiftedCarDemand = carDemand * (1 - shiftRate);
  const newRoadLoad = computeLoadFactor(shiftedCarDemand, capacity.roadCapacity);
  const newCongestedTime = bprDelay(baseFreeFlowTime, newRoadLoad);
  const totalTimeSavedPerPerson = congestedTime - newCongestedTime;
  const totalTimeSavedHours = (totalTimeSavedPerPerson * demand.totalDemand) / 3600;
  const totalCO2SavedKg = (carDemand * shiftRate * distKm * CO2_PER_KM.car) / 1000;

  const trafficReduction = roadLoad > 0 ? ((roadLoad - newRoadLoad) / roadLoad) * 100 : 0;

  // Check Nash equilibrium: no one can individually improve by deviating
  const isNash = suggestedMode !== originalMode
    ? suggestedTime <= congestedTime * 1.1 // within 10% — user won't deviate
    : true;

  // Gamification
  let gamificationReward: GamificationReward | undefined;
  if (suggestedMode !== originalMode && suggestedCO2 < originalCO2) {
    gamificationReward = {
      type: 'eco_badge',
      title: 'Зелёный выбор',
      description: `Вы сэкономили ${Math.round(originalCO2 - suggestedCO2)}г CO2`,
      points: Math.round((originalCO2 - suggestedCO2) / 10),
      icon: '🌱',
    };
  }

  return {
    originalMode,
    suggestedMode,
    suggestedDepartureShift,
    individualBenefit: {
      timeSavedSeconds: Math.round(originalTime - suggestedTime),
      costSavedRub: Math.round(originalCost - suggestedCost),
      co2SavedGrams: Math.round(originalCO2 - suggestedCO2),
    },
    collectiveBenefit: {
      trafficReductionPercent: Math.round(trafficReduction * 10) / 10,
      totalTimeSavedHours: Math.round(totalTimeSavedHours * 10) / 10,
      totalCO2SavedKg: Math.round(totalCO2SavedKg * 10) / 10,
    },
    adoptionRate: shiftRate,
    nashEquilibrium: isNash,
    gamificationReward,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// CITY METRICS AGGREGATION
// ══════════════════════════════════════════════════════════════════════════

/** Compute current city-wide metrics from all registered intentions */
export function computeCityMetrics(): CityMetrics {
  let totalAgents = 0;
  let totalSpeed = 0;
  let carCount = 0;
  let transitCount = 0;

  for (const [, intention] of intentionStore) {
    totalAgents++;
    const isDriver = intention.preferredModes.includes('car');
    if (isDriver) {
      carCount++;
      totalSpeed += 30; // average car speed estimate
    } else {
      transitCount++;
      totalSpeed += 25; // average transit speed
    }
  }

  const avgSpeed = totalAgents > 0 ? totalSpeed / totalAgents : 30;
  const congestionIndex = carCount > 0 ? Math.min(carCount / 500, 10) : 0;
  const co2TonsPerHour = (carCount * 30 * 120) / 1_000_000; // car × avg_km × g_per_km → tons
  const transitLoad = transitCount / Math.max(transitCount + carCount, 1);

  return {
    totalAgents,
    avgSpeed,
    congestionIndex,
    co2TonsPerHour,
    publicTransitLoad: transitLoad,
    avgCommuteMinutes: avgSpeed > 0 ? (10 / avgSpeed) * 60 : 30, // ~10km average commute
  };
}

// ══════════════════════════════════════════════════════════════════════════
// UTILITY: Haversine distance
// ══════════════════════════════════════════════════════════════════════════

function haversineKm(a: LatLng, b: LatLng): number {
  const dlat = (a.lat - b.lat) * 111.32;
  const dlng = (a.lng - b.lng) * 111.32 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

// ══════════════════════════════════════════════════════════════════════════
// CONVENIENCE: Create intention from LatLng
// ══════════════════════════════════════════════════════════════════════════

export function createTravelIntention(
  from: LatLng,
  to: LatLng,
  preferredModes: TravelMode[] = ['car'],
  flexibilityMinutes = 15
): TravelIntention {
  const now = Math.floor(Date.now() / 1000);
  return {
    anonymousId: `anon_${Math.random().toString(36).slice(2, 10)}`,
    fromZone: latLngToZone(from),
    toZone: latLngToZone(to),
    departureWindow: [now, now + flexibilityMinutes * 60],
    preferredModes,
    flexibilityMinutes,
  };
}
