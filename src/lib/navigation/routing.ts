import type { LatLng } from '@/types/taxi';
import type { NavRoute, RouteSegment, Maneuver, ManeuverType, TrafficLevel, TravelMode, MultiModalRoute, TransitRoutingOptions, PedestrianRoutingOptions } from '@/types/navigation';
import { useNavigatorSettings } from '@/stores/navigatorSettingsStore';
import { loadOsmGraph, type OSMGraph, type OSMGraphEdge, type OSMGraphNode } from '@/lib/navigation/osmGraph';

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const OSRM_BASE = ENV.VITE_OSRM_URL ?? 'https://router.project-osrm.org/route/v1/driving';
export const OSRM_FOOT_BASE = ENV.VITE_OSRM_FOOT_URL ?? 'https://router.project-osrm.org/route/v1/foot';

type GraphNode = OSMGraphNode;
type GraphEdge = OSMGraphEdge;
type LocalGraph = OSMGraph;

let localGraph: LocalGraph | null = null;
let graphLoadAttempted = false;

async function loadLocalGraph(): Promise<LocalGraph | null> {
  if (graphLoadAttempted) return localGraph;
  graphLoadAttempted = true;
  
  try {
    const parsedGraph = await loadOsmGraph();
    if (!parsedGraph) {
      console.log('[Routing] Local graph not found');
      return null;
    }
    localGraph = parsedGraph;
    _spatialGrid = null; // reset spatial index
    _adjList = null; // reset adjacency list
    console.log('[Routing] Loaded local graph:', 
      Object.keys(parsedGraph.nodes).length, 'nodes,', 
      parsedGraph.edges.length, 'edges');
    return localGraph;
  } catch (e) {
    console.warn('[Routing] Failed to load local graph:', e);
    return null;
  }
}

// ─── Spatial grid for fast nearest-node lookup ─────────────────────────────
let _spatialGrid: Map<string, string[]> | null = null;
const GRID_SIZE = 0.005; // ~500m cells

function buildSpatialGrid(nodes: Record<string, GraphNode>): Map<string, string[]> {
  if (_spatialGrid) return _spatialGrid;
  _spatialGrid = new Map();
  for (const [id, node] of Object.entries(nodes)) {
    const key = `${Math.floor(node.lat / GRID_SIZE)},${Math.floor(node.lon / GRID_SIZE)}`;
    let arr = _spatialGrid.get(key);
    if (!arr) { arr = []; _spatialGrid.set(key, arr); }
    arr.push(id);
  }
  return _spatialGrid;
}

function findNearestNode(lat: number, lon: number, nodes: Record<string, GraphNode>): string | null {
  const grid = buildSpatialGrid(nodes);
  const cellLat = Math.floor(lat / GRID_SIZE);
  const cellLon = Math.floor(lon / GRID_SIZE);

  let minDist = Infinity;
  let nearest: string | null = null;

  // Search 3x3 neighborhood
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {
      const key = `${cellLat + dLat},${cellLon + dLon}`;
      const ids = grid.get(key);
      if (!ids) continue;
      for (const id of ids) {
        const node = nodes[id];
        const dist = (node.lat - lat) ** 2 + (node.lon - lon) ** 2;
        if (dist < minDist) { minDist = dist; nearest = id; }
      }
    }
  }

  // Fallback: if no node found in neighborhood, expand to 5x5
  if (!nearest) {
    for (let dLat = -2; dLat <= 2; dLat++) {
      for (let dLon = -2; dLon <= 2; dLon++) {
        const key = `${cellLat + dLat},${cellLon + dLon}`;
        const ids = grid.get(key);
        if (!ids) continue;
        for (const id of ids) {
          const node = nodes[id];
          const dist = (node.lat - lat) ** 2 + (node.lon - lon) ** 2;
          if (dist < minDist) { minDist = dist; nearest = id; }
        }
      }
    }
  }

  return nearest;
}

// ─── Adjacency list (built once per graph load) ────────────────────────────
let _adjList: Map<string, GraphEdge[]> | null = null;

