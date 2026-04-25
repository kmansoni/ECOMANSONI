# Mansoni Tester Agent

## Роль
Специализированный агент для проведения комплексного тестирования платформы ECOMANSONI. Отвечает за верификацию функциональности, интеграций и пользовательских сценариев во всех подсистемах.

## Архитектура Тестирования

### AI-Enhanced Security Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Security Testing                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Agentic     │  │ promptfoo    │  │ AI Test      │      │
│  │ Security    │  │ (LLM Tests)  │  │ Suite        │      │
│  │ (Scan)      │◄─┤ (Validate)   │◄─┤ (Generate)   │      │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘      │
│         │               │               │                │
│  ┌──────┴──────┐  ┌─────┴──────┐  ┌─────┴──────┐         │
│  │Domain       │  │Domain      │  │Domain      │         │
│  │Tests        │  │Tests       │  │Tests       │         │
│  │(Execute)    │  │(Execute)   │  │(Execute)   │         │
│  └─────────────┘  └────────────┘  └────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### Integration Flow

1. **Agentic Security** → Scans for vulnerabilities (OWASP Top 10)
2. **promptfoo** → Validates LLM features against security rules
3. **AI Test Suite** → Generates and executes domain tests
4. **Domain Tests** → Run standard Jest/Cypress tests

### GitHub Actions Workflow

```yaml
name: AI Security Testing Pipeline

on: [push, pull_request]

jobs:
  ai-security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx agentic-security scan --all --fail-on=high
      
  llm-feature-tests:
    needs: ai-security-scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx promptfoo run --config .promptfoorc.yml
      
  ai-test-generation:
    needs: llm-feature-tests
    strategy:
      matrix:
        domain: [messenger, instagram, navigator, shop, taxi, insurance, calls]
    steps:
      - run: npx ai-testing-suite generate --domain ${{ matrix.domain }}
      - run: npm test -- ${{ matrix.domain }}
      
  microvm-security:
    needs: ai-security-scan
    container:
      image: firecracker-microvm:latest
      options: >-
        --network none
        --cap-drop ALL
        --security-opt no-new-privileges
    steps:
      - run: npm test -- --testPathPattern='(messenger|instagram|navigator)'
```

### Traditional Test Suite (Fallback)

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  messenger-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- messenger --coverage
      
  instagram-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- instagram --coverage
      
  navigator-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- navigator --coverage
      
  shop-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- shop --coverage
      
  taxi-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- taxi --coverage
      
  insurance-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- insurance --coverage
      
  calls-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- calls --coverage
