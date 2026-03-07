# Navigation System — Part 5: Super-App Integration, Scaling & MVP Execution Plan

> **ECOMANSONI Navigation Documentation Series**
>
> - [Part 1: Core Engines](./01-core-engines.md) — Map Data Engine, Tile Rendering, Routing (Valhalla)
> - [Part 2: Intelligence & Navigation](./02-intelligence-navigation.md) — Traffic Intelligence, Map Matching, Navigation Engine
> - [Part 3: Search & Geocoding](./03-search-geocoding.md) — Geocoding, POI, Voice Search, Geolocation, Offline Maps
> - [Part 4: Crowdsourcing, SDK & Security](./04-crowdsourcing-sdk-security.md) — Crowdsourcing, Advanced Features, SDK, Security, Anti-Fraud
> - **Part 5: Super-App Integration, Scaling & MVP Execution Plan** ← *you are here*

---

## Table of Contents

1. [5.1 Navigation Integration into Super-App](#51-navigation-integration-into-super-app)
2. [5.2 Realtime Geo Platform Architecture](#52-realtime-geo-platform-architecture)
3. [5.3 Dispatch / Matching Marketplace](#53-dispatch--matching-marketplace)
4. [5.4 Supply-Demand Forecasting](#54-supply-demand-forecasting)
5. [5.5 Surge Pricing Engine](#55-surge-pricing-engine)
6. [5.6 Horizontal Scaling Architecture](#56-horizontal-scaling-architecture)
7. [5.7 Observability & Operations](#57-observability--operations)
8. [5.8 Data Pipeline & Analytics](#58-data-pipeline--analytics)
9. [5.9 CI/CD & Testing Strategy](#59-cicd--testing-strategy)
10. [5.10 MVP Execution Plan](#510-mvp-execution-plan)
11. [5.11 Complete Docker Compose](#511-complete-docker-compose)
12. [5.12 Environment Configuration](#512-environment-configuration)
13. [5.13 Database Migration Plan](#513-database-migration-plan)

---

## 5.1 Navigation Integration into Super-App

### Architecture Overview

The navigation module integrates as a **microfrontend** inside the ECOMANSONI super-app shell. The shell handles authentication, routing, and shared state; navigation is lazy-loaded on demand.

```
┌─────────────────────────────────────────────────────────┐
│                   App Shell (React)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Messenger │ │  Social  │ │   Taxi   │ │Navigation│  │
│  │  Module  │ │  Module  │ │  Module  │ │  Module  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       │             │             │             │        │
│  ─────┴─────────────┴─────────────┴─────────────┴────  │
│                  Cross-Module Event Bus                  │
│  ─────────────────────────────────────────────────────  │
│        Supabase Auth │ Shared State │ Analytics         │
└─────────────────────────────────────────────────────────┘
```

### Shared Auth (Supabase Auth)

Navigation re-uses the same Supabase Auth session as all other modules. No separate login required.

```typescript
// src/navigation/auth/useNavAuth.ts
import { useSession } from '@supabase/auth-helpers-react';
import { supabase } from '@/lib/supabase';

export function useNavAuth() {
  const session = useSession();

  const getNavToken = async (): Promise<string | null> => {
    if (!session) return null;
    // Re-use existing Supabase JWT — navigation Edge Functions
    // accept the same Bearer token
    return session.access_token;
  };

  return { session, getNavToken, userId: session?.user?.id };
}
```

Edge Functions verify the token identically to all other modules:

```typescript
// supabase/functions/_shared/auth.ts
import { createClient } from '@supabase/supabase-js';

export async function verifyToken(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing auth');
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized');
  return user;
}
```

### Navigation Context Sharing

A shared context object is published to the Event Bus so other modules (taxi, delivery, messenger) can consume navigation state:

```typescript
// src/navigation/context/navContext.ts
export interface NavigationContext {
  activeRoute: Route | null;
  currentPosition: Coordinates | null;
  destination: Coordinates | null;
  eta: number | null;           // seconds
  distanceRemaining: number;    // meters
  isNavigating: boolean;
  nextManeuver: Maneuver | null;
}

// Published to event bus whenever state changes
navEventBus.emit('navigation:context:updated', context);
```

### Cross-Module Event Bus

```typescript
// src/lib/eventBus.ts
type EventMap = {
  'navigation:context:updated': NavigationContext;
  'navigation:route:shared': SharedRoute;
  'navigation:location:shared': SharedLocation;
  'taxi:pickup:confirmed': { tripId: string; origin: Coordinates };
  'delivery:waypoint:reached': { orderId: string; waypointIndex: number };
  'chat:location:send': { chatId: string; location: Coordinates };
  'chat:route:send': { chatId: string; route: SharedRoute };
};

class TypedEventBus {
  private emitter = new EventTarget();

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    this.emitter.dispatchEvent(
      new CustomEvent(event, { detail: data })
    );
  }

  on<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void
  ) {
    this.emitter.addEventListener(event, (e) =>
      handler((e as CustomEvent<EventMap[K]>).detail)
    );
  }
}

export const navEventBus = new TypedEventBus();
```

### Deep Links for Navigation

```typescript
// src/navigation/deeplinks/handlers.ts
import { App } from '@capacitor/app';

// URL scheme: ecomansoni://navigation/<action>?<params>
// HTTPS deep link: https://ecomansoni.app/nav/<action>

export const NAVIGATION_DEEP_LINK_PATTERNS = {
  SHARE_LOCATION: /ecomansoni:\/\/navigation\/location\?lat=(.+)&lng=(.+)/,
  OPEN_ROUTE:     /ecomansoni:\/\/navigation\/route\?from=(.+)&to=(.+)/,
  OPEN_POI:       /ecomansoni:\/\/navigation\/poi\?id=(.+)/,
  SHARE_ETA:      /ecomansoni:\/\/navigation\/eta\?trip=(.+)/,
};

App.addListener('appUrlOpen', ({ url }) => {
  if (url.includes('/navigation/route')) {
    const params = new URLSearchParams(url.split('?')[1]);
    navEventBus.emit('navigation:route:shared', {
      from: parseCoords(params.get('from')!),
      to: parseCoords(params.get('to')!),
    });
  }
  if (url.includes('/navigation/location')) {
    const params = new URLSearchParams(url.split('?')[1]);
    navEventBus.emit('navigation:location:shared', {
      lat: parseFloat(params.get('lat')!),
      lng: parseFloat(params.get('lng')!),
    });
  }
});

export function generateShareLocationLink(coords: Coordinates): string {
  return `https://ecomansoni.app/nav/location?lat=${coords.lat}&lng=${coords.lng}`;
}

export function generateRouteLink(from: Coordinates, to: Coordinates): string {
  return `https://ecomansoni.app/nav/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`;
}
```

### Push Notifications for Navigation

```typescript
// src/navigation/notifications/navPush.ts
import { PushNotifications } from '@capacitor/push-notifications';

export type NavPushPayload =
  | { type: 'arrival'; eta_seconds: number; destination_name: string }
  | { type: 'traffic_alert'; message: string; severity: 'info' | 'warning' | 'critical' }
  | { type: 'report_nearby'; report_type: string; distance_m: number }
  | { type: 'driver_nearby'; driver_name: string; eta_seconds: number };

export async function handleNavPushNotification(payload: NavPushPayload) {
  switch (payload.type) {
    case 'arrival':
      showArrivalBanner(payload);
      break;
    case 'traffic_alert':
      showTrafficAlert(payload);
      break;
    case 'report_nearby':
      promptUserReport(payload.report_type, payload.distance_m);
      break;
    case 'driver_nearby':
      showDriverNearbyBanner(payload);
      break;
  }
}

// Backend: supabase/functions/nav-notify/index.ts
// Sends targeted push via FCM/APNs using user's device token
```

### Chat Integration: Share Location / Route

```typescript
// src/navigation/chat/locationShare.ts
import { navEventBus } from '@/lib/eventBus';

export function shareLocationToChat(
  chatId: string,
  location: Coordinates
) {
  navEventBus.emit('chat:location:send', { chatId, location });
}

export function shareRouteToChat(chatId: string, route: SharedRoute) {
  navEventBus.emit('chat:route:send', { chatId, route });
}

// In chat module, render a map card for location messages:
// message.type === 'location' → <LocationCard lat=... lng=... />
// message.type === 'route' → <RouteCard from=... to=... distance=... eta=... />
```

### Stories / Reels Integration: Geo-tags & Map in Stories

```typescript
// src/navigation/stories/geoTag.ts
export interface StoryGeoTag {
  type: 'location' | 'route_segment';
  label: string;
  coordinates: Coordinates;
  place_id?: string;
}

export function attachGeoTagToStory(
  storyEditor: StoryEditorContext,
  tag: StoryGeoTag
) {
  storyEditor.addSticker({
    type: 'geotag',
    data: tag,
    render: () => <GeoTagSticker tag={tag} />,
  });
  // Metadata stored in story record for discoverability
  storyEditor.setMetadata('geo_tag', tag);
}

// Map snapshot in story: renders static map tile at story creation
export async function generateMapSnapshot(
  center: Coordinates,
  zoom: number = 14,
  width = 400,
  height = 300
): Promise<string> {
  const url = `${MARTIN_URL}/styles/default/static/${center.lng},${center.lat},${zoom}/${width}x${height}.png`;
  const res = await fetch(url);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
```

### Taxi Module Integration (Valhalla Routes)

Replace mock routes in the taxi module with real Valhalla routing:

```typescript
// src/taxi/routing/valhallaAdapter.ts
import { getRoute } from '@/navigation/routing/client';

export async function getTaxiRoute(
  pickup: Coordinates,
  dropoff: Coordinates
): Promise<TaxiRoute> {
  const route = await getRoute({
    locations: [pickup, dropoff],
    costing: 'auto',
    units: 'km',
  });

  return {
    polyline: route.legs[0].shape,
    distance_km: route.summary.length,
    duration_sec: route.summary.time,
    maneuvers: route.legs[0].maneuvers,
    bbox: route.bbox,
  };
}

// During active trip: use real-time map matching
// (see Part 2 — Map Matching Engine)
export async function updateDriverPosition(
  tripId: string,
  rawGps: GpsPoint[]
) {
  const matched = await mapMatch(rawGps);
  await publishDriverLocation(tripId, matched.matched_points.at(-1)!);
}
```

### Delivery Module Integration

```typescript
// src/delivery/routing/courierRouting.ts
import { optimizeMultiStopRoute } from '@/navigation/routing/vrp';

export async function planCourierRoute(
  depot: Coordinates,
  orders: DeliveryOrder[]
): Promise<OptimizedCourierRoute> {
  const waypoints = orders.map(o => ({
    id: o.id,
    coordinates: o.delivery_address_coords,
    time_window: o.delivery_window,
    service_time_sec: 120, // 2 min per stop
  }));

  const optimized = await optimizeMultiStopRoute(depot, waypoints);

  return {
    stops: optimized.stops,
    total_distance_km: optimized.total_distance_km,
    estimated_duration_sec: optimized.estimated_duration_sec,
    polyline: optimized.polyline,
  };
}
```

### Payment Integration for Navigation

```typescript
// src/navigation/payments/index.ts

// Premium map features: offline maps, HD tiles, advanced POI
export const NAVIGATION_PREMIUM_FEATURES = {
  OFFLINE_MAPS: 'nav_offline_maps',       // $2.99/month
  HD_SATELLITE:  'nav_hd_satellite',      // $1.99/month
  ADVANCED_POI:  'nav_advanced_poi',      // included in premium
  SPEED_CAMERAS: 'nav_speed_cameras',     // $0.99/month
} as const;

export async function checkNavFeatureAccess(
  userId: string,
  feature: keyof typeof NAVIGATION_PREMIUM_FEATURES
): Promise<boolean> {
  const { data } = await supabase
    .from('user_subscriptions')
    .select('features')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  return data?.features?.includes(
    NAVIGATION_PREMIUM_FEATURES[feature]
  ) ?? false;
}
```

### Microfrontend Architecture & Module Loading

```typescript
// src/shell/moduleLoader.ts
const NAVIGATION_MODULE = React.lazy(
  () => import(/* webpackChunkName: "navigation" */ '@/navigation')
);

export function NavigationShell() {
  return (
    <React.Suspense fallback={<MapLoadingSkeleton />}>
      <NAVIGATION_MODULE />
    </React.Suspense>
  );
}

// Preload on hover/intent detection
export function preloadNavigation() {
  import('@/navigation');
}
```

### Shared Component Library

```typescript
// src/shared/components/map/index.ts
export { LocationPicker } from './LocationPicker';
export { MapWidget } from './MapWidget';
export { RouteCard } from './RouteCard';
export { LocationCard } from './LocationCard';
export { EtaBadge } from './EtaBadge';
export { DistanceBadge } from './DistanceBadge';
export { PlaceAutocomplete } from './PlaceAutocomplete';

// LocationPicker: used in taxi, delivery, messenger, stories
// MapWidget: small embeddable map for chat/feed cards
// PlaceAutocomplete: shared across search, taxi pickup, delivery
```

### Unified Analytics Pipeline

```typescript
// src/lib/analytics/navAnalytics.ts

export type NavAnalyticsEvent =
  | 'navigation_started'
  | 'navigation_completed'
  | 'navigation_cancelled'
  | 'route_recalculated'
  | 'location_shared'
  | 'poi_viewed'
  | 'map_zoomed'
  | 'traffic_layer_toggled';

export function trackNavEvent(
  event: NavAnalyticsEvent,
  properties: Record<string, unknown> = {}
) {
  analyticsClient.track(event, {
    ...properties,
    module: 'navigation',
    timestamp: Date.now(),
    session_id: getSessionId(),
  });
  // Kafka: analytics.navigation.events topic
}
```

---

## 5.2 Realtime Geo Platform Architecture

### Location Ingest Pipeline

```
Mobile/Web Client
      │  HTTP POST /api/v1/location/ingest  (batch, ≤50 points)
      │  WebSocket  /ws/location  (streaming)
      ▼
┌─────────────────────┐
│  FastAPI Location   │  ← validates, de-dupes, rate-limits
│  Ingest Service     │
└──────┬──────────────┘
       │  Kafka: location.raw
       ▼
┌─────────────────────┐
│  Map Matching       │  ← snaps GPS to road network (Part 2)
│  Worker             │
└──────┬──────────────┘
       │  Kafka: location.matched
       ▼
┌──────────────────────────────────┐
│  Location State Manager          │
│  - Update Redis presence         │
│  - Update Redis GEO index        │
│  - Update H3 zone counters       │
│  - Write to ClickHouse (async)   │
└──────┬───────────────────────────┘
       │
       ├──→ WebSocket Fanout Service → subscribed clients
       └──→ Dispatch Engine (if actor = driver & trip_id set)
```

### Presence Engine

```python
# navigation/presence/engine.py
import json, time
from redis.asyncio import Redis

PRESENCE_TTL = 30  # seconds — heartbeat interval × 3

class PresenceEngine:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def heartbeat(
        self,
        actor_type: str,      # 'driver' | 'courier' | 'user'
        actor_id: str,
        lat: float,
        lng: float,
        metadata: dict = {}
    ):
        key = f"presence:{actor_type}:{actor_id}"
        payload = {
            "lat": lat,
            "lng": lng,
            "ts": time.time(),
            "status": metadata.get("status", "active"),
            **metadata,
        }
        pipe = self.redis.pipeline()
        pipe.setex(key, PRESENCE_TTL, json.dumps(payload))
        pipe.geoadd(
            f"geo:{metadata.get('city_id', 'global')}:{actor_type}s",
            [lng, lat, actor_id]
        )
        await pipe.execute()

    async def get_presence(self, actor_type: str, actor_id: str) -> dict | None:
        key = f"presence:{actor_type}:{actor_id}"
        data = await self.redis.get(key)
        return json.loads(data) if data else None

    async def is_online(self, actor_type: str, actor_id: str) -> bool:
        return await self.redis.exists(
            f"presence:{actor_type}:{actor_id}"
        ) == 1
```

### Redis Keyspace Design

```
# Actor presence (TTL = 30s)
presence:{actor_type}:{id}  →  JSON string
  {
    "lat": 55.7558,
    "lng": 37.6173,
    "ts": 1709942679.123,
    "status": "available|busy|offline",
    "heading": 180,
    "speed_kmh": 42,
    "trip_id": "uuid|null",
    "city_id": "moscow"
  }

# Geo index per city per actor type (GEOADD, GEORADIUS)
geo:{city_id}:drivers    →  Redis ZSET with GEO encoding
geo:{city_id}:couriers   →  Redis ZSET with GEO encoding
geo:{city_id}:users      →  Redis ZSET with GEO encoding  (only for live-share)

# H3 zone supply counters (TTL = 60s)
zone:{h3_res7_cell}:supply   →  counter (INCR/DECR)
zone:{h3_res7_cell}:demand   →  counter
zone:{h3_res7_cell}:surge    →  float string

# Active trips
trip:{trip_id}:live        →  JSON (latest driver location)
trip:{trip_id}:route       →  JSON (planned route polyline)
trip:{trip_id}:state       →  string FSM state

# Rate limiting
ratelimit:ingest:{actor_id}  →  counter (TTL = 1s, limit = 10)

# Dispatch locks
dispatch:lock:{zone_id}    →  string (TTL = 5s)

# ETA cache
eta:{origin_h3}:{dest_h3}  →  int seconds (TTL = 120s)
```

### Geo Index: Redis GEO + H3 + PostGIS

```python
# navigation/geo/index.py
import h3
from redis.asyncio import Redis
from asyncpg import Connection

H3_DISPATCH_RES = 7   # ~5 km² cells for dispatch
H3_SURGE_RES    = 8   # ~0.7 km² cells for surge pricing

class GeoIndex:
    def __init__(self, redis: Redis, pg: Connection):
        self.redis = redis
        self.pg = pg

    async def update_actor(
        self,
        city_id: str,
        actor_type: str,
        actor_id: str,
        lat: float,
        lng: float,
    ):
        h3_cell_7 = h3.latlng_to_cell(lat, lng, H3_DISPATCH_RES)
        h3_cell_8 = h3.latlng_to_cell(lat, lng, H3_SURGE_RES)

        pipe = self.redis.pipeline()
        # Redis GEO index
        pipe.geoadd(f"geo:{city_id}:{actor_type}s", [lng, lat, actor_id])
        # H3 counters (for supply-demand)
        pipe.set(f"zone:{h3_cell_7}:h3res", H3_DISPATCH_RES)
        await pipe.execute()

        # PostGIS update (async, for analytics)
        await self.pg.execute("""
            INSERT INTO actor_positions (actor_id, actor_type, city_id, position, h3_7, h3_8, updated_at)
            VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326), $6, $7, NOW())
            ON CONFLICT (actor_id) DO UPDATE SET
              position = EXCLUDED.position,
              h3_7 = EXCLUDED.h3_7,
              h3_8 = EXCLUDED.h3_8,
              updated_at = EXCLUDED.updated_at
        """, actor_id, actor_type, city_id, lat, lng, h3_cell_7, h3_cell_8)

    async def nearby_actors(
        self,
        city_id: str,
        actor_type: str,
        lat: float,
        lng: float,
        radius_km: float,
        limit: int = 50
    ) -> list[dict]:
        results = await self.redis.georadius(
            f"geo:{city_id}:{actor_type}s",
            lng, lat,
            radius_km, 'km',
            withcoord=True,
            withdist=True,
            count=limit,
            sort='ASC'
        )
        return [
            {
                "id": r[0],
                "distance_km": r[1],
                "lat": r[2][1],
                "lng": r[2][0],
            }
            for r in results
        ]
```

### Kafka Topics Design

```yaml
# Kafka / Redpanda topics

# Location pipeline
location.raw:
  partitions: 24
  replication: 3
  retention: 1h
  key: actor_id
  value: LocationRawEvent

location.matched:
  partitions: 24
  replication: 3
  retention: 2h
  key: actor_id
  value: LocationMatchedEvent

# Trip lifecycle
trip.events:
  partitions: 12
  replication: 3
  retention: 7d
  key: trip_id
  value: TripEvent  # created|driver_assigned|started|completed|cancelled

# Dispatch
dispatch.requests:
  partitions: 12
  replication: 3
  retention: 30m
  key: city_id
  value: DispatchRequest

dispatch.offers:
  partitions: 12
  replication: 3
  retention: 1h
  key: driver_id
  value: DispatchOffer

# Analytics (high-volume, lower replication)
analytics.navigation.events:
  partitions: 48
  replication: 2
  retention: 48h
  key: user_id
  value: NavAnalyticsEvent

# Surge pricing
pricing.surge.updates:
  partitions: 6
  replication: 3
  retention: 24h
  key: zone_id
  value: SurgeUpdate
```

### WebSocket Fanout for Live Location

```python
# navigation/ws/fanout.py
from fastapi import WebSocket
from collections import defaultdict
import asyncio, json

class LocationFanout:
    """Fanout live location updates to WebSocket subscribers."""

    def __init__(self):
        # trip_id → set of WebSocket connections
        self._subscribers: dict[str, set[WebSocket]] = defaultdict(set)
        # actor_id → trip_id mapping
        self._actor_trips: dict[str, str] = {}

    async def subscribe(self, ws: WebSocket, trip_id: str):
        await ws.accept()
        self._subscribers[trip_id].add(ws)
        try:
            while True:
                # Keep connection alive, receive keepalive pings
                data = await ws.receive_text()
                if data == 'ping':
                    await ws.send_text('pong')
        except Exception:
            self._subscribers[trip_id].discard(ws)

    async def broadcast_location(self, trip_id: str, location: dict):
        dead = set()
        for ws in self._subscribers.get(trip_id, set()):
            try:
                await ws.send_text(json.dumps(location))
            except Exception:
                dead.add(ws)
        self._subscribers[trip_id] -= dead

fanout = LocationFanout()
```

### Sharding Strategy

```
Sharding unit: (city_id, h3_res5_parent_cell)
  - H3 resolution 5 ≈ 250 km² — ~20-50 cells per major city
  - Each shard owns a contiguous geographic area
  - Kafka partition key: f"{city_id}:{h3_res5_parent}"
  - Redis cluster: consistent hash on city_id
  - PostGIS: partition by city_id (LIST partitioning on trips)

Cross-shard trips:
  - Airport pickup (city A) → dropoff in city B
  - Handled by city A shard for entire duration
  - After trip close, replicated to analytics warehouse

Rebalancing:
  - H3 parent cell ownership map stored in Redis Cluster
  - Reassignment only on city launch / infrastructure change
  - No runtime rebalancing needed
```

### Backpressure & Rate Limiting

```python
# navigation/middleware/ratelimit.py
from fastapi import Request, HTTPException
from redis.asyncio import Redis

class LocationIngestRateLimiter:
    MAX_POINTS_PER_SECOND = 10
    MAX_POINTS_PER_BATCH = 50

    def __init__(self, redis: Redis):
        self.redis = redis

    async def check(self, actor_id: str, batch_size: int):
        if batch_size > self.MAX_POINTS_PER_BATCH:
            raise HTTPException(400, "Batch too large")

        key = f"ratelimit:ingest:{actor_id}"
        count = await self.redis.incr(key)
        if count == 1:
            await self.redis.expire(key, 1)
        if count > self.MAX_POINTS_PER_SECOND:
            raise HTTPException(429, "Rate limit exceeded")
```

### Graceful Degradation

```python
# navigation/resilience/fallbacks.py

class DegradedModeManager:
    """Manages graceful degradation when services fail."""

    FALLBACK_ETA_BY_DISTANCE = {
        # distance_km → eta_minutes (rough estimate)
        1: 3, 3: 8, 5: 15, 10: 25, 20: 45,
    }

    async def get_eta_with_fallback(
        self, origin: Coordinates, dest: Coordinates
    ) -> int:
        try:
            return await valhalla_eta(origin, dest)
        except Exception:
            # Fallback: haversine distance / avg city speed
            dist_km = haversine(origin, dest)
            avg_speed_kmh = 25  # conservative city speed
            return int(dist_km / avg_speed_kmh * 3600)

    async def get_nearby_with_fallback(
        self, city_id: str, lat: float, lng: float
    ) -> list:
        try:
            return await redis_geo_search(city_id, lat, lng)
        except Exception:
            # Fallback: PostgreSQL/PostGIS query (slower but reliable)
            return await postgis_nearby(lat, lng)
```

### API Contracts

```json
// POST /api/v1/location/ingest
// Request
{
  "actor_type": "driver",
  "actor_id": "uuid",
  "city_id": "moscow",
  "points": [
    {
      "lat": 55.7558,
      "lng": 37.6173,
      "accuracy_m": 5,
      "speed_kmh": 42,
      "heading": 180,
      "ts": 1709942679123
    }
  ],
  "metadata": {
    "trip_id": "uuid",
    "status": "available"
  }
}

// Response
{
  "accepted": 1,
  "rejected": 0,
  "server_ts": 1709942679200
}

// GET /api/v1/location/nearby?city=moscow&lat=55.75&lng=37.61&radius_km=3&type=drivers
// Response
{
  "actors": [
    {
      "id": "driver-uuid",
      "lat": 55.761,
      "lng": 37.605,
      "distance_km": 1.2,
      "status": "available",
      "heading": 90
    }
  ],
  "count": 1
}

// WebSocket /ws/trip/{trip_id}/location
// Server → Client messages
{
  "type": "location_update",
  "lat": 55.7558,
  "lng": 37.6173,
  "heading": 180,
  "speed_kmh": 42,
  "eta_seconds": 240,
  "ts": 1709942679123
}
```

---

## 5.3 Dispatch / Matching Marketplace

### Dispatch Pipeline Overview

```
Client Request
      │
      ▼
┌─────────────────┐
│ Request Ingest  │  Validate, dedupe, enqueue
└───────┬─────────┘
        │  Kafka: dispatch.requests
        ▼
┌─────────────────┐
│ Candidate Gen   │  H3 k-ring expand → Redis GEO → top-N drivers
└───────┬─────────┘
        ▼
┌─────────────────┐
│ Filter & Score  │  ETA, acceptance prob, idle time, balance
└───────┬─────────┘
        ▼
┌─────────────────┐
│ Offer Strategy  │  Single / Batch / Cascading
└───────┬─────────┘
        ▼
┌─────────────────┐
│ FSM Manager     │  Track trip state machine
└─────────────────┘
```

### Candidate Generation via H3 k-ring

```python
# navigation/dispatch/candidates.py
import h3
from typing import List

async def generate_candidates(
    city_id: str,
    origin: Coordinates,
    max_candidates: int = 20,
    max_radius_km: float = 10.0
) -> List[DriverCandidate]:
    origin_cell = h3.latlng_to_cell(origin.lat, origin.lng, 7)
    candidates = []

    # Expand k-ring outward until we have enough candidates
    for k in range(1, 6):  # k=1 → ~2km, k=5 → ~10km
        ring_cells = h3.grid_disk(origin_cell, k)
        for cell in ring_cells:
            cell_drivers = await redis.lrange(
                f"zone:{cell}:available_drivers", 0, -1
            )
            candidates.extend(cell_drivers)
            if len(candidates) >= max_candidates * 3:
                break

    # Fetch presence data for candidates
    raw = await asyncio.gather(*[
        redis.get(f"presence:driver:{d}") for d in candidates
    ])
    return [
        DriverCandidate.from_presence(c, json.loads(p))
        for c, p in zip(candidates, raw)
        if p is not None
    ][:max_candidates * 3]
```

### Filtering Rules

```python
# navigation/dispatch/filters.py

FILTER_RULES = [
    lambda d, req: d.status == 'available',
    lambda d, req: d.vehicle_type in req.acceptable_vehicle_types,
    lambda d, req: not d.is_fraud_flagged,
    lambda d, req: d.acceptance_rate_7d >= 0.5,  # min 50%
    lambda d, req: d.cancellation_rate_7d <= 0.2, # max 20%
    lambda d, req: d.distance_km <= req.max_driver_distance_km,
    # Surge acceptance: only show surge to drivers who accepted before
    lambda d, req: (not req.is_surge) or d.surge_acceptance_count > 0,
]

def apply_filters(
    candidates: List[DriverCandidate],
    request: DispatchRequest
) -> List[DriverCandidate]:
    for rule in FILTER_RULES:
        candidates = [c for c in candidates if rule(c, request)]
    return candidates
```

### ETA Estimation

```python
# navigation/dispatch/eta.py

async def estimate_eta(
    driver: DriverCandidate,
    pickup: Coordinates
) -> int:
    """Fast approximate ETA using cached H3-to-H3 lookup, fallback to Valhalla."""
    driver_h3 = h3.latlng_to_cell(driver.lat, driver.lng, 8)
    pickup_h3  = h3.latlng_to_cell(pickup.lat, pickup.lng, 8)

    cache_key = f"eta:{driver_h3}:{pickup_h3}"
    cached = await redis.get(cache_key)
    if cached:
        return int(cached)

    # Precise Valhalla route
    route = await valhalla_route(
        Coordinates(driver.lat, driver.lng),
        pickup,
        costing='auto'
    )
    eta = route.summary.time
    await redis.setex(cache_key, 120, eta)
    return eta
```

### Scoring Formula

```python
# navigation/dispatch/scoring.py

def score_driver(
    driver: DriverCandidate,
    eta_seconds: int,
    acceptance_prob: float
) -> float:
    """
    Score = w1*(1/ETA) + w2*acceptance_prob + w3*(1/idle_time) + w4*balance_factor
    
    Weights tuned via offline A/B testing against conversion rate.
    """
    W_ETA   = 0.40
    W_ACCP  = 0.30
    W_IDLE  = 0.20
    W_BAL   = 0.10

    MAX_ETA = 600  # 10 min — score floor
    eta_norm = max(0, 1 - eta_seconds / MAX_ETA)

    idle_norm = min(1.0, driver.idle_seconds / 300)  # normalize to 5 min

    # Balance factor: drivers with lower income today get slight boost
    balance_factor = 1.0 - min(1.0, driver.earnings_today / driver.daily_target)

    return (
        W_ETA  * eta_norm +
        W_ACCP * acceptance_prob +
        W_IDLE * idle_norm +
        W_BAL  * balance_factor
    )
```

### Acceptance Probability ML Model

```python
# navigation/dispatch/acceptance_model.py
# Feature: [eta_seconds, distance_km, surge_multiplier, time_of_day, 
#           driver_accept_rate_7d, driver_idle_seconds, weather_score]

import lightgbm as lgb

class AcceptanceProbabilityModel:
    def __init__(self, model_path: str):
        self.model = lgb.Booster(model_file=model_path)
        self.feature_names = [
            'eta_seconds', 'distance_km', 'surge_multiplier',
            'hour_of_day', 'day_of_week',
            'driver_accept_rate_7d', 'driver_idle_seconds',
            'weather_score', 'driver_earnings_pct_of_target',
        ]

    def predict(self, features: dict) -> float:
        x = [[features[f] for f in self.feature_names]]
        prob = self.model.predict(x)[0]
        return float(prob)

    async def predict_batch(
        self, drivers: List[DriverCandidate], request: DispatchRequest
    ) -> List[float]:
        features_list = [
            self._extract_features(d, request) for d in drivers
        ]
        return self.model.predict(features_list).tolist()
```

### Offer Orchestration Strategies

```python
# navigation/dispatch/offer_strategies.py

class OfferStrategy:
    """Base class for offer dispatch strategies."""
    pass

class SingleOffer(OfferStrategy):
    """Send to best driver, wait for accept/decline."""
    TIMEOUT_SEC = 15

    async def dispatch(self, ranked: List[DriverCandidate], req: DispatchRequest):
        for driver in ranked[:5]:  # try top-5 in sequence
            accepted = await send_offer_and_wait(driver, req, self.TIMEOUT_SEC)
            if accepted:
                return driver
        raise DispatchFailedException("No drivers accepted")

class BatchOffer(OfferStrategy):
    """Send to top-N drivers simultaneously, first accept wins."""
    BATCH_SIZE = 3
    TIMEOUT_SEC = 20

    async def dispatch(self, ranked: List[DriverCandidate], req: DispatchRequest):
        batch = ranked[:self.BATCH_SIZE]
        offers = [send_offer_and_wait(d, req, self.TIMEOUT_SEC) for d in batch]
        results = await asyncio.gather(*offers, return_exceptions=True)
        winners = [d for d, r in zip(batch, results) if r is True]
        if winners:
            # Cancel offers to other drivers
            await cancel_pending_offers(
                [d for d in batch if d != winners[0]], req.id
            )
            return winners[0]
        raise DispatchFailedException()

class CascadingOffer(OfferStrategy):
    """Gradually expand radius until driver found."""
    WAVE_SIZE = 2
    TIMEOUT_SEC = 12

    async def dispatch(self, ranked: List[DriverCandidate], req: DispatchRequest):
        for i in range(0, len(ranked), self.WAVE_SIZE):
            wave = ranked[i:i + self.WAVE_SIZE]
            for driver in wave:
                offer_task = asyncio.create_task(
                    send_offer_and_wait(driver, req, self.TIMEOUT_SEC)
                )
                if await offer_task:
                    return driver
        raise DispatchFailedException()
```

### Trip / Delivery FSM

```mermaid
stateDiagram-v2
    [*] --> PENDING : trip_request_created
    PENDING --> DISPATCHING : dispatch_started
    DISPATCHING --> DRIVER_ASSIGNED : driver_accepted
    DISPATCHING --> CANCELLED : dispatch_failed / timeout
    DRIVER_ASSIGNED --> DRIVER_EN_ROUTE : driver_departed
    DRIVER_EN_ROUTE --> ARRIVED_AT_PICKUP : arrived_at_pickup
    ARRIVED_AT_PICKUP --> IN_TRIP : passenger_boarded
    ARRIVED_AT_PICKUP --> CANCELLED : passenger_no_show (5 min timeout)
    IN_TRIP --> COMPLETED : dropped_off
    IN_TRIP --> CANCELLED : emergency_cancel
    COMPLETED --> [*]
    CANCELLED --> [*]
```

```python
# navigation/dispatch/trip_fsm.py

from enum import Enum

class TripState(Enum):
    PENDING            = "pending"
    DISPATCHING        = "dispatching"
    DRIVER_ASSIGNED    = "driver_assigned"
    DRIVER_EN_ROUTE    = "driver_en_route"
    ARRIVED_AT_PICKUP  = "arrived_at_pickup"
    IN_TRIP            = "in_trip"
    COMPLETED          = "completed"
    CANCELLED          = "cancelled"

VALID_TRANSITIONS = {
    TripState.PENDING:           {TripState.DISPATCHING, TripState.CANCELLED},
    TripState.DISPATCHING:       {TripState.DRIVER_ASSIGNED, TripState.CANCELLED},
    TripState.DRIVER_ASSIGNED:   {TripState.DRIVER_EN_ROUTE, TripState.CANCELLED},
    TripState.DRIVER_EN_ROUTE:   {TripState.ARRIVED_AT_PICKUP, TripState.CANCELLED},
    TripState.ARRIVED_AT_PICKUP: {TripState.IN_TRIP, TripState.CANCELLED},
    TripState.IN_TRIP:           {TripState.COMPLETED, TripState.CANCELLED},
    TripState.COMPLETED:         set(),
    TripState.CANCELLED:         set(),
}

class TripFSM:
    def __init__(self, trip_id: str, redis: Redis):
        self.trip_id = trip_id
        self.redis = redis

    async def transition(self, new_state: TripState, metadata: dict = {}):
        current = TripState(
            await self.redis.get(f"trip:{self.trip_id}:state") or "pending"
        )
        if new_state not in VALID_TRANSITIONS[current]:
            raise InvalidTransitionError(
                f"Cannot transition {current} → {new_state}"
            )
        await self.redis.set(f"trip:{self.trip_id}:state", new_state.value)
        await publish_kafka_event("trip.events", {
            "trip_id": self.trip_id,
            "from": current.value,
            "to": new_state.value,
            "ts": time.time(),
            **metadata,
        })
```

### Delivery-Specific: VRP with Insertion Heuristic

```python
# navigation/dispatch/vrp.py

def insertion_heuristic(
    depot: Coordinates,
    orders: List[Order],
    vehicle_capacity: int = 20
) -> List[List[Order]]:
    """
    Cheapest insertion heuristic for Vehicle Routing Problem.
    Returns list of routes (each route = ordered list of stops).
    """
    unassigned = list(orders)
    routes: List[List[Order]] = [[]]  # start with one empty route

    while unassigned:
        best_cost = float('inf')
        best_route_idx = 0
        best_insert_idx = 0
        best_order = None

        for order in unassigned:
            for ri, route in enumerate(routes):
                if len(route) >= vehicle_capacity:
                    continue
                for ii in range(len(route) + 1):
                    cost = insertion_cost(depot, route, ii, order)
                    if cost < best_cost:
                        best_cost = cost
                        best_route_idx = ri
                        best_insert_idx = ii
                        best_order = order

        if best_order is None:
            routes.append([])
            continue

        routes[best_route_idx].insert(best_insert_idx, best_order)
        unassigned.remove(best_order)

    return [r for r in routes if r]

def insertion_cost(depot, route, idx, order) -> float:
    prev = route[idx - 1].coords if idx > 0 else depot
    next_ = route[idx].coords if idx < len(route) else depot
    return (
        haversine(prev, order.coords) +
        haversine(order.coords, next_) -
        haversine(prev, next_)
    )
```

### SQL Schema

```sql
-- Trips table (partitioned by city)
CREATE TABLE trips (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id         TEXT NOT NULL,
    rider_id        UUID REFERENCES auth.users(id),
    driver_id       UUID REFERENCES drivers(id),
    state           TEXT NOT NULL DEFAULT 'pending',
    pickup_lat      DECIMAL(10,7),
    pickup_lng      DECIMAL(10,7),
    dropoff_lat     DECIMAL(10,7),
    dropoff_lng     DECIMAL(10,7),
    pickup_h3_7     TEXT,
    dropoff_h3_7    TEXT,
    route_polyline  TEXT,
    distance_km     DECIMAL(8,3),
    duration_sec    INT,
    fare_amount     DECIMAL(10,2),
    surge_multiplier DECIMAL(4,2) DEFAULT 1.0,
    requested_at    TIMESTAMPTZ DEFAULT NOW(),
    accepted_at     TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY LIST (city_id);

CREATE TABLE trips_moscow PARTITION OF trips FOR VALUES IN ('moscow');
CREATE TABLE trips_spb    PARTITION OF trips FOR VALUES IN ('spb');

-- Dispatch offers log
CREATE TABLE dispatch_offers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID REFERENCES trips(id),
    driver_id       UUID REFERENCES drivers(id),
    offered_at      TIMESTAMPTZ DEFAULT NOW(),
    responded_at    TIMESTAMPTZ,
    response        TEXT,  -- 'accepted'|'declined'|'timeout'
    eta_seconds     INT,
    score           DECIMAL(6,4),
    offer_wave      INT DEFAULT 1
);

-- Dispatch logs for analytics
CREATE TABLE dispatch_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID REFERENCES trips(id),
    event_type      TEXT,
    event_data      JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON trips (city_id, state, requested_at);
CREATE INDEX ON trips USING GIST (
    ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)
);
CREATE INDEX ON dispatch_offers (trip_id, offered_at);
```

---

## 5.4 Supply-Demand Forecasting

### Spatial-Temporal Forecast Model

```
Unit of forecasting: (city_id, h3_cell_res7, time_bucket)
Time bucket: 15-minute intervals
Horizon: 0-4 hours ahead (16 time buckets)
Update frequency: every 5 minutes
```

### Feature Engineering

```python
# navigation/forecasting/features.py

FEATURE_GROUPS = {
    # Historical patterns (from ClickHouse)
    "historical": [
        "demand_same_bucket_7d_avg",
        "demand_same_bucket_4w_avg",
        "supply_same_bucket_7d_avg",
        "demand_trend_1h",        # linear regression slope
        "demand_trend_7d",
    ],
    # Online signals (from Redis)
    "online": [
        "current_demand_rate",   # requests / last 5 min
        "current_supply_count",  # available drivers in cell
        "current_surge_multi",
        "pending_requests_count",
        "dispatch_success_rate_1h",
    ],
    # Context
    "context": [
        "hour_of_day_sin",
        "hour_of_day_cos",
        "day_of_week_sin",
        "day_of_week_cos",
        "is_holiday",
        "is_rush_hour",
        "weather_precipitation",
        "weather_temp_c",
        "local_event_score",     # concerts, sports events nearby
    ],
    # Spatial
    "spatial": [
        "h3_cell_id_embedding",  # learned embedding
        "distance_to_city_center_km",
        "poi_density_score",
        "residential_ratio",
        "commercial_ratio",
    ],
}

async def build_feature_vector(
    city_id: str,
    h3_cell: str,
    target_ts: datetime
) -> dict:
    historical = await fetch_historical_features(city_id, h3_cell, target_ts)
    online = await fetch_online_features(city_id, h3_cell)
    context = await fetch_context_features(city_id, target_ts)
    spatial = await fetch_spatial_features(h3_cell)
    return {**historical, **online, **context, **spatial}
```

### Model Architecture

```python
# navigation/forecasting/model.py

# Phase 1: Gradient Boosting (fast, interpretable, production-ready)
import lightgbm as lgb

class GBMForecastModel:
    def predict(self, features: dict) -> ForecastOutput:
        x = vectorize(features)
        p50 = self.model_p50.predict([x])[0]
        p90 = self.model_p90.predict([x])[0]
        return ForecastOutput(p50=p50, p90=p90, uncertainty=p90-p50)

# Phase 2: Temporal Fusion Transformer (better multi-step ahead)
# Implemented in PyTorch, served via Triton Inference Server
class TFTForecastModel:
    """
    Temporal Fusion Transformer for multi-horizon probabilistic forecasting.
    Input: past 96 time steps (24h of 15-min buckets) + future known features
    Output: 16 steps ahead (4h), quantiles [0.1, 0.5, 0.9]
    """
    def predict_horizon(
        self,
        past_features: np.ndarray,    # (96, n_features)
        future_known: np.ndarray,     # (16, n_known_features)
    ) -> QuantileForecast:
        with torch.no_grad():
            output = self.model(
                torch.from_numpy(past_features).unsqueeze(0),
                torch.from_numpy(future_known).unsqueeze(0),
            )
        quantiles = output.squeeze(0).numpy()
        return QuantileForecast(
            p10=quantiles[:, 0],
            p50=quantiles[:, 1],
            p90=quantiles[:, 2],
        )
```

### Forecast Serving Contract

```json
// GET /api/v1/forecast?city=moscow&h3_cell=871fb4670ffffff&horizon=4h
{
  "city_id": "moscow",
  "h3_cell": "871fb4670ffffff",
  "generated_at": "2024-03-09T10:00:00Z",
  "model_version": "tft-v2.1",
  "forecast": [
    {
      "time_bucket": "2024-03-09T10:00:00Z",
      "demand_p50": 12,
      "demand_p90": 17,
      "supply_p50": 8,
      "supply_p90": 11,
      "imbalance_score": 0.67,
      "confidence": 0.84
    },
    {
      "time_bucket": "2024-03-09T10:15:00Z",
      "demand_p50": 15,
      "demand_p90": 22,
      "supply_p50": 7,
      "supply_p90": 10,
      "imbalance_score": 0.78,
      "confidence": 0.81
    }
  ],
  "metadata": {
    "features_used": ["historical", "online", "context", "spatial"],
    "last_retrained": "2024-03-08T02:00:00Z"
  }
}
```

### ClickHouse Schema for Forecast Data

```sql
-- ClickHouse

CREATE TABLE forecasts (
    city_id         String,
    h3_cell         String,
    generated_at    DateTime,
    time_bucket     DateTime,
    horizon_minutes UInt16,
    demand_p10      Float32,
    demand_p50      Float32,
    demand_p90      Float32,
    supply_p10      Float32,
    supply_p50      Float32,
    supply_p90      Float32,
    imbalance_score Float32,
    model_version   String,
    confidence      Float32
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(generated_at)
ORDER BY (city_id, h3_cell, generated_at, time_bucket)
TTL generated_at + INTERVAL 90 DAY;

-- Actuals for backtesting
CREATE TABLE forecast_actuals (
    city_id         String,
    h3_cell         String,
    time_bucket     DateTime,
    actual_demand   UInt32,
    actual_supply   UInt32,
    actual_surge    Float32
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(time_bucket)
ORDER BY (city_id, h3_cell, time_bucket)
TTL time_bucket + INTERVAL 365 DAY;
```

### Backtesting Framework

```python
# navigation/forecasting/backtest.py

class ForecastBacktester:
    def run(
        self,
        model: ForecastModel,
        start_date: date,
        end_date: date,
        city_id: str
    ) -> BacktestReport:
        predictions = []
        actuals = []

        evaluation_windows = date_range(start_date, end_date, freq='1H')
        for window_start in evaluation_windows:
            features = fetch_historical_features_at(city_id, window_start)
            pred = model.predict(features)
            actual = fetch_actuals(city_id, window_start + timedelta(hours=1))
            predictions.append(pred)
            actuals.append(actual)

        return BacktestReport(
            mae=mean_absolute_error(actuals, [p.p50 for p in predictions]),
            mape=mean_absolute_percentage_error(actuals, [p.p50 for p in predictions]),
            p90_coverage=compute_quantile_coverage(actuals, [p.p90 for p in predictions], 0.90),
            hit_rate_high=compute_hit_rate(actuals, predictions, threshold=0.8),
        )
```

---

## 5.5 Surge Pricing Engine

### Input State Schema

```python
@dataclass
class SurgeInputState:
    # Current state
    current_demand_rate: float   # requests/min in zone
    current_supply_count: int    # available drivers in zone
    current_surge_multi: float   # active surge multiplier
    pending_request_count: int

    # Forecast state
    forecast_demand_p50: float
    forecast_demand_p90: float
    forecast_supply_p50: float
    forecast_imbalance: float

    # Risk state
    fraud_supply_ratio: float    # 0-1, portion of supply flagged
    anti_gaming_active: bool

    # Policy constraints
    max_surge_multiplier: float  # city policy, e.g. 5.0
    surge_enabled: bool
    is_emergency: bool           # disable surge in disasters
```

### Composite Imbalance Score

```python
def compute_imbalance_score(state: SurgeInputState) -> float:
    """
    Composite imbalance score ∈ [0, 1].
    0 = perfect supply, 1 = extreme shortage.
    """
    # Trusted supply (anti-fraud adjusted)
    trusted_supply = state.current_supply_count * (1 - state.fraud_supply_ratio)

    # Demand-supply ratio
    if trusted_supply == 0:
        ds_ratio = 3.0  # cap at extreme shortage
    else:
        ds_ratio = state.current_demand_rate / trusted_supply

    # Normalize to 0-1 (linear up to 3x demand)
    ds_component = min(1.0, (ds_ratio - 1.0) / 2.0)

    # Forecast component (forward-looking)
    fcast_component = min(1.0, state.forecast_imbalance)

    # Pending pressure
    pending_component = min(1.0, state.pending_request_count / 20.0)

    # Weighted composite
    score = (
        0.50 * ds_component +
        0.30 * fcast_component +
        0.20 * pending_component
    )
    return max(0.0, score)
```

### Surge Multiplier Calculation

```python
def compute_surge_multiplier(state: SurgeInputState) -> float:
    if not state.surge_enabled or state.is_emergency:
        return 1.0

    imbalance = compute_imbalance_score(state)

    # Thresholds
    if imbalance < 0.3:
        return 1.0         # no surge
    elif imbalance < 0.5:
        raw = 1.0 + (imbalance - 0.3) * 5   # 1.0 → 2.0
    elif imbalance < 0.8:
        raw = 2.0 + (imbalance - 0.5) * 6.67  # 2.0 → 4.0
    else:
        raw = 4.0 + (imbalance - 0.8) * 5   # 4.0 → 5.0

    raw = min(raw, state.max_surge_multiplier)

    # Stability layer
    return apply_stability_layer(raw, state.current_surge_multi)

def apply_stability_layer(
    target: float,
    current: float
) -> float:
    """
    Prevents rapid oscillation:
    - Max step change: ±0.5x per update cycle (5 min)
    - Hysteresis: change only if delta > 0.15
    - Min dwell time: stay at level for at least 2 cycles (10 min)
    """
    MAX_STEP = 0.5
    HYSTERESIS = 0.15

    delta = target - current
    if abs(delta) < HYSTERESIS:
        return current

    clamped_delta = max(-MAX_STEP, min(MAX_STEP, delta))
    return round(current + clamped_delta, 2)
```

### Publication Contract

```json
// Kafka: pricing.surge.updates
// Also cached in Redis: zone:{h3_cell}:surge
{
  "zone_id": "871fb4670ffffff",
  "city_id": "moscow",
  "surge_multiplier": 1.8,
  "imbalance_score": 0.52,
  "demand_rate": 24,
  "supply_count": 11,
  "trusted_supply_count": 9,
  "effective_from": "2024-03-09T10:05:00Z",
  "expires_at": "2024-03-09T10:10:00Z",
  "display_label": "1.8×",
  "consumer_price_factor": 1.8,
  "driver_bonus_factor": 1.6,
  "is_driver_incentive": false
}
```

### Spatial Smoothing

```python
def smooth_surge_spatially(
    cell_surges: dict[str, float],
    h3_resolution: int = 7
) -> dict[str, float]:
    """
    Prevent sharp borders between surge zones.
    Each cell's surge = 0.7 * own_surge + 0.3 * avg(neighbor_surge).
    """
    smoothed = {}
    for cell, surge in cell_surges.items():
        neighbors = h3.grid_disk(cell, 1) - {cell}
        neighbor_surges = [
            cell_surges.get(n, 1.0) for n in neighbors
        ]
        avg_neighbor = sum(neighbor_surges) / len(neighbor_surges)
        smoothed[cell] = 0.7 * surge + 0.3 * avg_neighbor
    return smoothed
```

### SQL Schema for Surge History

```sql
CREATE TABLE surge_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id         TEXT NOT NULL,
    h3_cell         TEXT NOT NULL,
    surge_version   INT NOT NULL DEFAULT 1,
    surge_multiplier DECIMAL(4,2),
    imbalance_score DECIMAL(5,4),
    demand_rate     DECIMAL(8,2),
    supply_count    INT,
    trusted_supply  INT,
    fraud_ratio     DECIMAL(5,4),
    effective_from  TIMESTAMPTZ NOT NULL,
    effective_to    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON surge_history (city_id, h3_cell, effective_from DESC);
CREATE INDEX ON surge_history (effective_from)
  WHERE effective_to IS NULL;  -- active surges
```

---

## 5.6 Horizontal Scaling Architecture

### Kubernetes Service Architecture

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: navigation
  labels:
    app: ecomansoni
    component: navigation
```

```yaml
# k8s/navigation-api/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: navigation-api
  namespace: navigation
spec:
  replicas: 3
  selector:
    matchLabels:
      app: navigation-api
  template:
    metadata:
      labels:
        app: navigation-api
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8000"
    spec:
      containers:
      - name: navigation-api
        image: ecomansoni/navigation-api:latest
        ports:
        - containerPort: 8000
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "2000m"
            memory: "2Gi"
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: navigation-secrets
              key: database-url
```

### Auto-scaling Policies

```yaml
# k8s/navigation-api/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: navigation-api-hpa
  namespace: navigation
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: navigation-api
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 75
  - type: External
    external:
      metric:
        name: kafka_consumer_lag
        selector:
          matchLabels:
            topic: location.raw
      target:
        type: AverageValue
        averageValue: "1000"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Pods
        value: 5
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
```

### Database Scaling

```sql
-- PostgreSQL read replicas: use pgBouncer for connection pooling
-- supabase.io manages read replicas automatically

-- Table partitioning for trips
CREATE TABLE trips (
    ...
) PARTITION BY LIST (city_id);

-- Automatic partitioning for time-series data
CREATE TABLE location_history (
    actor_id    UUID,
    lat         DECIMAL(10,7),
    lng         DECIMAL(10,7),
    recorded_at TIMESTAMPTZ
) PARTITION BY RANGE (recorded_at);

-- Create monthly partitions
CREATE TABLE location_history_2024_03
  PARTITION OF location_history
  FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
```

### Redis Cluster Topology

```
Redis Cluster: 6 nodes (3 primary + 3 replica)

Sharding by hash slot:
  - Slots 0-5460:     Node 1 (Primary) + Node 4 (Replica)
  - Slots 5461-10922: Node 2 (Primary) + Node 5 (Replica)
  - Slots 10923-16383: Node 3 (Primary) + Node 6 (Replica)

Cluster config:
  cluster-node-timeout: 5000ms
  cluster-require-full-coverage: no   (partial availability OK)
  min-replicas-to-write: 1

Memory allocation:
  - Presence keys: ~100 bytes × 50K active actors = 5 MB
  - GEO indexes: ~64 bytes × 50K actors per city = 3.2 MB
  - ETA cache: ~20 bytes × 500K cached routes = 10 MB
  - Total estimated: ~100 MB active data + 3× overhead = 300 MB per node
```

### CDN for Tiles

```nginx
# nginx/tiles-cache.conf
proxy_cache_path /var/cache/nginx/tiles
  levels=1:2
  keys_zone=tiles_cache:100m
  max_size=50g
  inactive=7d
  use_temp_path=off;

server {
  location /tiles/ {
    proxy_pass http://martin-tile-server:3000/;
    proxy_cache tiles_cache;
    proxy_cache_valid 200 7d;
    proxy_cache_valid 404 1m;
    proxy_cache_use_stale error timeout updating;
    proxy_cache_background_update on;
    add_header X-Cache-Status $upstream_cache_status;
    add_header Cache-Control "public, max-age=604800, immutable";
  }
}
```

### Multi-Region Deployment

```
Region: Moscow (primary)
  - Full stack deployment
  - Primary PostgreSQL
  - Valhalla: Russia + CIS maps
  - Redis cluster (primary)
  - Kafka cluster (primary)

Region: Moscow (DR secondary)
  - PostgreSQL read replica + standby for failover
  - Redis replica
  - Kafka MirrorMaker 2 replication
  - Hot standby, RTO < 5 min

CDN (CloudFlare):
  - Map tiles: global edge cache
  - Static assets: global edge cache
  - API: not cached, direct to origin
```

### Latency Budget

```
Request path: Client → API → Processing → Response

Navigation API (routing request):
  - Network (client → API): 10-30ms (Moscow region)
  - Auth token verify: 2-5ms (cached)
  - Valhalla routing: 20-100ms (typical route)
  - Response serialization: 1-2ms
  Total P50: ~50ms | P95: ~150ms | P99: ~300ms

Location ingest:
  - Network: 10-30ms
  - Rate limit check (Redis): 1ms
  - Kafka produce: 3-10ms
  - Map matching: 5-15ms
  Total P50: ~30ms | P95: ~80ms | P99: ~150ms

Dispatch (full pipeline):
  - Candidate gen (Redis GEO): 5-10ms
  - Filter + score: 10-20ms
  - ETA estimation (cached): 2-5ms
  - Offer dispatch: 5-15ms
  Total P50: ~30ms | P95: ~60ms

SLO targets:
  routing_p95_latency:  < 200ms
  ingest_p95_latency:   < 100ms
  dispatch_p95_latency: < 100ms
  ws_fanout_p99:        < 50ms
```

### Capacity Planning

```
Formulas:

Required Valhalla instances =
  ceil(peak_routing_rps × avg_routing_latency_sec / 0.7)
  Example: 100 rps × 0.05s / 0.7 = 8 instances at 70% target utilization

Required location ingest pods =
  ceil(peak_location_events_per_sec / events_per_pod_per_sec)
  Example: 50,000 events/s / 5,000 events/pod/s = 10 pods

Redis memory per city =
  (active_drivers × 200B) + (active_users × 100B) + (geo_entries × 64B) + padding
  Example: 5K drivers + 50K users + 55K geo = ~7 MB + 3× = ~21 MB

Kafka throughput =
  peak_events_per_sec × avg_event_size_bytes × retention_hours × 3 (replication)
  Example: 60K eps × 500B × 2h × 3 = ~216 GB/topic/day
```

---

## 5.7 Observability & Operations

### Prometheus Metrics

```python
# navigation/metrics/prometheus.py
from prometheus_client import Counter, Histogram, Gauge

# Location ingest
location_ingest_total = Counter(
    'nav_location_ingest_total',
    'Total location points ingested',
    ['city_id', 'actor_type', 'status']  # status: accepted|rejected
)

location_ingest_latency = Histogram(
    'nav_location_ingest_latency_seconds',
    'Location ingest latency',
    ['city_id'],
    buckets=[.005, .01, .025, .05, .1, .25]
)

# Routing
routing_requests_total = Counter(
    'nav_routing_requests_total',
    'Total routing requests',
    ['city_id', 'costing', 'status']
)

routing_latency = Histogram(
    'nav_routing_latency_seconds',
    'Valhalla routing latency',
    ['costing'],
    buckets=[.02, .05, .1, .25, .5, 1.0, 2.5]
)

# Dispatch
dispatch_funnel = Counter(
    'nav_dispatch_funnel_total',
    'Dispatch pipeline funnel',
    ['stage', 'result']  # stage: request|candidate|filter|score|offer|accept
)

dispatch_eta_seconds = Histogram(
    'nav_dispatch_eta_seconds',
    'ETA distribution for dispatched trips',
    ['city_id'],
    buckets=[60, 120, 180, 300, 600]
)

# Surge
surge_multiplier_gauge = Gauge(
    'nav_surge_multiplier',
    'Current surge multiplier by zone',
    ['city_id', 'h3_cell']
)

# WebSocket
ws_active_connections = Gauge(
    'nav_ws_active_connections',
    'Active WebSocket connections',
    ['type']  # tracking|navigation
)

ws_fanout_latency = Histogram(
    'nav_ws_fanout_latency_seconds',
    'WebSocket message broadcast latency',
    buckets=[.001, .005, .01, .025, .05, .1]
)
```

### Grafana Dashboards

```
Navigation Overview Dashboard:
  Row 1: Key health indicators
    - Active trips (gauge)
    - Active navigating users (gauge)
    - Available drivers per city (table)
    - Dispatch success rate (stat)

  Row 2: Location ingest pipeline
    - Ingest rate (timeseries)
    - Ingest latency p50/p95/p99 (timeseries)
    - Map matching hit rate (stat)
    - Kafka consumer lag (timeseries)

  Row 3: Routing & Navigation
    - Routing RPS by costing (timeseries)
    - Routing p50/p95 latency (timeseries)
    - Valhalla instance count (stat)
    - Routing error rate (timeseries)

  Row 4: Dispatch & Marketplace
    - Dispatch funnel (bar chart: requests→candidates→filtered→scored→offered→accepted)
    - ETA distribution (histogram)
    - Acceptance rate (timeseries)
    - Driver utilization % (heatmap by city)

  Row 5: Surge Pricing
    - Surge zone map (custom panel with MapLibre)
    - Zones with surge > 1.5× (table)
    - Surge multiplier history (timeseries)
    - Anti-gaming flags count (stat)
```

### OpenTelemetry Distributed Tracing

```python
# navigation/telemetry/tracing.py
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor

def setup_tracing(app):
    provider = TracerProvider(
        resource=Resource.create({"service.name": "navigation-api"})
    )
    exporter = OTLPSpanExporter(endpoint="http://otel-collector:4317")
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    RedisInstrumentor().instrument()
    AsyncPGInstrumentor().instrument()

# Custom span for dispatch pipeline
tracer = trace.get_tracer("navigation.dispatch")

async def dispatch_with_tracing(request: DispatchRequest):
    with tracer.start_as_current_span("dispatch.pipeline") as span:
        span.set_attribute("city_id", request.city_id)
        span.set_attribute("origin_h3", request.origin_h3)

        with tracer.start_as_current_span("dispatch.candidates"):
            candidates = await generate_candidates(request)
            span.set_attribute("candidates_count", len(candidates))

        with tracer.start_as_current_span("dispatch.filter"):
            filtered = apply_filters(candidates, request)

        with tracer.start_as_current_span("dispatch.score"):
            scored = await score_candidates(filtered, request)

        return scored
```

### SLI/SLO Definitions

```yaml
# slo/navigation.yaml
services:
  navigation-routing:
    sli:
      - name: availability
        description: "Successful routing responses / total requests"
        formula: "sum(rate(nav_routing_requests_total{status='200'}[5m])) / sum(rate(nav_routing_requests_total[5m]))"
      - name: latency_p95
        description: "95th percentile routing latency"
        formula: "histogram_quantile(0.95, rate(nav_routing_latency_seconds_bucket[5m]))"
    slo:
      - availability: 99.5%          # error budget: 0.5% = ~216 min/month
      - latency_p95: < 200ms

  navigation-ingest:
    slo:
      - availability: 99.9%
      - latency_p95: < 100ms

  dispatch-pipeline:
    slo:
      - availability: 99.5%
      - dispatch_p95_latency: < 2s   # time to offer sent
      - success_rate: > 85%          # offers accepted / requests

error_budget_policy:
  - at 50% consumed: alert on-call
  - at 75% consumed: freeze non-critical releases
  - at 100% consumed: incident post-mortem required
```

### Alerting Rules

```yaml
# prometheus/alerts/navigation.yaml
groups:
- name: navigation_critical
  rules:
  - alert: DispatchSuccessRateLow
    expr: |
      (
        sum(rate(nav_dispatch_funnel_total{stage="accept",result="success"}[5m]))
        /
        sum(rate(nav_dispatch_funnel_total{stage="request"}[5m]))
      ) < 0.70
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Dispatch success rate < 70%"

  - alert: LocationIngestLag
    expr: kafka_consumer_lag{topic="location.raw"} > 10000
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "Location ingest Kafka lag > 10K messages"

  - alert: ValhallaDown
    expr: up{job="valhalla"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Valhalla routing engine is down"

  - alert: SurgeAntiGamingTriggered
    expr: nav_anti_gaming_flags_total > 100
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Elevated anti-gaming flags in surge engine"
```

### On-Call Runbooks

```markdown
## Runbook: Valhalla Routing Down

**Symptom**: nav_routing_requests_total{status!="200"} > 90%
**Severity**: Critical — all routing fails, apps show errors

Steps:
1. Check pod status: `kubectl get pods -n navigation -l app=valhalla`
2. Check logs: `kubectl logs -n navigation -l app=valhalla --tail=100`
3. Common causes:
   a. OOM: increase memory limit + restart
   b. Tile data corruption: re-download from OSM mirror
   c. Config error: check /valhalla/config.json
4. Fallback: enable straight-line distance mode in navigation-api
   `kubectl set env deploy/navigation-api ROUTING_FALLBACK=haversine`
5. Escalate to geo-infra team if not resolved in 15 min

## Runbook: Kafka Consumer Lag Spike

**Symptom**: kafka_consumer_lag > 50,000 on location.raw
**Severity**: Warning → Critical if > 200,000

Steps:
1. Check consumer pod count vs lag growth rate
2. If consumers healthy: likely traffic spike → scale up
   `kubectl scale deploy/location-processor --replicas=20`
3. If consumers crashing: check for malformed messages
   `kafka-console-consumer --topic location.raw --max-messages 10`
4. If Kafka broker issue: check broker health dashboard
5. Dead letter queue: messages failing 3× go to location.raw.dlq
```

---

## 5.8 Data Pipeline & Analytics

### Event-Driven Data Pipeline

```
                    ┌──────────────┐
Navigation Events   │   FastAPI    │
Map Events          │   Services   │
Dispatch Events     └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │    Kafka /   │
                    │  Redpanda    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │ClickHou-│  │  Redis  │  │Postgres │
        │  se     │  │ (real-  │  │(transac-│
        │(analyt) │  │  time)  │  │ tional) │
        └────┬────┘  └─────────┘  └─────────┘
             │
      ┌──────▼──────┐
      │  Grafana /  │
      │  Metabase   │
      └─────────────┘
```

### ClickHouse Navigation Analytics Schema

```sql
-- Navigation sessions
CREATE TABLE navigation_sessions (
    session_id      UUID,
    user_id         UUID,
    city_id         String,
    origin_lat      Float64,
    origin_lng      Float64,
    destination_lat Float64,
    destination_lng Float64,
    origin_h3_7     String,
    dest_h3_7       String,
    distance_km     Float32,
    planned_eta_sec UInt32,
    actual_eta_sec  UInt32,
    costing         String,   -- 'auto'|'bicycle'|'pedestrian'
    started_at      DateTime,
    ended_at        DateTime,
    status          String,   -- 'completed'|'cancelled'|'abandoned'
    recalculations  UInt8,
    voice_enabled   UInt8,
    offline_mode    UInt8,
    app_version     String,
    platform        String    -- 'ios'|'android'|'web'
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (city_id, user_id, started_at)
TTL started_at + INTERVAL 2 YEAR;

-- Map interaction events
CREATE TABLE map_events (
    event_id        UUID,
    session_id      UUID,
    user_id         UUID,
    city_id         String,
    event_type      String,   -- 'zoom'|'pan'|'poi_tap'|'layer_toggle'|'search'
    lat             Float64,
    lng             Float64,
    zoom_level      Float32,
    extra           String,   -- JSON
    created_at      DateTime
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (city_id, created_at, event_type)
TTL created_at + INTERVAL 90 DAY;

-- Dispatch funnel analytics
CREATE TABLE dispatch_analytics (
    request_id      UUID,
    city_id         String,
    origin_h3_7     String,
    dest_h3_7       String,
    requested_at    DateTime,
    candidates_cnt  UInt16,
    filtered_cnt    UInt16,
    offers_sent     UInt8,
    accepted        UInt8,
    time_to_assign  UInt32,   -- ms from request to driver_assigned
    final_eta_sec   UInt32,
    surge_multiplier Float32,
    dispatch_strategy String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(requested_at)
ORDER BY (city_id, requested_at);
```

### Key Analytics Queries

```sql
-- Average ETA accuracy by city (ClickHouse)
SELECT
    city_id,
    avg(actual_eta_sec - planned_eta_sec) AS avg_eta_error_sec,
    quantile(0.95)(abs(actual_eta_sec - planned_eta_sec)) AS p95_eta_error_sec,
    count() AS sessions
FROM navigation_sessions
WHERE started_at >= now() - INTERVAL 7 DAY
  AND status = 'completed'
GROUP BY city_id
ORDER BY avg_eta_error_sec;

-- Dispatch funnel by hour
SELECT
    toHour(requested_at) AS hour,
    sum(candidates_cnt) AS total_candidates,
    sum(filtered_cnt) AS after_filter,
    sum(accepted) AS accepted,
    avg(time_to_assign) AS avg_assign_ms
FROM dispatch_analytics
WHERE requested_at >= now() - INTERVAL 1 DAY
GROUP BY hour
ORDER BY hour;

-- Top POI categories by navigation destination
SELECT
    dest_poi_category,
    count() AS navigations,
    avg(distance_km) AS avg_distance
FROM navigation_sessions ns
JOIN poi_categories pc ON ns.dest_h3_7 = pc.h3_7
WHERE ns.started_at >= now() - INTERVAL 30 DAY
GROUP BY dest_poi_category
ORDER BY navigations DESC
LIMIT 20;
```

### A/B Testing Framework

```python
# navigation/experiments/ab_testing.py

class NavigationExperiment:
    """A/B testing for navigation algorithms, dispatch policies, UI."""

    def __init__(self, experiment_id: str, variants: dict[str, float]):
        """
        variants: {'control': 0.5, 'treatment_a': 0.3, 'treatment_b': 0.2}
        """
        self.experiment_id = experiment_id
        self.variants = variants

    def get_variant(self, user_id: str) -> str:
        """Deterministic assignment based on hash(user_id + experiment_id)."""
        key = f"{user_id}:{self.experiment_id}"
        hash_val = int(hashlib.md5(key.encode()).hexdigest(), 16) % 10000 / 10000

        cumulative = 0.0
        for variant, weight in self.variants.items():
            cumulative += weight
            if hash_val < cumulative:
                return variant
        return list(self.variants.keys())[0]

# Active experiments
EXPERIMENTS = {
    'routing_algorithm': NavigationExperiment(
        'routing_algorithm_v2',
        {'valhalla_default': 0.5, 'valhalla_traffic_weighted': 0.5}
    ),
    'dispatch_strategy': NavigationExperiment(
        'dispatch_strategy_q1_2024',
        {'single': 0.33, 'batch': 0.33, 'cascading': 0.34}
    ),
    'surge_thresholds': NavigationExperiment(
        'surge_sensitivity_test',
        {'aggressive': 0.25, 'moderate': 0.5, 'conservative': 0.25}
    ),
    'ui_eta_display': NavigationExperiment(
        'eta_display_format',
        {'minutes_only': 0.5, 'range': 0.5}  # "5 min" vs "4-6 min"
    ),
}
```

### ETL Jobs

```python
# navigation/etl/daily_rollup.py
# Runs daily at 02:00 UTC

async def run_daily_navigation_rollup(date: date):
    """Aggregate navigation metrics to daily summary tables."""

    await clickhouse.execute("""
        INSERT INTO navigation_daily_summary
        SELECT
            toDate(started_at) AS day,
            city_id,
            costing,
            count() AS sessions,
            countIf(status='completed') AS completed,
            countIf(status='cancelled') AS cancelled,
            avg(distance_km) AS avg_distance_km,
            avg(actual_eta_sec) AS avg_duration_sec,
            avg(recalculations) AS avg_recalculations,
            quantile(0.5)(actual_eta_sec - planned_eta_sec) AS median_eta_error
        FROM navigation_sessions
        WHERE toDate(started_at) = %(date)s
        GROUP BY day, city_id, costing
    """, {"date": date.isoformat()})
```

### Data Retention Policy

```yaml
data_retention:
  location_raw_events:
    hot: 2 hours (Kafka)
    warm: 7 days (ClickHouse)
    cold: 90 days (object storage, compressed)
    delete_after: 1 year

  navigation_sessions:
    hot: 30 days (ClickHouse)
    cold: 2 years (ClickHouse, tiered storage)
    anonymize_after: 1 year (hash user_id)
    delete_after: 3 years

  trip_records:
    hot: 90 days (PostgreSQL)
    warm: 2 years (ClickHouse)
    delete_after: 7 years (legal requirement)

  surge_history:
    hot: 30 days (PostgreSQL)
    warm: 1 year (ClickHouse)
    delete_after: 2 years

  map_events:
    hot: 7 days (ClickHouse)
    cold: 90 days
    delete_after: 1 year

gdpr_deletion:
  user_data_deletion_sla: 30 days
  anonymization_strategy: hash_sha256_with_salt
  affected_tables:
    - navigation_sessions (user_id → hashed)
    - map_events (user_id → hashed)
    - dispatch_analytics (rider/driver → hashed)
    - location_history (actor_id → deleted)
```

---

## 5.9 CI/CD & Testing Strategy

### CI Pipeline

```yaml
# .github/workflows/navigation-ci.yml
name: Navigation CI

on:
  push:
    paths:
      - 'navigation/**'
      - 'supabase/functions/nav-*/**'
      - 'src/navigation/**'
  pull_request:
    branches: [main, develop]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:15-3.3
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: nav_test
      redis:
        image: redis:7-alpine
      kafka:
        image: redpandadata/redpanda:latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: pip install -r navigation/requirements.txt
      - name: Run unit tests
        run: pytest navigation/tests/unit/ -v --cov=navigation --cov-report=xml
      - name: Run integration tests
        run: pytest navigation/tests/integration/ -v --timeout=60
      - name: Upload coverage
        uses: codecov/codecov-action@v4

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:navigation

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Ruff lint (Python)
        run: |
          pip install ruff mypy
          ruff check navigation/
          mypy navigation/
      - name: ESLint (TypeScript)
        run: npm run lint -- --filter=navigation

  build-docker:
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend, lint]
    steps:
      - uses: actions/checkout@v4
      - name: Build navigation-api image
        uses: docker/build-push-action@v5
        with:
          context: navigation/
          tags: ecomansoni/navigation-api:${{ github.sha }}
          push: ${{ github.ref == 'refs/heads/main' }}
```

### Integration Test Harness

```python
# navigation/tests/integration/test_dispatch_pipeline.py
import pytest
from navigation.dispatch import DispatchEngine
from navigation.tests.fixtures import (
    fake_driver, fake_request, seed_drivers_in_redis
)

@pytest.mark.integration
@pytest.mark.asyncio
async def test_full_dispatch_pipeline(
    redis_client, pg_conn, kafka_consumer
):
    city_id = "test_city"
    await seed_drivers_in_redis(redis_client, city_id, count=10)

    engine = DispatchEngine(redis_client, pg_conn)
    request = fake_request(city_id=city_id)

    result = await engine.dispatch(request)

    assert result.status == "driver_assigned"
    assert result.driver_id is not None
    assert result.eta_seconds > 0
    assert result.eta_seconds < 600

    # Verify Kafka event was published
    event = await kafka_consumer.consume(timeout=5.0)
    assert event["trip_id"] == request.id
    assert event["to"] == "driver_assigned"
```

### Marketplace Simulator

```python
# navigation/tests/simulator/marketplace_sim.py

class MarketplaceSimulator:
    """Simulates supply, demand, and dispatch to validate system behavior."""

    def __init__(self, city_id: str, seed: int = 42):
        self.city_id = city_id
        self.rng = np.random.RandomState(seed)
        self.drivers: List[SimDriver] = []
        self.active_requests: List[SimRequest] = []

    def spawn_drivers(self, count: int, distribution: str = 'uniform'):
        """Place drivers across the city area."""
        for _ in range(count):
            lat, lng = sample_city_coordinates(
                self.city_id, distribution, self.rng
            )
            self.drivers.append(SimDriver(lat=lat, lng=lng, status='available'))

    async def run_simulation(
        self,
        duration_minutes: int = 60,
        demand_rate_per_minute: float = 10.0
    ) -> SimulationReport:
        metrics = SimulationMetrics()
        for minute in range(duration_minutes):
            # Generate demand
            n_requests = self.rng.poisson(demand_rate_per_minute)
            for _ in range(n_requests):
                req = self.spawn_request()
                result = await self.dispatch_engine.dispatch(req)
                metrics.record(result)

            # Move drivers (random walk)
            for driver in self.drivers:
                driver.move(self.rng)

        return metrics.report()
```

### Load Testing with k6

```javascript
// k6/navigation-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp up
    { duration: '5m', target: 200 },  // steady state
    { duration: '2m', target: 500 },  // spike
    { duration: '5m', target: 200 },  // back to steady
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    'http_req_duration{endpoint:routing}': ['p(95)<200'],
    'http_req_duration{endpoint:ingest}':  ['p(95)<100'],
    'http_req_failed': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.NAV_API_URL || 'https://api.ecomansoni.app';

export default function () {
  // Test routing endpoint
  const routingRes = http.post(
    `${BASE_URL}/api/v1/route`,
    JSON.stringify({
      locations: [
        { lat: 55.7558, lng: 37.6173 },
        { lat: 55.7624, lng: 37.6065 },
      ],
      costing: 'auto',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'routing' },
    }
  );
  check(routingRes, {
    'routing status 200': (r) => r.status === 200,
    'has route': (r) => JSON.parse(r.body).trip !== undefined,
  });

  sleep(1);

  // Test location ingest endpoint
  const ingestRes = http.post(
    `${BASE_URL}/api/v1/location/ingest`,
    JSON.stringify({
      actor_type: 'driver',
      actor_id: `load-test-driver-${__VU}`,
      city_id: 'moscow',
      points: [{ lat: 55.756 + Math.random() * 0.01, lng: 37.617, ts: Date.now() }],
    }),
    { tags: { endpoint: 'ingest' } }
  );
  check(ingestRes, { 'ingest status 200': (r) => r.status === 200 });

  sleep(0.5);
}
```

### Canary Deployments

```yaml
# k8s/navigation-api/canary.yaml
# Using Argo Rollouts

apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: navigation-api
  namespace: navigation
spec:
  replicas: 10
  strategy:
    canary:
      canaryService: navigation-api-canary
      stableService: navigation-api-stable
      steps:
      - setWeight: 5      # 5% canary traffic
      - pause: { duration: 5m }
      - analysis:
          templates:
          - templateName: routing-success-rate
      - setWeight: 20
      - pause: { duration: 10m }
      - setWeight: 50
      - pause: { duration: 10m }
      - setWeight: 100
  selector:
    matchLabels:
      app: navigation-api
```

### Feature Flags

```typescript
// src/navigation/flags/featureFlags.ts
import { createClient } from '@unleash/proxy-client-react';

export const flagClient = createClient({
  url: `${import.meta.env.VITE_UNLEASH_URL}/api/frontend`,
  clientKey: import.meta.env.VITE_UNLEASH_KEY,
  appName: 'navigation',
});

export const NAV_FLAGS = {
  TRAFFIC_OVERLAY:     'nav_traffic_overlay',
  PEDESTRIAN_AR:       'nav_pedestrian_ar',
  OFFLINE_MAPS_V2:     'nav_offline_maps_v2',
  SURGE_DISPLAY:       'nav_surge_display',
  DISPATCH_BATCH_MODE: 'nav_dispatch_batch',
  TFT_FORECAST:        'nav_tft_forecast',
} as const;

export function useNavFlag(flag: keyof typeof NAV_FLAGS): boolean {
  return flagClient.isEnabled(NAV_FLAGS[flag]);
}
```

### Database Migration Strategy

See [Section 5.13](#513-database-migration-plan) for the full migration plan.

### Blue/Green Deploy for Routing Engine Updates

```bash
#!/bin/bash
# scripts/deploy-valhalla-bluegreen.sh
# Zero-downtime Valhalla update (new OSM data or config change)

NAMESPACE="navigation"
NEW_TAG="${1:-latest}"

echo "Starting blue/green Valhalla deployment..."

# 1. Deploy new version alongside current
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: valhalla-green
  namespace: $NAMESPACE
spec:
  replicas: 2
  selector:
    matchLabels:
      app: valhalla
      slot: green
  template:
    metadata:
      labels:
        app: valhalla
        slot: green
    spec:
      containers:
      - name: valhalla
        image: ecomansoni/valhalla:$NEW_TAG
        readinessProbe:
          httpGet:
            path: /health
            port: 8002
          initialDelaySeconds: 60  # Valhalla startup time
          periodSeconds: 10
EOF

# 2. Wait for green to be ready
kubectl rollout status deploy/valhalla-green -n $NAMESPACE --timeout=300s

# 3. Smoke test green slot
GREEN_POD=$(kubectl get pod -n $NAMESPACE -l slot=green -o name | head -1)
kubectl exec -n $NAMESPACE $GREEN_POD -- curl -s "localhost:8002/route?json={...}" | jq .

# 4. Switch service selector to green
kubectl patch service valhalla-svc -n $NAMESPACE -p '{"spec":{"selector":{"slot":"green"}}}'

echo "Traffic switched to green. Monitoring for 2 minutes..."
sleep 120

# 5. Verify error rate
ERROR_RATE=$(promtool query instant 'rate(nav_routing_requests_total{status!="200"}[2m])')
if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
  echo "ERROR: High error rate detected. Rolling back..."
  kubectl patch service valhalla-svc -n $NAMESPACE -p '{"spec":{"selector":{"slot":"blue"}}}'
  exit 1
fi

# 6. Delete old blue deployment
kubectl delete deploy valhalla-blue -n $NAMESPACE
kubectl label deploy valhalla-green slot=blue -n $NAMESPACE --overwrite

echo "Blue/green deployment complete!"
```

---

## 5.10 MVP Execution Plan

### Phase 0 — Foundation (2–3 weeks)

**Goal**: Lay the infrastructure foundation, replace Leaflet with MapLibre.

**Deliverables**:

| # | Deliverable | Description |
|---|-------------|-------------|
| 0.1 | PostGIS setup | Enable PostGIS extension, create `geo_locations`, `map_reports`, `driver_positions` tables |
| 0.2 | Docker Compose | Valhalla + Martin + Photon + Redis + Kafka running locally |
| 0.3 | Routing proxy | Supabase Edge Function forwarding to Valhalla |
| 0.4 | Geocoding proxy | Edge Function forwarding to Photon |
| 0.5 | MapLibre migration | Replace Leaflet in the app with MapLibre GL JS |
| 0.6 | Basic location ingest | POST endpoint, writes to PostgreSQL |
| 0.7 | Map tile serving | Martin serving PostGIS data as MVT tiles |

**Team**: 2 engineers (1 backend, 1 frontend)

**Risks**:
- Valhalla osm.pbf download time for Russia (~2 GB) — mitigate by using pre-built Docker image
- MapLibre migration may break existing map components — mitigate by feature flagging

**Success Criteria**:
- `GET /api/v1/route?from=...&to=...` returns valid JSON route
- MapLibre renders vector tiles in the app
- Location heartbeat stored in PostgreSQL

---

### Phase 1 — Core Navigation (3–4 weeks)

**Goal**: Working turn-by-turn navigation, POI search, taxi route replacement.

**Deliverables**:

| # | Deliverable | Description |
|---|-------------|-------------|
| 1.1 | Turn-by-turn UI | Maneuver-by-maneuver navigation in MapLibre |
| 1.2 | Voice guidance | TTS announcements for maneuvers |
| 1.3 | Map matching v1 | Basic GPS trace → road network matching |
| 1.4 | POI search | Photon-powered autocomplete + map display |
| 1.5 | Offline maps v1 | Download city tile packages for offline use |
| 1.6 | Taxi Valhalla routes | Replace mock routes in taxi module with real routing |
| 1.7 | Location sharing | Share location and route in chat |

**Team**: 3 engineers (2 backend, 1 frontend + UX)

**Risks**:
- Voice guidance platform differences (iOS/Android TTS) — use `@capacitor/text-to-speech`
- Offline tile storage limits on older devices — compress tiles, limit to city-level

**Success Criteria**:
- User can navigate from A to B with voice guidance
- Taxi module shows real route on MapLibre map
- Offline navigation works without internet for selected cities

---

### Phase 2 — Intelligence (4–6 weeks)

**Goal**: Real-time traffic, presence engine, dispatch v1.

**Deliverables**:

| # | Deliverable | Description |
|---|-------------|-------------|
| 2.1 | Traffic data pipeline | Ingest probe vehicle data → Kafka → ClickHouse |
| 2.2 | Traffic overlay | Real-time color-coded traffic layer on map |
| 2.3 | Traffic-aware routing | Valhalla using live traffic speeds |
| 2.4 | Presence engine | Redis-based presence with heartbeat |
| 2.5 | Dispatch v1 | H3 candidate gen + filter + single offer strategy |
| 2.6 | Live tracking | WebSocket fanout for driver position in taxi |
| 2.7 | ETA improvements | Map-matching based ETA recalculation |

**Team**: 4 engineers (2 backend, 1 data, 1 frontend)

**Risks**:
- Traffic data quality — use multiple probe sources + outlier detection
- WebSocket scaling — use Redis pub/sub for multi-pod fanout
- Dispatch latency — profile and optimize H3 lookup

**Success Criteria**:
- Traffic layer updates every 2 minutes with fresh data
- Dispatch assigns driver within 30 seconds in normal conditions
- Live tracking updates ≤ 2s latency

---

### Phase 3 — Marketplace (4–6 weeks)

**Goal**: Full dispatch marketplace with surge, fraud protection, forecasting.

**Deliverables**:

| # | Deliverable | Description |
|---|-------------|-------------|
| 3.1 | Scoring engine | ML-based driver scoring (ETA + acceptance prob) |
| 3.2 | Surge pricing v1 | Zone-based surge with stability layer |
| 3.3 | Anti-fraud rules | GPS spoofing detection, phantom supply checks |
| 3.4 | Supply-demand forecast v1 | GBM model for 1h ahead demand/supply |
| 3.5 | Crowdsource reports | Users report traffic, hazards, speed traps |
| 3.6 | Dispatch strategies | Batch and cascading offer modes |
| 3.7 | Trip FSM | Full state machine for trip lifecycle |

**Team**: 5 engineers (2 backend, 1 ML/data, 1 frontend, 1 QA)

**Risks**:
- Surge price gouging concerns — implement price cap + display notice to users
- ML model cold start — use rule-based scoring until enough data
- Fraud model false positives — needs human review queue

**Success Criteria**:
- Surge multiplier updates every 5 minutes across zones
- Anti-fraud detects > 80% of simulated GPS spoof attacks
- Dispatch success rate > 85%
- Forecast MAE < 20%

---

### Phase 4 — Scale & Polish (ongoing)

**Goal**: Production hardening, multi-region, SDK, performance tuning.

**Deliverables**:

| # | Deliverable | Description |
|---|-------------|-------------|
| 4.1 | Kubernetes migration | Move from Docker Compose to full K8s |
| 4.2 | Auto-scaling | HPA for all navigation services |
| 4.3 | Multi-region v1 | Moscow + SPB deployment |
| 4.4 | Navigation SDK v1 | iOS + Android + Web SDK (Part 4) |
| 4.5 | A/B testing framework | Experiment infrastructure for routing + dispatch |
| 4.6 | Advanced features | AR navigation, 3D buildings, bicycle routing |
| 4.7 | Performance tuning | Load test → optimize bottlenecks |
| 4.8 | Documentation | Full API docs, SDK docs, runbooks |

**Team**: 6+ engineers (2 backend, 1 platform/infra, 1 mobile, 1 data, 1 QA)

**Success Criteria**:
- P95 routing latency < 150ms at 500 RPS
- System sustains 10K concurrent active navigations
- SDK published to npm, CocoaPods, Maven
- 99.5% availability SLO met for 30 consecutive days

---

## 5.11 Complete Docker Compose

```yaml
# docker-compose.navigation.yml
version: '3.9'

services:
  # ─────────────────────────────────────────
  # Valhalla Routing Engine
  # ─────────────────────────────────────────
  valhalla:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    ports:
      - "8002:8002"
    volumes:
      - valhalla_tiles:/data/valhalla
      - ./config/valhalla.json:/valhalla.json:ro
    environment:
      - use_tiles_ignore_pbf=true
      - serve_tiles=true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G

  valhalla-init:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    volumes:
      - valhalla_tiles:/data/valhalla
      - ./data/osm:/osm:ro
    entrypoint: >
      sh -c "
        valhalla_build_config --mjolnir-tile-dir /data/valhalla/tiles
          --mjolnir-tile-extract /data/valhalla/tiles.tar
          --mjolnir-timezone /data/valhalla/timezone.sqlite
          --mjolnir-admin /data/valhalla/admin.sqlite
          > /data/valhalla/valhalla.json &&
        valhalla_build_admins --config /data/valhalla/valhalla.json /osm/russia.osm.pbf &&
        valhalla_build_timezones --config /data/valhalla/valhalla.json &&
        valhalla_build_tiles --config /data/valhalla/valhalla.json /osm/russia.osm.pbf &&
        valhalla_build_extract -c /data/valhalla/valhalla.json -I
      "
    profiles:
      - init  # run only with: docker compose --profile init up valhalla-init

  # ─────────────────────────────────────────
  # Martin Vector Tile Server
  # ─────────────────────────────────────────
  martin:
    image: ghcr.io/maplibre/martin:latest
    ports:
      - "3000:3000"
    volumes:
      - ./config/martin.yaml:/config.yaml:ro
    environment:
      - DATABASE_URL=postgresql://nav_user:${DB_PASSWORD}@postgres:5432/ecomansoni_nav
    command: ["--config", "/config.yaml"]
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 15s
      timeout: 5s
      retries: 3

  # ─────────────────────────────────────────
  # Photon Geocoder
  # ─────────────────────────────────────────
  photon:
    image: rtuszik/photon-docker:latest
    ports:
      - "2322:2322"
    volumes:
      - photon_data:/photon/photon_data
    environment:
      - JAVA_OPTS=-Xmx4g
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:2322/api?q=Moscow&limit=1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s  # Photon takes time to start with large index

  # ─────────────────────────────────────────
  # PostgreSQL + PostGIS
  # ─────────────────────────────────────────
  postgres:
    image: postgis/postgis:16-3.4
    ports:
      - "5433:5432"  # 5433 to avoid conflict with local Postgres
    environment:
      POSTGRES_USER: nav_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ecomansoni_nav
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nav_user -d ecomansoni_nav"]
      interval: 10s
      timeout: 5s
      retries: 5
    command:
      - postgres
      - -c
      - shared_preload_libraries=pg_stat_statements
      - -c
      - max_connections=200
      - -c
      - shared_buffers=512MB

  # ─────────────────────────────────────────
  # Redis (Geo-state, Presence, Cache)
  # ─────────────────────────────────────────
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
      - ./config/redis.conf:/usr/local/etc/redis/redis.conf:ro
    command: ["redis-server", "/usr/local/etc/redis/redis.conf"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 1G

  # ─────────────────────────────────────────
  # Redpanda (Kafka-compatible event streaming)
  # ─────────────────────────────────────────
  redpanda:
    image: redpandadata/redpanda:latest
    ports:
      - "9092:9092"    # Kafka API
      - "8081:8081"    # Schema Registry
      - "8082:8082"    # REST Proxy
      - "9644:9644"    # Admin API
    volumes:
      - redpanda_data:/var/lib/redpanda/data
    command:
      - redpanda
      - start
      - --kafka-addr=PLAINTEXT://0.0.0.0:9092
      - --advertise-kafka-addr=PLAINTEXT://redpanda:9092
      - --pandaproxy-addr=0.0.0.0:8082
      - --schema-registry-addr=0.0.0.0:8081
      - --rpc-addr=0.0.0.0:33145
      - --advertise-rpc-addr=redpanda:33145
      - --mode=dev-container
      - --smp=2
      - --memory=1G
      - --reserve-memory=0M
    healthcheck:
      test: ["CMD", "rpk", "cluster", "health"]
      interval: 15s
      timeout: 5s
      retries: 5

  redpanda-init:
    image: redpandadata/redpanda:latest
    depends_on:
      redpanda:
        condition: service_healthy
    entrypoint: >
      bash -c "
        rpk topic create location.raw     --partitions 24 --replicas 1 &&
        rpk topic create location.matched --partitions 24 --replicas 1 &&
        rpk topic create trip.events      --partitions 12 --replicas 1 &&
        rpk topic create dispatch.requests --partitions 12 --replicas 1 &&
        rpk topic create dispatch.offers  --partitions 12 --replicas 1 &&
        rpk topic create pricing.surge.updates --partitions 6 --replicas 1 &&
        rpk topic create analytics.navigation.events --partitions 48 --replicas 1 &&
        echo 'Topics created'
      "
    environment:
      - RPK_BROKERS=redpanda:9092
    restart: on-failure

  # ─────────────────────────────────────────
  # ClickHouse (Analytics)
  # ─────────────────────────────────────────
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "8123:8123"   # HTTP
      - "9000:9000"   # Native protocol
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./config/clickhouse/config.xml:/etc/clickhouse-server/config.xml:ro
      - ./config/clickhouse/users.xml:/etc/clickhouse-server/users.xml:ro
      - ./migrations/clickhouse:/docker-entrypoint-initdb.d:ro
    environment:
      - CLICKHOUSE_DB=navigation
      - CLICKHOUSE_USER=nav_user
      - CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}
    healthcheck:
      test: ["CMD", "clickhouse-client", "--query", "SELECT 1"]
      interval: 15s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 4G

  # ─────────────────────────────────────────
  # Navigation FastAPI Service
  # ─────────────────────────────────────────
  navigation-api:
    build:
      context: ./navigation
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://nav_user:${DB_PASSWORD}@postgres:5432/ecomansoni_nav
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=redpanda:9092
      - VALHALLA_URL=http://valhalla:8002
      - PHOTON_URL=http://photon:2322
      - MARTIN_URL=http://martin:3000
      - CLICKHOUSE_URL=http://nav_user:${CLICKHOUSE_PASSWORD}@clickhouse:8123
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      redpanda:
        condition: service_healthy
      valhalla:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
    volumes:
      - ./navigation:/app:ro  # hot reload in dev
    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--reload"]

  # ─────────────────────────────────────────
  # Location Processor Worker
  # ─────────────────────────────────────────
  location-processor:
    build:
      context: ./navigation
      dockerfile: Dockerfile.worker
    environment:
      - KAFKA_BROKERS=redpanda:9092
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://nav_user:${DB_PASSWORD}@postgres:5432/ecomansoni_nav
      - VALHALLA_URL=http://valhalla:8002
    depends_on:
      redpanda-init:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
    command: ["python", "-m", "workers.location_processor"]
    deploy:
      replicas: 3

  # ─────────────────────────────────────────
  # Prometheus
  # ─────────────────────────────────────────
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./config/prometheus/alerts:/etc/prometheus/alerts:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'

  # ─────────────────────────────────────────
  # Grafana
  # ─────────────────────────────────────────
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./config/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./config/grafana/dashboards:/var/lib/grafana/dashboards:ro
    depends_on:
      - prometheus

  # ─────────────────────────────────────────
  # Nginx (Reverse Proxy + Tile Cache)
  # ─────────────────────────────────────────
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx/navigation.conf:/etc/nginx/conf.d/navigation.conf:ro
      - nginx_cache:/var/cache/nginx
    depends_on:
      - martin
      - navigation-api
      - valhalla

volumes:
  valhalla_tiles:
  photon_data:
  postgres_data:
  redis_data:
  redpanda_data:
  clickhouse_data:
  prometheus_data:
  grafana_data:
  nginx_cache:

networks:
  default:
    name: navigation-net
    driver: bridge
```

---

## 5.12 Environment Configuration

### Complete `.env.example` for Navigation

```bash
# =============================================================
# ECOMANSONI Navigation — Environment Configuration
# Copy to .env and fill in values
# NEVER commit .env to version control
# =============================================================

# ─────────────────────────────────────────
# Supabase (Shared Auth & Database)
# ─────────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key   # backend only, never frontend
SUPABASE_JWT_SECRET=your-jwt-secret          # for Edge Function verification

# ─────────────────────────────────────────
# Navigation PostgreSQL (PostGIS)
# Separate from Supabase for geo-workloads
# ─────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5433
DB_NAME=ecomansoni_nav
DB_USER=nav_user
DB_PASSWORD=change-me-in-production
DB_POOL_MIN=5
DB_POOL_MAX=20
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ─────────────────────────────────────────
# Redis
# ─────────────────────────────────────────
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=                              # empty for local dev
REDIS_MAX_CONNECTIONS=50
PRESENCE_TTL_SECONDS=30                     # actor presence expiry
GEO_INDEX_TTL_SECONDS=60                    # H3 zone counter expiry
ETA_CACHE_TTL_SECONDS=120                   # cached ETA per H3 pair

# ─────────────────────────────────────────
# Kafka / Redpanda
# ─────────────────────────────────────────
KAFKA_BROKERS=localhost:9092
KAFKA_SASL_USERNAME=                         # empty for local dev
KAFKA_SASL_PASSWORD=
KAFKA_SECURITY_PROTOCOL=PLAINTEXT            # SASL_SSL in production
KAFKA_GROUP_ID_PREFIX=nav-worker

# ─────────────────────────────────────────
# Valhalla Routing Engine
# ─────────────────────────────────────────
VALHALLA_URL=http://localhost:8002
VALHALLA_TIMEOUT_SECONDS=30
VALHALLA_MAX_DISTANCE_KM=2000
VALHALLA_DEFAULT_COSTING=auto               # auto|bicycle|pedestrian|bus

# ─────────────────────────────────────────
# Martin Vector Tile Server
# ─────────────────────────────────────────
MARTIN_URL=http://localhost:3000
MARTIN_TILE_CACHE_TTL=604800                 # 7 days in seconds

# ─────────────────────────────────────────
# Photon Geocoder
# ─────────────────────────────────────────
PHOTON_URL=http://localhost:2322
PHOTON_MAX_RESULTS=10
PHOTON_DEFAULT_LANGUAGE=ru

# ─────────────────────────────────────────
# ClickHouse Analytics
# ─────────────────────────────────────────
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DB=navigation
CLICKHOUSE_USER=nav_user
CLICKHOUSE_PASSWORD=change-me
CLICKHOUSE_URL=http://${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}@${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/${CLICKHOUSE_DB}

# ─────────────────────────────────────────
# Navigation API Service
# ─────────────────────────────────────────
NAV_API_PORT=8000
NAV_API_WORKERS=4                            # Uvicorn worker count
NAV_API_LOG_LEVEL=info                       # debug|info|warning|error
NAV_API_CORS_ORIGINS=http://localhost:5173,https://ecomansoni.app

# ─────────────────────────────────────────
# Rate Limiting
# ─────────────────────────────────────────
LOCATION_INGEST_RATE_LIMIT=10               # points per second per actor
ROUTING_RATE_LIMIT_PER_USER=60             # requests per minute
GEOCODING_RATE_LIMIT_PER_USER=30           # requests per minute

# ─────────────────────────────────────────
# Dispatch Configuration
# ─────────────────────────────────────────
DISPATCH_STRATEGY=single                    # single|batch|cascading
DISPATCH_OFFER_TIMEOUT_SEC=15
DISPATCH_MAX_RADIUS_KM=10
DISPATCH_MAX_CANDIDATES=20
DISPATCH_MIN_ACCEPTANCE_RATE=0.5
DISPATCH_MAX_CANCELLATION_RATE=0.2

# ─────────────────────────────────────────
# Surge Pricing
# ─────────────────────────────────────────
SURGE_ENABLED=true
SURGE_MAX_MULTIPLIER=5.0
SURGE_UPDATE_INTERVAL_SEC=300               # 5 minutes
SURGE_MIN_DWELL_TIME_CYCLES=2              # minimum cycles before change
SURGE_MAX_STEP_CHANGE=0.5                  # max change per cycle
SURGE_HYSTERESIS=0.15

# ─────────────────────────────────────────
# H3 Configuration
# ─────────────────────────────────────────
H3_DISPATCH_RESOLUTION=7                    # ~5 km² cells
H3_SURGE_RESOLUTION=8                      # ~0.7 km² cells
H3_PRESENCE_RESOLUTION=9                   # ~0.1 km² cells

# ─────────────────────────────────────────
# Map Configuration (Frontend)
# ─────────────────────────────────────────
VITE_MAPLIBRE_STYLE_URL=https://your-style-server/style.json
VITE_MARTIN_TILES_URL=http://localhost:3000
VITE_NAV_API_URL=http://localhost:8000
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# ─────────────────────────────────────────
# Observability
# ─────────────────────────────────────────
PROMETHEUS_PORT=9090
GRAFANA_PASSWORD=change-me
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=navigation-api
SENTRY_DSN=                                 # optional error tracking

# ─────────────────────────────────────────
# Security
# ─────────────────────────────────────────
NAV_ENCRYPTION_KEY=32-byte-hex-key-here    # for encrypting stored routes
ANTI_FRAUD_MODEL_PATH=/models/fraud_v1.pkl
ANTI_FRAUD_THRESHOLD=0.85
TRUSTED_PROXY_IPS=10.0.0.0/8,172.16.0.0/12

# ─────────────────────────────────────────
# Feature Flags (Unleash)
# ─────────────────────────────────────────
VITE_UNLEASH_URL=https://unleash.ecomansoni.app
VITE_UNLEASH_KEY=your-client-key

# ─────────────────────────────────────────
# External Integrations
# ─────────────────────────────────────────
# Traffic data provider (optional commercial source)
TRAFFIC_PROVIDER_URL=
TRAFFIC_PROVIDER_API_KEY=
TRAFFIC_UPDATE_INTERVAL_SEC=120

# Weather API (for surge pricing context)
WEATHER_API_URL=https://api.openweathermap.org/data/3.0
WEATHER_API_KEY=
WEATHER_UPDATE_INTERVAL_SEC=600

# FCM for push notifications
FCM_SERVER_KEY=
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_AUTH_KEY_PATH=/secrets/apns.p8
```

### Secret Management Strategy

```
Local development:
  - .env file (gitignored)
  - Docker Compose env_file

Staging / CI:
  - GitHub Actions Secrets → injected as env vars
  - Supabase Vault for Edge Function secrets

Production (Kubernetes):
  - Kubernetes Secrets (base64 encoded)
  - Sealed Secrets (encrypted at rest in git)
  - Or: HashiCorp Vault + Vault Agent Injector

Secret rotation policy:
  - Database passwords: every 90 days
  - API keys: every 180 days or on compromise
  - JWT secrets: annually or on compromise
  - All rotation: zero-downtime (dual-key acceptance window)
```

---

## 5.13 Database Migration Plan

### Migration Order & Dependencies

```
Migration execution order:

001_enable_postgis.sql
  └─→ 002_core_geo_tables.sql
       ├─→ 003_actor_positions.sql
       ├─→ 004_trips_base.sql
       │    └─→ 005_trips_partitioning.sql
       │         └─→ 006_dispatch_offers.sql
       │              └─→ 007_dispatch_logs.sql
       ├─→ 008_surge_history.sql
       ├─→ 009_map_reports.sql    (Part 4 crowdsourcing)
       ├─→ 010_poi_tables.sql     (Part 3 POI)
       └─→ 011_analytics_views.sql
            └─→ 012_forecast_tables.sql
```

### Migration Files

```sql
-- migrations/001_enable_postgis.sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS h3;            -- pg_h3 extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- migrations/002_core_geo_tables.sql
CREATE TABLE cities (
    id          TEXT PRIMARY KEY,  -- 'moscow', 'spb', etc.
    name        TEXT NOT NULL,
    name_ru     TEXT,
    bbox        GEOMETRY(Polygon, 4326),
    center      GEOMETRY(Point, 4326),
    timezone    TEXT NOT NULL DEFAULT 'Europe/Moscow',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON cities USING GIST (bbox);

INSERT INTO cities (id, name, name_ru, center, bbox, timezone) VALUES
  ('moscow', 'Moscow', 'Москва',
   ST_SetSRID(ST_MakePoint(37.6173, 55.7558), 4326),
   ST_MakeEnvelope(36.803, 55.142, 37.968, 56.021, 4326),
   'Europe/Moscow'),
  ('spb', 'Saint Petersburg', 'Санкт-Петербург',
   ST_SetSRID(ST_MakePoint(30.3609, 59.9311), 4326),
   ST_MakeEnvelope(29.515, 59.644, 30.745, 60.257, 4326),
   'Europe/Moscow');

-- migrations/003_actor_positions.sql
CREATE TABLE actor_positions (
    actor_id    UUID PRIMARY KEY,
    actor_type  TEXT NOT NULL CHECK (actor_type IN ('driver', 'courier', 'user')),
    city_id     TEXT REFERENCES cities(id),
    position    GEOMETRY(Point, 4326) NOT NULL,
    h3_7        TEXT,   -- H3 cell at resolution 7
    h3_8        TEXT,   -- H3 cell at resolution 8
    heading     SMALLINT,
    speed_kmh   SMALLINT,
    status      TEXT DEFAULT 'active',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON actor_positions USING GIST (position);
CREATE INDEX ON actor_positions (city_id, actor_type, status);
CREATE INDEX ON actor_positions (h3_7) WHERE actor_type = 'driver';

-- migrations/004_trips_base.sql
CREATE TABLE trips (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id          TEXT NOT NULL REFERENCES cities(id),
    rider_id         UUID,  -- references supabase auth.users
    driver_id        UUID,
    state            TEXT NOT NULL DEFAULT 'pending',
    pickup_point     GEOMETRY(Point, 4326),
    dropoff_point    GEOMETRY(Point, 4326),
    pickup_h3_7      TEXT,
    dropoff_h3_7     TEXT,
    route_polyline   TEXT,
    distance_km      DECIMAL(8,3),
    duration_sec     INT,
    fare_amount      DECIMAL(10,2),
    fare_currency    TEXT DEFAULT 'RUB',
    surge_multiplier DECIMAL(4,2) DEFAULT 1.0,
    vehicle_type     TEXT,
    requested_at     TIMESTAMPTZ DEFAULT NOW(),
    accepted_at      TIMESTAMPTZ,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    cancelled_at     TIMESTAMPTZ,
    cancel_reason    TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY LIST (city_id);

-- migrations/005_trips_partitioning.sql
CREATE TABLE trips_moscow PARTITION OF trips FOR VALUES IN ('moscow');
CREATE TABLE trips_spb    PARTITION OF trips FOR VALUES IN ('spb');
CREATE TABLE trips_other  PARTITION OF trips DEFAULT;

CREATE INDEX ON trips (city_id, state, requested_at);
CREATE INDEX ON trips USING GIST (pickup_point);
CREATE INDEX ON trips (driver_id, requested_at);
CREATE INDEX ON trips (rider_id, requested_at);

-- migrations/006_dispatch_offers.sql
CREATE TABLE dispatch_offers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id      UUID NOT NULL,
    driver_id    UUID NOT NULL,
    offered_at   TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    response     TEXT CHECK (response IN ('accepted', 'declined', 'timeout')),
    eta_seconds  INT,
    score        DECIMAL(6,4),
    offer_wave   SMALLINT DEFAULT 1
);

CREATE INDEX ON dispatch_offers (trip_id, offered_at);
CREATE INDEX ON dispatch_offers (driver_id, offered_at);

-- migrations/007_dispatch_logs.sql
CREATE TABLE dispatch_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON dispatch_logs (trip_id, created_at);
CREATE INDEX ON dispatch_logs USING GIN (event_data);

-- migrations/008_surge_history.sql
CREATE TABLE surge_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id          TEXT NOT NULL,
    h3_cell          TEXT NOT NULL,
    surge_multiplier DECIMAL(4,2) NOT NULL,
    imbalance_score  DECIMAL(5,4),
    demand_rate      DECIMAL(8,2),
    supply_count     INT,
    trusted_supply   INT,
    fraud_ratio      DECIMAL(5,4),
    effective_from   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON surge_history (city_id, h3_cell, effective_from DESC);
CREATE INDEX ON surge_history (effective_from) WHERE effective_to IS NULL;

-- migrations/011_analytics_views.sql
CREATE OR REPLACE VIEW v_active_trips AS
SELECT
    t.*,
    ST_AsGeoJSON(t.pickup_point)::jsonb  AS pickup_geo,
    ST_AsGeoJSON(t.dropoff_point)::jsonb AS dropoff_geo,
    ap.position AS driver_position,
    ap.heading  AS driver_heading,
    ap.speed_kmh AS driver_speed
FROM trips t
LEFT JOIN actor_positions ap ON ap.actor_id = t.driver_id
WHERE t.state IN ('driver_assigned', 'driver_en_route', 'arrived_at_pickup', 'in_trip');

CREATE OR REPLACE VIEW v_zone_supply AS
SELECT
    city_id,
    h3_7 AS h3_cell,
    count(*) FILTER (WHERE actor_type = 'driver' AND status = 'active') AS available_drivers,
    count(*) FILTER (WHERE actor_type = 'courier' AND status = 'active') AS available_couriers,
    max(updated_at) AS last_updated
FROM actor_positions
WHERE updated_at > NOW() - INTERVAL '30 seconds'
GROUP BY city_id, h3_7;

-- migrations/012_forecast_tables.sql
-- (PostgreSQL side — hot forecast cache)
CREATE TABLE forecast_cache (
    city_id          TEXT NOT NULL,
    h3_cell          TEXT NOT NULL,
    time_bucket      TIMESTAMPTZ NOT NULL,
    demand_p50       SMALLINT,
    demand_p90       SMALLINT,
    supply_p50       SMALLINT,
    imbalance_score  DECIMAL(5,4),
    generated_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (city_id, h3_cell, time_bucket)
);

CREATE INDEX ON forecast_cache (city_id, time_bucket)
  WHERE time_bucket > NOW();  -- partial index, only future forecasts
```

### Rollback Strategy per Migration

```sql
-- Each migration has a corresponding rollback script

-- rollback/001_enable_postgis.sql
-- NOTE: Cannot safely remove PostGIS once data exists
-- Do NOT run in production unless fresh installation
DROP EXTENSION IF EXISTS postgis CASCADE;

-- rollback/002_core_geo_tables.sql
DROP TABLE IF EXISTS cities CASCADE;

-- rollback/003_actor_positions.sql
DROP TABLE IF EXISTS actor_positions CASCADE;

-- rollback/004_trips_base.sql  (+005)
DROP TABLE IF EXISTS trips CASCADE;

-- rollback/006_dispatch_offers.sql
DROP TABLE IF EXISTS dispatch_offers CASCADE;

-- rollback/007_dispatch_logs.sql
DROP TABLE IF EXISTS dispatch_logs CASCADE;

-- rollback/008_surge_history.sql
DROP TABLE IF EXISTS surge_history CASCADE;
```

### Migration Runner

```python
# navigation/migrations/runner.py
import asyncpg, os
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent / "sql"

async def run_migrations(db_url: str):
    conn = await asyncpg.connect(db_url)

    # Ensure migrations table exists
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id          SERIAL PRIMARY KEY,
            name        TEXT UNIQUE NOT NULL,
            applied_at  TIMESTAMPTZ DEFAULT NOW(),
            checksum    TEXT
        )
    """)

    applied = {r['name'] for r in await conn.fetch(
        "SELECT name FROM _migrations ORDER BY id"
    )}

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))

    for migration_file in migration_files:
        name = migration_file.stem
        if name in applied:
            print(f"  ✓ {name} (already applied)")
            continue

        sql = migration_file.read_text()
        checksum = hashlib.sha256(sql.encode()).hexdigest()

        async with conn.transaction():
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO _migrations (name, checksum) VALUES ($1, $2)",
                name, checksum
            )
        print(f"  ✔ {name} applied")

    await conn.close()
```

### Development Data Seeding

```sql
-- seeds/01_test_drivers.sql
-- 20 fake drivers in Moscow for development

INSERT INTO actor_positions (actor_id, actor_type, city_id, position, h3_7, status)
SELECT
    gen_random_uuid(),
    'driver',
    'moscow',
    ST_SetSRID(
        ST_MakePoint(
            37.617 + (random() - 0.5) * 0.2,
            55.756 + (random() - 0.5) * 0.2
        ),
        4326
    ),
    -- H3 cell will be computed by trigger or app
    h3_latlng_to_cell(
        55.756 + (random() - 0.5) * 0.2,
        37.617 + (random() - 0.5) * 0.2,
        7
    )::text,
    'active'
FROM generate_series(1, 20);

-- seeds/02_test_surge_zones.sql
INSERT INTO surge_history (city_id, h3_cell, surge_multiplier, imbalance_score, effective_from)
VALUES
    ('moscow', '871fb4670ffffff', 1.8, 0.65, NOW()),
    ('moscow', '871fb4671ffffff', 1.3, 0.42, NOW()),
    ('moscow', '871fb4672ffffff', 2.2, 0.78, NOW());
```

---

## Summary

This document covers the complete production blueprint for the ECOMANSONI navigation super-app integration:

| Section | Content |
|---------|---------|
| [5.1](#51-navigation-integration-into-super-app) | Microfrontend architecture, shared auth, chat/stories/taxi/delivery integration |
| [5.2](#52-realtime-geo-platform-architecture) | Location ingest, presence engine, Redis keyspace, Kafka topics, WebSocket fanout |
| [5.3](#53-dispatch--matching-marketplace) | H3 candidate gen, filters, ETA, scoring, offer strategies, trip FSM, VRP |
| [5.4](#54-supply-demand-forecasting) | Feature engineering, GBM → TFT model, probabilistic forecasting, backtesting |
| [5.5](#55-surge-pricing-engine) | Composite imbalance score, stability layer, anti-gaming, spatial smoothing |
| [5.6](#56-horizontal-scaling-architecture) | K8s HPA, Redis cluster, Kafka sizing, CDN tiles, multi-region, latency budget |
| [5.7](#57-observability--operations) | Prometheus metrics, Grafana dashboards, OTel tracing, alerting, runbooks, SLO |
| [5.8](#58-data-pipeline--analytics) | ClickHouse schema, analytics queries, A/B framework, ETL, data retention |
| [5.9](#59-cicd--testing-strategy) | CI pipeline, integration harness, k6 load tests, canary, feature flags |
| [5.10](#510-mvp-execution-plan) | 4-phase roadmap with deliverables, team size, risks, success criteria |
| [5.11](#511-complete-docker-compose) | Full docker-compose for all navigation infrastructure |
| [5.12](#512-environment-configuration) | Complete `.env.example` with all variables documented |
| [5.13](#513-database-migration-plan) | Migration order, SQL scripts, rollback strategy, dev seeding |

---

*ECOMANSONI Navigation — Part 5 of 5*
*See [Part 1](./01-core-engines.md) through [Part 4](./04-crowdsourcing-sdk-security.md) for the complete navigation system documentation.*
