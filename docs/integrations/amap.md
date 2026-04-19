# Amap Integration (高德地图)

## Overview

This document describes the Amap (Gaode Maps) integration in the mansoni navigation system.

## Architecture

```
apps/mobile-shell/
├── src/
│   ├── components/
│   │   ├── AmapMap.tsx      # Map component with fallback to Leaflet
│   │   └── MapContext.tsx   # React Context for map state
│   ├── hooks/
│   │   ├── useCurrentLocation.ts   # Geolocation tracking
│   │   ├── useRouteDrawing.ts      # Route calculation (OSRM)
│   │   └── usePOISearch.ts         # POI search
│   ├── types/
│   │   └── index.ts         # TypeScript interfaces
│   └── native/
│       └── index.ts         # Native bridge utilities
```

## Map Providers

The integration supports three map providers:

| Provider | Description | Use Case |
|----------|-------------|----------|
| `leaflet` | OpenStreetMap tiles via Leaflet | Default, no API key required |
| `maplibre` | Open-source MapLibre GL | Better performance, custom styles |
| `amap` | Amap SDK (高德地图) | Full China coverage (requires API key) |

## Configuration

### Amap API Keys

Set environment variables for Amap SDK:

```bash
# .env
AMAP_ANDROID_KEY=your-android-key
AMAP_IOS_KEY=your-ios-key
```

Get keys from: https://console.amap.com/

### Fallback Behavior

When Amap SDK is unavailable (e.g., no API key, or non-China region):

1. **Automatic fallback** to Leaflet with OpenStreetMap tiles
2. **Route calculation** uses OSRM (Open Source Routing Machine)
3. **POI search** uses Nominatim (OpenStreetMap)

## Usage

### Basic Map

```tsx
import { AmapMap, useCurrentLocation, useRouteDrawing } from '@mansoni/mobile-shell';

function NavigationScreen() {
  const { location, startTracking } = useCurrentLocation({ autoStart: true });
  const { currentRoute, drawRoute } = useRouteDrawing();

  return (
    <AmapMap
      camera={{ center: location?.position ?? { lat: 39.9, lng: 116.4 }, zoom: 15 }}
      userLocation={location}
      route={currentRoute}
      mapType="standard"
    />
  );
}
```

### Route Drawing

```tsx
const { drawRoute, clearRoute } = useRouteDrawing({
  onRouteCalculated: (route) => console.log('Route distance:', route.distance),
  onError: (error) => console.error(error),
});

// Calculate driving route
await drawRoute(
  { lat: 39.9042, lng: 116.4074 },  // Beijing
  { lat: 31.2304, lng: 121.4737 },  // Shanghai
  'driving'
);
```

### POI Search

```tsx
const { results, search, isSearching } = usePOISearch({ provider: 'osm' });

const pois = await search('restaurant', { lat: 39.9042, lng: 116.4074 });
```

## Dependencies

```json
{
  "dependencies": {
    "@capacitor/core": "^8.0.1",
    "leaflet": "^1.9.4",
    "react": "^18.3.1"
  }
}
```

## Requirements for Production

1. **Amap API Key**: Register at https://console.amap.com/
2. **iOS**: Add to `ios/App/Info.plist`:
   - `NSLocationWhenInUseUsageDescription`
   - `NSLocationAlwaysAndWhenInUseUsageDescription`
3. **Android**: Add to `android/app/src/main/AndroidManifest.xml`:
   - `android.permission.ACCESS_FINE_LOCATION`
   - `android.permission.ACCESS_COARSE_LOCATION`

## API Reference

### useCurrentLocation

```typescript
const { 
  location,      // UserLocation | null
  error,         // string | null  
  isLoading,     // boolean
  startTracking, // () => void
  stopTracking,  // () => void
  getCurrentPosition // () => Promise<UserLocation | null>
} = useCurrentLocation({
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 10000,
  watchPosition: true,
  autoStart: false,
});
```

### useRouteDrawing

```typescript
const {
  currentRoute,    // MapRoute | null
  isCalculating,   // boolean
  drawRoute,       // (from, to, mode) => Promise<void>
  clearRoute,      // () => void
  setRoutePoints,  // (points, color?, width?) => void
} = useRouteDrawing();
```

### usePOISearch

```typescript
const {
  results,       // POI[]
  isSearching,   // boolean
  error,         // string | null
  search,        // (query, near?) => Promise<POI[]>
  clearResults,  // () => void
} = usePOISearch({ provider: 'osm' });
```

## Known Limitations

- Amap SDK requires China phone number for registration
- POI search with Amap returns mock data until API key is provided
- Offline maps not yet implemented
- Traffic layer requires Amap API key

## Next Steps

1. Add real Amap SDK (`react-native-amap3d`) for native mobile
2. Implement offline map downloading
3. Add real-time traffic data
4. Integrate with taxi-aggregator backend