# Navigation KPI and Fallbacks

This document defines Wave 2 + Wave 3 operational behavior for navigation routing and traffic.

## Backend-priority fallback chains

### Routing chain (`src/lib/navigation/routing.ts`)
1. `navigation_server` (`POST /api/v1/nav/route`) with auth header from current Supabase session.
2. Offline graph A* (`fetchRouteOffline`) with existing penalties for:
   - `avoidTolls`
   - `avoidHighways`
   - `avoidUnpaved`
3. OSRM fallback with existing `exclude` forwarding:
   - `avoidTolls` -> `exclude=toll`
   - `avoidHighways` -> `exclude=motorway`

### Traffic chain (`src/lib/navigation/trafficProvider.ts`)
1. `navigation_server` (`GET /api/v1/nav/traffic/area`) with Supabase bearer token.
2. Supabase RPC `get_traffic_in_bbox`.
3. Cached segments / deterministic time-of-day estimate.

## Circuit breaker and availability helper

Implemented in `src/lib/navigation/backendAvailability.ts`.

Behavior:
- One lightweight runtime breaker per backend service (`routing`, `traffic`).
- Tracks consecutive failures.
- Opens circuit when failure threshold is reached.
- While open, requests are skipped until cooldown expires.
- Success resets failure counters and closes circuit.

Config (frontend env):
- `VITE_NAV_SERVER_ENABLED`
- `VITE_NAV_SERVER_URL`
- `VITE_NAV_SERVER_TIMEOUT_MS`
- `VITE_NAV_SERVER_RETRIES`
- `VITE_NAV_SERVER_RETRY_DELAY_MS`
- `VITE_NAV_SERVER_CB_FAILURE_THRESHOLD`
- `VITE_NAV_SERVER_CB_COOLDOWN_MS`

Safe defaults are baked into code when env is absent.

## KPI metrics and gates

Implemented in `src/lib/navigation/navigationKpi.ts`.

### Metrics
- `route_build_latency_ms` (from destination selection / route preview build).
- `reroute_latency_ms` (off-route reroute block).
- `pipeline_confidence` (Amap pipeline confidence and fallback usage).
- `fallback_usage` counters by kind:
  - `routing`
  - `traffic`
  - `pipeline`
- backend status snapshots:
  - `ok`
  - `degraded`
  - `open`
  - `disabled`

### Gates
- Route build latency p95 gate: `<= 2500ms`
- Reroute latency p95 gate: `<= 1800ms`
- Pipeline confidence average gate: `>= 0.60`

These are diagnostics gates and do not block runtime navigation.

## Integration points

- `src/hooks/navigation/useNavigation.ts`
  - `selectDestination`: route build latency + source/fallback tagging.
  - route preview rebuild: fallback tagging when backend source is not primary.
  - reroute block: reroute latency + fallback/failure tagging.
- `src/hooks/navigation/useAmapNavigation.ts`
  - pipeline init failures and live confidence snapshots.
- `src/pages/navigation/NavigationPage.tsx`
  - additional confidence event logging while navigating.

## Dev diagnostics overlay

`src/components/navigation/NavigationDiagnosticsOverlay.tsx` renders key KPIs and backend status.

Feature flag:
- `VITE_NAV_DIAGNOSTICS=true`

The overlay is pointer-events disabled and does not block normal UI flows.
