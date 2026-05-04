---
name: offline-navigation
description: "Навигация офлайн с OSM данными: PBF парсинг, граф дорог, routing алгоритмы A*/Dijkstra, индексация. Use when: offline routing, OSM data, PBF parsing, map matching, turn-by-turn directions."
license: Apache 2.0
---

# Offline Navigation — Навигация без интернета

Навигация офлайн с OSM данными. Для пользователей без постоянного соединения.

## Когда использовать

- Offline карты и маршрутизация
- Приложения для путешествий/автопутешествий
- Экономия трафика
- Работа в проблемных регионах

## OSM Data Processing

### PBF Parsing
```typescript
// src/lib/navigation/pbfParser.ts
import { readFileSync } from 'fs';
import { parsePBF } from 'osm-pbf-parser';

interface OSMNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OSMWay {
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

function parseOSMRegion(pbfPath: string): { nodes: Map<number, OSMNode>, ways: OSMWay[] } {
  const buffer = readFileSync(pbfPath);
  const pbfData = parsePBF(buffer);
  
  const nodes = new Map<number, OSMNode>();
  const ways: OSMWay[] = [];
  
  for (const elem of pbfData) {
    if (elem.type === 'node') {
      nodes.set(elem.id, { id: elem.id, lat: elem.lat, lon: elem.lon, tags: elem.tags });
    } else if (elem.type === 'way') {
      ways.push({ id: elem.id, nodes: elem.refs, tags: elem.tags });
    }
  }
  
  return { nodes, ways };
}
```

### Graph Construction
```typescript
// src/lib/navigation/osmGraph.ts
import { Graph } from 'graphology';

interface RoadGraph {
  graph: Graph;
  getNodeId(lat: number, lon: number): string;
  getEdgeWeight(edgeId: string): number;
}

class OSMGraph implements RoadGraph {
  graph = new Graph();
  
  constructor(nodes: OSMNode[], ways: OSMWay[]) {
    // Add nodes
    for (const node of nodes) {
      this.graph.addNode(this.getNodeId(node.lat, node.lon), { lat: node.lat, lon: node.lon });
    }
    
    // Add edges with weights
    for (const way of ways) {
      if (way.tags?.highway) {
        const speed = this.getSpeedLimit(way.tags);
        for (let i = 0; i < way.nodes.length - 1; i++) {
          const from = this.getNodeById(way.nodes[i]);
          const to = this.getNodeById(way.nodes[i + 1]);
          const distance = this.haversineDistance(from, to);
          this.graph.addEdge(from.id, to.id, { 
            weight: distance / (speed / 3.6), // time in seconds
            distance,
            speedLimit: speed
          });
        }
      }
    }
  }
  
  getNodeById(id: number): OSMNode { /* ... */ }
  getNodeName(lat: number, lon: number): string { return `${lat},${lon}`; }
  getSpeedLimit(tags: Record<string, string>): number {
    const hw = tags.highway;
    const maxspeed = tags.maxspeed;
    if (maxspeed) return parseInt(maxspeed) || this.getDefaultSpeed(hw);
    return this.getDefaultSpeed(hw);
  }
  
  getDefaultSpeed(highway: string): number {
    const speeds: Record<string, number> = {
      motorway: 110, trunk: 90, primary: 80,
      secondary: 60, tertiary: 50, unclassified: 40,
      residential: 30, service: 20
    };
    return speeds[highway] || 30;
  }
  
  haversineDistance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
  }
}
```

## Routing Algorithms

### A* Algorithm
```typescript
// src/lib/navigation/aStar.ts
import { Graph } from 'graphology';

function aStar(graph: Graph, start: string, end: string) {
  const openSet = new PriorityQueue<{ node: string; f: number }>();
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  
  gScore.set(start, 0);
  openSet.enqueue({ node: start, f: heuristic(start, end) });
  
  while (openSet.length > 0) {
    const current = openSet.dequeue()!.node;
    
    if (current === end) {
      return reconstructPath(cameFrom, current);
    }
    
    for (const neighbor of graph.neighbors(current)) {
      const edgeWeight = graph.getEdgeAttribute(current, neighbor, 'weight') || 1;
      const tentativeG = (gScore.get(current) || Infinity) + edgeWeight;
      
      if (tentativeG < (gScore.get(neighbor) || Infinity)) {
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentativeG);
        const f = tentativeG + heuristic(neighbor, end);
        openSet.enqueue({ node: neighbor, f });
      }
    }
  }
  
  return null; // No path found
}

function heuristic(node: string, end: string): number {
  // Straight-line distance as heuristic
  const [lat1, lon1] = node.split(',').map(Number);
  const [lat2, lon2] = end.split(',').map(Number);
  return Math.sqrt((lat2-lat1)**2 + (lon2-lon1)**2) * 111000; // rough meters
}
```

### Route Preferences
```typescript
interface RouteOptions {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidUnpaved?: boolean;
}

function applyRoutePreferences(graph: Graph, options: RouteOptions) {
  for (const edge of graph.edges()) {
    const tags = graph.getEdgeAttributes(edge);
    
    if (options.avoidTolls && tags.toll === 'yes') {
      graph.setEdgeAttribute(edge, 'weight', Infinity);
    }
    if (options.avoidHighways && ['motorway', 'trunk', 'primary'].includes(tags.highway)) {
      graph.setEdgeAttribute(edge, 'weight', Infinity);
    }
    if (options.avoidUnpaved && tags.surface === 'unpaved') {
      graph.setEdgeAttribute(edge, 'weight', Infinity);
    }
  }
}
```

## IndexedDB Storage

```typescript
// src/lib/navigation/offlineStorage.ts
const DB_NAME = 'offline-maps';
const DB_VERSION = 1;

class OfflineMapStorage {
  private db: IDBDatabase | null = null;
  
  async init() {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('graphs', { keyPath: 'region' });
        db.createObjectStore('tiles', { keyPath: 'key' });
      }
    });
  }
  
  async saveGraph(region: string, graphData: ArrayBuffer) {
    await this.db!.put('graphs', { region, data: graphData });
  }
  
  async loadGraph(region: string): Promise<ArrayBuffer | undefined> {
    const result = await this.db!.get('graphs', region);
    return result?.data;
  }
}
```

## Checklist

- [ ] PBF парсинг с osm-pbf-parser
- [ ] Graph construction с весами (время)
- [ ] A* routing с heурistic
- [ ] Route preferences (tolls, highways, unpaved)
- [ ] IndexedDB для хранения графа
- [ ] Turn-by-turn instructions с ориентиром
- [ ] Map matching для текущей позиции