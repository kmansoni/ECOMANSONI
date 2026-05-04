---
name: traffic-provider
description: "Потоковые данные о пробках: H3 гексагоны, GPS probe aggregation, тяжесть трафика, интеграция с навигацией. Use when: traffic data, congestion, h3 indexing, probe aggregation, real-time traffic."
license: Apache 2.0
---

# Traffic Provider — Данные о пробках

Реальные данные о пробках для навигации. H3 гексагоны + GPS probes.

## Когда использовать

- Оверлей пробок на карте
- Расчёт задержек маршрута
- Traffic-weighted routing
- Интеграция с навигацией

## H3 Hexagonal Indexing

```typescript
// src/lib/navigation/trafficProvider.ts
import { h3 } from 'h3-js';

const RESOLUTION = 8; // ~460m hexagons for city-level traffic

interface TrafficProbe {
  lat: number;
  lon: number;
  speed: number;
  timestamp: number;
  heading?: number;
}

interface TrafficCell {
  h3Index: string;
  avgSpeed: number;
  sampleCount: number;
  lastUpdate: number;
  speedLimit: number;
}

class TrafficAggregator {
  private cells = new Map<string, TrafficCell>();
  
  addProbe(probe: TrafficProbe) {
    const h3Index = h3.latLngToCell(probe.lat, probe.lon, RESOLUTION);
    
    const existing = this.cells.get(h3Index);
    if (existing) {
      // Running average
      const totalSpeed = existing.avgSpeed * existing.sampleCount + probe.speed;
      existing.sampleCount += 1;
      existing.avgSpeed = totalSpeed / existing.sampleCount;
      existing.lastUpdate = probe.timestamp;
    } else {
      this.cells.set(h3Index, {
        h3Index,
        avgSpeed: probe.speed,
        sampleCount: 1,
        lastUpdate: probe.timestamp,
        speedLimit: this.getSpeedLimit(h3Index)
      });
    }
  }
  
  getTrafficLevel(cell: TrafficCell): 'free' | 'light' | 'moderate' | 'heavy' | 'severe' {
    const ratio = cell.avgSpeed / cell.speedLimit;
    if (ratio >= 0.9) return 'free';
    if (ratio >= 0.7) return 'light';
    if (ratio >= 0.5) return 'moderate';
    if (ratio >= 0.3) return 'heavy';
    return 'severe';
  }
  
  getDelayFactor(lat: number, lon: number): number {
    const h3Index = h3.latLngToCell(lat, lon, RESOLUTION);
    const cell = this.cells.get(h3Index);
    if (!cell) return 1.0;
    
    const level = this.getTrafficLevel(cell);
    const delays = { free: 1.0, light: 1.1, moderate: 1.3, heavy: 1.7, severe: 2.5 };
    return delays[level];
  }
}
```

## GPS Probe Aggregation

```typescript
// src/lib/navigation/trafficCollector.ts
interface ProbeBatch {
  probes: TrafficProbe[];
  timestamp: number;
}

class ProbeCollector {
  private buffer: TrafficProbe[] = [];
  private aggregator: TrafficAggregator;
  
  async collectProbes(probes: TrafficProbe[]) {
    // Validate probes
    const validProbes = probes.filter(p => 
      p.speed > 0 && p.speed < 200 && // Reasonable speed
      Math.abs(p.timestamp - Date.now()) < 300000 // Within 5 min
    );
    
    this.buffer.push(...validProbes);
    
    // Batch process every 30 seconds or 1000 probes
    if (this.buffer.length >= 1000 || Date.now() - this.lastBatch > 30000) {
      await this.flushBatch();
    }
  }
  
  private async flushBatch() {
    if (this.buffer.length === 0) return;
    
    for (const probe of this.buffer) {
      this.aggregator.addProbe(probe);
    }
    
    this.buffer = [];
    this.lastBatch = Date.now();
    
    // Update cache
    await this.updateCache();
  }
}
```

## Supabase Integration

