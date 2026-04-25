/**
 * Overpass API сканер дорожной инфраструктуры.
 *
 * Извлекает HD-данные о дорогах: полосы, знаки, камеры, мосты, светофоры.
 * Работает с rate limiting (≤2 req/sec) и кэшированием через infraCache.
 *
 * Источник: https://overpass-api.de/api/interpreter
 * Fallback: https://overpass.kumi.systems/api/interpreter
 */

import type {
  BBox,
  RoadInfraSnapshot,
  InfraScanOptions,
  HDLane,
  RoadSign,
  RoadCamera,
  TrafficSignal,
  BridgeGeometry,
  TunnelGeometry,
  LaneMarking,
  RoadRestriction,
  SignCategory,
  CameraEnforcementType,
  CameraType,
  BridgeType,
  TunnelType,
  SpeedBump,
  SpeedBumpType,
  PedestrianCrossing,
  CrossingType,
  BorderCrossing,
  PoliceCheckpoint,
  ParkingArea,
  ParkingType,
  Roundabout,
  HighwayExit,
  RoadSurface,
  SmoothnessGrade,
} from '@/types/roadInfra';
import type { LatLng } from '@/types/taxi';
import { logger } from '@/lib/logger';
import { getInfraFromCache, putInfraIntoCache } from './infraCache';
import { classifySign, parseLaneRefs } from './signClassifier';

const OVERPASS_PRIMARY = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK = 'https://overpass.kumi.systems/api/interpreter';
const DEFAULT_TIMEOUT_MS = 25_000;
const MIN_INTERVAL_MS = 500; // ≤2 req/sec

let _lastRequestAt = 0;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

function buildQuery(bbox: BBox, opts: InfraScanOptions): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const parts: string[] = [`[out:json][timeout:25];`, `(`];

  // Дороги с lanes
  if (opts.includeLanes !== false) {
    parts.push(`  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${b});`);
  }
  if (opts.includeCameras !== false) {
    parts.push(`  node["highway"="speed_camera"](${b});`);
    parts.push(`  node["enforcement"](${b});`);
  }
  if (opts.includeSignals !== false) {
    parts.push(`  node["highway"="traffic_signals"](${b});`);
  }
  if (opts.includeSigns !== false) {
    parts.push(`  node["traffic_sign"](${b});`);
  }
  if (opts.includeBridges !== false) {
    parts.push(`  way["bridge"](${b});`);
    parts.push(`  way["tunnel"](${b});`);
  }
  if (opts.includeSpeedBumps !== false) {
    parts.push(`  node["traffic_calming"](${b});`);
  }
  if (opts.includeCrossings !== false) {
    parts.push(`  node["highway"="crossing"](${b});`);
    parts.push(`  way["footway"="crossing"](${b});`);
  }
  if (opts.includeBorders !== false) {
    parts.push(`  node["barrier"="border_control"](${b});`);
  }
  if (opts.includeCheckpoints !== false) {
    parts.push(`  node["amenity"="police"](${b});`);
    parts.push(`  node["highway"="checkpoint"](${b});`);
  }
  if (opts.includeParking !== false) {
    parts.push(`  way["amenity"="parking"](${b});`);
    parts.push(`  node["amenity"="parking"](${b});`);
  }
  if (opts.includeRoundabouts !== false) {
    parts.push(`  way["junction"="roundabout"](${b});`);
  }
  if (opts.includeExits !== false) {
    parts.push(`  node["highway"="motorway_junction"](${b});`);
  }

  parts.push(`);`, `out body geom;`);
  return parts.join('\n');
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const wait = _lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  _lastRequestAt = Date.now();
}

