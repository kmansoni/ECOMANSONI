import type { LatLng } from '@/types/taxi';
import type { NavRoute, RouteSegment, Maneuver, ManeuverType, TrafficLevel } from '@/types/navigation';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

interface GraphNode {
  lat: number;
  lon: number;
}

interface GraphEdge {
  fromNode: string;
  toNode: string;
  distance: number;
  speed: number;
  highway: string;
  name: string;
}

interface LocalGraph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

let localGraph: LocalGraph | null = null;
let graphLoadAttempted = false;

async function loadLocalGraph(): Promise<LocalGraph | null> {
  if (graphLoadAttempted) return localGraph;
  graphLoadAttempted = true;
  
  try {
    const response = await fetch('/data/osm/graph.json');
    if (!response.ok) {
      console.log('[Routing] Local graph not found');
      return null;
    }
    const parsedGraph = (await response.json()) as LocalGraph;
    localGraph = parsedGraph;
    console.log('[Routing] Loaded local graph:', 
      Object.keys(parsedGraph.nodes).length, 'nodes,', 
      parsedGraph.edges.length, 'edges');
    return localGraph;
  } catch (e) {
    console.warn('[Routing] Failed to load local graph:', e);
    return null;
  }
}

function findNearestNode(lat: number, lon: number, nodes: Record<string, GraphNode>): string | null {
  let minDist = Infinity;
  let nearest: string | null = null;
  
  for (const [id, node] of Object.entries(nodes)) {
    const dist = Math.sqrt((node.lat - lat) ** 2 + (node.lon - lon) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearest = id;
    }
  }
  
  return nearest;
}

function dijkstra(
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
  startNodeId: string,
  endNodeId: string
): GraphEdge[] | null {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const visited: Set<string> = new Set();
  
  for (const id in nodes) {
    distances[id] = id === startNodeId ? 0 : Infinity;
    previous[id] = null;
  }
  
  while (visited.size < Object.keys(nodes).length) {
    let minDist = Infinity;
    let currentNode: string | null = null;
    
    for (const id in distances) {
      if (!visited.has(id) && distances[id] < minDist) {
        minDist = distances[id];
        currentNode = id;
      }
    }
    
    if (currentNode === null || currentNode === endNodeId) break;
    visited.add(currentNode);
    
    const outgoing = edges.filter(e => e.fromNode === currentNode);
    for (const edge of outgoing) {
      const newDist = distances[currentNode] + edge.distance;
      if (newDist < distances[edge.toNode]) {
        distances[edge.toNode] = newDist;
        previous[edge.toNode] = currentNode;
      }
    }
  }
  
  if (!previous[endNodeId]) return null;
  
  const path: GraphEdge[] = [];
  let current: string | null = endNodeId;
  while (current !== null && previous[current] !== null) {
    const from: string = previous[current] as string;
    const edge = edges.find(e => e.fromNode === from && e.toNode === current);
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
  
  const path = dijkstra(graph.nodes, graph.edges, fromNodeId, toNodeId);
  
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
  const r = Math.random();

  if ((hour >= 7 && hour < 10) || (hour >= 17 && hour < 20)) {
    // час пик
    if (r < 0.1) return 'congested';
    if (r < 0.4) return 'slow';
    return 'moderate';
  }
  if (hour >= 10 && hour < 17) {
    if (r < 0.5) return 'free';
    if (r < 0.8) return 'moderate';
    return 'slow';
  }
  // ночь
  if (r < 0.7) return 'free';
  if (r < 0.9) return 'moderate';
  return 'slow';
}

function chunkRoute(points: LatLng[], segmentCount: number): RouteSegment[] {
  if (points.length < 2) return [];
  const chunkSize = Math.max(2, Math.floor(points.length / segmentCount));
  const segments: RouteSegment[] = [];

  for (let i = 0; i < points.length; i += chunkSize - 1) {
    const end = Math.min(i + chunkSize, points.length);
    const chunk = points.slice(i, end);
    if (chunk.length >= 2) {
      segments.push({
        points: chunk,
        traffic: estimateTraffic(),
        speedLimit: [40, 60, 80, 100][Math.floor(Math.random() * 4)],
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
  alternatives = true
): Promise<{ main: NavRoute; alternatives: NavRoute[] }> {
  // Try offline first
  try {
    return await fetchRouteOffline(from, to);
  } catch (e) {
    console.log('[Routing] Falling back to OSRM:', e);
  }
  
  // Fallback to OSRM
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`OSRM error: ${resp.status}`);

  const data = await resp.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No route found');
  }

  const main = parseOSRMRoute(data.routes[0], 'main');
  const alts = (data.routes as OSRMRoute[])
    .slice(1, 4)
    .map((r, i) => parseOSRMRoute(r, `alt-${i}`));

  return { main, alternatives: alts };
}


