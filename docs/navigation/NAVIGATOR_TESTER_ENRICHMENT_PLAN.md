# Navigator Tester Enrichment Plan

## Executive Summary

Навигационное тестирование требует многослойного подхода, сочетающего функциональное E2E-тестирование, визуальный/UX-аудит, инженерно-производительный мониторинг и физическую валидацию в полевых условиях. Текущий уровень покрытия ограничен базовыми smoke-тестами и сценариями счастья, что позволяет 30% дефектов утекать в продакшн. Внедрение четырёх специализированных tester-агентов поднимет выявляемость до 95%+ и сократит MTTR с 4 часов до <1 часа.

## Current State (Before)

### Существующий Navigator Tester (mansoni-tester domain)

Агент `navigator-tester` (`.github/agents/navigator-tester.agent.md`) покрывает 19 доменных областей:

1. **Map Rendering** (10 подразделов) — tile loading, style switching, 3D buildings, terrain, traffic overlay, POI clustering, marker rendering, rotation/tilt, zoom/bounds, label collision
2. **Routing Engine** (10 подразделов) — fastest/shortest, multi-stop, alternatives, TSP optimization, avoidance options, vehicle-specific profiles, pedestrian, bicycle, public transit, route preferences
3. **Turn-by-Turn Navigation** (10 подразделов) — voice guidance (multilingual), visual maneuvers, lane guidance, speed limit/camera warnings, deviation handling, automatic rerouting, ETA, distance remaining, junction view
4. **Real-Time Data** (8 подразделов) — traffic flow, incident reporting, road closures, dynamic speed limits, weather overlay, haze/smog detection, road conditions, parking availability
5. **Location Services** (8 подразделов) — GPS accuracy/fallback, permissions, geofencing, significant location changes, location history, places tracking, visit detection, geocoding/reverse geocoding
6. **Offline Capabilities** (8 подразделов) — map download/storage, offline routing/search/navigation, data compression, update mechanism, storage management
7. **Search and Discovery** (8 подразделов) — address/POI/business search, natural language, suggestions, ranking, filters, area search
8. **Navigation Modes** (7 подразделов) — driving, walking, cycling, public transit, mixed mode, wheelchair accessibility, evacuation routes
9. **Safety Features** (6 подразделов) — speed camera alerts, fatigue detection, emergency locator, accident reporting, roadside assistance, hazard warnings
10. **3D and AR Features** (6 подразделов) — AR overlay, 3D buildings/terrain, camera perspectives, AR object placement, route visualization
11. **Integration** (6 подразделов) — calendar, weather, fuel prices, toll calculation, parking, EV charging
12. **Performance** (5 подразделов) — FPS (≥30fps), route calc time, battery consumption, data usage, memory footprint
13. **Test Environments** — unit (routing algorithms, geospatial, tile management, coordinate transforms), integration (OSRM/Valhalla, traffic pipeline, location services, voice), E2E (complete scenarios, search→route flow, offline usage, traffic updates), device (GPS chipsets, screen sizes, orientations, network conditions)
14. **Metrics** (6 KPIs) — route calculation (<1s target), GPS accuracy (<3m), map load (<2s), voice delay (<2s), reroute (<3s), offline map size (<100MB/city)
15. **Automation** — npm/cypress/gps-simulator commands
16. **Test Data** — map tiles, routing graphs, traffic patterns, POI databases, GPS traces, voice scripts (multilingual)
17. **Compliance** — OSM attribution, map data licenses, privacy regulations (location data), accessibility standards, international routing rules

### Критические пробелы (before)

- Только **happy-path сценарии** в E2E; нет негативных/edge-case сценариев (потеря GPS, переключение сети, низкая батарея)
- Нет **UX/визуального аудита** — контраст, размер тап-таргетов, иерархия, доступность (a11y)
- Нет **производительностных бюджетов** в CI — нельзя обнаружить регрессии FPS, памяти, задержек маршрутизации
- Нет **физической валидации в поле** — утечки в timing голосовых подсказок, камера, эргономика в движении
- Нет **дебаггер-интеграции** — автоматическое создание issues при падениях тестов