async function fetchOverpass(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  await rateLimit();

  const body = new URLSearchParams({ data: query }).toString();
  const init: RequestInit = {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  };

  const endpoints = [OVERPASS_PRIMARY, OVERPASS_FALLBACK];
  let lastError: unknown;

  for (const url of endpoints) {
    try {
      const ctrl = signal ? null : new AbortController();
      const timeoutId = ctrl ? setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS) : null;
      const finalInit = ctrl ? { ...init, signal: ctrl.signal } : init;

      const res = await fetch(url, finalInit);
      if (timeoutId) clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 429 || res.status === 504) {
          // rate limit → fallback endpoint
          lastError = new Error(`Overpass ${res.status}`);
          continue;
        }
        throw new Error(`Overpass HTTP ${res.status}`);
      }
      return (await res.json()) as OverpassResponse;
    } catch (err) {
      lastError = err;
      logger.debug('[overpassScanner] endpoint failed', { url, err });
    }
  }

  throw lastError ?? new Error('Overpass: all endpoints failed');
}

function metersFromTag(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const num = parseFloat(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function intFromTag(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function laneTypeFromTags(tags: Record<string, string>): 'driving' | 'bus' | 'bike' {
  if (tags.busway === 'lane' || tags.bus === 'designated') return 'bus';
  if (tags.cycleway === 'lane' || tags.bicycle === 'designated') return 'bike';
  return 'driving';
}

function buildLanesFromWay(el: OverpassElement): HDLane[] {
  const tags = el.tags ?? {};
  const geometry = el.geometry ?? [];
  if (geometry.length < 2) return [];

  const totalLanes = intFromTag(tags.lanes, 2);
  const totalWidth = metersFromTag(tags.width, totalLanes * 3.5);
  const laneWidth = totalWidth / totalLanes;
  const turnLanes = (tags['turn:lanes'] ?? '').split('|');
  const changeLanes = (tags['change:lanes'] ?? '').split('|');
  const baseType = laneTypeFromTags(tags);

  const centerline: LatLng[] = geometry.map((p) => ({ lat: p.lat, lng: p.lon }));

  const lanes: HDLane[] = [];
  for (let i = 0; i < totalLanes; i++) {
    const turnsRaw = turnLanes[i] ?? '';
    const allowedTurns = turnsRaw
      .split(';')
      .map((t) => t.trim())
      .filter(Boolean) as HDLane['allowedTurns'];

    const changeTag = changeLanes[i] ?? 'yes';
    lanes.push({
      id: `${el.id}:${i}`,
      index: i,
      type: i === 0 && baseType === 'bus' ? 'bus' : baseType,
      widthMeters: laneWidth,
      centerline, // TODO: offset в lane-modeler
      leftEdge: centerline,
      rightEdge: centerline,
      allowedTurns: allowedTurns.length > 0 ? allowedTurns : ['through'],
      isReversible: tags.oneway === 'reversible',
      canChangeLeft: !changeTag.includes('not_left') && changeTag !== 'no',
      canChangeRight: !changeTag.includes('not_right') && changeTag !== 'no',
      destinationHint: tags['destination:lanes']?.split('|')[i] ?? null,
    });
  }

  return lanes;
}

function buildSignFromNode(el: OverpassElement): RoadSign | null {
  if (el.type !== 'node' || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  const tag = tags.traffic_sign;
  if (!tag) return null;

  const classified = classifySign(tag);
  if (!classified) return null;

  const facingDir = tags.direction ? parseFloat(tags.direction) : null;
  const lanesRefs = parseLaneRefs(tag);

  return {
    id: `sign-${el.id}`,
    tag,
    category: classified.category as SignCategory,
    location: { lat: el.lat, lng: el.lon },
    poleHeightM: metersFromTag(tags.height, 2.5),
    facingDirection: Number.isFinite(facingDir) ? facingDir : null,
    value: classified.value,
    appliesToLaneIndices: lanesRefs,
    activity: tags.opening_hours
      ? { kind: 'schedule', openingHours: tags.opening_hours }
      : tags.temporary === 'yes'
      ? { kind: 'temporary' }
      : { kind: 'always' },
  };
}

const ENFORCEMENT_FOV: Record<CameraEnforcementType, { fov: number; range: number }> = {
  maxspeed: { fov: 30, range: 50 },
  average_speed: { fov: 30, range: 100 },
  red_signal: { fov: 60, range: 30 },
  check: { fov: 45, range: 40 },
  toll: { fov: 60, range: 20 },
  access_restriction: { fov: 45, range: 30 },
};

function buildCameraFromNode(el: OverpassElement): RoadCamera | null {
  if (el.type !== 'node' || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  const isCamera = tags.highway === 'speed_camera' || !!tags.enforcement;
  if (!isCamera) return null;

  const enforcement = (tags.enforcement as CameraEnforcementType) ?? 'maxspeed';
  const fovCfg = ENFORCEMENT_FOV[enforcement] ?? ENFORCEMENT_FOV.maxspeed;
  const direction = parseFloat(tags['camera:direction'] ?? tags.direction ?? '0') || 0;
  const camType = (tags['camera:type'] as CameraType) ?? 'fixed';

  return {
    id: `cam-${el.id}`,
    location: { lat: el.lat, lng: el.lon },
    enforcement,
    type: camType,
    maxspeed: tags.maxspeed ? parseFloat(tags.maxspeed) : undefined,
    direction,
    fovDegrees: fovCfg.fov,
    rangeMeters: fovCfg.range,
    heightMeters: metersFromTag(tags.height, 5),
    appliesToLaneIndices: null,
  };
}

function buildSignalFromNode(el: OverpassElement): TrafficSignal | null {
  if (el.type !== 'node' || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  if (tags.highway !== 'traffic_signals') return null;

  const dirTag = tags['traffic_signals:direction'];
  const direction: TrafficSignal['direction'] =
    dirTag === 'forward' || dirTag === 'backward' ? dirTag : 'both';

  return {
    id: `sig-${el.id}`,
    location: { lat: el.lat, lng: el.lon },
    direction,
    hasCountdown: tags['traffic_signals:countdown'] === 'yes',
  };
}

function buildBridgeFromWay(el: OverpassElement): BridgeGeometry | null {
  const tags = el.tags ?? {};
  const bridge = tags.bridge;
  if (!bridge || bridge === 'no') return null;
  const geometry = (el.geometry ?? []).map((p) => ({ lat: p.lat, lng: p.lon }));
  if (geometry.length < 2) return null;

  const bridgeType: BridgeType =
    bridge === 'viaduct' || bridge === 'aqueduct' || bridge === 'suspension' ||
    bridge === 'arch' || bridge === 'cable_stayed'
      ? bridge
      : 'bridge';

  const layer = intFromTag(tags.layer, 1);
  const heightM = metersFromTag(tags.height, layer * 5);
  const lengthM = approximateLength(geometry);

  return {
    id: `bridge-${el.id}`,
    bridgeType,
    geometry,
    layer,
    heightM,
    clearanceM: tags.min_height ? parseFloat(tags.min_height) : undefined,
    lengthM,
  };
}

function buildTunnelFromWay(el: OverpassElement): TunnelGeometry | null {
  const tags = el.tags ?? {};
  const tunnel = tags.tunnel;
  if (!tunnel || tunnel === 'no') return null;
  const geometry = (el.geometry ?? []).map((p) => ({ lat: p.lat, lng: p.lon }));
  if (geometry.length < 2) return null;

  const tunnelType: TunnelType =
    tunnel === 'building_passage' || tunnel === 'culvert' ? tunnel : 'tunnel';

  return {
    id: `tunnel-${el.id}`,
    tunnelType,
    geometry,
    layer: intFromTag(tags.layer, -1),
    heightM: tags.height ? parseFloat(tags.height) : undefined,
    lengthM: approximateLength(geometry),
  };
}

function buildRestrictionsFromWay(el: OverpassElement): RoadRestriction[] {
  const tags = el.tags ?? {};
  const result: RoadRestriction[] = [];
  const edgeId = `way-${el.id}`;
  const map: Array<[RoadRestriction['kind'], string]> = [
    ['maxweight', 'maxweight'],
    ['maxheight', 'maxheight'],
    ['maxwidth', 'maxwidth'],
    ['maxlength', 'maxlength'],
    ['maxaxleload', 'maxaxleload'],
  ];
  for (const [kind, tagKey] of map) {
    const v = tags[tagKey];
    if (!v) continue;
    const num = parseFloat(v);
    if (!Number.isFinite(num)) continue;
    result.push({ kind, value: num, edgeId });
  }
  return result;
}

function buildSpeedBumpFromNode(el: OverpassElement): SpeedBump | null {
  if (el.type !== 'node' || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  const calming = tags.traffic_calming;
  if (!calming) return null;

  const typeMap: Record<string, SpeedBumpType> = {
    bump: 'bump', hump: 'hump', table: 'table', cushion: 'cushion',
    raised_crosswalk: 'raised_crosswalk', dip: 'dip',
  };
  const bumpType = typeMap[calming] ?? 'bump';

  return {
    id: `bump-${el.id}`,
    location: { lat: el.lat, lng: el.lon },
    bumpType,
    crossingRef: calming === 'raised_crosswalk' ? tags.crossing_ref : undefined,
  };
}

function buildCrossingFromNode(el: OverpassElement): PedestrianCrossing | null {
  if (el.type !== 'node' || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  if (tags.highway !== 'crossing') return null;

  const ct = tags.crossing ?? tags.crossing_ref ?? 'uncontrolled';
  const typeMap: Record<string, CrossingType> = {
    traffic_signals: 'traffic_signals', zebra: 'zebra', pelican: 'pelican',
    toucan: 'toucan', uncontrolled: 'uncontrolled', unmarked: 'uncontrolled',
  };

  return {
    id: `cross-${el.id}`,
    location: { lat: el.lat, lng: el.lon },
    crossingType: typeMap[ct] ?? 'uncontrolled',
    hasSignal: ct === 'traffic_signals' || tags['crossing:signals'] === 'yes',
    hasTactilePaving: tags.tactile_paving === 'yes',
  };
}

function buildCrossingFromWay(el: OverpassElement): PedestrianCrossing | null {
  if (el.type !== 'way') return null;
  const tags = el.tags ?? {};
  if (tags.footway !== 'crossing') return null;
  const geometry = (el.geometry ?? []).map((p) => ({ lat: p.lat, lng: p.lon }));
  if (geometry.length < 2) return null;

  const mid = geometry[Math.floor(geometry.length / 2)];
  const ct = tags.crossing ?? 'uncontrolled';
  const typeMap: Record<string, CrossingType> = {
    traffic_signals: 'traffic_signals', zebra: 'zebra', uncontrolled: 'uncontrolled',
    unmarked: 'uncontrolled',
  };

  return {
    id: `cross-${el.id}`,
    location: mid,
    crossingType: typeMap[ct] ?? 'uncontrolled',
    hasSignal: ct === 'traffic_signals',
    hasTactilePaving: tags.tactile_paving === 'yes',
    geometry,
  };
}

function buildBorderFromNode(el: OverpassElement): BorderCrossing | null {
  if (el.type !== 'node' || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  if (tags.barrier !== 'border_control') return null;

  return {
    id: `border-${el.id}`,
    location: { lat: el.lat, lng: el.lon },
    borderType: tags.border_type === 'regional' ? 'regional' : 'international',
    name: tags.name ?? tags['name:en'] ?? 'Border',
    openingHours: tags.opening_hours,
    countryTo: tags['addr:country'],
  };
}

function buildCheckpointFromNode(el: OverpassElement): PoliceCheckpoint | null {
  if (el.type !== 'node' || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};

  const isPolice = tags.amenity === 'police' || tags.highway === 'checkpoint';
  if (!isPolice) return null;

  const op = (tags.operator ?? '').toLowerCase();
  let cpType: PoliceCheckpoint['checkpointType'] = 'dps';
  if (op.includes('таможн') || op.includes('custom')) cpType = 'customs';
  else if (op.includes('вес') || tags.check === 'weight') cpType = 'weight_control';
  else if (tags.barrier === 'toll_booth') cpType = 'toll_booth';

  return {
    id: `cp-${el.id}`,
    location: { lat: el.lat, lng: el.lon },
    checkpointType: cpType,
    name: tags.name,
    direction: tags.direction ? parseFloat(tags.direction) : undefined,
  };
}

function buildParkingFromElement(el: OverpassElement): ParkingArea | null {
  const tags = el.tags ?? {};
  if (tags.amenity !== 'parking') return null;

  let location: LatLng;
  let geometry: LatLng[] | undefined;

  if (el.type === 'node' && el.lat != null && el.lon != null) {
    location = { lat: el.lat, lng: el.lon };
  } else if (el.type === 'way' && el.geometry?.length) {
    geometry = el.geometry.map((p) => ({ lat: p.lat, lng: p.lon }));
    const mid = geometry[Math.floor(geometry.length / 2)];
    location = mid;
  } else {
    return null;
  }

  const ptMap: Record<string, ParkingType> = {
    underground: 'underground', multi_storey: 'multi_storey', 'multi-storey': 'multi_storey',
    rooftop: 'rooftop', street_side: 'street_side', lane: 'lane', surface: 'surface',
  };

  return {
    id: `park-${el.id}`,
    location,
    parkingType: ptMap[tags.parking ?? ''] ?? 'surface',
    capacity: tags.capacity ? parseInt(tags.capacity, 10) : undefined,
    fee: tags.fee === 'yes',
    access: (['yes', 'customers', 'private', 'permissive'] as const).includes(tags.access as 'yes')
      ? (tags.access as ParkingArea['access'])
      : 'yes',
    geometry,
    name: tags.name,
  };
}

function buildRoundaboutFromWay(el: OverpassElement): Roundabout | null {
  if (el.type !== 'way') return null;
  const tags = el.tags ?? {};
  if (tags.junction !== 'roundabout') return null;
  const geometry = (el.geometry ?? []).map((p) => ({ lat: p.lat, lng: p.lon }));
  if (geometry.length < 3) return null;

  let cLat = 0, cLng = 0;
  for (const p of geometry) { cLat += p.lat; cLng += p.lng; }
  const center = { lat: cLat / geometry.length, lng: cLng / geometry.length };

  let maxDist = 0;
  for (const p of geometry) {
    const dLat = (p.lat - center.lat) * 111_320;
    const dLng = (p.lng - center.lng) * 111_320 * Math.cos((center.lat * Math.PI) / 180);
    const d = Math.sqrt(dLat * dLat + dLng * dLng);
    if (d > maxDist) maxDist = d;
  }

  return {
    id: `ra-${el.id}`,
    center,
    radiusM: maxDist,
    lanes: intFromTag(tags.lanes, 1),
    direction: tags.direction === 'clockwise' ? 'clockwise' : 'counterclockwise',
    geometry,
  };
}

function buildExitFromNode(el: OverpassElement): HighwayExit | null {
  if (el.type !== 'node' || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  if (tags.highway !== 'motorway_junction') return null;

  return {
    id: `exit-${el.id}`,
    location: { lat: el.lat, lng: el.lon },
    ref: tags.ref,
    destination: tags.destination ?? tags['destination:ref'],
    exitType: tags.services === 'yes' ? 'service_area' : tags.rest_area === 'yes' ? 'rest_area' : 'exit',
  };
}

function buildSurfaceFromWay(el: OverpassElement): RoadSurface | null {
  if (el.type !== 'way') return null;
  const tags = el.tags ?? {};
  if (!tags.smoothness && !tags.surface) return null;
  const geometry = (el.geometry ?? []).map((p) => ({ lat: p.lat, lng: p.lon }));
  if (geometry.length < 2) return null;

  const validGrades: SmoothnessGrade[] = ['excellent', 'good', 'intermediate', 'bad', 'very_bad', 'horrible'];
  const sm = tags.smoothness as SmoothnessGrade | undefined;

  return {
    edgeId: `way-${el.id}`,
    surface: tags.surface ?? 'asphalt',
    smoothness: sm && validGrades.includes(sm) ? sm : 'good',
    lastSurvey: tags['survey:date'],
    geometry,
  };
}

function approximateLength(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = (b.lat - a.lat) * 111_320;
    const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    total += Math.sqrt(dLat * dLat + dLng * dLng);
  }
  return total;
}

function parseElements(elements: OverpassElement[]): Omit<RoadInfraSnapshot, 'bbox' | 'fetchedAt' | 'ttlSeconds' | 'source'> {
  const lanes: HDLane[] = [];
  const signs: RoadSign[] = [];
  const cameras: RoadCamera[] = [];
  const signals: TrafficSignal[] = [];
  const bridges: BridgeGeometry[] = [];
  const tunnels: TunnelGeometry[] = [];
  const restrictions: RoadRestriction[] = [];
  const markings: LaneMarking[] = []; // заполняется в lane-modeler
  const speedBumps: SpeedBump[] = [];
  const crossings: PedestrianCrossing[] = [];
  const borders: BorderCrossing[] = [];
  const checkpoints: PoliceCheckpoint[] = [];
  const parking: ParkingArea[] = [];
  const roundabouts: Roundabout[] = [];
  const exits: HighwayExit[] = [];
  const surfaces: RoadSurface[] = [];

  for (const el of elements) {
    if (el.type === 'way') {
      lanes.push(...buildLanesFromWay(el));
      const bridge = buildBridgeFromWay(el);
      if (bridge) bridges.push(bridge);
      const tunnel = buildTunnelFromWay(el);
      if (tunnel) tunnels.push(tunnel);
      restrictions.push(...buildRestrictionsFromWay(el));
      const crossing = buildCrossingFromWay(el);
      if (crossing) crossings.push(crossing);
      const parkEl = buildParkingFromElement(el);
      if (parkEl) parking.push(parkEl);
      const ra = buildRoundaboutFromWay(el);
      if (ra) roundabouts.push(ra);
      const surf = buildSurfaceFromWay(el);
      if (surf) surfaces.push(surf);
    } else if (el.type === 'node') {
      const sign = buildSignFromNode(el);
      if (sign) signs.push(sign);
      const cam = buildCameraFromNode(el);
      if (cam) cameras.push(cam);
      const sig = buildSignalFromNode(el);
      if (sig) signals.push(sig);
      const bump = buildSpeedBumpFromNode(el);
      if (bump) speedBumps.push(bump);
      const cross = buildCrossingFromNode(el);
      if (cross) crossings.push(cross);
      const border = buildBorderFromNode(el);
      if (border) borders.push(border);
      const cp = buildCheckpointFromNode(el);
      if (cp) checkpoints.push(cp);
      const parkNode = buildParkingFromElement(el);
      if (parkNode) parking.push(parkNode);
      const exit = buildExitFromNode(el);
      if (exit) exits.push(exit);
    }
  }

  return {
    lanes, markings, signs, cameras, signals, bridges, tunnels, restrictions,
    speedBumps, crossings, borders, checkpoints, parking, roundabouts, exits, surfaces,
  };
}

/** Главная функция: сканировать инфраструктуру в bbox */
export async function scanInfrastructure(
  bbox: BBox,
  opts: InfraScanOptions = {}
): Promise<RoadInfraSnapshot> {
  const ttl = opts.cacheTTL ?? 3600;

  // Кэш
  if (!opts.forceRefresh) {
    const cached = await getInfraFromCache(bbox, ttl);
    if (cached) {
      logger.debug('[overpassScanner] Кэш-хит', bbox);
      return { ...cached, source: 'cache' };
    }
  }

  // Запрос
  const query = buildQuery(bbox, opts);
  let response: OverpassResponse;
  try {
    response = await fetchOverpass(query, opts.signal);
  } catch (err) {
    logger.warn('[overpassScanner] Overpass недоступен, fallback на устаревший кэш', err);
    const stale = await getInfraFromCache(bbox, Number.MAX_SAFE_INTEGER);
    if (stale) return { ...stale, source: 'cache' };
    throw err;
  }

  const parsed = parseElements(response.elements);
  const snapshot: RoadInfraSnapshot = {
    bbox,
    fetchedAt: Date.now(),
    ttlSeconds: ttl,
    source: 'overpass',
    ...parsed,
  };

  // Сохранить в кэш не блокируя
  void putInfraIntoCache(snapshot).catch((err) => {
    logger.debug('[overpassScanner] Не удалось сохранить в кэш', err);
  });

  return snapshot;
}
