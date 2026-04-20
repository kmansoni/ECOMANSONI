/**
 * Contraction Hierarchies (CH) — production-grade fast routing.
 *
 * Preprocessing: contract nodes in order of importance, adding shortcut edges.
 * Query: bidirectional Dijkstra on the augmented graph (only upward edges).
 *
 * Performance target: <50ms query on 10M+ edge graphs.
 *
 * References:
 * - Geisberger et al., "Contraction Hierarchies: Faster and Simpler
 *   Hierarchical Routing in Road Networks" (ESA 2008)
 */

import { loadOsmGraph, type OSMGraph, type OSMGraphEdge, type OSMGraphNode } from './osmGraph';
import type { LatLng } from '@/types/taxi';

// ── Types ────────────────────────────────────────────────────────────────────

interface CHNode {
  id: string;
  lat: number;
  lon: number;
  level: number; // contraction order (higher = more important)
}

interface CHEdge {
  from: string;
  to: string;
  weight: number; // seconds (travel time)
  distance: number; // metres
  /** If this is a shortcut, the contracted node used to unpack */
  shortcutVia: string | null;
  /** Original edge indices for non-shortcuts */
  originalEdge: number | null;
}

interface CHGraph {
  nodes: Map<string, CHNode>;
  /** Forward adjacency: only edges going to higher-level nodes */
  upEdges: Map<string, CHEdge[]>;
  /** Backward adjacency: only edges coming from higher-level nodes */
  downEdges: Map<string, CHEdge[]>;
  /** All edges (for unpacking) */
  allEdges: CHEdge[];
  /** Preprocessing time (ms) */
  preprocessTime: number;
}

export interface CHRoute {
  /** Unpacked path as coordinate sequence */
  path: LatLng[];
  /** Total travel time (seconds) */
  totalTimeSeconds: number;
  /** Total distance (metres) */
  totalDistanceMeters: number;
  /** Node IDs along the path */
  nodeIds: string[];
  /** Edge indices from original graph */
  originalEdgeIndices: number[];
  /** Query time (ms) */
  queryTimeMs: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SPEED_KMH: Record<string, number> = {
  motorway: 110,
  motorway_link: 60,
  trunk: 90,
  trunk_link: 50,
  primary: 60,
  primary_link: 40,
  secondary: 50,
  secondary_link: 35,
  tertiary: 40,
  tertiary_link: 30,
  residential: 30,
  living_street: 20,
  service: 20,
  unclassified: 30,
  track: 15,
};

const M_PER_DEG_LAT = 111_320;

// ── Geometry ─────────────────────────────────────────────────────────────────

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * sinLng * sinLng;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Spatial grid for nearest-node ────────────────────────────────────────────

const GRID_SIZE = 0.005;
let _spatialGrid: Map<string, string[]> | null = null;

function buildSpatialGrid(nodes: Map<string, CHNode>): Map<string, string[]> {
  if (_spatialGrid) return _spatialGrid;
  _spatialGrid = new Map();

  for (const [id, node] of nodes) {
    const key = `${Math.floor(node.lat / GRID_SIZE)},${Math.floor(node.lon / GRID_SIZE)}`;
    let arr = _spatialGrid.get(key);
    if (!arr) {
      arr = [];
      _spatialGrid.set(key, arr);
    }
    arr.push(id);
  }

  return _spatialGrid;
}

function findNearestCHNode(lat: number, lng: number, graph: CHGraph): string | null {
  const grid = buildSpatialGrid(graph.nodes);
  const cellLat = Math.floor(lat / GRID_SIZE);
  const cellLng = Math.floor(lng / GRID_SIZE);

  let minDist = Infinity;
  let nearest: string | null = null;

  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const ids = grid.get(`${cellLat + dLat},${cellLng + dLng}`);
      if (!ids) continue;
      for (const id of ids) {
        const n = graph.nodes.get(id)!;
        const d = (n.lat - lat) ** 2 + (n.lon - lng) ** 2;
        if (d < minDist) {
          minDist = d;
          nearest = id;
        }
      }
    }
  }

  return nearest;
}

// ── Priority queue (binary heap) ─────────────────────────────────────────────

