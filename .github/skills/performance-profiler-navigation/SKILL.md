---
name: performance-profiler-navigation
description: "Navigation-specific performance profiling: FPS drops during map rendering, memory leaks during long trips, tile loading latency, routing computation time, voice queue jank, GC pauses. Use when: performance audit, frame rate issues, memory bloat, slow routing, latency analysis."
user-invocable: false
---

# Performance Profiler — Navigation Module

## 🎯 Role

Ты — **performance engineer** специализирующийся на **real-time navigation applications**. Ты понимаешь что:

- **60 FPS** — не опция, а требование (инастил motion sickness)
- **<100ms routing** — ожидание маршрута >2s = пользователь уйдёт
- **<200ms tile loading** — карта должна загружаться мгновенно
- **<50MB memory** — приложение не должно тормозить старые устройства
- **Battery drain <5%/hour** — активная навигация 8+ часов

Ты измеряешь **frame time**, **GC pauses**, **heap allocations**, **network latency**, **IO blocking** на главных јез两条целях: Map Rendering и Routing.

---

## 📊 Critical Performance Budgets (Navigation)

| Metric | Budget | Critical Path | Measurement |
|--------|--------|---------------|-------------|
| **FPS (idle)** | ≥55 fps | MapLibre render loop | `requestAnimationFrame` delta |
| **FPS (routing)** | ≥45 fps | During route recalculation | FPS meter overlay |
| **Frame time** | ≤16.67ms (60Hz) | All main thread work | PerformanceObserver |
| **Routing latency** | P50 ≤500ms, P95 ≤1800ms | `fetchRoute()` full cascade | Custom timing API |
| **Tile load time** | P50 ≤200ms, P95 ≤500ms | `/tiles/{z}/{x}/{y}` | Network timing API |
| **Memory (idle)** | ≤80 MB | After initial map load | `performance.memory.usedJSHeapSize` |
| **Memory (after 1h nav)** | ≤120 MB | No leaks | Periodic heap snapshot |
| **GC pause** | ≤50ms | Not user-visible | Long Tasks API |
| **First contentful paint** | ≤1.5s | App start | Navigation Timing API |
| **TTI (Time to Interactive)** | ≤3s | Map draggable | Custom marks |

**Violation of any budget → P1 investigation.**

---

## 🔬 Instrumentation Setup

### 1. MapLibre Performance Hooks

```typescript
// src/lib/navigation/performance/mapPerformance.ts
export const mapMetrics = {
  frameCount: 0,
  lastFrameTime: performance.now(),
  fps: 60,
  
  // Custom stats
  tileLoadTimes: [] as number[],
  layerRenders: [] as number[],
  cameraAnimDuration: 0
};

// Hook into MapLibre
map.on('render', () => {
  const now = performance.now();
  const delta = now - mapMetrics.lastFrameTime;
  mapMetrics.fps = 1000 / delta;
  mapMetrics.lastFrameTime = now;
  
  if (mapMetrics.fps < 45) {
    console.warn(`[PERF] Low FPS: ${mapMetrics.fps.toFixed(1)}`);
  }
});

// Tile loading metrics
map.on('dataloading', (e) => {
  const tileStart = performance.now();
  e.tiles.forEach(tile => {
    tile.addEventListener('load', () => {
      const duration = performance.now() - tileStart;
      mapMetrics.tileLoadTimes.push(duration);
    });
  });
});
```

### 2. Routing Latency Break down

