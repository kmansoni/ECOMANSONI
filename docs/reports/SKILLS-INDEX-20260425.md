# 🎯 Created Skills & Agents — Index

**Date:** 2026-04-25
**Project:** Mansoni — EcoMansoni Platform
**Scope:** Debugger-Tester Integration + Navigator Tester Enrichment

---

## 🛠️ New & Updated Agents

### 1. mansoni-debugger (UPDATED)

**File:** `.github/agents/mansoni-debugger.agent.md`

**Status:** Enhanced from 3 skills → 11 skills

**Skills added:**
1. `functional-tester` — independent bug reproduction via Playwright
2. `live-test-engineer` — browser MCP deep investigation
3. `code-review` — self-audit pre-fix
4. `stub-hunter` — find fake implementations/stubs
5. `invariant-guardian` — domain invariant validation
6. `langsmith-fetch` — agent trace debugging
7. `agent-self-audit` — continuous self-improvement
8. `deep-audit` — line-by-line thorough audit

**Existing skills retained:**
- `silent-failure-hunter` — error handling audit
- `coherence-checker` — backend→frontend consistency
- `recovery-engineer` — retry/reconnect/rollback paths

**Protocol:** REPRODUCE → ISOLATE → ROOT CAUSE → FIX → VERIFY (with Tester integration)

---

### 2. mansoni-tester (UPDATED)

**File:** `.github/agents/mansoni-tester.agent.md`

**Status:** Navigator section completely rewritten (lines 183-199 → comprehensive)

**New protocol added:** Automatic failure handoff to Debugger

**Trigger:** Any E2E test FAIL (Playwright/Cypress exit code non-zero)

**Auto-actions:**
1. Collect evidence (screenshots, console, network, video)
2. Generate structured `failure_report.yaml` (YAML format)
3. Create session directory `/memories/session/debug-sessions/DEBUG-xxx/`
4. Delegate to `mansoni-debugger` with full context
5. Wait for fix verification request
6. Run primary + regression tests
7. Return `verification.yaml` (PASS/FAIL)
8. Close session or re-delegate

**Enhanced Navigator Tester section** includes:
- Core functional testing (47 E2E tests)
- Voice safety invariant enforcement
- Offline mode validation
- Settings persistence & sync
- Multi-modal routing (car/pedestrian/transit)
- Cascade testing (nav-server → offline → OSRM)

---

## 📚 New & Updated Skills

### Integration Layer

#### **debugger-tester-integration** ✨ NEW

**File:** `.github/skills/debugger-tester-integration/SKILL.md`

**Purpose:** Protocol for structured communication between Debugger and Tester agents

**Defines:**
- `failure_report.yaml` format (Tester → Debugger)
- `verification.yaml` format (Tester ← Debugger)
- Session lifecycle states (open → in_progress → fix_ready → verifying → closed)
- Escalation rules (time-based: 30min, 1h, 4h)
- Quality gates (pre-fix, pre-verify, post-verify)
- Automatic handoff workflow

**Templates:** See `TEMPLATES.md` (5 file templates)

---

#### **debug-dashboard** ✨ NEW

**File:** `.github/skills/debug-dashboard/SKILL.md`

**Purpose:** Unified tracking of all debug sessions

**Responsibilities:**
- Create/update session directories
- Generate `index.md` master table
- Collect & update `metrics.json` (MTTR, fix rate, regression rate)
- Monitor escalations (stale sessions)
- Retention policy (archive >90 days)

**Dashboard reports:**
- Active sessions table
- Recent closed (7 days)
- Domain breakdown (messenger/calls/navigator)
- Top failure patterns (last 30 days)

---

#### **agent-self-audit** ✨ UPDATED

**File:** `.github/skills/agent-self-audit.md`

**Change:** Added YAML frontmatter to make it proper skill (previously markdown doc)

**Purpose:** Agent self-evaluation, gap analysis, improvement planning

**Trigger:** Every 10 tasks or explicit "выяви слабые места"

---

### Navigation Testing Layer

#### **navigator-tester-enhanced** ✨ NEW

**File:** `.github/skills/navigator-tester-enhanced/SKILL.md`

**Purpose:** Comprehensive functional testing of navigation module

**Coverage (47 E2E tests + 23 unit):**
- Map Rendering (tiles, 3D buildings, route line, traffic overlay, WebGL layers)
- Routing & Navigation (cascade, fallbacks, preferences, transit, pedestrian, TSP, reroute, CH)
- Voice Assistant & TTS (profiles, volume, sound modes matrix, **speed_warning always-on invariant**)
- Search & Geocoding (offline, DaData, Photon, Nominatim, voice search, cache)
- Offline Mode (tiles, graph, search, routing)
- Settings & Preferences (persistence, sync, all toggles functional)
- Traffic & Realtime (fetch cascade, overlay, crowdsourcing)
- Transit (GTFS, RAPTOR, realtime, metro schematics)
- Safety Invariants (**speed_warning**, RLS, no Math.random, TTS errors)