function getAdjacencyList(edges: GraphEdge[]): Map<string, GraphEdge[]> {
  if (_adjList) return _adjList;
  _adjList = new Map();
  for (const edge of edges) {
    let arr = _adjList.get(edge.fromNode);
    if (!arr) { arr = []; _adjList.set(edge.fromNode, arr); }
    arr.push(edge);
  }
  return _adjList;
}

// ─── Binary Min-Heap for Dijkstra ──────────────────────────────────────────
class MinHeap {
  private heap: [number, string][] = []; // [distance, nodeId]

  push(dist: number, id: string): void {
    this.heap.push([dist, id]);
    this._bubbleUp(this.heap.length - 1);
  }

  pop(): [number, string] | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size(): number { return this.heap.length; }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[i][0] >= this.heap[parent][0]) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1, right = 2 * i + 2;
      if (left < n && this.heap[left][0] < this.heap[smallest][0]) smallest = left;
      if (right < n && this.heap[right][0] < this.heap[smallest][0]) smallest = right;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}

// Типы дорог для фильтрации
const TOLL_HIGHWAYS = new Set(['motorway', 'toll', 'motorway_link']);
const UNPAVED_ROADS = new Set(['track', 'path', 'unpaved', 'dirt']);
const HIGHWAY_ROADS = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link']);

interface RoutePreferences {
  avoidTolls: boolean;
  avoidUnpaved: boolean;
  avoidHighways: boolean;
}

function getRoutePreferences(): RoutePreferences {
  const state = useNavigatorSettings.getState();
  return {
    avoidTolls: state.avoidTolls,
    avoidUnpaved: state.avoidUnpaved,
    avoidHighways: state.avoidHighways,
  };
}

// Штраф за нежелательные типы дорог (умножитель расстояния)
function getEdgePenalty(edge: GraphEdge, prefs: RoutePreferences): number {
  let penalty = 1.0;
  if (prefs.avoidTolls && TOLL_HIGHWAYS.has(edge.highway)) penalty += 10;
  if (prefs.avoidUnpaved && UNPAVED_ROADS.has(edge.highway)) penalty += 10;
  if (prefs.avoidHighways && HIGHWAY_ROADS.has(edge.highway)) penalty += 5;
  return penalty;
}