```typescript
// src/lib/navigation/trafficCache.ts
import { supabase } from '~/lib/supabase';

const TRAFFIC_TABLE = 'traffic_cells';
const CACHE_TTL = 60000; // 1 minute

interface TrafficCacheEntry {
  h3_index: string;
  avg_speed: number;
  speed_limit: number;
  sample_count: number;
  last_update: number;
  expiry: number;
}

class TrafficCache {
  private cache = new Map<string, TrafficCacheEntry>();
  
  async getTraffic(lat: number, lon: number): Promise<TrafficCell | null> {
    const h3Index = h3.latLngToCell(lat, lon, RESOLUTION);
    
    // Check memory cache
    let entry = this.cache.get(h3Index);
    if (entry && entry.expiry > Date.now()) {
      return this.toCell(entry);
    }
    
    // Fetch from Supabase
    const { data } = await supabase
      .from(TRAFFIC_TABLE)
      .select('*')
      .eq('h3_index', h3Index)
      .gt('expiry', Date.now())
      .single();
    
    if (data) {
      entry = data as TrafficCacheEntry;
      this.cache.set(h3Index, entry);
      return this.toCell(entry);
    }
    
    return null;
  }
  
  async updateCache(cells: TrafficCell[]) {
    const now = Date.now();
    const payload = cells.map(c => ({
      h3_index: c.h3Index,
      avg_speed: c.avgSpeed,
      speed_limit: c.speedLimit,
      sample_count: c.sampleCount,
      last_update: c.lastUpdate,
      expiry: now + CACHE_TTL
    }));
    
    await supabase.from(TRAFFIC_TABLE).upsert(payload);
  }
  
  private toCell(entry: TrafficCacheEntry): TrafficCell {
    return {
      h3Index: entry.h3_index,
      avgSpeed: entry.avg_speed,
      speedLimit: entry.speed_limit,
      sampleCount: entry.sample_count,
      lastUpdate: entry.last_update
    };
  }
}
```

## Map Rendering

```typescript
// src/components/navigation/TrafficOverlay.tsx
import { Layer, Source } from 'react-map-gl';

export function TrafficOverlay({ cells }: { cells: TrafficCell[] }) {
  const getColor = (level: string) => {
    const colors = {
      free: 'rgba(0, 200, 0, 0.3)',
      light: 'rgba(255, 200, 0, 0.4)',
      moderate: 'rgba(255, 150, 0, 0.5)',
      heavy: 'rgba(255, 100, 0, 0.6)',
      severe: 'rgba(200, 0, 0, 0.7)'
    };
    return colors[level as keyof typeof colors] || 'transparent';
  };
  
  return (
    <Source
      id="traffic"
      type="geojson"
      data={{
        type: 'FeatureCollection',
        features: cells.map(cell => ({
          type: 'Feature',
          geometry: h3.cellToBoundary(cell.h3Index),
          properties: {
            level: getTrafficLevel(cell),
            color: getColor(getTrafficLevel(cell))
          }
        }))
      }}
    >
      <Layer
        id="traffic-fill"
        type="fill"
        paint={{
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.6
        }}
      />
    </Source>
  );
}
```

## Routing Integration

```typescript
// Apply traffic delays to route calculation
function applyTrafficToRoute(route: Route, traffic: TrafficAggregator) {
  let totalDelay = 0;
  
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const delayFactor = traffic.getDelayFactor(step.location[1], step.location[0]);
      const delay = step.duration * (delayFactor - 1);
      totalDelay += delay;
    }
  }
  
  return {
    ...route,
    duration_with_traffic: route.duration + totalDelay
  };
}
```

## Checklist

- [ ] H3 индексация (resolution 8-9)
- [ ] GPS probe aggregation с валидацией
- [ ] Traffic levels: free/light/moderate/heavy/severe
- [ ] Supabase таблица traffic_cells с TTL
- [ ] Кеширование в памяти + БД
- [ ] Map overlay с цветовой дифференциацией
- [ ] Traffic-weighted routing