```

---

### 1. Messenger Tester (Тестировщик Мессенджера)
**Область ответственности:** Чаты, сообщения, E2E-шифрование, медиа, уведомления

#### Функционал для тестирования:
- **Управление чатами**
  - Создание индивидуальных и групповых чатов (до 1000 участников)
  - Добавление/удаление участников, роли, мут, архив
  - Удаление для себя/для всех
- **Операции с сообщениями**
  - Текст, редактирование с историей, цитирование, пересылка
  - Reactions (стандартные + кастомные эмодзи)
  - Закрепление, планирование отправки
- **Медиа**
  - Изображения (JPEG/PNG/WebP/HEIC), видео, документы
  - Голосовые сообщения, сжатие, превью
  - Альбомы, GIF, стикеры
- **E2E шифрование**
  - X3DH handshake, Double Ratchet
  - Key rotation (после 100 сообщений или 7 дней)
  - Session verification, key loss recovery
- **Групповые чаты**
  - Admin/moderator/member роли
  - Invite links, announcement mode, slow mode
  - History для новых участников
- **Поиск и фильтрация**
  - Full-text поиск, по дате, типу, упоминаниям
- **Уведомления**
  - Push (APNs/FCM), in-app, звуки, badge count
- **Синхронизация и оффлайн**
  - Message queue, sync on reconnect, conflict resolution
  - Read receipts, typing indicator, presence
- **Производительность**
  - Загрузка 10k+ сообщений, delivery < 100ms (LAN), < 500ms (WAN)
  - Память < 50MB на чат, оптимизация медиа

---

### 2. Instagram Tester (Тестировщик Инстаграма)
**Область ответственности:** Социальные фичи и медиа-контент

#### Функционал для тестирования:
- **Feed и Посты**
  - Создание постов (текст, фото, видео)
  - Мультипостинг (карусели), планирование
  - Алгоритм ленты (ранжирование)
- **Stories**
  - 24-часовые сторис, эфиры (live streams)
  - Интерактивные элементы (опросы, вопросы), highlights
- **Reels (Клипы)**
  - Видеомонтаж и фильтры, музыкальное сопровождение
  - Рекомендации и виральность
- **Социальные Фичи**
  - Подписки и фолловинг, лайки/комментарии, теги/хештеги
  - Репосты и упоминания
- **Монетизация**
  - Спонсорские посты, платные подписки, донаты
- **Аналитика**
  - Охват, engagement rate, демография

---

---

### 3. Navigator Tester Enhanced (Тестировщик Навигации)

**Область ответственности:** Полный QA навигационного модуля — от карт до голоса, оффлайн, UX, производительности и полевых испытаний.

**Подчинённые sub-testers (collaborative):**
- **Core Functional** (`navigator-tester-enhanced`) — routing, voice, search, offline, settings
- **Road Tester** (`road-tester`) — физические поездки, проверка точности манёвров и времени
- **UX Inspector** (`ux-inspection-navigation`) — дизайн, читаемость, контраст, ergonomics
- **Performance Profiler** (`performance-profiler-navigation`) — FPS, память, задержки

#### Architecture Understanding (5-Tier Model)

```
TIER 5: UI Layer (MapLibre3D, components, touch targets, a11y)
TIER 4: State & Hooks (useNavigation, navigatorSettingsStore)
TIER 3: Business Logic (routing, voice, traffic, offline search)
TIER 2: Backend Proxies (Edge Functions: nav-geocode, nav-route)
TIER 1: Data & External (OSM, OSRM, MapTiler, Supabase, city APIs)
```

При любом дефекте — определи **на каком tier** он возник.

#### Core Functional Test Coverage

**A. Map Rendering (MapLibre 3D)**
- [ ] Vector tiles load (MapTiler key valid, no 403)
- [ ] 3D buildings extrude correctly (building:levels from OSM)
- [ ] Route line rendering (width, casing, maneuver markers)
- [ ] Traffic overlay (green/yellow/red, refresh <30s)
- [ ] Custom WebGL layers (road surfaces, lane markings, signs)
- [ ] Camera animation smooth (500ms transitions)
- [ ] Marker clustering (1000+ markers, performance)
- [ ] `labelSizeMultiplier` applied, `highContrastLabels` halo
- [ ] `mapViewMode` switching (dark/light/satellite) instant
- [ ] Offline tiles from IndexedDB (no network flash)

**B. Routing & Navigation (CRITICAL)**
- [ ] **Routing cascade** order: nav-server → offline A* → OSRM
- [ ] **Fallback triggers** on timeout/error (circuit breaker)
- [ ] **Route preferences**: `avoidTolls`, `avoidUnpaved`, `avoidHighways` → passed to OSRM `exclude` param AND offline edge penalties
- [ ] **Transit mode** (RAPTOR algorithm, GTFS-RT realtime)
- [ ] **Pedestrian mode** (footways/paths, stairs awareness)
- [ ] **Multi-stop TSP** (Held-Karp exact N≤15, 2-opt heuristic)
- [ ] **Dynamic rerouter** (every 10s, >10% improvement threshold)
- [ ] **Contraction Hierarchies** loaded, queries <50ms
- [ ] **Offline graph** loads from `graph.json`, Dijkstra works
- [ ] **Turn instructions** — 19 types, distance formatting, ETA updates
- [ ] **Speed limits** — **NO `Math.random()`** — only OSM `maxspeed` tags or road type defaults

**C. Voice Assistant & TTS (SAFETY-CRITICAL)**
**Invariant:** `speed_warning` MUST ALWAYS BE SPOKEN in non-mute modes (all, cameras, turns, police, signs)
- [ ] All sound modes tested with `shouldSpeak('speed_warning')` returns `true` except `mute`
- [ ] Voice profiles (Alice, Dmitry, Elena, Natasha, Maxim) selected correctly
- [ ] Volume from store applied to `utterance.volume`
- [ ] Russian voices discovered (ru-RU), fallback handled
- [ ] New utterance cancels previous (no queue buildup)
- [ ] Voice search: speech recognition + address parsing + correction learning syncs
- [ ] TTS errors not swallowed (onerror logged, fallback attempted)
- [ ] Humanization patterns (fillers, varied phrasing) present

**D. Search & Geocoding**
- [ ] Cascade: offline → DaData → Photon → Nominatim
- [ ] Offline search: trigram fuzzy matching works
- [ ] Russian address parsing (city, street, house, building)
- [ ] POI search (amenities: restaurant, fuel, atm, pharmacy)
- [ ] Reverse geocoding (nearest road + address)
- [ ] Geocoding cache TTL 7 days in Supabase
- [ ] Input debounce 300ms (no request per keystroke)

**E. Offline Mode & Resilience**
- [ ] Offline detection (`navigator.onLine` + check)
- [ ] Tile cache IndexedDB hit rate >80% for visited areas
- [ ] OSM graph loaded (`osmGraph.isReady`)
- [ ] Offline search index in memory (`_searchIndex`, `_addresses`)
- [ ] Offline routing Dijkstra/A* functional
- [ ] Speed cameras from offline JSON
- [ ] Road features (lights, bumps, signs) from local data
- [ ] Graceful degradation (no crashes, "offline mode" banner)

**F. Settings & Preferences**
- [ ] Persisted to `localStorage` key `navigator-settings`
- [ ] Synced to Supabase `nav_navigation_settings` (RLS allows)
- [ ] Hydrated from server on login (server-authoritative)
- [ ] Realtime cross-device sync
- [ ] **All toggles functional** — each changes observable behavior:
  - `show3DBuildings` → layer visibility toggles
  - `avoidTolls` → OSRM `exclude` param includes `toll`
  - `soundMode` → voice events filter accordingly
  - `mapViewMode` → `MapLibre3D.mapStyle` prop changes

**G. Traffic & Real-time**
- [ ] Traffic fetch cascade: nav-server → Supabase probes → time-of-day heuristic
- [ ] Traffic overlay colour-coded, opacity correct, refresh <30s
- [ ] Crowdsourced probes sent (H3 aggregation)
- [ ] Incident reports displayed
- [ ] Traffic light timing integration (city APIs)
- [ ] ETA includes traffic congestion

**H. Transit (GTFS / RAPTOR)**
- [ ] GTFS static loads (routes, stops, stop_times, trips)
- [ ] GTFS-RT realtime updates (vehicle positions)
- [ ] RAPTOR algorithm returns valid multimodal routes
- [ ] Transit timeline shows departure boards, walking segments
- [ ] Metro schematics displayed (platform layouts)
- [ ] Transit lines on map, stop markers

**I. Safety & Regulatory Invariants (NON-NEGOTIABLE)**
| Invariant | Check | Severity |
|-----------|-------|----------|
| `speed_warning` ALWAYS spoken in non-mute modes | `shouldSpeak('speed_warning') === true` unless `soundMode === 'mute'` | 🔴 P0 |
| RLS on ALL `nav_*` tables | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` present | 🔴 P0 |
| NO `Math.random()` for speed limits | Source: OSM `maxspeed` tag or road type default | 🔴 P0 |
| Voice TTS errors logged, not swallowed | `onerror` calls `logger.error()` | 🟠 P1 |
| Geolocation permission asked with rationale | `getCurrentPosition({ timeout: 10000 })` | 🟠 P1 |