// A* эвристика — расстояние по прямой до цели (в км)
function heuristic(nodeId: string, endNodeId: string, nodes: Record<string, GraphNode>): number {
  const a = nodes[nodeId];
  const b = nodes[endNodeId];
  if (!a || !b) return 0;
  const dlat = (a.lat - b.lat) * 111.32;
  const dlng = (a.lon - b.lon) * 111.32 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function aStarRoute(
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
  startNodeId: string,
  endNodeId: string
): GraphEdge[] | null {
  const adj = getAdjacencyList(edges);
  const prefs = getRoutePreferences();
  const gScore: Record<string, number> = { [startNodeId]: 0 };
  const previous: Record<string, string | null> = { [startNodeId]: null };
  const visited = new Set<string>();
  const pq = new MinHeap();

  pq.push(heuristic(startNodeId, endNodeId, nodes), startNodeId);

  while (pq.size > 0) {
    const [, currentNode] = pq.pop()!;

    if (currentNode === endNodeId) break;
    if (visited.has(currentNode)) continue;
    visited.add(currentNode);

    const currentG = gScore[currentNode] ?? Infinity;
    const outgoing = adj.get(currentNode) ?? [];
    for (const edge of outgoing) {
      const penalty = getEdgePenalty(edge, prefs);
      const newG = currentG + edge.distance * penalty;
      if (newG < (gScore[edge.toNode] ?? Infinity)) {
        gScore[edge.toNode] = newG;
        previous[edge.toNode] = currentNode;
        const fScore = newG + heuristic(edge.toNode, endNodeId, nodes);
        pq.push(fScore, edge.toNode);
      }
    }
  }

  if (previous[endNodeId] === undefined) return null;

  const path: GraphEdge[] = [];
  let current: string | null = endNodeId;
  while (current !== null && previous[current] !== null) {
    const from: string = previous[current] as string;
    const edge = (adj.get(from) ?? []).find(e => e.toNode === current);
    if (edge) path.unshift(edge);
    current = from;
  }

  return path;
}

function edgesToRoute(
  edges: GraphEdge[],
  nodes: Record<string, GraphNode>,
  routeId: string
): NavRoute {
  const geometry: LatLng[] = [];
  const maneuvers: Maneuver[] = [];
  
  if (edges.length > 0) {
    const startNode = nodes[edges[0].fromNode];
    if (startNode) geometry.push({ lat: startNode.lat, lng: startNode.lon });
  }
  
  let totalDist = 0;
  let totalTime = 0;
  
  for (const edge of edges) {
    const node = nodes[edge.toNode];
    if (node) {
      geometry.push({ lat: node.lat, lng: node.lon });
      totalDist += edge.distance * 1000;
      totalTime += (edge.distance * 1000 / edge.speed) * 3.6;
      
      const prevNode = nodes[edge.fromNode];
      if (prevNode) {
        const dx = node.lon - prevNode.lon;
        const dy = node.lat - prevNode.lat;
        let maneuverType: ManeuverType = 'straight';
        
        if (Math.abs(dx) > Math.abs(dy)) {
          maneuverType = dx > 0 ? 'turn-right' : 'turn-left';
        }
        
        if (edges.indexOf(edge) === 0) {
          maneuvers.push({
            type: 'depart',
            instruction: edge.name || 'Начало маршрута',
            streetName: edge.name,
            distanceMeters: edge.distance * 1000,
            durationSeconds: (edge.distance * 1000 / edge.speed) * 3.6,
            location: { lat: prevNode.lat, lng: prevNode.lon },
          });
        }
        
        if (edges.indexOf(edge) === edges.length - 1) {
          maneuvers.push({
            type: 'arrive',
            instruction: 'Прибытие',
            streetName: edge.name || '',
            distanceMeters: edge.distance * 1000,
            durationSeconds: (edge.distance * 1000 / edge.speed) * 3.6,
            location: { lat: node.lat, lng: node.lon },
          });
        } else if (maneuverType !== 'straight') {
          maneuvers.push({
            type: maneuverType,
            instruction: edge.name || '',
            streetName: edge.name,
            distanceMeters: edge.distance * 1000,
            durationSeconds: (edge.distance * 1000 / edge.speed) * 3.6,
            location: { lat: prevNode.lat, lng: prevNode.lon },
          });
        }
      }
    }
  }
  
  const segmentCount = Math.max(5, Math.floor(geometry.length / 30));
  const chunkSize = Math.max(2, Math.floor(geometry.length / segmentCount));
  const segments: RouteSegment[] = [];
  
  for (let i = 0; i < geometry.length; i += chunkSize - 1) {
    const end = Math.min(i + chunkSize, geometry.length);
    const chunk = geometry.slice(i, end);
    if (chunk.length >= 2) {
      segments.push({
        points: chunk,
        traffic: 'moderate' as TrafficLevel,
        speedLimit: 60,
      });
    }
  }
  
  return {
    id: routeId,
    segments,
    maneuvers,
    totalDistanceMeters: totalDist,
    totalDurationSeconds: totalTime,
    geometry,
  };
}

export async function fetchRouteOffline(
  from: LatLng,
  to: LatLng
): Promise<{ main: NavRoute; alternatives: NavRoute[] }> {
  const graph = await loadLocalGraph();
  
  if (!graph) {
    throw new Error('No local graph available');
  }
  
  const fromNodeId = findNearestNode(from.lat, from.lng, graph.nodes);
  const toNodeId = findNearestNode(to.lat, to.lng, graph.nodes);
  
  if (!fromNodeId || !toNodeId) {
    throw new Error('Could not find nearest nodes');
  }
  
  const path = aStarRoute(graph.nodes, graph.edges, fromNodeId, toNodeId);
  
  if (!path || path.length === 0) {
    throw new Error('No path found');
  }
  
  const main = edgesToRoute(path, graph.nodes, 'offline-main');
  
  return { main, alternatives: [] };
}

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

function estimateTraffic(hour: number = new Date().getHours()): TrafficLevel {
  // Детерминированная оценка трафика по времени суток
  if ((hour >= 7 && hour < 10) || (hour >= 17 && hour < 20)) {
    return 'slow'; // час пик
  }
  if (hour >= 10 && hour < 17) {
    return 'moderate'; // рабочее время
  }
  if (hour >= 22 || hour < 6) {
    return 'free'; // ночь
  }
  return 'moderate'; // вечер / утро
}

function chunkRoute(
  points: LatLng[],
  segmentCount: number,
  trafficSegments?: { centerLat: number; centerLon: number; congestionLevel: TrafficLevel; confidence: number }[],
): RouteSegment[] {
  if (points.length < 2) return [];
  const chunkSize = Math.max(2, Math.floor(points.length / segmentCount));
  const segments: RouteSegment[] = [];

  for (let i = 0; i < points.length; i += chunkSize - 1) {
    const end = Math.min(i + chunkSize, points.length);
    const chunk = points.slice(i, end);
    if (chunk.length >= 2) {
      // Определяем трафик: реальный (из GPS-проб) или детерминированный fallback
      let traffic: TrafficLevel = estimateTraffic();

      if (trafficSegments && trafficSegments.length > 0) {
        const midIdx = Math.floor(chunk.length / 2);
        const mid = chunk[midIdx];
        const threshold = 0.003; // ~330м
        let bestDist = Infinity;
        for (const seg of trafficSegments) {
          const dLat = Math.abs(seg.centerLat - mid.lat);
          const dLon = Math.abs(seg.centerLon - mid.lng);
          if (dLat > threshold || dLon > threshold) continue;
          const dist = dLat * dLat + dLon * dLon;
          if (dist < bestDist && seg.confidence >= 0.3) {
            bestDist = dist;
            traffic = seg.congestionLevel;
          }
        }
      }

      segments.push({
        points: chunk,
        traffic,
        speedLimit: null, // Real speed limits from OSRM annotations or OSM maxspeed tags
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
  alternatives = true,
  mode: TravelMode = 'car',
  transitOptions?: TransitRoutingOptions,
  pedestrianOptions?: PedestrianRoutingOptions,
): Promise<{ main: NavRoute; alternatives: NavRoute[]; multimodal?: MultiModalRoute }> {
  const effectiveMode: TravelMode = mode === 'taxi' ? 'car' : mode;

  // Pedestrian mode — use pedestrian graph + A*
  if (effectiveMode === 'pedestrian') {
    const { buildPedestrianRoute } = await import('./pedestrianMode');
    try {
      const main = await buildPedestrianRoute(from, to, pedestrianOptions);
      return { main, alternatives: [] };
    } catch (e) {
      console.warn('[Routing] Pedestrian route failed, falling back to car:', e);
      // Fall through to car routing with warning
    }
  }

  // Transit mode — use TransitRouter (RAPTOR)
  if (effectiveMode === 'transit' || effectiveMode === 'multimodal' || effectiveMode === 'metro') {
    try {
      const { transitRouter } = await import('./transitRouter');
      const mergedTransitOptions: TransitRoutingOptions = effectiveMode === 'metro'
        ? {
            ...transitOptions,
            transitTypes: ['metro'],
            maxTransfers: transitOptions?.maxTransfers ?? 3,
          }
        : (transitOptions ?? {});
      const result = await transitRouter.buildTransitRoute(from, to, mergedTransitOptions);
      // Return the first transit segment's walk route as NavRoute fallback
      const mainSegment = result.main.segments.find(s => s.geometry && s.geometry.length > 0);
      const fallbackRoute: NavRoute = {
        id: result.main.id,
        segments: result.main.segments
          .filter(s => s.geometry && s.geometry.length >= 2)
          .map(s => ({ points: s.geometry!, traffic: 'free' as TrafficLevel, speedLimit: null })),
        maneuvers: [],
        totalDistanceMeters: result.main.totalDistanceMeters,
        totalDurationSeconds: result.main.totalDurationSeconds,
        geometry: result.main.segments.flatMap(s => s.geometry ?? []),
      };
      return { main: fallbackRoute, alternatives: [], multimodal: result.main };
    } catch (e) {
      console.warn('[Routing] Transit route failed, falling back to car:', e);
    }
  }

  // Car mode (default) — offline first, OSRM fallback
  // 1) OFFLINE FIRST — local Dijkstra routing
  try {
    const result = await fetchRouteOffline(from, to);
    console.log('[Routing] Offline route found');
    return result;
  } catch (e) {
    console.log('[Routing] Offline unavailable:', e);
  }
  
  // 2) OSRM fallback (only when offline graph not loaded yet)
  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const baseParams = `overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;

    // Apply route preferences to OSRM exclude param
    const prefs = useNavigatorSettings.getState();
    const excludes: string[] = [];
    if (prefs.avoidTolls) excludes.push('toll');
    if (prefs.avoidHighways) excludes.push('motorway');
    const excludeParam = excludes.length > 0 ? `&exclude=${excludes.join(',')}` : '';

    // Try with full params first, progressively strip unsupported features
    const urlVariants = [
      `${OSRM_BASE}/${coords}?${baseParams}&annotations=duration,speed${excludeParam}`,
      ...(excludeParam ? [`${OSRM_BASE}/${coords}?${baseParams}&annotations=duration,speed`] : []),
      `${OSRM_BASE}/${coords}?${baseParams}`,
    ];

    let resp: Response | null = null;
    for (const url of urlVariants) {
      resp = await fetch(url);
      if (resp.ok) break;
      console.warn(`[Routing] OSRM rejected: ${resp.status}, trying simpler request`);
    }

    if (!resp || !resp.ok) throw new Error(`OSRM error: ${resp?.status}`);

    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error('No route found');
    }

    const main = parseOSRMRoute(data.routes[0], 'main');
    const alts = (data.routes as OSRMRoute[])
      .slice(1, 4)
      .map((r, i) => parseOSRMRoute(r, `alt-${i}`));

    return { main, alternatives: alts };
  } catch (osrmErr) {
    console.warn('[Routing] OSRM also failed:', osrmErr);
    throw new Error('Нет доступных маршрутов. Загрузите оффлайн данные: node scripts/fetch-osm-data.mjs');
  }
}

// ─── Spatial off-route проверка O(1) вместо O(n) ───────────────────────────
const ROUTE_GRID_SIZE = 0.0005; // ~50м ячейки

/**
 * Строит spatial grid по точкам маршрута для быстрой проверки on-route.
 * Возвращает функцию isOnRoute(position) → boolean.
 */
export function buildRouteProximityChecker(
  routeGeometry: LatLng[],
  thresholdKm: number = 0.05
): (position: LatLng) => boolean {
  const grid = new Set<string>();
  const expand = Math.ceil(thresholdKm / (ROUTE_GRID_SIZE * 111)); // кол-во ячеек для расширения

  for (const p of routeGeometry) {
    const cellLat = Math.floor(p.lat / ROUTE_GRID_SIZE);
    const cellLng = Math.floor(p.lng / ROUTE_GRID_SIZE);
    for (let dLat = -expand; dLat <= expand; dLat++) {
      for (let dLng = -expand; dLng <= expand; dLng++) {
        grid.add(`${cellLat + dLat},${cellLng + dLng}`);
      }
    }
  }

  return (position: LatLng): boolean => {
    const cellLat = Math.floor(position.lat / ROUTE_GRID_SIZE);
    const cellLng = Math.floor(position.lng / ROUTE_GRID_SIZE);
    return grid.has(`${cellLat},${cellLng}`);
  };
}


