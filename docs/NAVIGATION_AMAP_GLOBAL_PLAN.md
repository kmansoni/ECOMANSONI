# NAVIGATION AMAP Global Plan (12 Weeks)

## Objectives

- Integrate AMap-grade pipeline (Kalman + map matching + lane recommendation) into core runtime without regressions.
- Improve navigation stability and guidance quality under urban noise, tunnels, and dense intersections.
- Keep backward-safe behavior: voice/search/transit remains functionally equivalent while pipeline rolls out.

## Scope and Guardrails

- Scope: runtime integration, observability, quality gates, progressive rollout, licensing-safe data stack.
- Out of scope for Wave 1: replacing all routing engines or introducing proprietary SDK lock-in.
- Safety rules:
  - Fallback to legacy navigation behavior when pipeline state is not ready or confidence is low.
  - No silent degradation of speed limits/lane guidance; always deterministic source priority.
  - Feature-flagged rollout with kill switch and per-segment telemetry.

## 12-Week Delivery Plan

### Wave 1 (Weeks 1-3): Runtime Integration + Safety Fallbacks

**Epics**
- E1. Wire `useAmapNavigation` into main navigation runtime.
- E2. Define source-priority policy for heading, matched position, speed, speed limit, road name, lane guidance.
- E3. Add defensive guards for uninitialized pipeline and low-confidence matching.
- E4. Add minimal telemetry for readiness/confidence and fallback ratio.

**KPI Targets**
- Pipeline-ready rate in active sessions: >= 95%.
- Fallback activation due to not-ready/low-confidence: <= 30% of navigating frames.
- Typecheck/build regression count: 0.

**Definition of Done (DoD)**
- Runtime uses AMap outputs with explicit fallback policy.
- No breakage in voice/search/transit user flows.
- Navigation page passes typecheck and smoke scenario tests.
- Logs/metrics include `pipelineReady`, `matchConfidence`, `fallbackReason`.

### Wave 2 (Weeks 4-6): Data Quality + Guidance Accuracy

**Epics**
- E5. Improve road graph freshness and lane metadata coverage.
- E6. Add confidence-aware hysteresis to reduce heading jitter and lane flicker.
- E7. Validate speed-limit source quality and mismatch alerts.
- E8. Build route replay harness for deterministic accuracy checks.

**KPI Targets**
- Heading jitter (p95): -25% versus baseline.
- Lane guidance precision on instrumented intersections: >= 85%.
- Speed limit mismatch (map vs expected): <= 5% on audited routes.

**Definition of Done (DoD)**
- Replay suite available in CI for representative urban/rural routes.
- Lane and speed-limit quality dashboards with baseline comparison.
- No increase in reroute rate due to map matching drift.

### Wave 3 (Weeks 7-9): Production Hardening + Performance

**Epics**
- E9. Optimize CPU/memory profile for low-end Android devices.
- E10. Add incremental/offline graph loading and cache invalidation strategy.
- E11. Harden failure handling (graph load errors, sparse GPS, long background gaps).
- E12. Expand telemetry with SLOs, alerts, and rollout guardrails.

**KPI Targets**
- Additional CPU load from pipeline (median): <= 12% during navigation.
- Additional memory footprint (p95): <= 120 MB.
- Crash-free sessions for navigation: >= 99.7%.

**Definition of Done (DoD)**
- Perf budget documented and enforced in CI/profiling checks.
- Incremental data update path tested (success + rollback path).
- Alerting policy for readiness drop, confidence drop, crash spikes in place.

### Wave 4 (Weeks 10-12): Commercial Readiness + Scale Rollout

**Epics**
- E13. Regional rollout plan (country/city cohorts, staged exposure).
- E14. Compliance and attribution audit for open-data components.
- E15. SLA runbooks, on-call playbooks, and incident simulation drills.
- E16. Business KPI validation (ETA accuracy, trust, retention lift).