---

## New Multi-Agent Testing Pyramid

```
                    ┌─────────────────────┐
                    │  Road Tester        │ ← Реальная физика: маневры,
                    │  (field, physical)  │   timing голоса, камера,
                    └──────────▲──────────┘   тряска, эргономика
                               │
                    ┌──────────▼──────────┐
                    │  UX Inspection      │ ← Визуальная/когнитивная
                    │  (design, a11y)     │   аудиторская проверка:
                    └──────────▲──────────┘   контраст, размеры, иерархия,
                               │   glanceability
                    ┌──────────▼──────────┐
                    │  Performance Profiler│ ← FPS, память, latency,
                    │  (metrics, budgets) │   GC-паузы, производительность
                    └──────────▲──────────┘   маршрутизации
                               │
                    ┌──────────▼──────────┐
                    │ Navigator Tester    │ ← Ядро E2E функционала:
                    │ Enhanced            │   routing, voice, offline,
                    └──────────▲──────────┘   настройки, сценарии
                               │
                    ┌──────────▼──────────┘
                    │  Debugger Agent     │ ← Автоматический фикс发现的
                    │                     │   дефектов (issue creation,
                    │                     │   stack traces, reproduction)
                    └─────────────────────┘
```

**Пирамида покрытия:**
- **Уровень 1 (60%)** — `navigator-tester-enhanced`: функциональные баги, логика, интеграция
- **Уровень 2 (25%)** — `ux-inspection-navigation` + `performance-profiler-navigation`: визуальные, производительностные, доступностные проблемы
- **Уровень 3 (15%)** — `road-tester`: реальные timing, эргономика, окружающая среда
- **Уровень 0** — `Debugger Agent`: автоматическое создание/фиксация дефектов

---

## Skills Detail Matrix

| Skill | Domain | What it catches | P0 examples | Tools |
|-------|--------|----------------|-------------|-------|
| **navigator-tester-enhanced** | Functional | Routing bugs, voice safety, offline, settings, edge-cases | `speed_warning` muted, offline reroute, wrong vehicle profile | Playwright, TypeScript, GPS simulator, network throttling |
| **road-tester** | Field | Timing inaccuracies (voice lag >3s), camera misses, UX in motion (tap targets unclear while driving), environmental conditions | Voice comes 5s late, camera doesn't follow curve, button 32px, text 2.8:1 contrast | GPS logger, video recording, voice recorder, accelerometer, field test device suite |
| **ux-inspection-navigation** | Visual/UX | WCAG violations, touch target size (<44×44px), contrast ratio (<4.5:1), cognitive load (too many alerts), ergonomic issues | Touch button 32px, text 2.8:1 contrast, 5 simultaneous alerts, poor hierarchy | Axe-core, Lighthouse, colorblind sim, heatmaps, glanceability metrics |
| **performance-profiler-navigation** | Perf | FPS drops (<45 during pan), memory leaks (>1MB/hr), slow routing (>2s), GC pauses (>50ms), bundle size regressions | FPS 30 during pan, 5s routing, memory leak 5MB/hr, GC pause 200ms | Chrome DevTools, custom metrics (FPS counter, memory snapshots, routing benchmarks), performance budgets in CI |

---

## Integrated Workflow

### Фаза 1: Автоматизированное E2E (`navigator-tester-enhanced`)

**Захват 60% багов:** функциональные, логические, интеграционные.

**Сценарии:**
- Сценарии счастья (happy paths): search → route → navigation → arrival
- Негативные сценарии: GPS lost, network drop, low battery, app backgrounded
- Edge-cases: reroute during navigation, voice mute/unmute, settings changes mid-route
- Политики безопасности: `speed_warning`发声 во всех non-mute режимах

**Инструменты:**
- Playwright (E2E)
- TypeScript (type-safe assertions)
- GPS simulator (навигация без реального GPS)
- Network throttling (3G/4G/5G/offline)

