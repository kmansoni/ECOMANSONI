import type { LatLng } from '@/types/taxi';
import type { NavRoute, RouteSegment, Maneuver, ManeuverType, PedestrianRoutingOptions } from '@/types/navigation';
import { staticDataUrl } from './staticDataUrl';

// Pedestrian speed weighting by road type (lower = more walkable)
const PEDESTRIAN_WEIGHTS: Record<string, number> = {
  footway: 1.0,
  pedestrian: 1.0,
  path: 1.1,
  sidewalk: 1.0,
  crossing: 1.0,
  steps: 1.5,
  elevator: 1.0,
  escalator: 1.2,
  cycleway: 1.3,
  living_street: 1.3,
  residential: 1.5,
  service: 1.8,
  unclassified: 2.0,
  tertiary: 2.5,
  secondary: 3.0,
  primary: 4.0,
  trunk: 50.0,
  motorway: 1000.0,
  motorway_link: 1000.0,
  trunk_link: 50.0,
};

const PEDESTRIAN_SPEED_KMH = 5.0;

interface PedestrianGraphNode {
  lat: number;
  lon: number;
}

interface PedestrianGraphEdge {
  fromNode: string;
  toNode: string;
  distance: number; // km
  highway: string;
  name: string;
  hasStairs?: boolean;
  hasElevator?: boolean;
  slopePercent?: number;
}

interface PedestrianGraph {
  nodes: Record<string, PedestrianGraphNode>;
  edges: PedestrianGraphEdge[];
}

let pedestrianGraph: PedestrianGraph | null = null;
let loadAttempted = false;

// Spatial grid for fast nearest-node lookup
let spatialGrid: Map<string, string[]> | null = null;
const GRID_SIZE = 0.003; // ~330m cells (finer for pedestrians)

// Adjacency list (built once per graph load)
let adjList: Map<string, PedestrianGraphEdge[]> | null = null;

function buildSpatialGrid(nodes: Record<string, PedestrianGraphNode>): Map<string, string[]> {
  if (spatialGrid) return spatialGrid;
  spatialGrid = new Map();
  for (const [id, node] of Object.entries(nodes)) {
    const key = `${Math.floor(node.lat / GRID_SIZE)},${Math.floor(node.lon / GRID_SIZE)}`;
    let arr = spatialGrid.get(key);
    if (!arr) { arr = []; spatialGrid.set(key, arr); }
    arr.push(id);
  }
  return spatialGrid;
}

function getAdjacencyList(edges: PedestrianGraphEdge[]): Map<string, PedestrianGraphEdge[]> {
  if (adjList) return adjList;
  adjList = new Map();
  for (const edge of edges) {
    let fwd = adjList.get(edge.fromNode);
    if (!fwd) { fwd = []; adjList.set(edge.fromNode, fwd); }
    fwd.push(edge);
    // Pedestrian graph is bidirectional
    let bwd = adjList.get(edge.toNode);
    if (!bwd) { bwd = []; adjList.set(edge.toNode, bwd); }
    bwd.push({ ...edge, fromNode: edge.toNode, toNode: edge.fromNode });
  }
  return adjList;
}

function findNearestPedestrianNode(
  lat: number,
  lng: number,
  nodes: Record<string, PedestrianGraphNode>
): string | null {
  const grid = buildSpatialGrid(nodes);
  const cellLat = Math.floor(lat / GRID_SIZE);
  const cellLon = Math.floor(lng / GRID_SIZE);
  let minDist = Infinity;
  let nearest: string | null = null;

  for (let radius = 1; radius <= 3; radius++) {
    for (let dLat = -radius; dLat <= radius; dLat++) {
      for (let dLon = -radius; dLon <= radius; dLon++) {
        const ids = grid.get(`${cellLat + dLat},${cellLon + dLon}`);
        if (!ids) continue;
        for (const id of ids) {
          const node = nodes[id];
          const dist = (node.lat - lat) ** 2 + (node.lon - lng) ** 2;
          if (dist < minDist) { minDist = dist; nearest = id; }
        }
      }
    }
    if (nearest) break;
  }
  return nearest;
}

