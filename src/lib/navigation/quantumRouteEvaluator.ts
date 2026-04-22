/**
 * Quantum-Inspired Route Evaluator.
 *
 * Implements superposition routing: all candidate routes exist simultaneously
 * as a wave function. Amplitude encodes multi-objective quality, phase encodes
 * uncertainty. When user selects a route the wave function collapses.
 *
 * Uses Pareto-front analysis in high-dimensional objective space to show not
 * just "3 routes" but the full cloud of non-dominated alternatives.
 */

import type { NavRoute, MultiModalRoute, TravelMode } from '@/types/navigation';
import type { LatLng } from '@/types/taxi';
import type {
  ComplexNumber,
  RouteWaveFunction,
  RouteSuperposition,
  ParetoPoint,
  RouteObjectives,
  RouteEmbedding,
  RouteArchetype,
  SemanticRouteProfile,
} from '@/types/quantum-transport';
import type { RouteWeights } from '@/lib/navigation/routePreferenceLearner';

// ══════════════════════════════════════════════════════════════════════════
// WAVE FUNCTION EVALUATION
// ══════════════════════════════════════════════════════════════════════════

const DEFAULT_WEIGHTS: RouteWeights = {
  time: 0.30,
  cost: 0.20,
  eco: 0.15,
  safety: 0.15,
  comfort: 0.10,
  transfers: 0.10,
};

/** Extract multi-objective scores from a NavRoute */
export function extractObjectives(route: NavRoute, mode: TravelMode = 'car'): RouteObjectives {
  const dist = route.totalDistanceMeters;
  const dur = route.totalDurationSeconds;

  // CO2 estimate (g/km) by mode
  const co2PerKm: Record<string, number> = {
    car: 120, pedestrian: 0, transit: 40, multimodal: 60,
  };
  const co2Grams = (dist / 1000) * (co2PerKm[mode] ?? 120);

  // Cost estimate (rub/km) by mode
  const costPerKm: Record<string, number> = {
    car: 8, pedestrian: 0, transit: 2.5, multimodal: 4,
  };
  const costRub = (dist / 1000) * (costPerKm[mode] ?? 8);

  // Safety: fewer maneuvers → safer (simplified)
  const complexManeuvers = route.maneuvers.filter(m =>
    m.type.includes('sharp') || m.type === 'uturn' || m.type === 'roundabout'
  ).length;
  const safetyScore = Math.max(0, 1 - complexManeuvers * 0.1);

  // Comfort: fewer segments with congestion → more comfortable
  const congestedSegments = route.segments.filter(s => s.traffic === 'congested' || s.traffic === 'slow').length;
  const comfortScore = Math.max(0, 1 - congestedSegments / Math.max(route.segments.length, 1));

  // Reliability: based on traffic variability
  const unknownTraffic = route.segments.filter(s => s.traffic === 'unknown').length;
  const reliabilityScore = Math.max(0.3, 1 - unknownTraffic / Math.max(route.segments.length, 1));

  // Walking distance (approximation for car routes)
  const walkingMeters = mode === 'pedestrian' ? dist : 0;

  return {
    timeSeconds: dur,
    costRub,
    co2Grams,
    safetyScore,
    comfortScore,
    reliabilityScore,
    transfers: 0,
    walkingMeters,
  };
}

/** Extract objectives from a multimodal route */
export function extractMultiModalObjectives(route: MultiModalRoute): RouteObjectives {
  const co2Map: Record<string, number> = {
    walk: 0, transit: 40, car: 120,
  };

  let totalCO2 = 0;
  let totalCost = 0;
  let walkingMeters = 0;

  for (const seg of route.segments) {
    const distKm = seg.distanceMeters / 1000;
    totalCO2 += distKm * (co2Map[seg.mode] ?? 60);
    if (seg.mode === 'walk') {
      walkingMeters += seg.distanceMeters;
    }
    if (seg.taxiEstimate) {
      totalCost += seg.taxiEstimate.priceRub;
    } else if (seg.mode === 'transit') {
      totalCost += 50; // fixed fare estimate
    } else if (seg.mode === 'car') {
      totalCost += distKm * 8;
    }
  }

  return {
    timeSeconds: route.totalDurationSeconds,
    costRub: route.fare ?? totalCost,
    co2Grams: totalCO2,
    safetyScore: 0.8,
    comfortScore: Math.max(0, 1 - route.transfers * 0.15),
    reliabilityScore: 0.7,
    transfers: route.transfers,
    walkingMeters,
  };
}

/**
 * Compute wave function for a single route.
 * Amplitude = weighted multi-objective score.
 * Phase = uncertainty (more unknowns → larger phase spread).
 */