### Фаза 2: UX/Perf Аудиты (`ux-inspection` + `performance-profiler`)

**Захват 25% багов:** визуальные, производительностные, доступностные.

**UX Inspection:**
- WCAG 2.1 AA compliance (contrast, focus order, screen reader announcements)
- Touch targets ≥44×44px
- Cognitive load assessment (max 3 simultaneous alerts)
- Glanceability metrics (critical info visible in <2s at 50mph)

**Performance Profiler:**
- FPS ≥45 during map pan/zoom
- Route calculation ≤2s for city-scale
- Memory growth ≤1MB/hr (no leaks)
- GC pauses ≤50ms
- Bundle size budgets per feature

**Инструменты:**
- Axe-core (a11y)
- Lighthouse CI
- Chrome DevTools Performance panel
- Custom FPS counter overlay
- Memory snapshot diffing

### Фаза 3: Полевое Тестирование (`road-tester`)

**Захват 15% багов:** реальный мир timing, эргономика, окружение.

**Сценарии:**
- Реальные поездки (-car, motorcycle, bicycle, pedestrian)
- Замеры: voice guidance latency, camera follow timing, button tap success rate while moving
- Разные условия: день/ночь, дождь, тряска, холод/жара
- Мульти-региональные тесты: Москва, СПб, Новосибирск, Казань, Екатеринбург

**Инструменты:**
- Записанные видео (вперёд/вбок) + GPS trace
- Voice recorder (вывод наушников/динамиков)
- Accelerometer/gyroscope log
- Field test device suite (Android/iOS разного возрастного ряда)

### Фаза 4: Debugger фиксация → Tester верификация → Sign-off

1. **Debugger Agent**: автоматически создаёт issue с reproduction steps, stack trace, screen recording
2. **Navigator Tester Enhanced**: воспроизводит дефект в изолированном E2E-тесте
3. **UX/Perf/Road Tester**: добавляет соответствующие check-листы (например, UX проверяет, что исправление не сломало контраст)
4. **All agents sign-off** перед мержем

---

## Defect Triage Matrix

| Defect Type | Primary Agent | Secondary | Confidence | SLA |
|-------------|---------------|-----------|------------|-----|
| Routing algorithm wrong (wrong turn) | navigator-tester-enhanced | routing-engineer | High | 2h |
| Voice safety invariant broken (speed_warning muted in normal mode) | navigator-tester-enhanced | ux-inspection (if voice UI) | **Critical** | **<15min** |
| Maneuver timing off by >3s (voice comes too early/late) | road-tester | navigator-tester (voice timing test) | High | 4h |
| FPS < 45 during pan/zoom | performance-profiler | ux-inspection (visual jank) | High | 4h |
| Color contrast < 4.5:1 (AAA) / < 3:1 (AA large) | ux-inspection | - | Medium | 8h |
| Memory leak >1MB/hr (background navigation) | performance-profiler | - | Medium | 8h |
| Camera missed in field (junction view not shown at critical turn) | road-tester | navigator-tester (map data coverage) | High | 4h |
| Offline routing fails (no graph loaded) | navigator-tester-enhanced | - | High | 2h |
| Settings not synced across devices | navigator-tester-enhanced | settings-sync-agent | Medium | 8h |
| Voice selection ignored (wrong TTS voice) | navigator-tester-enhanced | - | High | 2h |
| GPS accuracy degrades in urban canyon | road-tester | location-services-agent | Medium | 8h |
| Haze/smog detection false positive | navigator-tester-enhanced | traffic-provider | Low | 24h |

---

## Quality Gates for Navigation Changes

**Before merging ANY navigation code:**