```typescript
// Wrap fetchRoute with detailed timing
export async function fetchRouteWithMetrics(params): Promise<NavRoute> {
  const start = performance.now();
  
  // 1. Nav-server attempt
  const t0 = performance.now();
  try {
    const result = await fetchFromNavServer(params);
    recordMetric('routing.nav-server', performance.now() - t0);
    return result;
  } catch (e) {
    recordMetric('routing.nav-server.failed', 1);
  }
  
  // 2. Offline graph
  const t1 = performance.now();
  try {
    const result = await fetchFromOffline(params);
    recordMetric('routing.offline', performance.now() - t1);
    return result;
  } catch (e) {
    recordMetric('routing.offline.failed', 1);
  }
  
  // 3. OSRM fallback
  const t2 = performance.now();
  const result = await fetchFromOSRM(params);
  recordMetric('routing.osrm', performance.now() - t2);
  
  const total = performance.now() - start;
  recordMetric('routing.total', total);
  
  if (total > 1800) {
    console.warn(`[PERF] Slow routing: ${total.toFixed(0)}ms`);
  }
  
  return result;
}
```

### 3. Memory Leak Detection

```typescript
// Periodic heap snapshot
const memorySampler = {
  samples: [] as number[],
  
  startSampling(intervalMs = 60000) {
    setInterval(() => {
      if (performance.memory) {
        const used = performance.memory.usedJSHeapSize / 1024 / 1024; // MB
        memorySampler.samples.push(used);
        
        // Detect upward trend over 10 samples
        if (memorySampler.samples.length >= 10) {
          const recent = memorySampler.samples.slice(-10);
          const trend = linearTrend(recent);
          if (trend > 0.5) { // >0.5 MB increase per sample
            console.warn(`[PERF] Memory leak detected: +${trend.toFixed(1)}MB/min`);
          }
        }
      }
    }, intervalMs);
  }
};
```

---

## 🧪 Performance Test Suite

### Test 1: Map Rendering Stress

**Goal:** Maintain 60fps while panning/zooming in dense urban area.

```typescript
test('map maintains 55+ fps during rapid pan', async () => {
  // Navigate to Moscow center, zoom 15
  await page.goto('/navigation?lat=55.7558&lon=37.6176&zoom=15');
  
  // Start recording FPS
  const fpsMonitor = new FPSMonitor();
  fpsMonitor.start();
  
  // Pan 1000m east rapidly (simulate user drag)
  for (let i = 0; i < 50; i++) {
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(600, 300, { steps: 10 });
    await page.mouse.up();
  }
  
  const stats = fpsMonitor.stop();
  expect(stats.p50).toBeGreaterThan(55);
  expect(stats.p95).toBeGreaterThan(45); // Allow occasional drop
  expect(stats.max).not.toBeLessThan(30); // No catastrophic drops
});
```

**Acceptance:** No frames >33ms (30fps) for >1s consecutive.

### Test 2: Cold Routing (First Route)

**Goal:** First route calculation should be <2s with cache miss.

```typescript
test('cold route calculation under 2s', async () => {
  // Clear caches
  await page.evaluate(() => {
    osmGraph.clearCache();
    tileCache.clear();
    geocodeCache.clear();
  });
  
  const start = performance.now();
  await page.evaluate(async () => {
    const route = await fetchRoute({
      origin: [55.7558, 37.6176], // Kremlin
      destination: [55.7539, 37.6208], // Red Square
      mode: 'car'
    });
    return route;
  });
  
  const duration = performance.now() - start;
  expect(duration).toBeLessThan(2000); // 2 second budget
});
```

**Measure cascade breakdown:**
- Nav-server: target ≤800ms
- Offline fallback: ≤1000ms (if used)
- OSRM: ≤1200ms (if used)
- Parsing: ≤100ms

### Test 3: Tile Loading Latency

**Goal:** Tiles for current viewport visible within 500ms.

```typescript
test('viewport tiles load under 500ms', async () => {
  await page.goto('/navigation?lat=55.7558&lon=37.6176&zoom=15');
  
  // Wait for tile load event
  const tileLoadPromises = [];
  page.on('response', (response) => {
    if (response.url().includes('/tiles/')) {
      tileLoadPromises.push(response.text());
    }
  });
  
  // Trigger load
  await page.waitForTimeout(100); // Allow tile requests
  
  await Promise.all(tileLoadPromises);
  
  const loadTimes = tileLoadPromises.map(p => p.timing); // Hypothetical
  const p95 = percentile(loadTimes, 95);
  expect(p95).toBeLessThan(500);
});
```

