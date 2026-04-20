/**
 * Lane-Level Navigation Graph — Amap-grade lane guidance.
 *
 * This module builds a lane-level graph ON TOP of the road graph,
 * modeling individual lanes, their connectivity at intersections,
 * and lane change feasibility.
 *
 * Data sources:
 * - OSM turn:lanes tags (primary)
 * - OSM lanes tag (count)
 * - HD map data (future: HERE HD, TomTom HD)
 *
 * Architecture:
 *   Road Graph → Lane Graph → Lane Connectivity → Lane Recommendation
 */

import type { LatLng } from '@/types/taxi';
import type { OSMGraph, OSMGraphEdge } from './osmGraph';
import type { ManeuverType } from '@/types/navigation';
import { staticDataUrl } from './staticDataUrl';

// ── Types ────────────────────────────────────────────────────────────────────

export type LaneDirection = 'left' | 'slight_left' | 'sharp_left' | 'through' | 'right' | 'slight_right' | 'sharp_right' | 'merge_to_left' | 'merge_to_right' | 'reverse' | 'none';

export interface Lane {
  /** Unique lane ID: `{edgeIndex}:{laneIndex}` */
  id: string;
  /** Parent edge index in road graph */
  edgeIndex: number;
  /** Lane index from left to right (0-based) */
  laneIndex: number;
  /** Total lanes on this road segment */
  totalLanes: number;
  /** Allowed turn directions from this lane */
  allowedTurns: LaneDirection[];
  /** Is this a bus-only lane? */
  isBusLane: boolean;
  /** Is this a bike lane? */
  isBikeLane: boolean;
  /** Lane width in metres (estimated) */
  widthMeters: number;
  /** Lane type */
  type: 'driving' | 'bus' | 'bike' | 'parking' | 'shoulder';
}

export interface LaneConnection {
  /** Source lane ID */
  fromLaneId: string;
  /** Target lane ID */
  toLaneId: string;
  /** Maneuver type for this connection */
  maneuver: LaneDirection;
  /** Cost penalty for this connection (higher = less desirable) */
  penalty: number;
}

export interface LaneSegment {
  /** All lanes on this road segment */
  lanes: Lane[];
  /** Edge index in road graph */
  edgeIndex: number;
  /** Road name */
  roadName: string;
  /** Speed limit (km/h) */
  speedLimit: number | null;
  /** Road type */
  roadType: string;
  /** Geometry start */
  from: LatLng;
  /** Geometry end */
  to: LatLng;
}

export interface LaneRecommendation {
  /** Recommended lane index (0-based from left) */
  recommendedLane: number;
  /** Total lanes */
  totalLanes: number;
  /** All lanes with their recommendation status */
  lanes: Array<{
    index: number;
    directions: LaneDirection[];
    isRecommended: boolean;
    isAllowed: boolean;
    isCurrent: boolean;
  }>;
  /** Distance to the decision point (metres) */
  distanceToDecision: number;
  /** Urgency level */
  urgency: 'low' | 'medium' | 'high' | 'critical';
  /** Text instruction */
  instruction: string;
}

