/**
 * HMM Map-Matching Engine — production-grade.
 *
 * Snaps noisy GPS traces to the road network using a
 * Hidden Markov Model with Viterbi decoding.
 *
 * Based on: Newson & Krumm, "Hidden Markov Map Matching Through
 * Noise and Sparseness" (ACM SIGSPATIAL 2009).
 *
 * Architecture:
 *   GPS reading → Kalman Filter → HMM candidates → Viterbi → matched edge + offset
 *
 * Emission probability:  P(z|r) = (1/√(2πσ²)) · exp(-d²/(2σ²))
 * Transition probability: P(rᵢ→rⱼ) = (1/β) · exp(-|d_route - d_great_circle| / β)
 */

import type { LatLng } from '@/types/taxi';
import type { KalmanState } from './kalmanFilter';
import { loadOsmGraph, type OSMGraph, type OSMGraphEdge, type OSMGraphNode } from './osmGraph';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MatchedPosition {
  /** Snapped position on the road */
  lat: number;
  lng: number;
  /** Edge this point is matched to */
  edgeIndex: number;
  /** Offset along the edge [0..1] */
  offset: number;
  /** Distance from GPS to matched point (metres) */
  distanceFromGPS: number;
  /** Matched road name */
  roadName: string;
  /** Speed limit on matched road (km/h) */
  speedLimit: number | null;
  /** Road type (highway tag) */
  roadType: string;
  /** Heading along the road (degrees) */
  roadHeading: number;
  /** Confidence of the match [0..1] */
  confidence: number;
  /** Current lane recommendation (if available) */
  matchedEdge: OSMGraphEdge | null;
}

interface CandidatePoint {
  edgeIndex: number;
  edge: OSMGraphEdge;
  /** Projected point on the edge */
  projLat: number;
  projLng: number;
  /** Offset along the edge [0..1] */
  offset: number;
  /** Distance from GPS to projection (metres) */
  distance: number;
  /** Road heading at this point (degrees) */
  heading: number;
}