class MinHeap<T> {
  private items: Array<{ key: number; value: T }> = [];

  get size(): number {
    return this.items.length;
  }

  push(key: number, value: T): void {
    this.items.push({ key, value });
    this.bubbleUp(this.items.length - 1);
  }

  pop(): { key: number; value: T } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].key <= this.items[i].key) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.items.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.items[left].key < this.items[smallest].key) smallest = left;
      if (right < n && this.items[right].key < this.items[smallest].key) smallest = right;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
      i = smallest;
    }
  }
}

// ── Preprocessing: build CH graph ────────────────────────────────────────────

function getEdgeWeight(edge: OSMGraphEdge, fromNode: OSMGraphNode, toNode: OSMGraphNode): { weight: number; distance: number } {
  const distance = haversineM(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);
  const speedKmh = edge.speed
    ? edge.speed * 3.6
    : DEFAULT_SPEED_KMH[edge.highway || 'residential'] ?? 30;
  const speedMps = speedKmh / 3.6;
  const weight = distance / speedMps; // seconds
  return { weight, distance };
}

/** Compute node importance for contraction ordering. */
function nodeImportance(
  nodeId: string,
  adj: Map<string, Array<{ to: string; weight: number; edgeIdx: number }>>,
  contracted: Set<string>,
): number {
  const neighbors = adj.get(nodeId);
  if (!neighbors) return 0;

  const activeNeighbors = neighbors.filter(n => !contracted.has(n.to));
  const inDeg = activeNeighbors.length;
  const outDeg = activeNeighbors.length;

  // Edge difference: shortcuts_added - edges_removed
  // This is the key heuristic from the CH paper
  const edgeDiff = estimateShortcuts(nodeId, adj, contracted) - inDeg - outDeg;

  // Spatial diversity: prefer contracting low-degree nodes first
  return edgeDiff * 10 + inDeg + outDeg;
}

function estimateShortcuts(
  nodeId: string,
  adj: Map<string, Array<{ to: string; weight: number; edgeIdx: number }>>,
  contracted: Set<string>,
): number {
  const neighbors = adj.get(nodeId);
  if (!neighbors) return 0;

  const active = neighbors.filter(n => !contracted.has(n.to));
  let shortcuts = 0;

  // For each pair (u, w) of active neighbors through nodeId:
  // check if u→nodeId→w is the shortest path
  for (const from of active) {
    for (const to of active) {
      if (from.to === to.to) continue;
      const viaCost = from.weight + to.weight;

      // Check if there's a direct or shorter alternative
      const directNeighbors = adj.get(from.to);
      let hasDirectShorter = false;
      if (directNeighbors) {
        for (const d of directNeighbors) {
          if (d.to === to.to && d.weight <= viaCost) {
            hasDirectShorter = true;
            break;
          }
        }
      }

      if (!hasDirectShorter) shortcuts++;
    }
  }

  return shortcuts;
}