// A* heuristic — straight-line distance in km
function heuristic(
  nodeId: string,
  endNodeId: string,
  nodes: Record<string, PedestrianGraphNode>
): number {
  const a = nodes[nodeId];
  const b = nodes[endNodeId];
  if (!a || !b) return 0;
  const dlat = (a.lat - b.lat) * 111.32;
  const dlng = (a.lon - b.lon) * 111.32 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

// Binary min-heap for A*
class MinHeap {
  private heap: [number, string][] = [];

  push(dist: number, id: string): void {
    this.heap.push([dist, id]);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): [number, string] | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number { return this.heap.length; }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[i][0] >= this.heap[parent][0]) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
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

function getEdgeWeight(edge: PedestrianGraphEdge, opts: PedestrianRoutingOptions): number {
  const baseWeight = PEDESTRIAN_WEIGHTS[edge.highway] ?? 2.0;
  let weight = edge.distance * baseWeight;

  if (opts.avoidStairs && edge.hasStairs) {
    weight *= 100; // virtually unreachable
  }
  if (opts.maxSlopePercent != null && edge.slopePercent != null) {
    if (edge.slopePercent > opts.maxSlopePercent) {
      weight *= 50;
    }
  }
  return weight;
}

function aStarPedestrian(
  graph: PedestrianGraph,
  startId: string,
  endId: string,
  opts: PedestrianRoutingOptions
): PedestrianGraphEdge[] | null {
  const adj = getAdjacencyList(graph.edges);
  const gScore: Record<string, number> = { [startId]: 0 };
  const previous: Record<string, { node: string; edge: PedestrianGraphEdge } | null> = { [startId]: null };
  const visited = new Set<string>();
  const pq = new MinHeap();

  pq.push(heuristic(startId, endId, graph.nodes), startId);

  while (pq.size > 0) {
    const [, current] = pq.pop()!;
    if (current === endId) break;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentG = gScore[current] ?? Infinity;
    const outgoing = adj.get(current) ?? [];
    for (const edge of outgoing) {
      const newG = currentG + getEdgeWeight(edge, opts);
      if (newG < (gScore[edge.toNode] ?? Infinity)) {
        gScore[edge.toNode] = newG;
        previous[edge.toNode] = { node: current, edge };
        pq.push(newG + heuristic(edge.toNode, endId, graph.nodes), edge.toNode);
      }
    }
  }

  if (previous[endId] === undefined) return null;

  const path: PedestrianGraphEdge[] = [];
  let cur: string = endId;
  while (previous[cur] !== null) {
    const prev = previous[cur]!;
    path.unshift(prev.edge);
    cur = prev.node;
  }
  return path;
}

function edgesToPedestrianRoute(
  edges: PedestrianGraphEdge[],
  graph: PedestrianGraph,
  from: LatLng,
  to: LatLng
): NavRoute {
  const geometry: LatLng[] = [from];
  const maneuvers: Maneuver[] = [];
  let totalDist = 0;
  let totalTime = 0;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const node = graph.nodes[edge.toNode];
    if (!node) continue;

    geometry.push({ lat: node.lat, lng: node.lon });
    const distM = edge.distance * 1000;
    const durS = (edge.distance / PEDESTRIAN_SPEED_KMH) * 3600;
    totalDist += distM;
    totalTime += durS;

    if (i === 0) {
      maneuvers.push({
        type: 'depart',
        instruction: `Идите по ${edge.name || 'дороге'}`,
        streetName: edge.name || '',
        distanceMeters: distM,
        durationSeconds: durS,
        location: from,
      });
    }

    // Detect turns
    if (i > 0 && i < edges.length - 1) {
      const prev = edges[i - 1];
      const prevNode = graph.nodes[prev.toNode];
      const curNode = graph.nodes[edge.fromNode];
      const nextNode = graph.nodes[edge.toNode];
      if (prevNode && curNode && nextNode) {
        const angle = calculateTurnAngle(
          { lat: prevNode.lat, lng: prevNode.lon },
          { lat: curNode.lat, lng: curNode.lon },
          { lat: nextNode.lat, lng: nextNode.lon }
        );
        const maneuverType = angleToManeuver(angle);
        if (maneuverType !== 'straight') {
          const turnName = maneuverType === 'turn-left' ? 'Поверните налево' :
            maneuverType === 'turn-right' ? 'Поверните направо' :
            maneuverType === 'turn-slight-left' ? 'Чуть левее' :
            maneuverType === 'turn-slight-right' ? 'Чуть правее' : 'Продолжайте';
          maneuvers.push({
            type: maneuverType,
            instruction: `${turnName} на ${edge.name || 'дорогу'}`,
            streetName: edge.name || '',
            distanceMeters: distM,
            durationSeconds: durS,
            location: { lat: curNode.lat, lng: curNode.lon },
          });
        }
      }
    }
  }

  geometry.push(to);

  maneuvers.push({
    type: 'arrive',
    instruction: 'Вы прибыли',
    streetName: '',
    distanceMeters: 0,
    durationSeconds: 0,
    location: to,
  });

  const chunkSize = Math.max(2, Math.floor(geometry.length / Math.max(3, Math.floor(geometry.length / 20))));
  const segments: RouteSegment[] = [];
  for (let i = 0; i < geometry.length; i += chunkSize - 1) {
    const end = Math.min(i + chunkSize, geometry.length);
    const chunk = geometry.slice(i, end);
    if (chunk.length >= 2) {
      segments.push({ points: chunk, traffic: 'free', speedLimit: null });
    }
  }

  return {
    id: `ped-${Date.now()}`,
    segments,
    maneuvers,
    totalDistanceMeters: totalDist,
    totalDurationSeconds: totalTime,
    geometry,
  };
}