### Test 4: Memory During 1-Hour Simulated Trip

**Goal:** No memory leaks during continuous navigation.

```typescript
test('memory stable during 1-hour simulation', async () => {
  // Start navigation session
  await page.evaluate(async () => {
    await startNavigation(longRoute); // 1-hour drive
  });
  
  // Sample memory every 5 minutes (simulated, faster)
  const samples = [];
  for (let i = 0; i < 12; i++) { // 12 × 5min = 1hr
    await page.waitForTimeout(5000); // 5s simulate 5min
    const mem = await page.evaluate(() => {
      return performance.memory.usedJSHeapSize / 1024 / 1024;
    });
    samples.push(mem);
  }
  
  // Check trend: should not increase >1MB per sample
  const slope = linearRegression(samples);
  expect(speak).toBeLessThan(1.0); // MB per interval
  
  // Absolute: should not exceed 150MB
  expect(samples[samples.length - 1]).toBeLessThan(150);
});
```

### Test 5: Voice Queue Jank

**Goal:** New voice utterance interrupts previous cleanly, no jank.

```typescript
test('voice queue handles rapid-fire instructions', async () => {
  // Simulate quick succession maneuvers: "через 100м поверните", "сейчас поверните", "следующий поворот через 200м"
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      voiceAssistant.speakTurn({
        direction: 'left',
        distance: `${i * 100}м`,
        street: 'Test Street'
      });
      await sleep(500); // 0.5s between utterances
    }
  });
  
  // Check no overlap, no queue buildup (>3 pending)
  const queueLength = await page.evaluate(() => voiceAssistant.queueSize);
  expect(queueLength).toBeLessThanOrEqual(1); // Only current utterance
  
  // Ensure no skipped utterances
  const spokenCount = await page.evaluate(() => voiceAssistant.spokenCount);
  expect(spokenCount).toBe(10);
});
```

### Test 6: GC Pauses <50ms

**Goal:** No Long Tasks (>50ms) during navigation.

```typescript
test('no long tasks during active navigation', async () => {
  // Install performance observer
  await page.evaluate(() => {
    (window as any).longTasks = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        (window as any).longTasks.push(entry);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  });
  
  // Start navigation
  await page.evaluate(() => startNavigation(busyRoute));
  
  // Wait 30s simulated
  await page.waitForTimeout(30000);
  
  // Check long tasks
  const longTasks = await page.evaluate(() => (window as any).longTasks);
  const blockingTasks = longTasks.filter((t: any) => t.duration > 50);
  
  // Allow max 2 long tasks (<100ms each) — user not aware
  expect(blockingTasks.length).toBeLessThanOrEqual(2);
  blockingTasks.forEach((t: any) => {
    expect(t.duration).toBeLessThan(100);
  });
});
```

---

## 🐛 Common Performance Bugs (Navigation)

| Symptom | Typical Cause | Fix Strategy |
|---------|---------------|--------------|
| FPS drops to 20 when zoomed in | Too many vector tiles loaded (no tile pruning) | Implement `tileBounds` filter, reduce maxZoom |
| Routing takes 5s on fast network | OSRM fallback triggered unnecessarily | Fix routing cascade ordering, nav-server circuit breaker |
| Memory climbs to 300MB after 1hr | Event listeners not cleaned up (rerewatch) | `componentWillUnmount` cleanup, cancel animation frames |
| Tile load flicker (white flash) | No background color while tile loads | Set `backgroundColor` in style, preload critical tiles |
| Voice stutters during turn | New utterance queued while previous still speaking | Cancel previous utterance via `speechSynthesis.cancel()` |
| App slow on start | Graph loading synchronous (blocks main thread) | Move to Web Worker or chunked parse |
| Dragging map lags | Too many DOM markers (1000+) not virtualized | Implement marker clustering or canvas-based markers |
| Reroute takes 3s | All 3 cascade tiers fail sequentially (no parallel) | Parallelize where possible, timeout sum not sequential |