export function preprocessCH(osmGraph: OSMGraph): CHGraph {
  const startTime = performance.now();

  // Build adjacency
  const adj = new Map<string, Array<{ to: string; weight: number; edgeIdx: number }>>();

  for (let i = 0; i < osmGraph.edges.length; i++) {
    const edge = osmGraph.edges[i];
    const fromNode = osmGraph.nodes[edge.from];
    const toNode = osmGraph.nodes[edge.to];
    if (!fromNode || !toNode) continue;

    const { weight } = getEdgeWeight(edge, fromNode, toNode);

    let fwdArr = adj.get(edge.from);
    if (!fwdArr) {
      fwdArr = [];
      adj.set(edge.from, fwdArr);
    }
    fwdArr.push({ to: edge.to, weight, edgeIdx: i });

    // Bidirectional for non-motorways
    if (edge.highway !== 'motorway' && edge.highway !== 'motorway_link') {
      let revArr = adj.get(edge.to);
      if (!revArr) {
        revArr = [];
        adj.set(edge.to, revArr);
      }
      revArr.push({ to: edge.from, weight, edgeIdx: i });
    }
  }

  // Create CH nodes
  const chNodes = new Map<string, CHNode>();
  for (const [id, node] of Object.entries(osmGraph.nodes)) {
    chNodes.set(id, { id, lat: node.lat, lon: node.lon, level: 0 });
  }

  // Contract nodes in importance order
  const contracted = new Set<string>();
  const allEdges: CHEdge[] = [];
  const upEdges = new Map<string, CHEdge[]>();
  const downEdges = new Map<string, CHEdge[]>();

  // Add original edges
  for (let i = 0; i < osmGraph.edges.length; i++) {
    const edge = osmGraph.edges[i];
    const fromNode = osmGraph.nodes[edge.from];
    const toNode = osmGraph.nodes[edge.to];
    if (!fromNode || !toNode) continue;

    const { weight, distance } = getEdgeWeight(edge, fromNode, toNode);
    const chEdge: CHEdge = {
      from: edge.from,
      to: edge.to,
      weight,
      distance,
      shortcutVia: null,
      originalEdge: i,
    };
    allEdges.push(chEdge);
  }

  // Compute initial ordering
  const nodeIds = Array.from(chNodes.keys());
  const importanceQueue = new MinHeap<string>();

  for (const nodeId of nodeIds) {
    const imp = nodeImportance(nodeId, adj, contracted);
    importanceQueue.push(imp, nodeId);
  }

  // Contract up to 80% of nodes (remaining form the "core")
  const maxContractions = Math.floor(nodeIds.length * 0.8);
  let level = 0;

  for (let c = 0; c < maxContractions && importanceQueue.size > 0; c++) {
    const entry = importanceQueue.pop();
    if (!entry) break;
    const nodeId = entry.value;

    if (contracted.has(nodeId)) continue;

    // Lazy update: recompute importance
    const freshImp = nodeImportance(nodeId, adj, contracted);
    if (importanceQueue.size > 0 && freshImp > importanceQueue.size) {
      importanceQueue.push(freshImp, nodeId);
      c--;
      continue;
    }

    // Contract this node
    contracted.add(nodeId);
    const chNode = chNodes.get(nodeId)!;
    chNode.level = level++;

    // Add shortcuts
    const neighbors = adj.get(nodeId);
    if (neighbors) {
      const active = neighbors.filter(n => !contracted.has(n.to));

      for (const from of active) {
        for (const to of active) {
          if (from.to === to.to) continue;

          const viaCost = from.weight + to.weight;

          // Check if shortcut is needed (witness search)
          const directNeighbors = adj.get(from.to);
          let hasWitness = false;
          if (directNeighbors) {
            for (const d of directNeighbors) {
              if (d.to === to.to && d.weight <= viaCost && !contracted.has(d.to)) {
                hasWitness = true;
                break;
              }
            }
          }

          if (!hasWitness) {
            const viaDistance =
              (allEdges.find(e => e.from === from.to && e.to === nodeId)?.distance ?? 0) +
              (allEdges.find(e => e.from === nodeId && e.to === to.to)?.distance ?? 0);

            const shortcut: CHEdge = {
              from: from.to,
              to: to.to,
              weight: viaCost,
              distance: viaDistance,
              shortcutVia: nodeId,
              originalEdge: null,
            };
            allEdges.push(shortcut);

            // Add to adjacency
            let fwdArr = adj.get(from.to);
            if (!fwdArr) {
              fwdArr = [];
              adj.set(from.to, fwdArr);
            }
            fwdArr.push({ to: to.to, weight: viaCost, edgeIdx: allEdges.length - 1 });
          }
        }
      }
    }
  }

  // Uncontracted nodes get highest levels
  for (const [id, node] of chNodes) {
    if (!contracted.has(id)) {
      node.level = level++;
    }
  }

  // Build up/down edge lists
  for (const edge of allEdges) {
    const fromLevel = chNodes.get(edge.from)?.level ?? 0;
    const toLevel = chNodes.get(edge.to)?.level ?? 0;

    if (toLevel >= fromLevel) {
      let arr = upEdges.get(edge.from);
      if (!arr) {
        arr = [];
        upEdges.set(edge.from, arr);
      }
      arr.push(edge);
    }

    if (fromLevel >= toLevel) {
      let arr = downEdges.get(edge.to);
      if (!arr) {
        arr = [];
        downEdges.set(edge.to, arr);
      }
      arr.push(edge);
    }
  }

  const preprocessTime = performance.now() - startTime;
  console.log(
    `[CH] Preprocessed: ${chNodes.size} nodes, ${allEdges.length} edges (${allEdges.filter(e => e.shortcutVia).length} shortcuts), ${preprocessTime.toFixed(0)}ms`,
  );

  return { nodes: chNodes, upEdges, downEdges, allEdges, preprocessTime };
}