function calculateTurnAngle(prev: LatLng, curr: LatLng, next: LatLng): number {
  const bearing1 = Math.atan2(curr.lng - prev.lng, curr.lat - prev.lat);
  const bearing2 = Math.atan2(next.lng - curr.lng, next.lat - curr.lat);
  let angle = (bearing2 - bearing1) * (180 / Math.PI);
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;
  return angle;
}

function angleToManeuver(angle: number): ManeuverType {
  const abs = Math.abs(angle);
  if (abs < 20) return 'straight';
  if (abs < 60) return angle > 0 ? 'turn-slight-right' : 'turn-slight-left';
  if (abs < 150) return angle > 0 ? 'turn-right' : 'turn-left';
  return 'uturn';
}

export async function loadPedestrianGraph(): Promise<PedestrianGraph | null> {
  if (loadAttempted) return pedestrianGraph;
  loadAttempted = true;

  try {
    // Try pedestrian-specific graph first, then fall back to car graph
    let response = await fetch(staticDataUrl('/data/osm/pedestrian-graph.json'));
    if (!response.ok) {
      response = await fetch(staticDataUrl('/data/osm/graph.json'));
    }
    if (!response.ok) {
      console.log('[PedestrianMode] No graph available');
      return null;
    }
    pedestrianGraph = (await response.json()) as PedestrianGraph;
    spatialGrid = null;
    adjList = null;
    console.log(
      '[PedestrianMode] Loaded graph:',
      Object.keys(pedestrianGraph.nodes).length, 'nodes,',
      pedestrianGraph.edges.length, 'edges'
    );
    return pedestrianGraph;
  } catch (e) {
    console.warn('[PedestrianMode] Failed to load graph:', e);
    return null;
  }
}

export async function buildPedestrianRoute(
  from: LatLng,
  to: LatLng,
  options: PedestrianRoutingOptions = {}
): Promise<NavRoute> {
  const graph = await loadPedestrianGraph();
  if (!graph) {
    throw new Error('Пешеходный граф недоступен. Загрузите оффлайн данные.');
  }

  const fromNode = findNearestPedestrianNode(from.lat, from.lng, graph.nodes);
  const toNode = findNearestPedestrianNode(to.lat, to.lng, graph.nodes);

  if (!fromNode || !toNode) {
    throw new Error('Не удалось найти ближайшие пешеходные точки');
  }

  const edges = aStarPedestrian(graph, fromNode, toNode, options);
  if (!edges || edges.length === 0) {
    throw new Error('Пешеходный маршрут не найден');
  }

  return edgesToPedestrianRoute(edges, graph, from, to);
}

export function isPedestrianGraphLoaded(): boolean {
  return pedestrianGraph !== null;
}
