/**
 * Knowledge Graph Engine — Semantic Navigation Intelligence.
 *
 * Maintains a graph of entities and relationships:
 * - Nodes: stops, roads, POIs, people, events, zones, routes, vehicles
 * - Edges: connected_by, located_at, visits_regularly, affects, etc.
 *
 * Capabilities:
 * - BFS/DFS traversal with edge-type filtering
 * - Abductive reasoning (explain anomalies)
 * - Pattern detection (habitual routes, time patterns)
 * - Insight generation ("you always avoid this area — here's why")
 */

import type { LatLng } from '@/types/taxi';
import type {
  KGNode,
  KGEdge,
  KGNodeType,
  KGEdgeType,
  KnowledgeGraphQuery,
  KnowledgeGraphResult,
  AbductiveHypothesis,
} from '@/types/quantum-transport';

// ══════════════════════════════════════════════════════════════════════════
// GRAPH STORAGE
// ══════════════════════════════════════════════════════════════════════════

class KnowledgeGraph {
  private nodes = new Map<string, KGNode>();
  private edges: KGEdge[] = [];
  private adjacency = new Map<string, KGEdge[]>();
  private reverseAdjacency = new Map<string, KGEdge[]>();

  // ─── Node operations ─────────────────────────────────────────────

  addNode(node: KGNode): void {
    this.nodes.set(node.id, node);
  }

  getNode(id: string): KGNode | undefined {
    return this.nodes.get(id);
  }