function computeWaveFunction(
  routeId: string,
  objectives: RouteObjectives,
  weights: RouteWeights,
  maxObjectives: RouteObjectives
): RouteWaveFunction {
  // Normalize each objective to [0..1] (higher = better)
  const normTime = 1 - clamp(objectives.timeSeconds / Math.max(maxObjectives.timeSeconds, 1), 0, 1);
  const normCost = 1 - clamp(objectives.costRub / Math.max(maxObjectives.costRub, 1), 0, 1);
  const normCO2 = 1 - clamp(objectives.co2Grams / Math.max(maxObjectives.co2Grams, 1), 0, 1);
  const normSafety = objectives.safetyScore;
  const normComfort = objectives.comfortScore;
  const normTransfers = 1 - clamp(objectives.transfers / 4, 0, 1);

  // Amplitude = weighted sum of normalized objectives
  const amplitude =
    weights.time * normTime +
    weights.cost * normCost +
    weights.eco * normCO2 +
    weights.safety * normSafety +
    weights.comfort * normComfort +
    weights.transfers * normTransfers;

  // Phase = function of uncertainty (reliability, unknown traffic, etc.)
  const uncertainty = 1 - objectives.reliabilityScore;
  const phase = uncertainty * 2 * Math.PI;

  // Probability = |amplitude|² (Born rule analogy)
  const probability = amplitude * amplitude;

  return {
    routeId,
    amplitude: clamp(amplitude, 0, 1),
    phase,
    probability,
    collapsed: false,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PARETO FRONT (MULTI-OBJECTIVE OPTIMIZATION)
// ══════════════════════════════════════════════════════════════════════════

/** Check if objective A dominates objective B (better in all dimensions) */
function dominates(a: RouteObjectives, b: RouteObjectives): boolean {
  const aBetter =
    a.timeSeconds <= b.timeSeconds &&
    a.costRub <= b.costRub &&
    a.co2Grams <= b.co2Grams &&
    a.safetyScore >= b.safetyScore &&
    a.comfortScore >= b.comfortScore &&
    a.transfers <= b.transfers;

  if (!aBetter) return false;

  // Must be strictly better in at least one dimension
  return (
    a.timeSeconds < b.timeSeconds ||
    a.costRub < b.costRub ||
    a.co2Grams < b.co2Grams ||
    a.safetyScore > b.safetyScore ||
    a.comfortScore > b.comfortScore ||
    a.transfers < b.transfers
  );
}

/** Compute Pareto front from a set of routes with their objectives */
function computeParetoFront(
  routeObjectives: Array<{ routeId: string; objectives: RouteObjectives }>
): ParetoPoint[] {
  const points: ParetoPoint[] = routeObjectives.map(ro => ({
    routeId: ro.routeId,
    objectives: ro.objectives,
    dominates: [],
    rank: 0,
  }));

  // Compute dominance relationships
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      if (dominates(points[i].objectives, points[j].objectives)) {
        points[i].dominates.push(points[j].routeId);
      }
    }
  }

  // Assign Pareto ranks (non-dominated sorting)
  const assigned = new Set<number>();
  let currentRank = 0;

  while (assigned.size < points.length) {
    const frontIndices: number[] = [];

    for (let i = 0; i < points.length; i++) {
      if (assigned.has(i)) continue;

      // Check if any unassigned point dominates this one
      let isDominated = false;
      for (let j = 0; j < points.length; j++) {
        if (i === j || assigned.has(j)) continue;
        if (dominates(points[j].objectives, points[i].objectives)) {
          isDominated = true;
          break;
        }
      }

      if (!isDominated) {
        frontIndices.push(i);
      }
    }

    for (const idx of frontIndices) {
      points[idx].rank = currentRank;
      assigned.add(idx);
    }

    currentRank++;
    if (frontIndices.length === 0) break; // safety
  }

  return points;
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API: SUPERPOSITION ROUTING
// ══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate all routes as a quantum superposition.
 * Returns wave functions + Pareto front for interactive exploration.
 */
export function evaluateRouteSuperposition(
  routes: NavRoute[],
  weights: RouteWeights = DEFAULT_WEIGHTS,
  mode: TravelMode = 'car'
): RouteSuperposition {
  if (routes.length === 0) {
    return { waveFunctions: [], totalProbability: 0, paretoFront: [], dominatedCount: 0 };
  }

  // Extract objectives for all routes
  const allObjectives = routes.map(r => ({
    routeId: r.id,
    objectives: extractObjectives(r, mode),
  }));

  // Find maxima for normalization
  const maxObj: RouteObjectives = {
    timeSeconds: Math.max(...allObjectives.map(o => o.objectives.timeSeconds), 1),
    costRub: Math.max(...allObjectives.map(o => o.objectives.costRub), 1),
    co2Grams: Math.max(...allObjectives.map(o => o.objectives.co2Grams), 1),
    safetyScore: 1,
    comfortScore: 1,
    reliabilityScore: 1,
    transfers: Math.max(...allObjectives.map(o => o.objectives.transfers), 1),
    walkingMeters: Math.max(...allObjectives.map(o => o.objectives.walkingMeters), 1),
  };

  // Compute wave functions
  const waveFunctions = allObjectives.map(o =>
    computeWaveFunction(o.routeId, o.objectives, weights, maxObj)
  );

  // Normalize probabilities to sum to 1
  const totalRaw = waveFunctions.reduce((s, wf) => s + wf.probability, 0);
  if (totalRaw > 0) {
    for (const wf of waveFunctions) {
      wf.probability /= totalRaw;
    }
  }

  // Compute Pareto front
  const paretoFront = computeParetoFront(allObjectives);
  const dominatedCount = paretoFront.filter(p => p.rank > 0).length;

  return {
    waveFunctions,
    totalProbability: 1.0,
    paretoFront,
    dominatedCount,
  };
}

/**
 * Evaluate multimodal routes as a superposition.
 */
export function evaluateMultiModalSuperposition(
  routes: MultiModalRoute[],
  weights: RouteWeights = DEFAULT_WEIGHTS
): RouteSuperposition {
  if (routes.length === 0) {
    return { waveFunctions: [], totalProbability: 0, paretoFront: [], dominatedCount: 0 };
  }

  const allObjectives = routes.map(r => ({
    routeId: r.id,
    objectives: extractMultiModalObjectives(r),
  }));

  const maxObj: RouteObjectives = {
    timeSeconds: Math.max(...allObjectives.map(o => o.objectives.timeSeconds), 1),
    costRub: Math.max(...allObjectives.map(o => o.objectives.costRub), 1),
    co2Grams: Math.max(...allObjectives.map(o => o.objectives.co2Grams), 1),
    safetyScore: 1,
    comfortScore: 1,
    reliabilityScore: 1,
    transfers: Math.max(...allObjectives.map(o => o.objectives.transfers), 1),
    walkingMeters: Math.max(...allObjectives.map(o => o.objectives.walkingMeters), 1),
  };

  const waveFunctions = allObjectives.map(o =>
    computeWaveFunction(o.routeId, o.objectives, weights, maxObj)
  );

  const totalRaw = waveFunctions.reduce((s, wf) => s + wf.probability, 0);
  if (totalRaw > 0) {
    for (const wf of waveFunctions) {
      wf.probability /= totalRaw;
    }
  }

  const paretoFront = computeParetoFront(allObjectives);
  const dominatedCount = paretoFront.filter(p => p.rank > 0).length;

  return { waveFunctions, totalProbability: 1.0, paretoFront, dominatedCount };
}

/**
 * Collapse the superposition: user has selected a route.
 * Records the measurement event and returns probability distribution update.
 */
export function collapseSuperposition(
  superposition: RouteSuperposition,
  selectedRouteId: string
): RouteSuperposition {
  return {
    ...superposition,
    waveFunctions: superposition.waveFunctions.map(wf => ({
      ...wf,
      collapsed: true,
      probability: wf.routeId === selectedRouteId ? 1.0 : 0.0,
      amplitude: wf.routeId === selectedRouteId ? 1.0 : 0.0,
    })),
    observedAt: new Date(),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ROUTE EMBEDDINGS (128-DIMENSIONAL SPACE)
// ══════════════════════════════════════════════════════════════════════════

const EMBEDDING_DIM = 128;

/**
 * Embed a route into a 128-dimensional vector space.
 * First dimensions encode explicit objectives, remaining dimensions
 * encode structural features (turn patterns, mode transitions, etc.)
 */
export function embedRoute(
  route: NavRoute,
  mode: TravelMode = 'car',
  departureHour = 12
): RouteEmbedding {
  const vec = new Float32Array(EMBEDDING_DIM);
  const obj = extractObjectives(route, mode);

  // Dimensions 0-7: normalized objectives
  vec[0] = clamp(obj.timeSeconds / 7200, 0, 1);
  vec[1] = clamp(obj.costRub / 5000, 0, 1);
  vec[2] = clamp(obj.co2Grams / 10000, 0, 1);
  vec[3] = obj.safetyScore;
  vec[4] = obj.comfortScore;
  vec[5] = obj.reliabilityScore;
  vec[6] = clamp(obj.transfers / 4, 0, 1);
  vec[7] = clamp(obj.walkingMeters / 3000, 0, 1);

  // Dimensions 8-15: route structure
  vec[8] = clamp(route.maneuvers.length / 30, 0, 1);
  vec[9] = clamp(route.segments.length / 20, 0, 1);
  vec[10] = clamp(route.totalDistanceMeters / 50000, 0, 1);

  // Count maneuver types
  const turnCount = route.maneuvers.filter(m => m.type.includes('turn')).length;
  const mergeCount = route.maneuvers.filter(m => m.type.includes('merge')).length;
  vec[11] = clamp(turnCount / 20, 0, 1);
  vec[12] = clamp(mergeCount / 10, 0, 1);

  // Traffic distribution
  const trafficDist = { free: 0, moderate: 0, slow: 0, congested: 0 };
  for (const seg of route.segments) {
    if (seg.traffic in trafficDist) trafficDist[seg.traffic as keyof typeof trafficDist]++;
  }
  const totalSeg = Math.max(route.segments.length, 1);
  vec[13] = trafficDist.free / totalSeg;
  vec[14] = trafficDist.congested / totalSeg;

  // Dimensions 16-23: temporal features
  vec[16] = departureHour / 24;
  vec[17] = departureHour >= 7 && departureHour <= 9 ? 1 : 0;   // morning rush
  vec[18] = departureHour >= 17 && departureHour <= 19 ? 1 : 0;  // evening rush
  vec[19] = departureHour >= 22 || departureHour <= 5 ? 1 : 0;   // night

  // Mode encoding (one-hot)
  const modeMap: Record<string, number> = { car: 20, pedestrian: 21, transit: 22, multimodal: 23 };
  if (modeMap[mode] !== undefined) vec[modeMap[mode]] = 1;

  // Dimensions 24-127: hash-based features for structural diversity
  // Use simple feature hashing of maneuver sequences
  for (let i = 0; i < route.maneuvers.length && i < 50; i++) {
    const m = route.maneuvers[i];
    const hash = simpleHash(m.type + m.streetName) % (EMBEDDING_DIM - 24);
    vec[24 + hash] = clamp(vec[24 + hash] + 0.1, 0, 1);
  }

  // L2-normalize the vector
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;

  // Classify archetype
  const archetype = classifyArchetype(obj, mode, departureHour);

  // Assign cluster (simple quantization)
  const cluster = Math.floor(vec[0] * 4) * 4 + Math.floor(vec[1] * 4);

  return { routeId: route.id, vector: vec, archetype, cluster };
}

/** Cosine similarity between two route embeddings */
export function embeddingSimilarity(a: RouteEmbedding, b: RouteEmbedding): number {
  let dot = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    dot += a.vector[i] * b.vector[i];
  }
  return dot; // vectors are already L2-normalized
}

/** Find k nearest routes in embedding space */
export function findNearestRoutes(
  target: RouteEmbedding,
  candidates: RouteEmbedding[],
  k: number
): RouteEmbedding[] {
  return [...candidates]
    .map(c => ({ embedding: c, sim: embeddingSimilarity(target, c) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)
    .map(c => c.embedding);
}

/** Classify route into semantic archetype */
function classifyArchetype(
  obj: RouteObjectives,
  mode: TravelMode,
  hour: number
): RouteArchetype {
  if (obj.timeSeconds < 300 && mode === 'pedestrian') return 'shopping_run';
  if (hour >= 5 && hour <= 9 && obj.timeSeconds < 5400) return 'daily_commute';
  if (hour >= 17 && hour <= 20 && obj.timeSeconds < 5400) return 'daily_commute';
  if (hour >= 22 || hour <= 4) return 'night_ride';
  if (obj.costRub > 2000) return 'airport_trip';
  if ((new Date()).getDay() === 0 || (new Date()).getDay() === 6) return 'weekend_leisure';
  return 'daily_commute';
}

/** Get semantic profile of a route */
export function getSemanticProfile(
  route: NavRoute,
  mode: TravelMode = 'car',
  hour = 12
): SemanticRouteProfile {
  const obj = extractObjectives(route, mode);
  const archetype = classifyArchetype(obj, mode, hour);

  const patternMap: Record<string, string> = {
    car: 'Direct drive',
    pedestrian: 'Walking route',
    transit: 'Public transit',
    multimodal: 'Multi-modal combination',
  };

  let sentiment: SemanticRouteProfile['sentiment'] = 'routine';
  if (obj.co2Grams < 500) sentiment = 'eco_friendly';
  else if (obj.costRub > 1000) sentiment = 'premium';
  else if (obj.costRub < 100) sentiment = 'budget';
  else if (mode === 'pedestrian') sentiment = 'active';

  return {
    archetype,
    pattern: patternMap[mode] ?? 'Unknown',
    sentiment,
    consistency: 0.7, // requires user history to compute properly
  };
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