// ── Query: bidirectional Dijkstra on CH ──────────────────────────────────────

export function queryCH(
  from: LatLng,
  to: LatLng,
  chGraph: CHGraph,
): CHRoute | null {
  const queryStart = performance.now();

  const fromNode = findNearestCHNode(from.lat, from.lng, chGraph);
  const toNode = findNearestCHNode(to.lat, to.lng, chGraph);

  if (!fromNode || !toNode) return null;
  if (fromNode === toNode) {
    const n = chGraph.nodes.get(fromNode)!;
    return {
      path: [{ lat: n.lat, lng: n.lon }],
      totalTimeSeconds: 0,
      totalDistanceMeters: 0,
      nodeIds: [fromNode],
      originalEdgeIndices: [],
      queryTimeMs: performance.now() - queryStart,
    };
  }

  // Forward search (from source, using up-edges)
  const fwdDist = new Map<string, number>();
  const fwdPrev = new Map<string, { nodeId: string; edge: CHEdge }>();
  const fwdQueue = new MinHeap<string>();

  fwdDist.set(fromNode, 0);
  fwdQueue.push(0, fromNode);

  // Backward search (from target, using down-edges)
  const bwdDist = new Map<string, number>();
  const bwdPrev = new Map<string, { nodeId: string; edge: CHEdge }>();
  const bwdQueue = new MinHeap<string>();

  bwdDist.set(toNode, 0);
  bwdQueue.push(0, toNode);

  let bestCost = Infinity;
  let meetingNode: string | null = null;

  const fwdSettled = new Set<string>();
  const bwdSettled = new Set<string>();

  // Alternate forward/backward
  while (fwdQueue.size > 0 || bwdQueue.size > 0) {
    // Forward step
    if (fwdQueue.size > 0) {
      const entry = fwdQueue.pop()!;
      const u = entry.value;
      const uDist = entry.key;

      if (uDist > bestCost) {
        // Can prune
      } else if (!fwdSettled.has(u)) {
        fwdSettled.add(u);

        // Check if backward search reached this node
        const bDist = bwdDist.get(u);
        if (bDist !== undefined && uDist + bDist < bestCost) {
          bestCost = uDist + bDist;
          meetingNode = u;
        }

        // Relax up-edges
        const edges = chGraph.upEdges.get(u);
        if (edges) {
          for (const edge of edges) {
            const newDist = uDist + edge.weight;
            const existing = fwdDist.get(edge.to);
            if (existing === undefined || newDist < existing) {
              fwdDist.set(edge.to, newDist);
              fwdPrev.set(edge.to, { nodeId: u, edge });
              fwdQueue.push(newDist, edge.to);
            }
          }
        }
      }
    }

    // Backward step
    if (bwdQueue.size > 0) {
      const entry = bwdQueue.pop()!;
      const u = entry.value;
      const uDist = entry.key;

      if (uDist > bestCost) {
        // Can prune
      } else if (!bwdSettled.has(u)) {
        bwdSettled.add(u);

        // Check if forward search reached this node
        const fDist = fwdDist.get(u);
        if (fDist !== undefined && fDist + uDist < bestCost) {
          bestCost = fDist + uDist;
          meetingNode = u;
        }

        // Relax down-edges (reversed)
        const edges = chGraph.downEdges.get(u);
        if (edges) {
          for (const edge of edges) {
            const newDist = uDist + edge.weight;
            const existing = bwdDist.get(edge.from);
            if (existing === undefined || newDist < existing) {
              bwdDist.set(edge.from, newDist);
              bwdPrev.set(edge.from, { nodeId: u, edge });
              bwdQueue.push(newDist, edge.from);
            }
          }
        }
      }
    }

    // Termination: both queues exceed best cost
    if (
      (fwdQueue.size === 0 || (fwdQueue.size > 0 && fwdDist.get(fromNode) !== undefined)) &&
      (bwdQueue.size === 0 || (bwdDist.get(toNode) !== undefined))
    ) {
      const fwdMin = fwdQueue.size > 0 ? fwdQueue.pop()?.key ?? Infinity : Infinity;
      const bwdMin = bwdQueue.size > 0 ? bwdQueue.pop()?.key ?? Infinity : Infinity;
      if (fwdMin + bwdMin >= bestCost) break;
    }
  }

  if (!meetingNode || bestCost === Infinity) return null;

  // Reconstruct path: forward part (source → meeting)
  const fwdPath: string[] = [];
  const fwdEdges: CHEdge[] = [];
  let current = meetingNode;
  while (current !== fromNode) {
    fwdPath.unshift(current);
    const prev = fwdPrev.get(current);
    if (!prev) break;
    fwdEdges.unshift(prev.edge);
    current = prev.nodeId;
  }
  fwdPath.unshift(fromNode);

  // Backward part (meeting → target)
  const bwdPath: string[] = [];
  const bwdEdges: CHEdge[] = [];
  current = meetingNode;
  while (current !== toNode) {
    const prev = bwdPrev.get(current);
    if (!prev) break;
    bwdPath.push(prev.nodeId);
    bwdEdges.push(prev.edge);
    current = prev.nodeId;
  }
  if (bwdPath[bwdPath.length - 1] !== toNode) {
    bwdPath.push(toNode);
  }

  const fullNodePath = [...fwdPath, ...bwdPath.slice(1)];
  const fullEdges = [...fwdEdges, ...bwdEdges];

  // Unpack shortcuts to get original edges
  const originalEdgeIndices: number[] = [];
  function unpackEdge(edge: CHEdge): void {
    if (edge.shortcutVia === null) {
      if (edge.originalEdge !== null) {
        originalEdgeIndices.push(edge.originalEdge);
      }
    } else {
      // Find the two sub-edges through the via node
      const via = edge.shortcutVia;
      const firstHalf = chGraph.allEdges.find(
        e => e.from === edge.from && e.to === via,
      );
      const secondHalf = chGraph.allEdges.find(
        e => e.from === via && e.to === edge.to,
      );
      if (firstHalf) unpackEdge(firstHalf);
      if (secondHalf) unpackEdge(secondHalf);
    }
  }

  for (const edge of fullEdges) {
    unpackEdge(edge);
  }

  // Build coordinate path
  const path: LatLng[] = fullNodePath
    .map(id => {
      const n = chGraph.nodes.get(id);
      return n ? { lat: n.lat, lng: n.lon } : null;
    })
    .filter((p): p is LatLng => p !== null);

  // Calculate total distance
  let totalDistance = 0;
  for (let i = 1; i < path.length; i++) {
    totalDistance += haversineM(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng);
  }

  return {
    path,
    totalTimeSeconds: bestCost,
    totalDistanceMeters: totalDistance,
    nodeIds: fullNodePath,
    originalEdgeIndices,
    queryTimeMs: performance.now() - queryStart,
  };
}

// ── Singleton with lazy preprocessing ────────────────────────────────────────

let _chGraph: CHGraph | null = null;
let _preprocessing: Promise<CHGraph | null> | null = null;

/**
 * Get or build the CH graph. First call triggers preprocessing.
 * Subsequent calls return the cached result.
 */
export async function getCHGraph(): Promise<CHGraph | null> {
  if (_chGraph) return _chGraph;

  if (!_preprocessing) {
    _preprocessing = (async () => {
      const osmGraph = await loadOsmGraph();
      if (!osmGraph) {
        console.warn('[CH] Cannot load OSM graph for preprocessing');
        return null;
      }

      console.log('[CH] Starting preprocessing...');
      _chGraph = preprocessCH(osmGraph);
      return _chGraph;
    })();
  }

  return _preprocessing;
}

/**
 * Route using Contraction Hierarchies.
 * Falls back to null if CH is not ready.
 */
export async function routeWithCH(from: LatLng, to: LatLng): Promise<CHRoute | null> {
  const ch = await getCHGraph();
  if (!ch) return null;
  return queryCH(from, to, ch);
}