export interface LaneGraph {
  /** All lane segments indexed by edge index */
  segments: Map<number, LaneSegment>;
  /** Lane connections between segments at intersections */
  connections: LaneConnection[];
  /** Build timestamp */
  buildTime: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LANE_WIDTH = 3.5; // metres
const DEFAULT_LANE_COUNT: Record<string, number> = {
  motorway: 3,
  motorway_link: 1,
  trunk: 2,
  trunk_link: 1,
  primary: 2,
  primary_link: 1,
  secondary: 1,
  secondary_link: 1,
  tertiary: 1,
  residential: 1,
  living_street: 1,
  service: 1,
};

// ── Lane data cache from OSM ─────────────────────────────────────────────────

interface RawLaneData {
  wayId: number;
  turnLanes: string;
  laneCount: number;
  direction: string;
  busLane?: boolean;
  bikeLane?: boolean;
}

let _rawLaneData: Map<string, RawLaneData> | null = null;

/** Load lane data from OSM preprocessing output. */
export async function loadLaneGraphData(): Promise<boolean> {
  try {
    const resp = await fetch(staticDataUrl('/data/osm/processed/road_details.json'));
    if (!resp.ok) return false;
    const data: RawLaneData[] = await resp.json();
    _rawLaneData = new Map();
    for (const d of data) {
      _rawLaneData.set(`${d.wayId}:${d.direction}`, d);
    }
    console.log(`[LaneGraph] Loaded ${_rawLaneData.size} raw lane records`);
    return true;
  } catch {
    return false;
  }
}

// ── Parse turn:lanes ─────────────────────────────────────────────────────────

function parseTurnLanes(raw: string): LaneDirection[][] {
  if (!raw) return [];
  return raw.split('|').map(lane =>
    lane.split(';').map(t => {
      const mapping: Record<string, LaneDirection> = {
        left: 'left', slight_left: 'slight_left', sharp_left: 'sharp_left',
        through: 'through',
        right: 'right', slight_right: 'slight_right', sharp_right: 'sharp_right',
        merge_to_left: 'merge_to_left', merge_to_right: 'merge_to_right',
        reverse: 'reverse', none: 'none', '': 'through',
      };
      return mapping[t.trim()] ?? 'through';
    }),
  );
}

// ── Build lane graph ─────────────────────────────────────────────────────────

export function buildLaneGraph(osmGraph: OSMGraph): LaneGraph {
  const startTime = performance.now();
  const segments = new Map<number, LaneSegment>();
  const connections: LaneConnection[] = [];

  for (let i = 0; i < osmGraph.edges.length; i++) {
    const edge = osmGraph.edges[i];
    const fromNode = osmGraph.nodes[edge.from];
    const toNode = osmGraph.nodes[edge.to];
    if (!fromNode || !toNode) continue;

    // Determine lane count and turn info
    let laneCount = DEFAULT_LANE_COUNT[edge.highway || 'residential'] ?? 1;
    let turnLanesRaw = '';
    let hasBusLane = false;
    let hasBikeLane = false;

    // Check raw lane data from OSM
    if (_rawLaneData) {
      // Try matching by way ID (if edge has wayId)
      const edgeKey = `${(edge as { wayId?: number }).wayId ?? 0}:forward`;
      const rawData = _rawLaneData.get(edgeKey);
      if (rawData) {
        laneCount = rawData.laneCount || laneCount;
        turnLanesRaw = rawData.turnLanes || '';
        hasBusLane = rawData.busLane ?? false;
        hasBikeLane = rawData.bikeLane ?? false;
      }
    }

    // Parse turn lanes
    const parsedTurns = parseTurnLanes(turnLanesRaw);
    if (parsedTurns.length > 0) {
      laneCount = Math.max(laneCount, parsedTurns.length);
    }

    // Build lanes
    const lanes: Lane[] = [];
    for (let li = 0; li < laneCount; li++) {
      const allowedTurns: LaneDirection[] =
        li < parsedTurns.length ? parsedTurns[li] : ['through'];

      // Determine lane type
      let type: Lane['type'] = 'driving';
      if (hasBusLane && li === laneCount - 1) type = 'bus';
      if (hasBikeLane && li === 0) type = 'bike';

      lanes.push({
        id: `${i}:${li}`,
        edgeIndex: i,
        laneIndex: li,
        totalLanes: laneCount,
        allowedTurns,
        isBusLane: type === 'bus',
        isBikeLane: type === 'bike',
        widthMeters: DEFAULT_LANE_WIDTH,
        type,
      });
    }

    const speedLimit = edge.speed ? Math.round(edge.speed * 3.6) : null;

    segments.set(i, {
      lanes,
      edgeIndex: i,
      roadName: edge.name || '',
      speedLimit,
      roadType: edge.highway || 'unknown',
      from: { lat: fromNode.lat, lng: fromNode.lon },
      to: { lat: toNode.lat, lng: toNode.lon },
    });
  }

  // Build connections between segments at shared nodes
  // Group edges by endpoint nodes
  const edgesByFromNode = new Map<string, number[]>();
  const edgesByToNode = new Map<string, number[]>();

  for (let i = 0; i < osmGraph.edges.length; i++) {
    const edge = osmGraph.edges[i];
    let arr = edgesByFromNode.get(edge.from);
    if (!arr) {
      arr = [];
      edgesByFromNode.set(edge.from, arr);
    }
    arr.push(i);

    arr = edgesByToNode.get(edge.to);
    if (!arr) {
      arr = [];
      edgesByToNode.set(edge.to, arr);
    }
    arr.push(i);
  }

  // For each node, connect lanes from incoming edges to outgoing edges
  for (const [nodeId, incomingEdgeIndices] of edgesByToNode) {
    const outgoingEdgeIndices = edgesByFromNode.get(nodeId);
    if (!outgoingEdgeIndices) continue;

    for (const inIdx of incomingEdgeIndices) {
      const inSegment = segments.get(inIdx);
      if (!inSegment) continue;

      for (const outIdx of outgoingEdgeIndices) {
        if (inIdx === outIdx) continue; // no U-turn on same edge
        const outSegment = segments.get(outIdx);
        if (!outSegment) continue;

        // Determine the turn direction from incoming to outgoing
        const turnDir = computeTurnDirection(
          inSegment.from, inSegment.to,
          outSegment.from, outSegment.to,
        );

        // Connect lanes: lanes whose allowedTurns include this direction
        for (const inLane of inSegment.lanes) {
          if (inLane.type === 'bus' || inLane.type === 'bike') continue;

          const laneAllowsTurn = inLane.allowedTurns.some(t => turnsMatch(t, turnDir));

          if (laneAllowsTurn) {
            // Connect to the best target lane
            const targetLane = findBestTargetLane(outSegment, turnDir);
            if (targetLane) {
              connections.push({
                fromLaneId: inLane.id,
                toLaneId: targetLane.id,
                maneuver: turnDir,
                penalty: computeLaneChangePenalty(inLane, targetLane, turnDir),
              });
            }
          }
        }
      }
    }
  }

  const buildTime = performance.now() - startTime;
  console.log(
    `[LaneGraph] Built: ${segments.size} segments, ${connections.length} connections, ${buildTime.toFixed(0)}ms`,
  );

  return { segments, connections, buildTime };
}

// ── Turn direction computation ───────────────────────────────────────────────

function computeTurnDirection(
  inFrom: LatLng, inTo: LatLng,
  outFrom: LatLng, outTo: LatLng,
): LaneDirection {
  const inBearing = bearingDeg(inFrom.lat, inFrom.lng, inTo.lat, inTo.lng);
  const outBearing = bearingDeg(outFrom.lat, outFrom.lng, outTo.lat, outTo.lng);

  let diff = outBearing - inBearing;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  if (Math.abs(diff) < 15) return 'through';
  if (diff >= 15 && diff < 45) return 'slight_right';
  if (diff >= 45 && diff < 120) return 'right';
  if (diff >= 120) return 'sharp_right';
  if (diff <= -15 && diff > -45) return 'slight_left';
  if (diff <= -45 && diff > -120) return 'left';
  if (diff <= -120) return 'sharp_left';
  return 'through';
}

function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function turnsMatch(laneTurn: LaneDirection, actualTurn: LaneDirection): boolean {
  if (laneTurn === actualTurn) return true;
  // Fuzzy matching: slight variants match base direction
  if (laneTurn === 'left' && (actualTurn === 'slight_left' || actualTurn === 'sharp_left')) return true;
  if (laneTurn === 'right' && (actualTurn === 'slight_right' || actualTurn === 'sharp_right')) return true;
  if (laneTurn === 'through' && (actualTurn === 'slight_left' || actualTurn === 'slight_right')) return true;
  return false;
}

function findBestTargetLane(segment: LaneSegment, turnDir: LaneDirection): Lane | null {
  // For left turns, prefer leftmost lane; for right, rightmost; for through, center
  const drivingLanes = segment.lanes.filter(l => l.type === 'driving');
  if (drivingLanes.length === 0) return null;

  if (turnDir === 'left' || turnDir === 'slight_left' || turnDir === 'sharp_left') {
    return drivingLanes[0]; // leftmost
  }
  if (turnDir === 'right' || turnDir === 'slight_right' || turnDir === 'sharp_right') {
    return drivingLanes[drivingLanes.length - 1]; // rightmost
  }
  // Through: center lane
  return drivingLanes[Math.floor(drivingLanes.length / 2)];
}

function computeLaneChangePenalty(from: Lane, to: Lane, _turnDir: LaneDirection): number {
  // Penalty increases with lane change distance
  const laneShift = Math.abs(from.laneIndex - to.laneIndex);
  return laneShift * 2; // 2 seconds per lane change
}

// ── Lane recommendation engine ───────────────────────────────────────────────

/**
 * Get lane recommendation for the current position on a route.
 *
 * @param currentEdgeIndex - Current edge in the road graph
 * @param nextManeuverType - The type of the upcoming maneuver
 * @param distanceToManeuver - Distance to the next maneuver (metres)
 * @param laneGraph - The lane-level graph
 * @param currentLaneEstimate - Estimated current lane (from map-matching heading analysis)
 */
export function getLaneRecommendation(
  currentEdgeIndex: number,
  nextManeuverType: ManeuverType | null,
  distanceToManeuver: number,
  laneGraph: LaneGraph,
  currentLaneEstimate?: number,
): LaneRecommendation | null {
  const segment = laneGraph.segments.get(currentEdgeIndex);
  if (!segment || segment.lanes.length <= 1) return null;

  // Only show lane guidance within 1km of turn
  if (distanceToManeuver > 1000) return null;

  // Map maneuver type to lane direction
  const targetDir = maneuverToLaneDirection(nextManeuverType);

  // Find which lanes allow this maneuver
  const lanesInfo = segment.lanes.map((lane, idx) => {
    const isAllowed = lane.allowedTurns.some(t => turnsMatch(t, targetDir));
    const isRecommended = isAllowed && lane.type === 'driving';
    const isCurrent = currentLaneEstimate !== undefined ? idx === currentLaneEstimate : false;

    return {
      index: idx,
      directions: lane.allowedTurns,
      isRecommended,
      isAllowed,
      isCurrent,
    };
  });

  // Find best recommended lane
  const recommended = lanesInfo.filter(l => l.isRecommended);
  if (recommended.length === 0) {
    // Fallback: all driving lanes are OK
    const driving = lanesInfo.filter(l => segment.lanes[l.index].type === 'driving');
    if (driving.length === 0) return null;
    return {
      recommendedLane: driving[Math.floor(driving.length / 2)].index,
      totalLanes: segment.lanes.length,
      lanes: lanesInfo,
      distanceToDecision: distanceToManeuver,
      urgency: 'low',
      instruction: '',
    };
  }

  // Pick center of recommended range
  const recIdx = recommended[Math.floor(recommended.length / 2)].index;

  // Urgency based on distance
  let urgency: LaneRecommendation['urgency'] = 'low';
  if (distanceToManeuver < 100) urgency = 'critical';
  else if (distanceToManeuver < 300) urgency = 'high';
  else if (distanceToManeuver < 600) urgency = 'medium';

  // Instruction
  const instruction = buildLaneInstruction(recIdx, segment.lanes.length, targetDir, urgency);

  return {
    recommendedLane: recIdx,
    totalLanes: segment.lanes.length,
    lanes: lanesInfo,
    distanceToDecision: distanceToManeuver,
    urgency,
    instruction,
  };
}

function maneuverToLaneDirection(maneuverType: ManeuverType | null): LaneDirection {
  if (!maneuverType) return 'through';
  const mapping: Partial<Record<ManeuverType, LaneDirection>> = {
    'turn-left': 'left',
    'turn-right': 'right',
    'slight-left': 'slight_left',
    'slight-right': 'slight_right',
    'sharp-left': 'sharp_left',
    'sharp-right': 'sharp_right',
    'straight': 'through',
    'merge-left': 'merge_to_left',
    'merge-right': 'merge_to_right',
    'u-turn': 'reverse',
    'fork-left': 'slight_left',
    'fork-right': 'slight_right',
    'ramp-left': 'slight_left',
    'ramp-right': 'slight_right',
    'keep-left': 'slight_left',
    'keep-right': 'slight_right',
  };
  return mapping[maneuverType] ?? 'through';
}

function buildLaneInstruction(
  lane: number,
  total: number,
  direction: LaneDirection,
  urgency: LaneRecommendation['urgency'],
): string {
  const laneNames = ['крайнюю левую', 'левую', 'среднюю', 'правую', 'крайнюю правую'];

  let laneName: string;
  if (total <= 2) {
    laneName = lane === 0 ? 'левую' : 'правую';
  } else if (total === 3) {
    laneName = lane === 0 ? 'левую' : lane === 1 ? 'среднюю' : 'правую';
  } else {
    const pos = Math.round((lane / (total - 1)) * (laneNames.length - 1));
    laneName = laneNames[Math.min(pos, laneNames.length - 1)];
  }

  const dirNames: Record<string, string> = {
    left: 'поворота налево',
    right: 'поворота направо',
    slight_left: 'плавного поворота налево',
    slight_right: 'плавного поворота направо',
    through: 'движения прямо',
    merge_to_left: 'перестроения влево',
    merge_to_right: 'перестроения вправо',
  };

  const dirText = dirNames[direction] ?? 'манёвра';

  if (urgency === 'critical') {
    return `Перестройтесь в ${laneName} полосу!`;
  }
  return `Займите ${laneName} полосу для ${dirText}`;
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _laneGraph: LaneGraph | null = null;

export async function getLaneGraph(osmGraph: OSMGraph): Promise<LaneGraph> {
  if (_laneGraph) return _laneGraph;
  await loadLaneGraphData();
  _laneGraph = buildLaneGraph(osmGraph);
  return _laneGraph;
}

export function resetLaneGraph(): void {
  _laneGraph = null;
}
