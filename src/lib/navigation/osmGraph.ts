import { staticDataUrl } from './staticDataUrl';

export interface OSMGraphNode {
  lat: number;
  lon: number;
}

export interface OSMGraphEdge {
  fromNode: string;
  toNode: string;
  distance: number;
  speed: number;
  highway: string;
  name: string;
}

export interface OSMGraph {
  nodes: Record<string, OSMGraphNode>;
  edges: OSMGraphEdge[];
}

let graphCache: OSMGraph | null = null;
let graphPromise: Promise<OSMGraph | null> | null = null;

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

      const graph = await response.json() as OSMGraph;
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