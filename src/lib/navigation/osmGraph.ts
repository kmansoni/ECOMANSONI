import { staticDataUrl } from './staticDataUrl';

export interface OSMGraphNode {
  lat: number;
  lon: number;
}

export interface OSMGraphEdge {
  fromNode: string;
  toNode: string;
  from?: string;
  to?: string;
  distance: number;
  speed: number;
  highway: string;
  name: string;
  wayId?: number;
}

export interface OSMGraph {
  nodes: Record<string, OSMGraphNode>;
  edges: OSMGraphEdge[];
}

let graphCache: OSMGraph | null = null;
let graphPromise: Promise<OSMGraph | null> | null = null;

function normalizeGraph(graph: OSMGraph): OSMGraph {
  return {
    ...graph,
    edges: graph.edges
      .map((edge) => {
        const fromNode = edge.fromNode ?? edge.from;
        const toNode = edge.toNode ?? edge.to;
        if (!fromNode || !toNode) return null;

        return {
          ...edge,
          fromNode,
          toNode,
        };
      })
      .filter((edge): edge is OSMGraphEdge => edge !== null),
  };
}

export async function loadOsmGraph(forceReload = false): Promise<OSMGraph | null> {
  if (!forceReload && graphCache) return graphCache;
  if (!forceReload && graphPromise) return graphPromise;

  graphPromise = (async () => {
    try {
      const response = await fetch(staticDataUrl('/data/osm/graph.json'));
      if (!response.ok) {
        console.warn('[OSMGraph] graph.json is unavailable');
        return null;
      }

      const graph = normalizeGraph(await response.json() as OSMGraph);
      graphCache = graph;
      return graph;
    } catch (error) {
      console.warn('[OSMGraph] Failed to load graph:', error);
      return null;
    } finally {
      graphPromise = null;
    }
  })();

  return graphPromise;
}

export function clearOsmGraphCache(): void {
  graphCache = null;
  graphPromise = null;
}