**KPI Targets**
- ETA absolute error p50: -15% vs baseline.
- Correct-turn success at complex junctions: +10% vs baseline.
- Navigation session retention (D7 cohort): +5% relative.

**Definition of Done (DoD)**
- Rollout completed to 100% target region with monitored SLO adherence.
- License obligations and attribution flows signed off.
- Operations runbooks validated in game-day drills.

## Free Data Sources and Licenses

| Source | Usage in stack | License / Terms | Commercial notes | Self-host recommendation |
|---|---|---|---|---|
| OpenStreetMap (planet/extracts) | Base roads, names, maxspeed, lanes, turn restrictions | ODbL 1.0 | Must provide attribution; share-alike applies to produced databases under ODbL rules | Yes (required for control and compliance) |
| Nominatim (geocoder) | Forward/reverse geocoding | OSM data (ODbL) + Nominatim usage policy | Public endpoint not suitable for commercial high-volume; self-host for production | Yes |
| Photon | Search index on top of OSM/Nominatim | Apache-2.0 (software), ODbL (data) | Good open geocoder API; still obey OSM attribution | Yes |
| Valhalla | Routing, map matching, isochrones | MIT (software), OSM data license | Commercial-safe software license; data obligations remain | Yes |
| OSRM | Fast routing engine | BSD-2-Clause (software), OSM data license | Mature for driving routing; pair with own extracts | Yes |
| OpenMapTiles | Vector tiles | BSD-style toolchain + data-dependent licenses | Verify exact tile schema/data source attribution | Yes |
| OpenWeather | Weather overlays and conditions | Freemium API terms | Free tier quotas; verify commercial/API limits per plan | Optional |
| SRTM (NASA) | Elevation/slope for routing and ETA | Public domain (US Gov) | Commercial-safe; verify distribution packaging policy | Yes |
| Copernicus DEM (EU) | Higher-quality elevation in selected regions | Copernicus free/open terms | Commercial-safe with attribution requirements | Yes |
| Natural Earth | Low-zoom cartographic context | Public domain | Commercial-safe | Yes |
| GTFS static feeds (agency-provided) | Transit schedules and stops | Agency-specific terms | License differs by operator; keep per-feed registry | Yes |
| GTFS-RT feeds | Live transit positions/alerts | Agency-specific terms | Often has redistribution limits; enforce cache policy | Yes |

## Recommended Safe Commercial Stack

### Core Runtime

- Routing engine: Valhalla primary, OSRM fallback for latency-sensitive car routes.
- Map matching: in-house HMM pipeline (already integrated) with confidence gating.
- Geocoding: Photon + self-hosted Nominatim for primary; optional paid backup for SLA-critical markets.
- Tiles: OpenMapTiles self-hosted vector stack with CDN edge cache.

### Data and Update Layer

- OSM ingestion pipeline: regional extracts + scheduled diffs (daily or near-real-time depending on region criticality).
- Elevation: SRTM baseline, Copernicus DEM upgrade where available.
- Traffic/camera enrichment: internal probes + vetted open municipal datasets where license permits.

### Compliance and Governance

- Maintain machine-readable attribution manifest shipped with app/web and backend responses.
- Keep data provenance ledger: source, snapshot date, region, license, downstream artifacts.
- Run automated license policy checks in CI for all map/transit/weather imports.

### Reliability and Security

- Multi-region deployment for routing/geocoding APIs.
- Feature flags + kill switches for each pipeline component (kalman, matching, lane).
- Rate limits and abuse controls at API gateway; signed client telemetry where feasible.
- SLO examples: `p95 route latency <= 900ms`, `geocode success >= 99%`, `pipeline ready >= 95%`.

## Exit Criteria for Global Rollout

- Safety: no regression in turn correctness, speed warning behavior, or camera alerts.
- Quality: sustained KPI gains for ETA and guidance consistency.
- Ops: on-call readiness validated with incident drills and rollback playbooks.
- Legal: attribution, ODbL obligations, and provider terms fully documented and auditable.
