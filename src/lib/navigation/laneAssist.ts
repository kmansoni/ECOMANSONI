/**
 * Lane Assist — recommends the correct lane before intersections.
 *
 * Uses turn:lanes data from OSM to visualize lane arrows
 * and highlight the recommended lane based on the next maneuver.
 */

import type { LatLng } from '@/types/taxi';
import type {
  LaneTurn,
  ManeuverType,
  Maneuver,
  NavigationLaneGuidance,
  NavigationLaneInfo,
} from '@/types/navigation';

// ── Types ────────────────────────────────────────────────────────────────────

export type LaneInfo = NavigationLaneInfo;
export type LaneGuidance = NavigationLaneGuidance;

// ── Loaded lane data (from OSM fetch) ────────────────────────────────────────

interface RoadLaneData {
  wayId: number;
  turnLanes: string; // e.g. "left|through|through;right|right"
  laneCount: number;
  direction: 'forward' | 'backward';
  destinations?: string;
  busLane?: boolean;
  bikeLane?: boolean;
}

const roadLaneIndex = new Map<string, RoadLaneData>();

/**
 * Load lane data from road_details.json (fetched by OSM script)
 */
export async function loadLaneData(): Promise<void> {
  try {
    const resp = await fetch('/data/osm/processed/road_details.json');
    if (!resp.ok) return;
    const data: RoadLaneData[] = await resp.json();
    for (const rd of data) {
      const key = `${rd.wayId}:${rd.direction}`;
      roadLaneIndex.set(key, rd);
    }
    console.log(`[LaneAssist] Loaded ${roadLaneIndex.size} lane records`);
  } catch {
    // No lane data available yet
  }
}

// ── Parse turn:lanes tag ─────────────────────────────────────────────────────

function parseTurnLanes(raw: string): LaneTurn[][] {
  // "left|through|through;right|right" → [['left'], ['through'], ['through','right'], ['right']]
  return raw.split('|').map(lane =>
    lane.split(';').map(t => {
      const mapping: Record<string, LaneTurn> = {
        left: 'left', slight_left: 'slight_left', sharp_left: 'sharp_left',
        through: 'through',
        right: 'right', slight_right: 'slight_right', sharp_right: 'sharp_right',
        merge_to_left: 'merge_to_left', merge_to_right: 'merge_to_right',
        reverse: 'reverse', none: 'none', '': 'through',
      };
      return mapping[t.trim()] || 'through';
    })
  );
}

// ── Lane recommendation ──────────────────────────────────────────────────────

/**
 * Get lane guidance for an upcoming maneuver.
 */
export function getLaneGuidance(
  nextManeuver: Maneuver | null,
  distanceToTurn: number,
  _currentPosition: LatLng,
  routeGeometry: LatLng[],
): LaneGuidance | null {
  if (!nextManeuver || distanceToTurn > 500) return null;

  // Try to find lane data near the maneuver point
  const laneData = findNearestLaneData(nextManeuver.location, routeGeometry);

  if (laneData) {
    return buildGuidanceFromOSM(laneData, nextManeuver, distanceToTurn);
  }

  // Fallback: heuristic lane guidance based on maneuver type
  return buildHeuristicGuidance(nextManeuver, distanceToTurn);
}

function findNearestLaneData(_location: LatLng, routeGeometry: LatLng[]): RoadLaneData | null {
  if (routeGeometry.length === 0) return null;

  // Simple proximity search in loaded data
  // In production, this would use a spatial index
  let best: RoadLaneData | null = null;

  for (const [, data] of roadLaneIndex) {
    // We don't have geometry per-way in this simple index,
    // so we rely on the loaded data structure
    // This is a placeholder - real implementation needs way geometry matching
    if (data.turnLanes && data.laneCount > 0) {
      best = data; // simplified
      break;
    }
  }

  return best;
}

function buildGuidanceFromOSM(
  data: RoadLaneData,
  maneuver: Maneuver,
  distance: number,
): LaneGuidance {
  const laneTurns = parseTurnLanes(data.turnLanes);
  const targetTurn = maneuverToTurn(maneuver.type);

  const destinations = data.destinations?.split('|').map((item) => item.trim()).filter(Boolean) ?? [];

  const lanes: LaneInfo[] = laneTurns.map((turns, i) => {
    const isRecommended = turns.some(t => isTurnCompatible(t, targetTurn));
    return {
      index: i,
      turns,
      isRecommended,
      isBusLane: data.busLane === true && i === 0,
      isBikeLane: data.bikeLane === true && i === laneTurns.length - 1,
      destination: destinations[i] ?? destinations[0],
    };
  });

  const recommendedIdx = lanes.findIndex(l => l.isRecommended);
  const urgency = distance < 100 ? 'critical' : distance < 250 ? 'warn' : 'info';
  const position = recommendedIdx <= 0 ? 'левую' :
    recommendedIdx >= lanes.length - 1 ? 'правую' : 'центральную';

  return {
    lanes,
    totalLanes: lanes.length,
    distanceToIntersection: distance,
    message: `Займите ${position} полосу`,
    urgency,
    source: 'osm',
    maneuverType: maneuver.type,
    destinationHint: lanes.find((lane) => lane.isRecommended)?.destination ?? null,
  };
}