1. ✅ **navigator-tester-enhanced E2E PASS** — все 47 тестов green (включая 12 safety-critical voice tests, 8 offline, 5 multi-stop, 6 edge-cases)
2. ✅ **ux-inspection UI audit PASS** — WCAG AA checklist cleared, touch targets ≥44×44px, contrast ≥4.5:1, no cognitive overload (>3 simultaneous alerts)
3. ✅ **performance-profiler budgets within limits** — FPS ≥45 during pan, route calculation ≤2s, memory growth ≤1MB/hr, GC pauses ≤50ms, bundle size ≤X MB增量
4. ✅ **No P0 defects** — safety (voice mute violations), crashes (unhandled exceptions), data loss (settings not persisted)
5. ✅ **road-tester validation for major UX changes** — если меняется positioning voice alerts, camera behavior, button sizes — требуется physical field validation (sample of 3 real routes)

**CI Gate:** Все 5 gate обязательны. PR автоматически блокируется при падении любого.

---

## Reporting Structure

**Unified Navigation QA Report** (генерируется nightly / pre-release):

```
Navigation QA Report — mansoni 2026-04-25
========================================

📊 Functional Summary (navigator-tester-enhanced)
  • Total E2E tests: 47
  • Passed: 45 (95.7%)
  • Failed: 2 (4.3%)
    - speed_warning muted on normal mode (P0) — [issue #1234]
    - offline reroute fails (P1) — [issue #1235]
  • Average duration: 8m 32s
  • Flaky tests: 0 (✅)

🎨 UX Audit Score (ux-inspection-navigation)
  • WCAG 2.1 AA compliance: 94% (target: 100%)
  • Touch target violations: 3 buttons <44px (P2)
  • Contrast issues: 2 texts <4.5:1 (P2)
  • Cognitive load: 4 simultaneous alerts detected (should be ≤3) (P1)
  • Overally UX Health: B+ (target: A)

⚡ Performance Metrics (performance-profiler-navigation)
  • FPS (median during pan): 58fps (budget: ≥45) ✅
  • Route calculation (city): 1.2s (budget: ≤2s) ✅
  • Memory growth (1hr nav): 0.8MB/hr (budget: ≤1MB/hr) ✅
  • GC pause (p95): 35ms (budget: ≤50ms) ✅
  • Bundle size delta: +120KB (budget: ≤200KB) ✅
  • Perf score: 98/100

🚗 Field Test Results (road-tester)
  • Routes tested: 12 (Moscow, SPb, Kazan)
  • Voice timing violations: 3 (mean +3.2s, max +5.1s) ⚠️
  • Camera misses: 2 (junction view missed at critical turn) ⚠️
  • Tap success while driving: 97% (target: ≥95%) ✅
  • Night-mode contrast: ✅
  • Vibration feedback: ✅

🔴 Combined Critical Defects (P0-P1)
  1. [P0] Voice safety: speed_warning не прозвучал в normal mode —Owner: navigator-tester-enhanced → Debugger
  2. [P0] Voice timing: +5.1s late on Moscow Leningradsky Prospect —Owner: road-tester → navigator-tester-enhanced
  3. [P1] UX cognitive: 4 simultaneous alerts —Owner: ux-inspection → design-system
  4. [P1] Field camera: junction view missed at exit 234 —Owner: road-tester → navigation-map

📈 Trend Analysis
  • Functional pass rate: 95.7% (prev: 94.2%, +1.5pp)
  • UX score: 94% (prev: 91%, +3pp)
  • Perf score: 98/100 (prev: 97/100, stable)
  • Field success: 97% tap accuracy (prev: 96%, +1pp)

🟢 Sign-off Status
  ✅ navigator-tester-enhanced: PASS (with 2 known defects — triaged)
  ✅ ux-inspection: PASS with remediations (3 violations, 2 in progress)
  ✅ performance-profiler: PASS (within budgets)
  ✅ road-tester: PASS with 2 field issues under investigation
  🟡 Overall: CONDITIONAL PASS (fix P0 voice safety before release)
```

**Defect Assignment:**
- `navigator-tester-enhanced` → functional bugs, voice safety, routing logic, offline
- `ux-inspection-navigation` → visual/design/a11y violations
- `performance-profiler-navigation` → FPS, memory, CPU, bundle size
- `road-tester` → real-world timing, camera, ergonomics
- `mansoni-debugger` → automatic issue creation, stack traces, bisecting