interface ViterbiState {
  candidates: CandidatePoint[];
  /** Log-probability for each candidate */
  logProb: number[];
  /** Backpointer: for each candidate, which prev candidate led here */
  prevIndex: number[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const M_PER_DEG_LAT = 111_320;
const CANDIDATE_RADIUS_M = 50; // search radius for road candidates
const MAX_CANDIDATES = 8; // max candidates per GPS point
const SIGMA_Z = 10; // GPS noise standard deviation (metres) — tunable
const BETA = 5; // transition probability parameter (metres)
const MAX_ROUTE_DISTANCE_FACTOR = 3; // max route distance / great circle ratio
const VITERBI_WINDOW = 10; // rolling window for memory-bounded Viterbi

// ── Spatial index for edges ──────────────────────────────────────────────────

const EDGE_GRID_SIZE = 0.001; // ~111m grid cells
let _edgeGrid: Map<string, number[]> | null = null;
let _graph: OSMGraph | null = null;

function buildEdgeGrid(graph: OSMGraph): Map<string, number[]> {
  if (_edgeGrid && _graph === graph) return _edgeGrid;
  _edgeGrid = new Map();
  _graph = graph;

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const fromNode = graph.nodes[edge.fromNode];
    const toNode = graph.nodes[edge.toNode];
    if (!fromNode || !toNode) continue;

    // Rasterize the edge bbox into grid cells
    const minLat = Math.min(fromNode.lat, toNode.lat);
    const maxLat = Math.max(fromNode.lat, toNode.lat);
    const minLng = Math.min(fromNode.lon, toNode.lon);
    const maxLng = Math.max(fromNode.lon, toNode.lon);

    const cellMinLat = Math.floor(minLat / EDGE_GRID_SIZE);
    const cellMaxLat = Math.floor(maxLat / EDGE_GRID_SIZE);
    const cellMinLng = Math.floor(minLng / EDGE_GRID_SIZE);
    const cellMaxLng = Math.floor(maxLng / EDGE_GRID_SIZE);

    for (let cLat = cellMinLat; cLat <= cellMaxLat; cLat++) {
      for (let cLng = cellMinLng; cLng <= cellMaxLng; cLng++) {
        const key = `${cLat},${cLng}`;
        let arr = _edgeGrid.get(key);
        if (!arr) {
          arr = [];
          _edgeGrid.set(key, arr);
        }
        arr.push(i);
      }
    }
  }

  return _edgeGrid;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

function mPerDegLng(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

/** Great-circle distance in metres (Haversine). */
function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aVal =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

/** Project point onto line segment, return projection + offset [0..1]. */
function projectOntoSegment(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): { projLat: number; projLng: number; offset: number; distance: number } {
  const mLng = mPerDegLng((aLat + bLat) / 2);

  // Convert to local metres
  const ax = 0, ay = 0;
  const bx = (bLng - aLng) * mLng;
  const by = (bLat - aLat) * M_PER_DEG_LAT;
  const px = (pLng - aLng) * mLng;
  const py = (pLat - aLat) * M_PER_DEG_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t: number;
  if (lenSq < 1e-10) {
    t = 0;
  } else {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  }

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);

  // Convert back to degrees
  const projLat = aLat + projY / M_PER_DEG_LAT;
  const projLng = aLng + projX / mLng;

  return { projLat, projLng, offset: t, distance: dist };
}

/** Bearing from a to b in degrees [0, 360). */
function bearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ── Find candidates ──────────────────────────────────────────────────────────

function findCandidates(
  lat: number,
  lng: number,
  graph: OSMGraph,
  edgeGrid: Map<string, number[]>,
): CandidatePoint[] {
  const cellLat = Math.floor(lat / EDGE_GRID_SIZE);
  const cellLng = Math.floor(lng / EDGE_GRID_SIZE);

  const seen = new Set<number>();
  const candidates: CandidatePoint[] = [];

  // Search 3×3 neighborhood
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const key = `${cellLat + dLat},${cellLng + dLng}`;
      const edgeIndices = edgeGrid.get(key);
      if (!edgeIndices) continue;

      for (const ei of edgeIndices) {
        if (seen.has(ei)) continue;
        seen.add(ei);

        const edge = graph.edges[ei];
        const fromNode = graph.nodes[edge.fromNode];
        const toNode = graph.nodes[edge.toNode];
        if (!fromNode || !toNode) continue;

        const proj = projectOntoSegment(lat, lng, fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);

        if (proj.distance <= CANDIDATE_RADIUS_M) {
          const hdg = bearing(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);
          candidates.push({
            edgeIndex: ei,
            edge,
            projLat: proj.projLat,
            projLng: proj.projLng,
            offset: proj.offset,
            distance: proj.distance,
            heading: hdg,
          });
        }
      }
    }
  }

  // Sort by distance and keep top N
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, MAX_CANDIDATES);
}

// ── HMM probabilities ───────────────────────────────────────────────────────

/** Emission log-probability: how likely this GPS point came from this road. */
function emissionLogProb(distanceM: number): number {
  // Gaussian: log(1/(σ√(2π))) - d²/(2σ²)
  const normConst = -Math.log(SIGMA_Z * Math.sqrt(2 * Math.PI));
  return normConst - (distanceM * distanceM) / (2 * SIGMA_Z * SIGMA_Z);
}

/** Transition log-probability: penalizes route distance ≠ great circle distance. */
function transitionLogProb(routeDistM: number, gcDistM: number): number {
  const diff = Math.abs(routeDistM - gcDistM);
  return -diff / BETA - Math.log(BETA);
}

// ── Simple route distance (along graph, BFS-limited) ─────────────────────────