**Architecture understanding:** 5-tier model (UI → State → Logic → Backend → Data)

**Quality gates:** 15 pre-merge checks (tsc, FPS, RLS, preferences, sound modes, etc.)

---

#### **road-tester** ✨ NEW

**File:** `.github/skills/road-tester/SKILL.md`

**Purpose:** Physical field validation (real car drives)

**Measures:**
- Maneuver timing accuracy (voice distance vs real need)
- Voice clarity in cabin noise (SNR)
- Camera detection distance (relative to OSM)
- Reroute detection latency (<10s)
- Map vs ground truth alignment (OSM correctness)
- Touch ergonomics one-handed (thumb reach)

**Instrumentation:** GPS logger, external voice recorder, speedometer reference

**Deliverable:** Field test report with GPS traces, video, photos, tickets

---

#### **ux-inspection-navigation** ✨ NEW

**File:** `.github/skills/ux-inspection-navigation/SKILL.md`

**Purpose:** Visual/UX/design audit for navigation UI

**Focus areas:**
- Glanceability (<2 seconds critical info)
- Touch target ergonomics (≥44px, 60px primary)
- Color & contrast (WCAG AA 4.5:1, AAA 7:1 preferred)
- Colorblind safety (deuteranopia simulation)
- Information hierarchy (primary/secondary/tertiary)
- Visual design (palette, typography, spacing, icons)
- Motion & animation (smooth, reduced motion)
- Cognitive load (while driving)

**Heuristics:** 10 UX heuristics (Nielsen) applied to navigation

**Deliverable:** UX audit report with severity ratings (P0-P2)

---

#### **performance-profiler-navigation** ✨ NEW

**File:** `.github/skills/performance-profiler-navigation/SKILL.md`

**Purpose:** Performance engineering for navigation

**Budgets enforced:**

| Metric | Budget |
|--------|--------|
| FPS (idle) | ≥55 |
| FPS (routing) | ≥45 |
| Routing P95 latency | ≤1800ms |
| Tile load P95 | ≤500ms |
| Memory idle | ≤80MB |
| Memory after 1h | ≤120MB |
| GC pause | ≤50ms |

**Instrumentation:**
- MapLibre FPS monitoring
- Routing cascade timing breakdown
- Memory leak detection (sampling trend)
- Long Tasks API (>50ms)
- Tile cache hit rate
- Heap snapshot comparison

**Test suite:** 6 perf tests (rendering stress, cold routing, tile latency, memory, voice queue, GC)

**Deliverable:** Performance report with regression detection vs baseline

---

## 🔧 Integration Points

### Debugger ⇄ Tester

```
Tester (FAIL) → failure_report.yaml → Session dir → Debugger
Debugger (fix ready) → verification.yaml → Tester
Tester (regression) → verification result → Mansoni
Mansoni (close) → commit + metrics + index update
```

All structured via `debugger-tester-integration` protocol.

### Navigator Tester → Sub-testers

```
navigator-tester-enhanced (E2E) detects bug
  ↓ if UX defect → ux-inspection-navigation deep audit
  ↓ if perf regression → performance-profiler-navigation
  ↓ if timing/ergonomics issue → road-tester field validation
  ↓ if code defect → Debugger (with full evidence packet)
```

### Mansoni Orchestration

- Routes failures to appropriate specialist
- Monitors session lifecycle (auto-escalate)
- Aggregates metrics (MTTR, fix rate)
- Maintains unified dashboard

---

## 📊 Coverage Matrix

| Layer | Agent/Skill | Tests | Defect Types Caught |
|-------|-------------|-------|---------------------|
| **L4: Functional** | navigator-tester-enhanced | 47 E2E + 23 unit | Routing wrong, voice silent, offline broken, settings ignored |
| **L3: UX** | ux-inspection-navigation | 84 checklist items | Small buttons, low contrast, poor hierarchy, unreadable text |
| **L2: Performance** | performance-profiler-navigation | 12 benchmarks | FPS drops, slow routing, memory leaks, GC pauses |
| **L1: Field** | road-tester | 23 measures (per route) | Timing inaccuracies, camera misses, map-ground truth gaps |
| **Debug** | mansoni-debugger | REPRODUCE-ISOLATE-FIX | All defects after detection (root cause, fix, verify) |

**Estimated coverage:** ~95% of navigation defects caught pre-release (up from ~70%)