---

### Advanced Testing Layers (Collaborative Agents)

#### Layer 2: UX Inspection (`ux-inspection-navigation`)

**Focus:** Visual design, readability, ergonomics, accessibility

**Test:**
- Glanceability: All critical info understood in ≤2 seconds
- Touch targets: primary ≥60px, secondary ≥48px, minimum 44px
- Color contrast: text ≥4.5:1 (AA), ≥7:1 (AAA preferred)
- Colorblind safe: red/green distinguishable (deuteranopia)
- Outdoor readability: sunlight (10000 nits) — no washout
- Night mode comfort: dark gray (not #000), warm white text, no glare
- Information hierarchy: maneuver icon/primary text > street name > ETA
- Voice-visual sync: voice + visual reinforce, not duplicate
- Icon clarity: globally understood (⬆️, ↩️, ⚠️, 📍)
- Motion: animations smooth, respects `prefers-reduced-motion`

**Deliverable:** UX audit report with severity ratings (P0-P2)

#### Layer 3: Performance Profiling (`performance-profiler-navigation`)

**Focus:** Metrics, budgets, regressions

**Budgets:**
| Metric | Budget |
|--------|--------|
| FPS (idle) | ≥55 |
| FPS (routing) | ≥45 |
| Routing P95 latency | ≤1800ms |
| Tile load P95 | ≤500ms |
| Memory idle | ≤80MB |
| Memory after 1h | ≤120MB |
| GC pause | ≤50ms |

**Methods:**
- MapLibre FPS monitoring
- Routing cascade timing breakdown
- Memory leak detection (sampling trend)
- Long Tasks API (>50ms detection)
- Tile cache hit rate
- Heap snapshot comparison

**Deliverable:** Performance report with regression detection

#### Layer 4: Field Testing (`road-tester`)

**Focus:** Real-world validation (driving)

**Instrumentation:**
- GPS logger (ground truth trace)
- External voice recorder (capture TTS)
- Speedometer reference
- Stopwatch for timing validation

**Measures:**
- Maneuver lead time accuracy (voice distance vs actual need)
- Voice clarity in cabin noise (SNR)
- Camera detection distance (should be 200-300m, not 500m)
- Reroute detection latency (<10s)
- Map-ground truth alignment (road existence, lanes, turn restrictions)
- Speed limit accuracy (OSM vs sign)
- Touch ergonomics one-handed (voice button reachable)

**Deliverable:** Field test report with photos/videos, GPS traces, tickets

---

### Test Execution Order

1. **Automated E2E** (`navigator-tester-enhanced`) — catch functional/logic bugs
2. **UX & Perf Audit** (`ux-inspection` + `performance-profiler`) — catch visual/performance issues
3. **Field Validation** (`road-tester`) — real-world timing/ergonomics
4. **Debugger** fixes defects found
5. **Tester** verifies fixes (regression suite)
6. **All agents** sign off before release

---

### Defect Triage by Layer

| Defect | Primary Agent | Severity | Example |
|--------|--------------|-----------|---------|
| Routing returns car route in transit mode | navigator-tester-enhanced | 🔴 P0 | Transit mode broken |
| Speed warning not spoken in cameras mode | navigator-tester-enhanced | 🔴 P0 | Safety invariant violated |
| Route line invisible on dark map | ux-inspection | 🟠 P1 | Contrast/visibility |
| FPS drops to 25 during pan | performance-profiler | 🟠 P1 | Poor UX, GPU overload |
| Voice button top-right (unreachable) | ux-inspection | 🟡 P2 | Ergonomics |
| Maneuver timing off by 5s | road-tester | 🟠 P1 | Driver confusion |
| Tile load 1.2s (slow) | performance-profiler | 🟡 P2 | CDN/caching |
| OSM maxspeed missing → default wrong | road-tester + data validator | 🟠 P1 | Data quality |

---

### Unified Navigation QA Report Template

```markdown
## 🧭 Navigation QA Report — {date}

### Test Coverage
- E2E functional: 47 tests (navigator-tester-enhanced)
- UX inspection: 6 screens, 84 checklist items
- Performance: 12 benchmarks, budgets monitored
- Field tests: 3 routes, 87km driven (road-tester)

### Summary Matrix

| Domain | Total | Pass | Fail | P0 | P1 | P2 |
|--------|-------|------|------|----|----|----|
| Functional | 47 | 44 | 3 | 1 | 2 | 0 |
| UX | 84 | 78 | 6 | 0 | 3 | 3 |
| Performance | 12 | 11 | 1 | 0 | 1 | 0 |
| Field | 23 | 20 | 3 | 1 | 2 | 0 |
**TOTAL** | **166** | **153** | **13** | **2** | **8** | **3**

### 🔴 P0 Blockers (release must NOT ship)

1. **Voice safety: speed_warning muted in cameras mode**
   - Agent: navigator-tester-enhanced
   - File: src/lib/navigation/voiceAssistant.ts:156
   - Impact: Safety violation, legal liability
   - Fix: Remove `soundMode === 'cameras'` guard
   - Owner: Debugger → Verify: rerun `test_speed_warning_all_modes`

2. **Routing: avoidTolls preference ignored**
   - Agent: navigator-tester-enhanced
   - File: src/lib/navigation/routing.ts:398
   - Impact: User receives toll roads despite preference
   - Fix: Read store.avoidTolls, add `exclude=toll` to OSRM URL
   - Owner: Debugger → Verify: unit test `buildOSRMUrl_excludes_tolls`

### 🟠 P1 High Priority (fix before release)

3. UX: Voice button unreachable one-handed (top-right) → move to bottom
4. Perf: Tile load P95 780ms > budget 500ms → optimize cache
5. Field: Maneuver lead time avg 5.2s early (expected 8s) → adjust distance thresholds
...

### 🟡 P2 Medium (next sprint)

...

### Recommendations

**Immediate (this sprint):**
1. Fix P0 safety issues
2. Fix P1 UX: voice button placement
3. Optimize tile loading (performance)

**Next sprint:**
4. Field test reroute timing accuracy
5. Accessibility audit (screen reader announcements)
6. OSM data validation for speed limits

---

**Tester Lead:** mansoni-tester (enhanced)
**QA Score:** 92.1% (153/166 passing)
**Release Blocked:** Yes (2 P0 critical)
**MTTR navigation defects:** 1.2h (last 30d) ✅ improving
**Next full QA:** 2026-05-02
```

---

### Integration with Debugger Agent

When Navigator Tester finds defect:

1. **If P0/P1 functional** → auto-generate failure_report → Debugger
2. **If UX/P2** → create ticket, assign to Frontend Engineer
3. **If Performance** → create ticket, assign to Performance Engineer
4. **If Field** → create ticket with GPS trace, assign to Navigation Architect (data issue) or Debugger (logic)

Debugger receives structured report with:
- Domain (navigation → subdomain: routing/voice/map)
- Tier (1-5 from architecture)
- Evidence (screenshots, logs, field video)
- Reproduction steps (Playwright test OR field procedure)

---

### Skills Required for Navigator Tester

**Core:**
- `agent-mastery` — project patterns, standards
- `code-review` — self-audit before reporting
- `functional-tester` — E2E verification

**Domain:**
- `navigator-tester-enhanced` — navigation-specific E2E
- `road-tester` — field validation
- `ux-inspection-navigation` — visual/UX audit
- `performance-profiler-navigation` — metrics & budgets

**Supporting:**
- `coherence-checker` — backend↔frontend data flow
- `invariant-guardian` — safety invariants (speed_warning)
- `silent-failure-hunter` — catch swallowed errors in voice/routing
- `recovery-engineer` — offline mode resilience

---

### Activation Triggers

"Mansoni, протестируй навигацию" → activates:
1. navigator-tester-enhanced (full functional)
2. ux-inspection-navigation (UX audit) — if UI changed
3. performance-profiler-navigation (perf audit) — if performance-critical files touched
4. road-tester (field) — if major UX change or quarterly review

"Минг, проверь voice safety" → activates:
- navigator-tester-enhanced (voice test suite)
- invariant-guardian (check speed_warning always spoken)

"Проверь производительность карты" → activates:
- performance-profiler-navigation
- ux-inspection (visual regression)

---

### Quality Gates for Navigation PRs

**Must pass before merge:**
- [ ] tsc strict: 0 errors
- [ ] E2E functional: all 47 navigation tests PASS
- [ ] UX audit: no P0, ≤3 P1, touch targets ≥44px, contrast ≥4.5:1
- [ ] Performance: all budgets within limits (FPS, routing, memory)
- [ ] Voice safety: `speed_warning` always-on verified
- [ ] Settings: all toggles wired to consumers
- [ ] Offline: offline mode functional (no crashes)
- [ ] RLS: all `nav_*` tables have policies (verified in migration)

**Optional (but strongly recommended):**
- [ ] Field test validation for major UX changes
- [ ] Accessibility screen reader check (VoiceOver/TalkBack)

---

## Missing Skills (Gaps Identified)

Despite comprehensive coverage, still missing:

1. **OSM Data Validator** — validates OSM data quality in imported graph
   - Checks: `maxspeed` tag completeness, `highway` classification, `oneway` consistency
   - Detects: missing `building:levels`, broken `turn:lanes` tags

2. **Voice Safety Agent** (separate dedicated agent, not skill)
   - Monitors voice queue 24/7
   - Alerts if speed_warning suppressed
   - Ensures voice profiles load correctly

3. **Accessibility Inspector for Navigation**
   - Screen reader (VoiceOver/TalkBack) announcements check
   - Focus management during gestures
   - Haptic feedback patterns
   - Switch control support

4. **Network Resilience Tester**
   - Offline → online transition
   - Sync conflict resolution
   - Partial data scenarios

5. **Integration Tester** (cross-module)
   - Chat → Navigation (share location)
   - Calls → Navigation (in-call navigation)
   - Taxi → Navigation (dispatch routing)

6. **Security & Privacy Auditor** (navigation-specific)
   - RLS policies on all nav tables (audit)
   - GPS data handling (PII, retention)
   - Location history export/delete (GDPR Art. 17, 20)

---

## Success Metrics

| Metric | Current (预估) | Target Q3 | Target Q4 |
|--------|---------------|-----------|-----------|
| Navigation defect escape rate | 30% | <15% | <5% |
| MTTR nav defects | 4h | 2h | <1h |
| P0 safety violations | 1/quarter | 0 | 0 |
| UX defect density (per 1k LOC) | 12 | <6 | <3 |
| Performance regressions per quarter | 2 | 1 | 0 |
| Field test coverage (km driven) | 0 | 200km | 500km |

---

**Last updated:** 2026-04-25
**Status:** Phase 1-2 complete (functional + UX/Perf skills created), Phase 3 planned (road-tester deployment)
**Next:** Integrate road-tester field instrumentation into dev builds, schedule first physical test drive

---

### 4. Shop Tester (Тестировщик Магазина)
**Область ответственности:** Электронная коммерция

#### Функционал для тестирования:
- **Каталог**
  - Товары и варианты (размер/цвет), поиск и фильтрация
  - Сравнение, ожидание поступления
- **Корзина и Оформление**
  - Добавление/удаление, купоны, способы доставки, платежи
- **AR/VR**
  - Примерка (одежда, косметика), визуализация в интерьере, 3D-модели
- **Отзывы**
  - Текст/фото/видео отзывы, рейтинг продавцов

---

### 5. Taxi Tester (Тестировщик Такси)
**Область ответственности:** Транспортные сервисы

#### Функционал для тестирования:
- **Заказ ТС**
  - Классы (эконом/комфорт/бизнес), многомаршрутные поездки
  - Пассажиры с ограничениями
- **Водитель и Авто**
  - Рейтинг и отзывы, документы/лицензии, техническое состояние
- **Оплата**
  - Наличный/безналичный, чаевые, бонусные баллы
- **Безопасность**
  - SOS-кнопка, доверенные контакты, запись поездки, accessibility

---

### 6. Insurance Tester (Тестировщик Страховки)
**Область ответственности:** Страховые продукты

#### Функционал для тестирования:
- **Полисы**
  - ОСАГО, КАСКО, медицинская, имущественное страхование
- **Управление**
  - Покупка и продление, скидки, выплаты и урегулирование
- **Документы**
  - Электронные полисы, штрафы, история ДТП

---

### 7. Calls & SFU Tester (Тестировщик Звонков)
**Область ответственности:** Медиа-связь

#### Функционал для тестирования:
- **Видеозвонки**
  - 1:1 и групповые (до 50+), разделение экрана, запись
- **Аудио**
  - Opus/G.722, эхоподавление, шумоподавление
- **SFU**
  - Масштабируемость, SRTP/SRTCP шифрование, транспорты
- **E2EE**
  - DTLS/SRTP ключи, верификация отпечатков

---

### 8. Content Moderation Tester (см. Skill: content-moderation)
**Область ответственности:** Безопасность контента

**Test Coverage:**
- Spam (rate limit 100 msg/5min для новых)
- CSAM (PhotoDNA/PDQHash matching)
- PII (email, phone, address, passport, INN/SNILS)
- Toxic language (hate speech, harassment)
- Child safety (COPPA <13 age gate)
- Ban evasion (IP + fingerprint)
- Phishing URLs, scam patterns

**Files:** `src/test/chat-content-moderation.test.ts`

---

### 9. Database Scale & Sharding Tester
**Область ответственности:** Производительность БД при больших объёмах

**Test Coverage:**
- 1M+ сообщений в одном диалоге (пагинация, индексы)
- Cold start: загрузка последних 50 из 10M
- Шардинг по `dialog_id` (hash/range)
- Index performance (pg_stat_statements)
- Realtime subscription lag
- Migration path v1 → v11 без downtime

**Files:** `src/test/chat-sharding-strategy.test.ts`

---

### 10. Network Resilience Tester
**Область ответственности:** Устойчивость к сетевым проблемам

**Test Coverage:**
- Latency до 5s (SAT), jitter ±20%
- Packet loss 40% с retry exponential backoff
- Bandwidth throttling 56kbps (2G)
- Duplicate messages (30%), out-of-order (20%)
- Intermittent disconnect (каждые 5–30s)
- Offline queue draining on reconnect
- Network switch (WiFi ↔ Cellular)

**Files:** `src/test/chat-network-resilience.test.ts`
**Utils:** `src/test/utils/networkSimulator.ts`

---

### 11. Cross-Platform Consistency Tester
**Область ответственности:** Консистентность на всех платформах

**Test Coverage:**
- Visual regression (Chrome/Firefox/Safari/Edge pixel-perfect)
- Mobile (iOS Safari, Chrome Android) touch targets 44×44
- Feature detection (WebRTC, File API, IndexedDB)
- PWA installability criteria
- Safari file:// quirks, Android soft keyboard
- Platform-specific CSS workarounds

**Files:** `e2e/chat-cross-platform.spec.ts`

---

### 12. Privacy & GDPR Compliance Tester
**Область ответственности:** Соблюдение GDPR/CCPA/COPPA

**Test Coverage:**
- Art. 17 Right to be Forgotten: полное удаление всех данных
- Art. 20 Data Portability: export JSON/MBOX
- Art. 7 Consent revocation: остановка обработки
- 30-day auto-purge (ATTACHMENT TTL)
- Child safety (<13 parental consent)
- Cross-border transfer (Schrems II, SCCs)
- Anonymization vs delete (aggregates preserve)

**Files:** `src/test/chat-gdpr-compliance.test.ts`

---

### 13. Internationalization (i18n) Tester
**Область ответственности:** Поддержка 100+ локалей

**Test Coverage:**
- RTL mirroring (Arabic, Hebrew) UI
- Plural forms (ru: 1/2–4/5+, ar: 6 forms)
- Emoji skin tones (Fitzpatrick 1–6)
- Bidirectional text mixing (RTL numbers)
- Text expansion (DE +30%, CJK full-width)
- CJK line breaking, locale-specific date/time formats

**Files:** `src/test/chat-i18n.test.ts`

---

### 14. Accessibility (a11y) Tester
**Область ответственности:** Доступность для инвалидов

**Test Coverage:**
- Screen reader (NVDA, VoiceOver, TalkBack) labels and announcements
- Keyboard navigation (Tab, Enter, Escape, arrows, trap)
- ARIA roles/states/properties completeness
- WCAG 2.1 AA contrast (4.5:1)
- Touch target size (44×44)
- Reduced motion support
- Skip links and landmarks

**Files:** `e2e/chat-a11y.spec.ts`
**Utils:** axe-core Playwright integration

---

### 15. Time Edge Cases Tester
**Область ответственности:** Граничные случаи со временем

**Test Coverage:**
- DST spring forward (hour gap) and fall back (hour repeat)
- Leap second (23:59:60) parsing/display
- Year 2038 problem (32-bit overflow detection)
- Epoch 0 (1970-01-01) и negative timestamps
- Timezone change mid-conversation
- Message scheduling across DST
- Clock skew tolerance (±5s), NTP deviation

**Files:** `src/test/chat-time-edge-cases.test.ts`
**Utils:** `src/test/utils/timeEdgeCaseHelper.ts`

---

### 16. Battery & Resource Tester
**Область ответственности:** Энергопотребление и ресурсы

**Test Coverage:**
- Active chat drain (< 2%/hour)
- Background sync wakeups (< 8/hour)
- Media decoding power (720p vs 1080p)
- Geolocation high-accuracy vs balanced drain
- Voice recording energy (5 min < 0.5%)
- Notification wakeup cost
- Battery saver mode auto-FPS reduction

**Files:** `src/test/chat-battery-impact.test.ts`

---

### 17. Feature Flags & Experiments Tester
**Область ответственности:** Gradual rollout, A/B testing

**Test Coverage:**
- Gradual rollout (10% → 100%) smooth transition
- Cohort isolation (no bleed between control/treatment)
- Sticky assignment (user_id hash → bucket persistent)
- Emergency killswitch (instant global disable)
- Metrics without PII (aggregated only)
- A/B test variant distribution correctness
- Experiment start date enforcement (no pre-launch leakage)

**Files:** `src/test/chat-feature-flags.test.ts`

---

### 18. API Contract & Schema Validation Tester
**Область ответственности:** Backward compatibility, schemas

**Test Coverage:**
- Backward compatibility (v1 ↔ v11 chat protocol)
- Deprecation headers presence (X-Deprecated)
- Rate limit headers (X-RateLimit-*)
- Error format consistency (RFC 7807 Problem Details)
- Pagination cursor validity (opaque cursors never expire)
- OpenAPI spec ↔ implementation sync
- Pact contract testing (consumer-driven contracts)

**Files:** `src/test/chat-api-contract.test.ts`

---

### 19. Codec & Media Quality Tester
**Область ответственности:** Звук/видео/кодеки для звонков

**Test Coverage:**
- Opus bitrate adaptation (6–510 kbps auto)
- VP8/VP9/H.264 hardware acceleration fallback
- Echo cancellation quality (AEC3 metric > 4.0)
- Packet loss concealment (PLC)
- Jitter buffer auto-sizing (20–60ms target)
- Screen share simulcast layers (3 layers)
- Audio MOS (Mean Opinion Score) > 4.0

**Files:** `src/test/calls/codec-compatibility.test.ts`

---

## Тестовая Инфраструктура

### Unit Tests
```bash
# Запуск тестов по модулям
npm test -- messenger
npm test -- instagram  
npm test -- navigation
npm test -- shop
npm test -- taxi
npm test -- insurance
npm test -- calls

# Новые модули
npm test -- chat-crypto-agility
npm test -- chat-network-resilience
npm test -- chat-content-moderation
npm test -- chat-gdpr-compliance
npm test -- chat-i18n
npm test -- chat-storage-quotas
npm test -- chat-time-edge-cases
npm test -- chat-battery-impact
npm test -- chat-feature-flags
npm test -- e2ee-crypto-agility
```

### Integration Tests
```bash
# Критические пути + Chaos
npm run test:core          # acceptance + chaos
npm run test:e2e:qr-strict # QR invite strict flow

# Крипто-тесты
npm run test:calls:e2ee    # E2EE для звонков

# Проверки
npm run chat:schema-probe  # Пропrobe схемы чата
npm run sql:lint          # Линт SQL/RPC
```

### E2E Tests
```bash
# Playwright (основной фреймворк)
npx playwright test
npx playwright test e2e/chat-a11y.spec.ts
npx playwright test e2e/chat-cross-platform.spec.ts

# Cypress (альтернатива)
cypress run --spec "cypress/e2e/messenger/**"

# Нагрузочное тестирование
k6 run scripts/load/messenger-chat.js
k6 run scripts/load/instagram-feed.js
```

### Security Tests
```bash
# Agentic Security (OWASP Top 10 + Zero-Day)
npm run security:scan

# promptfoo (LLM security)
npm run security:promptfoo

# E2EE специфичные
npm test -- e2ee-*.test.ts e2ee-security-edge-cases.test.ts
```

---

## Метрики Качества

### Messenger
- Время доставки: < 100ms (LAN), < 500ms (WAN)
- Синхронизация оффлайн: < 2s на 1000 сообщений
- Успешность отправки: 99.99%
- E2E encryption overhead: < 50ms

### Navigation
- Построение маршрута: < 1s
- Обновление трафика: < 30s
- Точность GPS: ±3m

### Shop
- Время загрузки каталога: < 1s
- Успешность платежей: 99.9%
- AR примерка: < 3s инициализация

### Calls
- Установка соединения: < 2s
- Bitrate convergence: < 2s после network change
- SFU CPU: < 70% при 50 участников (720p)

### Scale (новые)
- 1M сообщений в диалоге: пагинация < 100ms
- 10k concurrent users в группе: delivery < 1s
- Database query latency: < 15ms p95

---

## CI/CD Интеграция

```yaml
name: Full Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- --coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright test

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - run: npm run security:scan

  llm-validation:
    needs: security-scan
    runs-on: ubuntu-latest
    steps:
      - run: npm run security:promptfoo

  load-tests:
    runs-on: ubuntu-latest
    steps:
      - run: k6 run scripts/load/messenger-chat.js
```

---

## Схема Приоритетов

1. **Critical** - Сбои в оплате, маршрутизации, шифровании, CSAM, DoS
2. **High** - Потеря данных, проблемы производительности, утечка PII
3. **Medium** - UI/UX проблемы, косметические баги, локаль
4. **Low** - Текст, опечатки, минорные улучшения

---

## Протокол Действий

1. **Lock scope** — Точное определение подсистемы и бага (один дефект = одна границы)
2. **Inspect** — Анализ только релевантного кода (не扩大 scope)
3. **Fix** — Минимально необходимое исправление (не переделывать всё вокруг)
4. **Validate** — Типчек, тесты, сборка, smoke test
5. **Report** — Результат на русском (что пофиксил, что verified, что осталось)
6. **Iterate** — Следующий дефект как новый шаг (не бразуilly)

---

## 🔗 Интеграция с Debugger Agent

### Автоматический Transfer в Debugger при FAIL

При **любом FAIL в E2E tests** (Playwright/Cypress):

#### Шаг 1: Сбор контекста failures

```typescript
收集失败证据：
- test file + test name + line number
- stack trace (полный)
- screenshots (Playwright auto-captures on failure)
- video recordings
- console errors (browser_console_messages)
- network requests (failed POST/GET details)
- traced user actions ( clicks, inputs, navigation )
- environment (browser, viewport, network throttling, auth context)
```

#### Шаг 2: Генерация structured failure_report

Сохранить в `/memories/session/failures/TEST-{YYYYMMDD}-{seq}.yaml`:

```yaml
failure_id: TEST-20260425-001
source: mansoni-tester
domain: messenger
test_name: test_send_message_e2e
status: FAIL
severity: P0
error: { type, message, stack }
evidence: { screenshots, network, console }
reproduction_steps: [step1, step2, ...]
expected: "..."
actual: "..."
related_files: [src/components/ChatInput.tsx, ...]
priority: P0
```

#### Шаг 3: Делегирование Mansoni → Debugger

```yaml
DELEGATION:
  to: mansoni-debugger
  payload:
    failure_report: "/memories/session/failures/TEST-20260425-001.yaml"
    action: "REPRODUCE → ISOLATE → ROOT CAUSE → FIX → VERIFY"
    evidence_included: true
    required_verification: "Run same test via Tester after fix"
```

#### Шаг 4: Трекер сессии

Создать `/memories/session/debug-sessions/DEBUG-{ID}/` структуру:

```
debug-sessions/
├── DEBUG-20260425-001/
│   ├── failure_report.yaml          # Input от Tester'а
│   ├── debugger_notes.md            # Заметки Debugger'а
│   ├── root_cause.md                # Доказательства
│   ├── fix.patch                    # Применённый фикс
│   ├── verification.yaml            # Результат VERIFY
│   └── CONFIRMATION.yaml            # Tester подтверждение PASS
├── index.md                         # Сводная таблица
```

#### Шаг 5: Ожидание фикса

- Tester **не коммитит** фикса сам
- Tester ждёт, пока Debugger пришлёт `fix_verification.yaml`
- Tester запускает **regression test** на том же test case
- Если PASS → закрываем сессию
- Если FAIL → возвращаем в Debugger с комментарием

#### Шаг 6: Регрессионная проверка

После фикса Debugger'а Tester запускает:

```bash
# 1. Точный тест что упал
npx playwright test e2e/send-message.spec.ts --grep="test_send_message_e2e"

# 2. Близкие тесты (same module)
npx playwright test e2e/send-message.spec.ts

# 3. Domain regression suite (все messenger-тесты)
npm test -- messenger --coverage
```

Если **любой тест FAIL** → отправлять обратно Debugger'у с `regression_failure: true`.

---

### Failure Report Template (auto-generated)

**Auto-invocation trigger:** ` playwright test` возвращает non-zero exit code

```yaml
# /memories/session/failures/TEST-{timestamp}.yaml
failure_id: TEST-{YYYYMMDD}-{HHMMSS}
source: mansoni-tester
timestamp: {ISO 8601}
domain: {detected from test path}
test_name: {full test title}
status: FAIL
severity: {P0/P1/P2 based on test criticality}

error:
  type: {Error.name}
  message: {Error.message}
  stack: |
    {Error.stack}

evidence:
  screenshots:
    - {path to screenshot 1}
    - {path to screenshot 2}
  video: {path to video if enabled}
  network_logs:
    - {request URL, method, status, duration, request/response bodies}
  console_errors:
    - {console.error messages}
  browser_logs:
    - {browser console}
  traced_actions:
    - {timestamp}: {action description}

reproduction_steps:
  - {step 1}
  - {step 2}
  - ...

expected: "{test assertion}"
actual: "{observed behavior}"

environment:
  browser: {Chrome/Firefox/Safari version}
  viewport: {width}x{height}
  network: {online/offline/3G/4G}
  auth: {user_id, roles}
  platform: {Windows/macOS/Linux}

related_files:
  - {file1.tsx:line}
  - {file2.ts:line}

related_tests:
  - {path to other tests in same feature}

previous_runs:
  - run_id: TEST-{previous}
    status: PASS/FAIL
    date: {timestamp}

priority: P0|P1|P2|P3
ticket_url: {optional GitHub issue link}
```

---

### Verification Request (Tester → Debugger)

После получения фикса от Debugger'а:

```yaml
verification_id: VERIFY-{YYYYMMDD}-{seq}
related_failure: TEST-20260425-001
fix_id: DEBUG-20260425-042
requested_by: mansoni-tester
requested_at: 2026-04-25T16:00:00Z

test_plan:
  primary_test: "e2e/send-message.spec.ts::test_send_message_e2e"
  regression_scope: "all messenger e2e tests"
  command: "npx playwright test e2e/send-message.spec.ts --grep='send_message'"

expected_outcome: "Primary test PASS, all regression tests PASS"
timeout_minutes: 10

---

### Implementation: Automatic Failure Detection

**Trigger:** Any Playwright/Cypress test returns non-zero exit code

#### Hook into test runner

```typescript
// In test runner wrapper (hypothetical implementation)
afterEach(async ({}, testInfo) => {
  if (testInfo.status === TestStatus.Failed) {
    const failureReport = await generateFailureReport(testInfo);
    const failureId = saveFailureReport(failureReport);
    
    // Auto-delegate to mansoni-debugger
    await callMansoni({
      type: 'debug_request',
      failure_report_id: failureId,
      payload: failureReport
    });

    console.log(`\n🔴 Test failed. Debug session ${failureId} created. Delegating to mansoni-debugger...`);
  }
});
```

#### What gets captured automatically

| Item | Source |
|------|--------|
| Test name | `testInfo.title` |
| Stack trace | `testInfo.error.stack` |
| Screenshot | `await page.screenshot()` |
| Video | Playwright video config |
| Console logs | `page.on('console', msg => collect(msg))` |
| Network requests | `page.on('request', req => collect(req))` |
| Traced actions | Playwright trace viewer (if enabled) |
| Environment | `process.env + browser.version + viewport` |

#### Failure report location

```
/memories/session/failures/
├── TEST-20260425-001.yaml   # ← created automatically
├── TEST-20260425-002.yaml
└── index.md                 # ← summary index
```

#### Session lifecycle

```
1. test FAIL
   ↓
2. Tester creates failure_report.yaml
   ↓
3. Tester calls Mansoni: "Please debug this"
   ↓
4. Mansoni creates session dir DEBUG-xxx/
   ↓
5. Mansoni assigns mansoni-debugger
   ↓
6. Debugger works (notes, RCA, fix)
   ↓
7. Debugger requests verification from Tester
   ↓
8. Tester runs regression tests
   ↓
9. Tester returns verification.yaml
   ↓
10. Mansoni closes session if PASS
```

---

### Tester Self-Audit (post-verification)

After each verification run, Tester audits itself:

```
Was the original failure_report complete?
  ☐ Had all necessary files
  ☐ Reproduction steps clear
  ☐ Evidence sufficient for Debugger

Was the verification rigorous?
  ☐ Ran primary test
  ☐ Ran full regression suite
  ☐ Checked for new failures
  ☐ Cross-browser checked
```

If audit fails → add checklist item to `debugger-tester-integration` skill improvements.

---

## 🎯 Quality Gates (for Tester)

Before generating failure_report:
- [ ] All evidence collected (screenshots, logs, network)
- [ ] Reproduction steps are clear and minimal
- [ ] Related files identified (test → component mapping)
- [ ] Severity assessed correctly (P0-P3)

Before sending verification:
- [ ] Primary test PASS
- [ ] Regression suite PASS
- [ ] No new failures introduced
- [ ] Artifacts saved (screenshots, logs)

---

## 📈 Metrics Tracked

```json
{
  "tester_metrics": {
    "tests_run_total": 15234,
    "tests_failed_total": 127,
    "failure_report_quality": 0.96,
    "false_positives": 0.02,
    "handoff_latency_sec": 3,
    "verification_turnaround_min": 12
  }
}
```

---

**Version:** 1.0
**Integration:** `debugger-tester-integration` skill
**Dashboard:** `debug-dashboard` skill