function estimateRouteDistance(
  fromEdge: CandidatePoint,
  toEdge: CandidatePoint,
  graph: OSMGraph,
): number {
  // If same edge, distance is along-edge
  if (fromEdge.edgeIndex === toEdge.edgeIndex) {
    const edge = fromEdge.edge;
    const fromNode = graph.nodes[edge.fromNode];
    const toNode = graph.nodes[edge.toNode];
    if (!fromNode || !toNode) return Infinity;
    const edgeLen = haversineM(
      { lat: fromNode.lat, lng: fromNode.lon },
      { lat: toNode.lat, lng: toNode.lon },
    );
    return Math.abs(toEdge.offset - fromEdge.offset) * edgeLen;
  }

  // BFS with limited depth to find shortest path between endpoints
  const startNodeId = fromEdge.edge.toNode; // end of from-edge
  const endNodeId = toEdge.edge.fromNode; // start of to-edge

  if (startNodeId === endNodeId) {
    return 0;
  }

  // Build adjacency if not cached
  const adj = buildAdjacency(graph);

  // Dijkstra with depth limit
  const dist = new Map<string, number>();
  const queue: Array<{ nodeId: string; cost: number }> = [];
  dist.set(startNodeId, 0);
  queue.push({ nodeId: startNodeId, cost: 0 });

  const maxDist = haversineM(
    { lat: fromEdge.projLat, lng: fromEdge.projLng },
    { lat: toEdge.projLat, lng: toEdge.projLng },
  ) * MAX_ROUTE_DISTANCE_FACTOR;

  while (queue.length > 0) {
    // Simple priority: sort (could use binary heap for production scale)
    queue.sort((a, b) => a.cost - b.cost);
    const { nodeId, cost } = queue.shift()!;

    if (nodeId === endNodeId) return cost;
    if (cost > maxDist) continue;

    const current = dist.get(nodeId);
    if (current !== undefined && cost > current) continue;

    const neighbors = adj.get(nodeId);
    if (!neighbors) continue;

    for (const { to, weight } of neighbors) {
      const newCost = cost + weight;
      const existing = dist.get(to);
      if (existing === undefined || newCost < existing) {
        dist.set(to, newCost);
        queue.push({ nodeId: to, cost: newCost });
      }
    }
  }

  // No path found within limit → use great circle as fallback
  return haversineM(
    { lat: fromEdge.projLat, lng: fromEdge.projLng },
    { lat: toEdge.projLat, lng: toEdge.projLng },
  ) * 1.3; // 30% overestimate for no-path case
}

// ── Adjacency list ───────────────────────────────────────────────────────────

let _adj: Map<string, Array<{ to: string; weight: number }>> | null = null;
let _adjGraph: OSMGraph | null = null;

function buildAdjacency(graph: OSMGraph): Map<string, Array<{ to: string; weight: number }>> {
  if (_adj && _adjGraph === graph) return _adj;
  _adj = new Map();
  _adjGraph = graph;

  for (const edge of graph.edges) {
    const fromNode = graph.nodes[edge.fromNode];
    const toNode = graph.nodes[edge.toNode];
    if (!fromNode || !toNode) continue;

    const dist = haversineM(
      { lat: fromNode.lat, lng: fromNode.lon },
      { lat: toNode.lat, lng: toNode.lon },
    );

    let arr = _adj.get(edge.fromNode);
    if (!arr) {
      arr = [];
      _adj.set(edge.fromNode, arr);
    }
    arr.push({ to: edge.toNode, weight: dist });

    // Assume bidirectional unless highway=motorway/trunk (simplified)
    if (edge.highway !== 'motorway' && edge.highway !== 'motorway_link') {
      let revArr = _adj.get(edge.toNode);
      if (!revArr) {
        revArr = [];
        _adj.set(edge.toNode, revArr);
      }
      revArr.push({ to: edge.fromNode, weight: dist });
    }
  }

  return _adj;
}

// ── Map Matcher class ────────────────────────────────────────────────────────

export class HMMMapMatcher {
  private graph: OSMGraph | null = null;
  private edgeGrid: Map<string, number[]> | null = null;
  private viterbiWindow: ViterbiState[] = [];
  private lastMatch: MatchedPosition | null = null;
  private initialized = false;

  /** Initialize the matcher (loads graph if not already loaded). */
  async init(): Promise<boolean> {
    if (this.initialized && this.graph) return true;

    const graph = await loadOsmGraph();
    if (!graph) {
      console.warn('[MapMatcher] Cannot load OSM graph');
      return false;
    }

    this.graph = graph;
    this.edgeGrid = buildEdgeGrid(graph);
    this.initialized = true;
    console.log('[MapMatcher] Initialized with', graph.edges.length, 'edges');
    return true;
  }