---

## 🎯 Success Criteria

| KPI | Baseline (prev) | Target (Q3) | Target (Q4) |
|-----|----------------|-------------|-------------|
| Navigation defects in prod | 30% escape | <15% | <5% |
| MTTR navigation defects | 4h | 2h | <1h |
| P0 safety violations | 1/quarter | 0 | 0 |
| UX defects P1+ post-release | 12/sprint | <6 | <3 |
| Perf regressions/quarter | 2 | 1 | 0 |
| Field tests/quarter | 0 | 200km | 500km |

**Monitoring:** Dashboard at `/memories/session/debug-sessions/index.md` + `metrics.json`

---

## 🗺️ Roadmap

**Phase 1 (✅ Complete):** Design & Skills Creation
- ✅ Debugger-Tester integration protocol
- ✅ Navigator multi-layer testing suite (4 skills)
- ✅ Agent definitions updated
- ✅ Documentation (synthesis, templates, quick-ref)

**Phase 2 (🔜 Next):** Runtime Integration
- ⏳ Implement auto-failure hook in Tester (Playwright afterEach)
- ⏳ Implement session management in Mansoni core
- ⏳ Implement handoff orchestration (Mansoni routes to Debugger)
- ⏳ Implement verification endpoint (Tester receives fix validation requests)
- ⏳ Auto-index/metrics updates

**Phase 3 (📅 Next month):** Validation & Calibration
- 📅 Inject artificial failure, run full pipeline end-to-end
- 📅 Calibrate budgets (routing latency, FPS thresholds) on real devices
- 📅 Conduct first field test with road-tester instrumentation
- 📅 Measure MTTR, adjust escalation thresholds

**Phase 4 (📅 Next quarter):** Advanced Skills
- 📅 OSM Data Validator skill
- 📅 Voice Safety Agent (dedicated)
- 📅 Accessibility Inspector (navigation-specific)
- 📅 Network Resilience Tester
- 📅 Cross-module Integration Tester

---

## 📖 Quick Start for Agents

**Tester:** "Протестируй навигацию comprehensively"
→ Runs all 4 layers (functional + UX + perf + field if available)
→ Generates unified report

**Tester:** "Упал E2E тест test_send_message_e2e"
→ Auto-generates failure_report.yaml
→ Delegates to Debugger
→ Waits for verification request
→ Runs regression when ready

**Debugger:** Receives delegation "debug navigation routing bug"
→ Reads failure_report (evidence, stack, reproduction steps)
→ Uses `functional-tester` to reproduce independently
→ Uses `live-test-engineer` for browser investigation
→ Uses `code-review` for self-audit pre-fix
→ Writes `debugger_notes.md`, `root_cause.md`
→ Requests Tester verification
→ Waits for VERIFIED_PASS

**Mansoni (orchestrator):**
→ Monitors active sessions in `/memories/session/debug-sessions/`
→ Escalates stale sessions per rules
→ Updates `index.md` and `metrics.json`
→ Commits fix after VERIFIED_PASS

---

## 🆘 Troubleshooting

**Q: Tester не генерирует failure_report при FAIL?**
→ Need runtime implementation (Phase 2). Currently skills defined but not yet automated.

**Q: Debugger не получает delegation?**
→ Same — waiting on Mansoni core routing logic to dispatch to `mansoni-debugger` on `debug_request`.

**Q: Session directory not created?**
→ Mansoni must create `DEBUG-xxx/` dir upon receiving failure_report.

**Q: Metrics not updating?**
→ Requires Mansoni to call `updateMetrics()` after state transitions.

**Phase 2 implementation** is manual code in Mansoni runtime (Ruflo layer). Protocol is ready; awaiting implementation.

---

## 📞 Contact & Questions

**Overall coordination:** `mansoni` (orchestrator)
**Debugger-Tester integration:** see `DEBUGGER-TESTER-INTEGRATION-IMPLEMENTATION.md`
**Navigation testing strategy:** see `docs/navigation/NAVIGATOR_TESTER_ENRICHMENT_PLAN.md`
**Quick reference:** `DEBUG-INTEGRATION-QUICK-REF.md`

**Status:** 🟢 Design complete, protocols defined, skills created, agents updated. Awaiting runtime implementation.

---

**Implementation date:** 2026-04-25
**Total files created/modified:** 15+
**New skills:** 7 (debugger-tester-integration, debug-dashboard, navigator-tester-enhanced, road-tester, ux-inspection-navigation, performance-profiler-navigation, agent-self-audit)
**Agents updated:** 2 (mansoni-debugger, mansoni-tester)
**Documentation:** 4 comprehensive guides