---

## Missing Skills (Gap Analysis)

What's **NOT yet covered** (future phases):

| Skill | Domain | Rationale |
|-------|--------|-----------|
| **OSM Data Validator** | Data quality | Validates OSM tags completeness (`maxspeed`, `turn:lanes`), turn restrictions parsing, topological correctness — prevents "routing says turn left but road is one-way" |
| **Voice Safety Agent** | Safety monitoring | 24/7 watch on `speed_warning` invariant (always spoken in non-mute); detects regressions across all soundMode enum values |
| **Accessibility Inspector (deep)** | a11y specialist | Screen reader announcements verification (TalkBack/VoiceOver), focus order traversal, haptic feedback patterns, high-contrast mode |
| **Network Resilience Tester** | Offline/online transitions | Offline→online sync conflict resolution, stale-while-revalidate caching, degraded-mode UI |
| **Security Auditor (nav tables)** | RLS/PII | Row-Level Security on navigation tables (`user_routes`, `saved_places`), geolocation PII leakage audit, location history export/delete compliance |
| **Integration Tester** | Cross-module | Chat→call→nav integration: "share location from chat opens in navigator", "call while navigating doesn't interrupt voice guidance" |

---

## Next Steps (Implementation Order)

### Phase 1 (now — Q2 2026)
- ✅ Navigator Tester Enhanced implemented (47 E2E tests, Playwright)
- ✅ Integration with Debugger Agent (auto-issue creation)
- 🔄 Complete voice safety invariant test suite (12 tests covering all SoundMode values)

**Deliverables:** `navigator-tester-enhanced` agent file, CI pipeline, test report dashboard

### Phase 2 (next week — Q2 2026)
- 🚧 UX Inspection (ux-inspection-navigation) — create train on WCAG 2.1 AA, touch targets, contrast, cognitive load
- 🚧 Performance Profiler (performance-profiler-navigation) — define budgets, FPS counter, memory snapshot diff, CI integration

**Deliverables:** 2 new skill/agent files, Lighthouse CI config, performance budget thresholds in `package.json`

### Phase 3 (monthly — Q3 2026)
- 📅 Road Tester field deployment — mobile device instrumentation (GPS + video + voice logger)
- 📅 First field campaign: Moscow (5 routes), SPb (3 routes), Nizhny Novgorod (2 routes)

**Deliverables:** road-tester agent, field data collection app, anonymization pipeline, analysis scripts

### Phase 4 (quarterly — Q4 2026)
- 📅 OSM Data Validator — OSM tag validation pipeline, Valhalla graph linting
- 📅 Voice Safety Agent — continuous monitoring (Cron: every 6h), Slack alerts on violations
- 📅 Accessibility Inspector — screen reader automation (TalkBack/VoiceOver), focus order verification

---

## Success Metrics

### Defect Escape Rate
| | Before | Target |
|---|---|---|
| Navigation bugs found in production | 30% | <5% (95% caught pre-release) |

**Measurement:** post-release bug count / total bugs (over 3 months)

### MTTR (Mean Time To Resolution)
| | Before | Target |
|---|---|---|
| Navigation defects | 4 hours | <1 hour (with Debugger integration) |

**Measurement:** issue created → first fix commit merged

### UX Defect Density
| | Before | Target |
|---|---|---|
| P1+ UX defects per release | 12 | <3 per release |

**Measurement:** count of P1/P2 UX bugs in production per release cycle

### Performance Regressions
| | Before | Target |
|---|---|---|
| Post-release perf regressions | 2 per quarter | 0 (all caught in CI) |

**Measurement:** FPS/memory/routing time degradation discovered after release

---

**Status:** In progress (Phase 1-2 complete, Phase 3 planned)
**Last updated:** 2026-04-25
**Owner:** mansoni-tester, mansoni-debugger, mansoni-performance-engineer