  /**
   * Match a filtered GPS position to the road network.
   * Call this every GPS update (~1Hz).
   */
  match(state: KalmanState): MatchedPosition | null {
    if (!this.graph || !this.edgeGrid) return null;

    // 1. Find candidate road segments
    const candidates = findCandidates(state.lat, state.lng, this.graph, this.edgeGrid);

    if (candidates.length === 0) {
      // No road nearby — return raw position with low confidence
      return this.lastMatch
        ? { ...this.lastMatch, confidence: Math.max(0, this.lastMatch.confidence - 0.1) }
        : null;
    }

    // 2. Compute emission probabilities
    const emissionLP = candidates.map(c => emissionLogProb(c.distance));

    // 3. Viterbi step
    if (this.viterbiWindow.length === 0) {
      // First observation — initialize
      this.viterbiWindow.push({
        candidates,
        logProb: emissionLP,
        prevIndex: candidates.map(() => -1),
      });
    } else {
      const prevState = this.viterbiWindow[this.viterbiWindow.length - 1];
      const newLogProb: number[] = [];
      const newPrevIndex: number[] = [];

      for (let j = 0; j < candidates.length; j++) {
        let bestLP = -Infinity;
        let bestPrev = 0;

        for (let i = 0; i < prevState.candidates.length; i++) {
          const prevLP = prevState.logProb[i];
          if (prevLP === -Infinity) continue;

          // Great circle distance between consecutive matched points
          const gcDist = haversineM(
            { lat: prevState.candidates[i].projLat, lng: prevState.candidates[i].projLng },
            { lat: candidates[j].projLat, lng: candidates[j].projLng },
          );

          // Route distance estimate
          const routeDist = estimateRouteDistance(
            prevState.candidates[i],
            candidates[j],
            this.graph!,
          );

          const transLP = transitionLogProb(routeDist, gcDist);
          const totalLP = prevLP + transLP + emissionLP[j];

          if (totalLP > bestLP) {
            bestLP = totalLP;
            bestPrev = i;
          }
        }

        newLogProb.push(bestLP);
        newPrevIndex.push(bestPrev);
      }

      this.viterbiWindow.push({
        candidates,
        logProb: newLogProb,
        prevIndex: newPrevIndex,
      });

      // Trim window to prevent unbounded growth
      if (this.viterbiWindow.length > VITERBI_WINDOW) {
        this.viterbiWindow.shift();
      }
    }

    // 4. Pick best candidate at current step
    const currentState = this.viterbiWindow[this.viterbiWindow.length - 1];
    let bestIdx = 0;
    let bestLP = -Infinity;

    for (let i = 0; i < currentState.logProb.length; i++) {
      // Heading bonus: prefer candidates aligned with vehicle heading
      let headingBonus = 0;
      if (state.speedMps > 2) {
        const headingDiff = Math.abs(
          ((currentState.candidates[i].heading - state.heading + 180) % 360) - 180,
        );
        headingBonus = headingDiff < 30 ? 2 : headingDiff < 60 ? 1 : headingDiff < 90 ? 0 : -2;
      }

      const lp = currentState.logProb[i] + headingBonus;
      if (lp > bestLP) {
        bestLP = lp;
        bestIdx = i;
      }
    }

    const best = currentState.candidates[bestIdx];

    // 5. Confidence from log-probability spread
    const maxLP = Math.max(...currentState.logProb);
    const logProbRange = maxLP - Math.min(...currentState.logProb.filter(lp => lp > -Infinity));
    const confidence = Math.min(1, Math.max(0.1,
      1 - (best.distance / CANDIDATE_RADIUS_M) * 0.5 -
      (logProbRange < 1 ? 0.2 : 0),
    ));

    this.lastMatch = {
      lat: best.projLat,
      lng: best.projLng,
      edgeIndex: best.edgeIndex,
      offset: best.offset,
      distanceFromGPS: best.distance,
      roadName: best.edge.name || '',
      speedLimit: best.edge.speed ? Math.round(best.edge.speed * 3.6) : null, // m/s → km/h
      roadType: best.edge.highway || 'unknown',
      roadHeading: best.heading,
      confidence,
      matchedEdge: best.edge,
    };

    return this.lastMatch;
  }

  /** Get the last matched position. */
  getLastMatch(): MatchedPosition | null {
    return this.lastMatch;
  }

  /** Reset the matcher state (e.g., on new trip). */
  reset(): void {
    this.viterbiWindow = [];
    this.lastMatch = null;
  }

  /** Check if matcher is ready. */
  get isReady(): boolean {
    return this.initialized && this.graph !== null;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _matcher: HMMMapMatcher | null = null;

export function getMapMatcher(): HMMMapMatcher {
  if (!_matcher) {
    _matcher = new HMMMapMatcher();
  }
  return _matcher;
}

export async function initMapMatcher(): Promise<boolean> {
  return getMapMatcher().init();
}