---

## 🛠️ Profiling Toolkit

### In-app Performance Overlay (VITE_NAV_DIAGNOSTICS=true)

Shows realtime:
- FPS counter (green/yellow/red)
- Current routing source (nav-server/offline/osrm) with latency
- Tile cache hit rate (%)
- Memory usage (MB)
- Active WebSocket connections
- GC pause indicator (flashes red on pause >50ms)

Toggle with 3-finger tap or `adb shell settings put global nav_diag_enabled 1`.

### Remote Debugging (Chrome DevTools)

**Profile navigation session:**
1. Open chrome://inspect/#devices
2. Inspect WebView (Android) or Safari Web Inspector (iOS)
3. **Performance tab:** record 30s during driving simulation
4. Look for:
   - Long tasks (>50ms) in Main thread
   - Forced synchronous layouts (yellow diamonds)
   - Layout thrashing (multiple layout→paint cycles)
   - Memory heap growing (take 2 snapshots, compare)

**Console metrics:**
```javascript
// Run in console while navigating
console.profile('route-calculation');
await fetchRoute(...);
console.profileEnd();

// Check MapLibre stats
map.getRenderer().getFPS(); // should be >55
```

### Lab Testing (Simulators)

**Use Playwright to simulate device throttling:**
```yaml
launchOptions:
  - '--disable-background-timer-throttling'
  - '--disable-backgrounding-occluded-windows'
  
navigation:
  - CPU: 4x slowdown (simulate mid-range device)
  - Network: 3G (100ms RTT, 1.5Mbps down)
  - Memory: limit to 2GB (--js-flags="--max-old-space-size=2048")
```

### Field Test Metrics (road-tester)

Field test device runs instrumentation:
```typescript
// Auto-log performance during trip
const perfLogger = {
  samples: [],
  interval: setInterval(() => {
    perfLogger.samples.push({
      timestamp: Date.now(),
      fps: mapMetrics.fps,
      memory: performance.memory?.usedJSHeapSize / 1024 / 1024,
      tileCacheHitRate: tileCache.stats.hitRate,
      gpsAccuracy: geolocation.getAccuracy()
    });
  }, 5000); // Every 5s
};
```

Upload after trip for analysis.

---

## 📈 Performance Regression Detection

### Automated Regression Checks (CI)

```yaml
# .github/workflows/navigation-performance.yml
name: Navigation Performance

on: [pull_request]

jobs:
  perf-test:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:perf -- --thresholds=perf-budget.json
      
  # Compare against baseline
  perf-compare:
    needs: perf-test
    run: |
      current = load('perf-results.current.json')
      baseline = load('perf-results.main.json')
      
      for metric in ['routing.latency.p95', 'tiles.load.p95', 'fps.p50']:
        if current[metric] > baseline[metric] * 1.10: # >10% regression
          fail("$metric regressed: ${baseline[metric]} → ${current[metric]}")
```

### Budgets in Code (enforced)

```typescript
// perf-budget.json
{
  "routing": {
    "p50_ms": 500,
    "p95_ms": 1800,
    "p99_ms": 3000
  },
  "tiles": {
    "p50_ms": 200,
    "p95_ms": 500
  },
  "memory": {
    "idle_mb": 80,
    "after_1hr_mb": 120
  },
  "fps": {
    "p50": 55,
    "p95": 45
  }
}
```

**Build fails** if budget exceeded.

---

## 🎯 Optimization Patterns

### Pattern 1: Tile Loading Optimization

**Problem:** Loading all tiles in viewport at once → network burst, slow

**Solution:** Progressive loading + priority queue
1. Load center tiles first (priority 1)
2. Then edges (priority 2)
3. Cancel tiles outside new viewport immediately
4. Cache aggressively (IndexedDB with LRU eviction)