function buildHeuristicGuidance(
  maneuver: Maneuver,
  distance: number,
): LaneGuidance {
  const type = maneuver.type;
  const isLeft = type.includes('left') || type === 'uturn';
  const isRight = type.includes('right');
  const isStraight = type === 'straight' || type === 'depart';

  // Default 3-lane road
  const laneCount = 3;
  const lanes: LaneInfo[] = [];

  for (let i = 0; i < laneCount; i++) {
    const turns: LaneTurn[] = i === 0 ? ['left'] :
      i === laneCount - 1 ? ['right'] : ['through'];
    lanes.push({
      index: i,
      turns,
      isRecommended: isLeft ? i === 0 :
        isRight ? i === laneCount - 1 :
          i === 1,
      isBusLane: false,
      isBikeLane: false,
    });
  }

  const urgency = distance < 100 ? 'critical' : distance < 250 ? 'warn' : 'info';
  const dir = isLeft ? 'левую' : isRight ? 'правую' : 'центральную';

  return {
    lanes,
    totalLanes: laneCount,
    distanceToIntersection: distance,
    message: isStraight ? 'Двигайтесь прямо' : `Перестройтесь в ${dir} полосу`,
    urgency,
    source: 'heuristic',
    maneuverType: maneuver.type,
    destinationHint: null,
  };
}

// ── Mapping maneuver → lane turn ─────────────────────────────────────────────

function maneuverToTurn(type: ManeuverType): LaneTurn {
  const map: Partial<Record<ManeuverType, LaneTurn>> = {
    'turn-left': 'left',
    'turn-slight-left': 'slight_left',
    'turn-sharp-left': 'sharp_left',
    'turn-right': 'right',
    'turn-slight-right': 'slight_right',
    'turn-sharp-right': 'sharp_right',
    'straight': 'through',
    'fork-left': 'slight_left',
    'fork-right': 'slight_right',
    'keep-left': 'slight_left',
    'keep-right': 'slight_right',
    'merge-left': 'merge_to_left',
    'merge-right': 'merge_to_right',
    'ramp-left': 'slight_left',
    'ramp-right': 'slight_right',
    'uturn': 'reverse',
  };
  return map[type] || 'through';
}

function isTurnCompatible(laneTurn: LaneTurn, targetTurn: LaneTurn): boolean {
  if (laneTurn === targetTurn) return true;
  if (laneTurn === 'through' && targetTurn === 'through') return true;

  // Left turns are compatible with slight_left
  if (targetTurn === 'left' && (laneTurn === 'slight_left' || laneTurn === 'sharp_left')) return true;
  if (targetTurn === 'slight_left' && laneTurn === 'left') return true;

  // Right turns are compatible with slight_right
  if (targetTurn === 'right' && (laneTurn === 'slight_right' || laneTurn === 'sharp_right')) return true;
  if (targetTurn === 'slight_right' && laneTurn === 'right') return true;

  return false;
}

// ── Arrow SVG for lane display ───────────────────────────────────────────────

const ARROW_PATHS: Record<LaneTurn, string> = {
  left: 'M12 20V8l-6 6',
  slight_left: 'M14 20V8l-5 4',
  sharp_left: 'M14 20V10l-8 2',
  through: 'M12 20V4l-4 4M12 4l4 4',
  right: 'M12 20V8l6 6',
  slight_right: 'M10 20V8l5 4',
  sharp_right: 'M10 20V10l8 2',
  merge_to_left: 'M16 20V12l-8-4',
  merge_to_right: 'M8 20V12l8-4',
  reverse: 'M12 20V8C12 4 6 4 6 8',
  none: 'M12 20V4',
};

export function getLaneArrowSvg(turn: LaneTurn, highlighted: boolean): string {
  const color = highlighted ? '#4CAF50' : '#9E9E9E';
  const strokeWidth = highlighted ? 3 : 2;
  const path = ARROW_PATHS[turn] || ARROW_PATHS.through;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}
