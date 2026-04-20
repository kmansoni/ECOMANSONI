# AGENTS.md — ECOMANSONI Navigator AI Agent Architecture

> Defines agents, skills, and architect roles for maintaining and evolving the platform.

## 🏛️ Architects

### 1. Platform Architect
- **Domain:** Cross-cutting concerns (auth, RLS, multi-account, settings sync, edge functions)
- **Owns:** `src/lib/supabase.ts`, `src/contexts/`, `supabase/migrations/`, `src/lib/auth/`
- **Rules:**
  - Every table MUST have RLS policies
  - Every mutation MUST go through Supabase (no direct SQL from client)
  - Settings sync: server-authoritative for premium features, localStorage cache for performance

### 2. Navigation Architect
- **Domain:** Routing, map rendering, offline navigation, transit, voice assistant, traffic
- **Owns:** `src/lib/navigation/`, `src/components/navigation/`, `src/stores/navigatorSettingsStore.ts`
- **Rules:**
  - Speed limits MUST come from real data (OSM maxspeed tags, OSRM annotations) — NEVER random
  - Route preferences (avoidTolls/Unpaved/Highways) MUST be applied to ALL routing backends (offline + OSRM)
  - Voice `speed_warning` events MUST be audible in ALL non-mute sound modes (safety-critical)
  - Map style changes MUST propagate from store → `MapLibre3D` `mapStyle` prop
  - Camera heading comparison MUST use shortest angular distance (handle 350°↔10° wrap)

### 3. Media Architect
- **Domain:** Calls, livestream, video editor, media upload, SFU, SIP
- **Owns:** `src/calls-v2/`, `src/lib/calls/`, `src/components/live/`, `media-server/`
- **Rules:**
  - All media flows through E2EE where possible
  - SFU/SIP configs validated server-side

### 4. Commerce Architect
- **Domain:** Taxi, shop, insurance, real estate, premium
- **Owns:** `src/lib/taxi/`, `src/lib/insurance/`, `src/pages/taxi/`, `src/pages/insurance/`
- **Rules:**
  - Payment flows MUST be server-validated
  - Tariff estimates MUST match backend calculations

---

## 🤖 Agents

### Navigation Agent
- **Trigger:** Changes to `src/lib/navigation/**`, `src/components/navigation/**`, `src/stores/navigatorSettings*`
- **Pre-commit checks:**
  1. `tsc --noEmit` passes
  2. All `SoundMode` cases in `shouldSpeak()` cover `speed_warning` (safety)
  3. Route preferences are forwarded to OSRM via `exclude` param
  4. `mapViewMode` ↔ `MapLibre3D.mapStyle` binding exists
  5. No `Math.random()` for speed limits
- **Post-commit:**
  1. Run `vitest run --testPathPattern=navigation`
  2. Verify camera heading math handles wrap-around

### Settings Sync Agent
- **Trigger:** Changes to `src/stores/navigatorSettingsStore.ts`, `src/lib/user-settings.ts`
- **Checks:**
  1. Navigator settings sync to `navigator_settings` table via debounced upsert
  2. Supabase → localStorage hydration on login
  3. Premium feature flags are server-authoritative

### Routing Agent
- **Trigger:** Changes to `routing.ts`, `dynamicRerouter.ts`, `pedestrianMode.ts`, `transitRouter.ts`
- **Checks:**
  1. `fetchRoute()` passes `exclude` param to OSRM based on store preferences
  2. `DynamicRerouter.check()` passes same preferences on reroute
  3. Speed limits derived from OSRM step annotations or OSM data
  4. Offline A* respects edge penalties for tolls/highways/unpaved

### Map Display Agent
- **Trigger:** Changes to `NavigatorMap.tsx`, `MapLibre3D.tsx`, `navigatorSettingsStore.ts`
- **Checks:**
  1. `mapViewMode` → `mapStyle` prop mapping in `NavigatorMap`
  2. `show3DBuildings`, `showTrafficLights`, `showSpeedBumps`, `showRoadSigns`, `showLanes`, `showSpeedCameras`, `showPOI` toggles are consumed by rendering code
  3. `labelSizeMultiplier` applied to map text layers
  4. `highContrastLabels` adds text halo/stroke

### Voice Safety Agent
- **Trigger:** Changes to `voiceAssistant.ts`, `navigatorSettingsStore.ts`
- **CRITICAL checks:**
  1. `speed_warning` is ALWAYS spoken in non-mute modes
  2. Volume from store is applied to `utterance.volume`
  3. Voice selection matches `selectedVoice` from store

---

## 🎯 Skills

### Skill: Offline Navigation
- **Files:** `src/lib/navigation/offlineConfig.ts`, `offlineSearch.ts`, `osmGraph.ts`
- **Knowledge:** OSM data format, PBF parsing, Dijkstra/A* on adjacency lists, IndexedDB tile storage
- **When to apply:** Any change to offline routing, map tile downloads, or OSM data processing

### Skill: Voice Assistant
- **Files:** `src/lib/navigation/voiceAssistant.ts`, `turnInstructions.ts`
- **Knowledge:** Web Speech API, Russian TTS, voice selection, human-like filler patterns
- **When to apply:** Any change to navigation voice output, sound modes, volume control

### Skill: Traffic Analysis
- **Files:** `src/lib/navigation/trafficProvider.ts`, `trafficCollector.ts`, `trafficLightTiming.ts`
- **Knowledge:** H3 hexagonal indexing, GPS probe aggregation, Supabase RPC, cache invalidation
- **When to apply:** Any change to traffic data fetching, display, or routing weight calculation

### Skill: Map Rendering
- **Files:** `src/components/navigation/MapLibre3D.tsx`, `NavigatorMap.tsx`
- **Knowledge:** MapLibre GL JS, GeoJSON layers, 3D buildings extrusion, camera animation, marker management
- **When to apply:** Any change to map display, style switching, layer visibility toggling

### Skill: Settings Persistence
- **Files:** `src/stores/navigatorSettingsStore.ts`, `src/lib/user-settings.ts`, `src/contexts/UserSettingsContext.tsx`
- **Knowledge:** Zustand persist middleware, Supabase realtime, optimistic updates, cross-device sync
- **When to apply:** Any change to user or navigator settings storage, sync, or migration

### Skill: Transit Routing
- **Files:** `src/lib/navigation/transitRouter.ts`, `src/lib/transit/`
- **Knowledge:** GTFS, RAPTOR algorithm, multimodal route planning, transfer optimization
- **When to apply:** Any change to public transit routing or schedule handling

---

## 📋 Quality Gates

Every PR touching navigation code MUST pass:

1. **Type Safety:** `tsc --noEmit` clean (zero errors)
2. **Safety Audit:** `speed_warning` reachable in all non-mute modes
3. **Settings Integration:** Every store field consumed by at least one component/lib
4. **No Stubs:** No `Math.random()` for real data, no TODO/FIXME in critical paths
5. **Route Preferences:** OSRM `exclude` param matches store toggles
6. **Map Style Binding:** `mapViewMode` ↔ `MapLibre3D.mapStyle` connected
7. **Camera Math:** Heading comparison uses `min(diff, 360-diff)` for angle wrapping
