# Enhanced Navigator Tester - Implementation Details

## Map Rendering Performance Tests

### MapLibre 3D Tests
```typescript
describe('Map Rendering', () => {
  test('3D buildings extrusion', async () => {
    const map = await createMap({ style: '3d' });
    await map.loadBuildings();
    const buildingCount = await map.getBuildingCount();
    expect(buildingCount).toBeGreaterThan(100);
    expect(map.fps).toBeGreaterThan(30);
  });

  test('Label collision detection', async () => {
    const labels = await generateDenseLabels(500);
    const visible = await map.filterVisibleLabels(labels);
    expect(visible.length).toBeLessThan(labels.length);
    expect(visible.every(l => l.isVisible)).toBe(true);
  });

  test('Style switching performance', async () => {
    const startTime = performance.now();
    await map.setStyle('night-mode');
    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(1000);
  });
});
```

## Routing Algorithm Tests

### OSRM Integration
```typescript
describe('Routing', () => {
  test('Multi-stop route optimization', async () => {
    const stops = generateRandomStops(10);
    const route = await calculateOptimalRoute(stops);
    expect(route.totalDistance).toBeLessThan(1.5 * optimalDistance);
    expect(route.waypoints.length).toBe(10);
  });

  test('Real-time traffic integration', async () => {
    const route = await getRouteWithTraffic(start, end);
    const baseTime = route.baseDuration;
    const trafficTime = route.trafficDuration;
    expect(trafficTime).toBeGreaterThanOrEqual(baseTime);
  });

  test('Alternative routes calculation', async () => {
    const routes = await getAlternativeRoutes(start, end, 3);
    expect(routes.length).toBe(3);
    expect(routes[0].distance).toBeLessThan(routes[1].distance);
    expect(routes[0].distance).toBeLessThan(routes[2].distance);
  });
});
```

## Voice Guidance Tests

### SoundMode Integration
```typescript
describe('Voice Guidance', () => {
  test('Speed warning in non-mute modes', async () => {
    const navigator = new VoiceNavigator({ soundMode: 'normal' });
    await navigator.start();
    await triggerSpeedExceeded(120, 100);
    await expect(navigator.speak).toHaveBeenCalledWith('speed_warning');
  });

  test('Speed warning suppressed in mute', async () => {
    const navigator = new VoiceNavigator({ soundMode: 'mute' });
    await navigator.start();
    await triggerSpeedExceeded(120, 100);
    await expect(navigator.speak).not.toHaveBeenCalled();
  });

  test('Voice selection from settings', async () => {
    const settings = { selectedVoice: 'ru-RU-Premium' };
    const navigator = new VoiceNavigator(settings);
    await navigator.speak('turn_left');
    expect(navigator.currentVoice).toBe('ru-RU-Premium');
  });
});
```

## Navigator Settings Tests

### Store Integration
```typescript
describe('Navigator Settings Store', () => {
  test('Settings persistence to Supabase', async () => {
    const store = new NavigatorSettingsStore();
    store.setPreference('avoidTolls', true);
    await store.sync();
    const remote = await supabase.getSettings(userId);
    expect(remote.avoidTolls).toBe(true);
  });

  test('Map style binding', async () => {
    const store = new NavigatorSettingsStore();
    const map = new MapLibre3D();
    store.setViewMode('3d-satellite');
    expect(map.style).toBe('mapbox://styles/mapbox/satellite-streets-v11');
  });

  test('Camera heading wrap-around', async () => {
    const navigator = new NavigatorCamera();
    navigator.setHeading(350);
    navigator.rotateTo(10);
    const rotation = navigator.getShortestRotation();
    expect(rotation).toBe(20); // Not 340!
  });
});
```

## Geospatial Tests

### Coordinate Calculations
```typescript
describe('Geospatial', () => {
  test('H3 hexagon indexing', async () => {
    const lat = 55.7558; // Moscow
    const lng = 37.6176;
    const hex = h3.latLngToCell(lat, lng, 9);
    const center = h3.cellToLatLng(hex);
    expect(distance(lat, lng, center[0], center[1])).toBeLessThan(1000);
  });

  test('GPS accuracy simulation', async () => {
    const gps = new GPSSimulator({ accuracy: 3 });
    const position = await gps.getCurrentPosition();
    expect(position.coords.accuracy).toBeLessThan(5);
  });

  test('Route adherence monitoring', async () => {
    const route = await getRoute(start, end);
    const tracker = new RouteTracker(route);
    await tracker.track(movingVehicle);
    expect(tracker.deviation).toBeLessThan(50); // meters
  });
});
```

## Traffic Data Tests

### Real-time Updates
```typescript
describe('Traffic', () => {
  test('Traffic probe aggregation', async () => {
    const probes = generateProbes(1000);
    const traffic = await aggregateTraffic(probes);
    expect(traffic.segments.length).toBeGreaterThan(0);
    expect(traffic.lastUpdate).toBeWithinLast(30000); // 30s
  });

  test('Traffic light timing', async () => {
    const intersection = await getIntersection('123');
    const timing = await intersection.getSignalTiming();
    expect(timing.cycleLength).toBeLessThan(120);
  });

  test('Haze detection from probes', async () => {
    const slowProbes = await findSlowProbes(area, threshold);
    const haze = await detectHaze(slowProbes);
    expect(haze.confidence).toBeGreaterThan(0.8);
  });
});
```

## Offline Tests

### Cached Routing
```typescript
describe('Offline Mode', () => {
  test('Pre-cached map tiles', async () => {
    const cache = new TileCache({ region: 'Moscow' });
    await cache.downloadRegion();
    const available = await cache.getAvailableTiles();
    expect(available.zoomLevels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  test('Offline route calculation', async () => {
    const graph = await loadOfflineGraph('Moscow');
    const route = await calculateRouteOffline(graph, start, end);
    expect(route.distance).toBeGreaterThan(0);
    expect(route.duration).toBeGreaterThan(0);
  });
});
```

## Performance Benchmarks

| Operation | Target | Tolerance |
|-----------|--------|-----------|
| Map tile render (1km²) | < 100ms | 60fps |
| Route calculation (city) | < 1s | - |
| GPS update latency | < 100ms | ±10ms |
| Traffic refresh | < 30s | - |
| Style switch | < 500ms | - |

## Device Compatibility Tests
```typescript
// Test on different GPS hardware
const gpsDevices = ['android-gps', 'ios-corelocation', 'windows-location'];
for (const device of gpsDevices) {
  test(`${device} accuracy`, async () => {
    const accuracy = await testGPSDevice(device);
    expect(accuracy).toBeLessThan(5); // meters
  });
}
```