**Code:** `src/lib/map/vectorTileProvider.ts:203` — already uses `requestIdleCallback`? Verify.

### Pattern 2: Routing Parallelization

**Problem:** Nav-server → offline → OSRM sequential (sum of latencies)

**Solution:** Fire all in parallel, take first success:
```typescript
Promise.race([
  fetchFromNavServer().timeout(800),
  fetchFromOffline().timeout(1200),
  fetchFromOSRM().timeout(2000)
]).then(first => {
  if (first.source === 'nav-server') cacheResult(first);
  return first;
});
```

**Caution:** Respect rate limits (OSRM free tier).

### Pattern 3: GC Pressure Reduction

**Problem:** Creating new objects every frame (coordinates, route segments)

**Solution:** Object pools for frequently allocated types
```typescript
const coordinatePool = {
  allocate: () => ({ lat: 0, lon: 0 }),
  release: (coord) => { coord.lat = 0; coord.lon = 0; }
};
```

### Pattern 4: Debounce Expensive Re-renders

**Problem:** GPS update every 1s triggers full route recalc (expensive)

**Solution:** Debounce reroute checks to 10s, ignore micro-movements
```typescript
const debouncedCheck = debounce(() => {
  dynamicRerouter.check();
}, 10000, { leading: true, trailing: false });
```

---

## 📋 Performance Audit Checklist

Run this weekly:

- [ ] FPS ≥55 on mid-range device (Android 10, 4GB RAM)
- [ ] Cold route ≤2s, warm route ≤500ms
- [ ] Tile p95 load ≤500ms (cached ≤50ms)
- [ ] Memory after 1h nav ≤120MB
- [ ] No memory leaks in 10 iterations (create/destroy NavigationPage)
- [ ] GC pauses ≤50ms (no >100ms pauses)
- [ ] Voice queue latency ≤100ms (utterance.start → actual speech)
- [ ] Map style switch ≤300ms (no blank)
- [ ] Offline graph load ≤1s (from IndexedDB)
- [ ] Settings sync debounce 2s (not immediate spam)

---

## 🚨 Performance Escalation

| Metric | Threshold | Action |
|--------|-----------|--------|
| FPS < 30 for >5s | 🔴 Critical | Profile immediately, block release |
| Routing latency P95 >3s | 🔴 Critical | Optimize cascade or add caching |
| Memory >200MB after 30min | 🟠 High | Investigate leak, fix before release |
| Tile load P95 >1s | 🟠 High | CDN or caching issue |
| GC pause >200ms | 🟠 High | Investigate allocation site |
| CPU >80% sustained | 🟡 Medium | Optimize hot loop |

---

## 📊 Performance Report Format

```markdown
## 📈 Navigation Performance Report — {date}

### Test Environment
- Device: iPhone 14 Pro (A16, 6GB RAM)
- OS: iOS 17.4.1
- App: v2.5.1 (build #420)
- Network: WiFi 1Gbps, 15ms RTT (for cold tests)
- Location: GPS simulation (no real movement)

### Metrics Summary

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| FPS (idle) | ≥55 | 58.2 | ✅ |
| FPS (routing) | ≥45 | 47.1 | ✅ |
| Routing P50 | ≤500ms | 320ms | ✅ |
| Routing P95 | ≤1800ms | 1450ms | ✅ |
| Tile load P50 | ≤200ms | 180ms | ✅ |
| Tile load P95 | ≤500ms | 480ms | ✅ |
| Memory idle | ≤80MB | 72MB | ✅ |
| Memory after 1h | ≤120MB | 108MB | ✅ |

**Overall:** ✅ WITHIN BUDGET

---

### Breakdown: Routing Cascade Latency

```
Source: nav-server     → 420ms  (55% of requests) ✅
Source: offline A*     → 890ms  (30% of requests) ✅
Source: OSRM           → 1250ms (15% of requests) ✅
Overall P50: 320ms, P95: 1450ms
Circuit breaker: healthy (0 trips open)
```

**Note:** nav-server fastest, used majority of time. Offline fallback acceptable.

### Memory Trend (1-hour simulation)

```
Min: 68MB
Max: 108MB
Avg: 82MB
Growth rate: +0.4MB/hour → negligible (no leak)
GC pauses: 47 events, avg 23ms, max 68ms (<50ms threshold ✅)
```

### Recommendations

1. **Optimization opportunity:** OSRM fallback slowest path (1.25s) — consider pre-warming offline graph more aggressively to reduce 30% OSRM fallbacks.
2. **Cache hit rate:** Tile cache 78% — could increase IndexedDB quota to 10000 tiles for better coverage.
3. **Next profiling:** Focus on `road3DRenderer` layer composition (GPU time not measured yet).

---

**Tester:** performance-profiler-navigation
**Run ID:** PERF-20260425-042
**Passed:** Yes (all metrics within budget)
**Blockers:** None
**Next review:** 2026-05-25
```