  getNodesByType(type: KGNodeType): KGNode[] {
    const result: KGNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type) result.push(node);
    }
    return result;
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
    this.adjacency.delete(id);
    this.reverseAdjacency.delete(id);
    // Clean references from other adjacency lists
    for (const [key, edgeList] of this.adjacency) {
      this.adjacency.set(key, edgeList.filter(e => e.to !== id));
    }
    for (const [key, edgeList] of this.reverseAdjacency) {
      this.reverseAdjacency.set(key, edgeList.filter(e => e.from !== id));
    }
  }

  // ─── Edge operations ─────────────────────────────────────────────

  addEdge(edge: KGEdge): void {
    this.edges.push(edge);

    const fwd = this.adjacency.get(edge.from) ?? [];
    fwd.push(edge);
    this.adjacency.set(edge.from, fwd);

    const rev = this.reverseAdjacency.get(edge.to) ?? [];
    rev.push(edge);
    this.reverseAdjacency.set(edge.to, rev);
  }

  getOutEdges(nodeId: string, edgeTypes?: KGEdgeType[]): KGEdge[] {
    const edges = this.adjacency.get(nodeId) ?? [];
    if (!edgeTypes || edgeTypes.length === 0) return edges;
    return edges.filter(e => edgeTypes.includes(e.type));
  }

  getInEdges(nodeId: string, edgeTypes?: KGEdgeType[]): KGEdge[] {
    const edges = this.reverseAdjacency.get(nodeId) ?? [];
    if (!edgeTypes || edgeTypes.length === 0) return edges;
    return edges.filter(e => edgeTypes.includes(e.type));
  }

  // ─── Traversal ───────────────────────────────────────────────────

  /**
   * BFS traversal from a start node, optionally filtering by edge types.
   * Returns discovered nodes, traversed edges, all paths, and insights.
   */
  query(q: KnowledgeGraphQuery): KnowledgeGraphResult {
    const visited = new Set<string>();
    const resultNodes: KGNode[] = [];
    const resultEdges: KGEdge[] = [];
    const paths: string[][] = [];

    // BFS
    const queue: Array<{ nodeId: string; depth: number; path: string[] }> = [
      { nodeId: q.startNodeId, depth: 0, path: [q.startNodeId] },
    ];
    visited.add(q.startNodeId);

    const startNode = this.nodes.get(q.startNodeId);
    if (startNode) resultNodes.push(startNode);

    while (queue.length > 0 && resultNodes.length < q.limit) {
      const { nodeId, depth, path } = queue.shift()!;

      if (depth >= q.maxDepth) {
        paths.push(path);
        continue;
      }

      const outEdges = this.getOutEdges(nodeId, q.edgeTypes);
      let hasChildren = false;

      for (const edge of outEdges) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);

        const targetNode = this.nodes.get(edge.to);
        if (targetNode) {
          resultNodes.push(targetNode);
          resultEdges.push(edge);
          hasChildren = true;

          const newPath = [...path, edge.to];
          queue.push({ nodeId: edge.to, depth: depth + 1, path: newPath });
        }

        if (resultNodes.length >= q.limit) break;
      }

      if (!hasChildren && path.length > 1) {
        paths.push(path);
      }
    }

    // Generate insights
    const insights = this.generateInsights(resultNodes, resultEdges);

    return { nodes: resultNodes, edges: resultEdges, paths, insights };
  }

  /**
   * Find shortest path between two nodes (Dijkstra on edge weights).
   */
  findShortestPath(fromId: string, toId: string, edgeTypes?: KGEdgeType[]): string[] | null {
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const unvisited = new Set<string>();

    for (const id of this.nodes.keys()) {
      dist.set(id, Infinity);
      unvisited.add(id);
    }
    dist.set(fromId, 0);

    while (unvisited.size > 0) {
      // Find unvisited node with min distance
      let minNode: string | null = null;
      let minDist = Infinity;
      for (const id of unvisited) {
        const d = dist.get(id) ?? Infinity;
        if (d < minDist) {
          minDist = d;
          minNode = id;
        }
      }

      if (!minNode || minDist === Infinity) break;
      if (minNode === toId) break;

      unvisited.delete(minNode);

      const edges = this.getOutEdges(minNode, edgeTypes);
      for (const edge of edges) {
        if (!unvisited.has(edge.to)) continue;
        const alt = minDist + (1 / Math.max(edge.weight, 0.01));
        if (alt < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, minNode);
        }
      }
    }

    // Reconstruct path
    if (!prev.has(toId) && fromId !== toId) return null;

    const path: string[] = [];
    let current: string | undefined = toId;
    while (current !== undefined) {
      path.unshift(current);
      current = prev.get(current);
    }

    return path[0] === fromId ? path : null;
  }

  // ─── Pattern detection ───────────────────────────────────────────

  /**
   * Find habitual patterns for a user node.
   * Returns frequently visited nodes with timing patterns.
   */
  findHabitualPatterns(userId: string): Array<{ target: KGNode; frequency: number; edgeType: KGEdgeType }> {
    const edges = this.getOutEdges(userId);
    const frequencyMap = new Map<string, { count: number; edgeType: KGEdgeType }>();

    for (const edge of edges) {
      if (edge.type === 'visits_regularly' || edge.type === 'prefers') {
        const existing = frequencyMap.get(edge.to);
        if (existing) {
          existing.count += edge.weight;
        } else {
          frequencyMap.set(edge.to, { count: edge.weight, edgeType: edge.type });
        }
      }
    }

    const patterns: Array<{ target: KGNode; frequency: number; edgeType: KGEdgeType }> = [];
    for (const [nodeId, { count, edgeType }] of frequencyMap) {
      const node = this.nodes.get(nodeId);
      if (node) {
        patterns.push({ target: node, frequency: count, edgeType });
      }
    }

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Find nodes that the user avoids (has 'avoids' edges to).
   */
  findAvoidancePatterns(userId: string): Array<{ target: KGNode; reason: string }> {
    const edges = this.getOutEdges(userId, ['avoids']);
    return edges
      .map(e => {
        const node = this.nodes.get(e.to);
        if (!node) return null;
        const reason = (e.metadata?.['reason'] as string) ?? 'неизвестная причина';
        return { target: node, reason };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }

  // ─── Abductive reasoning ────────────────────────────────────────

  /**
   * Given an observation (e.g., "unusual congestion on route X"),
   * generate explanatory hypotheses by analyzing the knowledge graph.
   */
  abductiveReason(observation: string): AbductiveHypothesis {
    const hypotheses: AbductiveHypothesis['hypotheses'] = [];

    // Check for events that could explain the observation
    const eventNodes = this.getNodesByType('event');
    for (const event of eventNodes) {
      const affectsEdges = this.getOutEdges(event.id, ['affects']);
      if (affectsEdges.length > 0) {
        const affectedLabels = affectsEdges
          .map(e => this.nodes.get(e.to)?.label)
          .filter(Boolean);
        hypotheses.push({
          hypothesis: `Событие "${event.label}" влияет на: ${affectedLabels.join(', ')}`,
          confidence: 0.6 + affectsEdges.length * 0.05,
          evidence: [`Событие: ${event.label}`, `Затронуто объектов: ${affectsEdges.length}`],
          contradictions: [],
        });
      }
    }

    // Check for road/infrastructure issues
    const roadNodes = this.getNodesByType('road');
    for (const road of roadNodes) {
      const incidents = road.attributes['incidents'] as number | undefined;
      if (incidents && incidents > 0) {
        hypotheses.push({
          hypothesis: `Инцидент на "${road.label}"`,
          confidence: 0.7,
          evidence: [`Активных инцидентов: ${incidents}`],
          contradictions: [],
        });
      }
    }

    // Check for time-based patterns
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 7 && hour <= 9) {
      hypotheses.push({
        hypothesis: 'Утренний час пик (7:00-9:00)',
        confidence: 0.8,
        evidence: [`Текущее время: ${hour}:00`, 'Исторический паттерн пиковой нагрузки'],
        contradictions: [],
      });
    } else if (hour >= 17 && hour <= 19) {
      hypotheses.push({
        hypothesis: 'Вечерний час пик (17:00-19:00)',
        confidence: 0.8,
        evidence: [`Текущее время: ${hour}:00`, 'Исторический паттерн пиковой нагрузки'],
        contradictions: [],
      });
    }

    // Sort by confidence
    hypotheses.sort((a, b) => b.confidence - a.confidence);

    // Cap confidences at 1.0
    for (const h of hypotheses) {
      h.confidence = Math.min(h.confidence, 1.0);
    }

    const best = hypotheses[0];

    return {
      observation,
      hypotheses,
      bestHypothesis: best?.hypothesis ?? 'Недостаточно данных для анализа',
      conclusion: best
        ? `Наиболее вероятная причина: ${best.hypothesis} (уверенность: ${Math.round(best.confidence * 100)}%)`
        : 'Причина не определена — требуются дополнительные данные',
    };
  }

  // ─── Insight generation ──────────────────────────────────────────

  private generateInsights(nodes: KGNode[], edges: KGEdge[]): string[] {
    const insights: string[] = [];

    // Type distribution
    const typeCounts = new Map<KGNodeType, number>();
    for (const node of nodes) {
      typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
    }

    if (typeCounts.size > 0) {
      const dominant = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      insights.push(`Преобладающий тип: ${dominant[0]} (${dominant[1]} из ${nodes.length})`);
    }

    // Heavy connectors
    const connectionCount = new Map<string, number>();
    for (const edge of edges) {
      connectionCount.set(edge.from, (connectionCount.get(edge.from) ?? 0) + 1);
      connectionCount.set(edge.to, (connectionCount.get(edge.to) ?? 0) + 1);
    }

    const heavyConnectors = [...connectionCount.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);

    for (const [nodeId, count] of heavyConnectors.slice(0, 3)) {
      const node = this.nodes.get(nodeId);
      if (node) {
        insights.push(`Узловой объект: "${node.label}" (${count} связей)`);
      }
    }

    // Avoidance patterns
    const avoidEdges = edges.filter(e => e.type === 'avoids');
    if (avoidEdges.length > 0) {
      insights.push(`Обнаружено ${avoidEdges.length} паттерн(ов) избегания`);
    }

    return insights;
  }

  // ─── Bulk operations ─────────────────────────────────────────────

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  getAllNodes(): KGNode[] {
    return [...this.nodes.values()];
  }

  getAllEdges(): KGEdge[] {
    return [...this.edges];
  }

  clear(): void {
    this.nodes.clear();
    this.edges = [];
    this.adjacency.clear();
    this.reverseAdjacency.clear();
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SINGLETON & HELPERS
// ══════════════════════════════════════════════════════════════════════════

/** Global knowledge graph instance */
export const knowledgeGraph = new KnowledgeGraph();

/** Convenience: populate graph from navigation data */
export function populateGraphFromStops(
  stops: Array<{ id: string; name: string; location: LatLng; routes: string[] }>
): void {
  for (const stop of stops) {
    knowledgeGraph.addNode({
      id: stop.id,
      type: 'stop',
      label: stop.name,
      attributes: { lat: stop.location.lat, lng: stop.location.lng },
    });
  }

  // Connect stops served by the same route
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const commonRoutes = stops[i].routes.filter(r => stops[j].routes.includes(r));
      if (commonRoutes.length > 0) {
        knowledgeGraph.addEdge({
          from: stops[i].id,
          to: stops[j].id,
          type: 'connected_by',
          weight: commonRoutes.length,
          metadata: { routes: commonRoutes },
        });
      }
    }
  }
}

/** Record a user visit to a POI (builds habitual patterns over time) */
export function recordUserVisit(userId: string, poiId: string, timestamp?: Date): void {
  // Ensure user node exists
  if (!knowledgeGraph.getNode(userId)) {
    knowledgeGraph.addNode({
      id: userId,
      type: 'person',
      label: `User ${userId.substring(0, 8)}`,
      attributes: {},
    });
  }

  // Check if edge already exists and increment weight
  const existingEdges = knowledgeGraph.getOutEdges(userId, ['visits_regularly']);
  const existing = existingEdges.find(e => e.to === poiId);

  if (existing) {
    existing.weight += 1;
    existing.metadata = { ...existing.metadata, lastVisit: (timestamp ?? new Date()).toISOString() };
  } else {
    knowledgeGraph.addEdge({
      from: userId,
      to: poiId,
      type: 'visits_regularly',
      weight: 1,
      metadata: { firstVisit: (timestamp ?? new Date()).toISOString() },
    });
  }
}

/** Register a user route preference */
export function recordUserPreference(userId: string, routeId: string, positive: boolean): void {
  if (!knowledgeGraph.getNode(userId)) {
    knowledgeGraph.addNode({
      id: userId,
      type: 'person',
      label: `User ${userId.substring(0, 8)}`,
      attributes: {},
    });
  }

  knowledgeGraph.addEdge({
    from: userId,
    to: routeId,
    type: positive ? 'prefers' : 'avoids',
    weight: 1,
    metadata: { timestamp: new Date().toISOString() },
  });
}

/** Register an event that affects transport nodes */
export function registerEvent(
  eventId: string,
  label: string,
  affectedNodeIds: string[],
  severity: number
): void {
  knowledgeGraph.addNode({
    id: eventId,
    type: 'event',
    label,
    attributes: { severity, createdAt: new Date().toISOString() },
  });

  for (const nodeId of affectedNodeIds) {
    knowledgeGraph.addEdge({
      from: eventId,
      to: nodeId,
      type: 'affects',
      weight: severity,
    });
  }
}

export { KnowledgeGraph };
