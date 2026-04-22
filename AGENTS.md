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

## 🧭 Execution Protocol

- **Russian-first:** all discussion, промежуточные отчеты, questions, and final summaries MUST be in Russian unless the user explicitly requests another language.
- **Single trajectory:** one task means one bounded subsystem. If the task is to fix calls, work only on calls. If the task is to fix SFU, work only on SFU. If the task is to fix avatars, work only on avatars. Do not broaden scope without explicit approval.
- **One issue at a time:** if one specification contains multiple defects, resolve them strictly one by one. After each fix: verify, report the result, and only then move to the next defect.
- **Surgical changes only:** avoid batch fixing across adjacent areas just because the code is nearby. Touch only the files and logic required for the current defect.
- **Fix quality rule:** optimize not for the fewest changed lines, but for the smallest necessary change surface. Inside that bounded area, the fix must be complete and clean, not a temporary patch.
- **Clean-code loop:** every change follows the same order: write the minimal clean fix, run validation, discuss outcome, refine if needed.
- **No silent tech debt:** do not leave temporary branches of logic, stale fallbacks, dead code, duplicate paths, commented-out code, or partial migrations behind.
- **No masked unknowns:** if the active area is underspecified or clearly missing logic, data, backend/frontend contract, or product behavior, do not hide it with a stub, noop, fake value, or silent bypass. Surface the gap explicitly.
- **Deletion requires confirmation:** when cleanup means deleting old code, old endpoints, old config, or old fallback behavior, ask for confirmation before removal.
- **Syntax and encoding first:** syntax errors, broken Cyrillic, mojibake, mixed encodings, and malformed text are first-class blockers and must be detected and surfaced immediately.
- **Keep context compact:** do not accumulate unnecessary notes, duplicate plans, or speculative cleanup lists. Keep only the information needed for the current step.

When such a gap is found, the agent MUST:

1. identify the missing contract or logic explicitly;
2. link the exact code area, schema, API, config, or document where the gap manifests;
3. explain what is known, what is missing, and why a clean production fix cannot be completed silently;
4. continue only after the gap is clarified or an explicit implementation direction is agreed.

---

## 🔄 Work Cycle

For every defect, the agent MUST follow this sequence:

1. **Lock scope:** state the exact subsystem and exact defect being worked on.
2. **Inspect only relevant code:** read only the files needed for that defect.
3. **Apply the smallest clean fix:** no opportunistic refactors outside the active defect.
4. **Run validation immediately:** typecheck, test, build, smoke check, or targeted runtime verification for that exact area.
5. **Report result in Russian:** what was fixed, what was verified, what remains.
6. **Only then move forward:** if another defect exists, treat it as a new step, not as part of the previous patch.

If validation fails, continue working on the same defect until it is clean or explicitly blocked.

---

## 🤖 Agents

## 🧰 Agent Runtime Split

- **Активный runtime:** только файлы в `.github/agents/`.
- **Активный toolset:** `execute`, `read`, `edit`, `search`, `agent`, `web`, `todo`, `claude-flow/*`.
- **Жёсткое правило:** VS Code-specific, legacy-runtime и Kilo-incompatible инструменты не допускаются в agent definitions проекта.

Если contributor добавляет новый agent-файл, он должен соответствовать только активному runtime проекта и его текущему toolset.

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

---

## ✅ Change Control Gates

Every commit or PR in this repo SHOULD follow these rules unless the user explicitly overrides them:

1. **One defect per logical step:** if three problems are reported, do not merge them into one broad fix pass.
2. **One bounded scope per commit:** avoid mixing calls, SFU, avatars, navigation, music, or deploy fixes in the same commit unless they are inseparable.
3. **Proof before progression:** each defect fix must include a concrete verification result before the next defect is touched.
4. **No stealth cleanup:** removing legacy code, fallback code, duplicate code paths, or obsolete config requires explicit user confirmation.
5. **No dirty leftovers:** temporary debug code, commented blocks, dead branches, duplicated logic, and stale fallback URLs are not allowed to remain after the fix.
6. **Syntax and text integrity gate:** before closing work, check for syntax errors, malformed Russian text, mojibake, and accidental mixed encodings in touched files.
7. **Discussion language gate:** all agent-facing explanations, progress notes, and summaries default to Russian.

Recommended commit shape:

1. defect statement
2. surgical fix
3. targeted validation
4. concise Russian summary