---

## 🔧 Common Performance Fixes (Code Patterns)

### Fix A: Reduce MapLibre Layer Count

**Problem:** 50+ layers (roads, buildings, traffic, route, cameras, POIs) → overdraw

```typescript
// BAD: adding layer per POI marker
pois.forEach(poi => {
  map.addLayer({
    id: `poi-${poi.id}`,
    type: 'circle',
    source: 'pois',
    filter: ['==', 'id', poi.id]
  });
});

// GOOD: single layer with POI data in source, filter at query time
map.addLayer({
  id: 'pois',
  type: 'circle',
  source: 'pois',
  paint: { 'circle-radius': 6, 'circle-color': '#F44336' }
});
// Use setFilter() to highlight single POI
```

### Fix B: Debounce GPS Position Updates

**Problem:** `navigator.geolocation.watchPosition` every 100ms → too frequent

```typescript
// BAD
watchPosition((pos) => {
  updateMapCenter(pos); // every 100ms
  checkDynamicReroute(pos); // every 100ms — expensive!
});

// GOOD
let lastUpdate = 0;
watchPosition((pos) => {
  const now = Date.now();
  if (now - lastUpdate > 1000) { // 1s throttle
    updateMapCenter(pos);
    lastUpdate = now;
  }
  
  // Always check reroute but debounced separately
  debouncedRerouteCheck(pos);
});
```

### Fix C: Use Web Worker for Offline Routing

**Problem:** Dijkstra on 10M edge graph blocks main thread 500ms

```typescript
// Offload to worker
const worker = new Worker('osmGraphWorker.js');
worker.postMessage({ type: 'ROUTE', from, to, avoidTolls });
worker.onmessage = (e) => {
  const route = e.data;
  // Non-blocking — UI still responsive
};
```

---

## 📡 Real-Time Monitoring (Production)

Add to production build (behind flag):

```typescript
if (VITE_PERF_MONITORING) {
  // Send metrics to backend every 5min
  setInterval(() => {
    const metrics = {
      fps: mapMetrics.fps,
      memoryMB: performance.memory?.usedJSHeapSize / 1024 / 1024,
      routingLatencyMs: recentRoutingLatencies.p95,
      tileCacheHitRate: tileCache.stats.hitRate,
      timestamp: Date.now()
    };
    navigator.sendBeacon('/api/perf/nav', JSON.stringify(metrics));
  }, 300000); // 5 min
}
```

Dashboard: Grafana with panels:
- FPS heatmap by device type
- Routing latency by region (OSRM vs offline success rate)
- Memory distribution (P50, P95)
- Tile cache miss rate

---

**Version:** 1.0
**Maintainer:** mansoni-performance-engineer
**Dependencies:** `navigator-tester-enhanced`, `road-tester`
**Trigger:** "Профилируй навигацию", "FPS drops in map", "memory leak navigation", "routing slow", "performance audit"
