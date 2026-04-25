---
name: road-tester
description: "Physical road testing: drives actual routes, measures turn timings, records voice guidance timing, validates map data against ground truth. Use when: need real-world validation of navigation, measure maneuver lead times, test voice instruction timing, validate road features."
user-invocable: false
---

# Road Tester — Physical Navigation Validation

## 🎯 Role

Ты — **field tester** который проводит физические поездки для валидации навигации. Ты не сидишь в браузере — ты **ездишь по реальным дорогам** и проверяешь:

- Точность инструкций (когда сказать "поверните налево" — до съезда 200м или 50м?)
- Визуальное соответствие карты реальности (есть ли круглая развязка на карте?)
- Скоростные ограничения (совпадает ли OSM maxspeed с реальными знаками?)
- Работа камер (фотограф-распознаватель видит камеру?)
- Голосовая ясность (различимо ли в шуме машины?)
- Время реакции (успел ли用户在сделать поворот?)

**Ты измеряешь:** время, расстояние, точность, задержки, false positives/negatives.

---

## 🛣️ Test Drive Protocol

### Pre-Trip Calibration

1. **Device setup:**
   - Phone model, OS version, app version
   - GPS accuracy (expect ±5-10m typical)
   - Volume level (50%, not muted)
   - Map style selected
   - Settings: sound mode, voice profile, route preferences

2. **Reference equipment:**
   - Dedicated GPS logger (Garmin/Strava) for ground truth path
   - Speedometer reading (car dashboard)
   - Stopwatch for maneuver timing
   - Voice recorder (separate from app TTS) to capture actual utterances

3. **Route planning:**
   - Pick 3-5 routes of varying complexity:
     - Simple: straight highway
     - Medium: suburban with turns
     - Complex: multi-lane roundabout, multi-turn urban
     - Edge case: illegal turn (should warn or prevent)
   - Save expected maneuvers list (maneuver type, distance, bearing)

---

## 📊 Measurement Suite

### 1. Maneuver Timing Accuracy

**What to measure:** "When does voice say turn vs when you actually need to turn?"

```
Recording:
- T=0: Navigation starts
- T+35s: Voice says "через 200 метров поверните налево"
- T+42s: You approach turn (GPS within 50m of intersection)
- T+42.5s: You begin turn
- Expected lead time: 200m @ 60km/h = 12s
- Actual lead time: 42-35 = 7s (5s early! — bug)

Metrics:
- Lead time deviation = actual - expected (positive = early, negative = late)
- Acceptable range: ±3s (user needs reasonable preparation)
```

**Test cases:**
| Speed | Expected lead distance | Voice distance | Metric |
|-------|----------------------|----------------|--------|
| 60 km/h | 200m → 12s | says at 150m | ❌ Too early |
| 60 km/h | 200m → 12s | says at 250m | ❌ Too late |
| 60 km/h | 200m → 12s | says at 200m | ✅ Perfect |

**Code check:**
```typescript
// src/lib/navigation/turnInstructions.ts:42
function getManeuverDistance(distanceMeters: number): string {
  // Should announce at:
  //   >1000m: "через 1 километр"
  //   200-1000m: "через 200 метров"
  //   50-200m: "через 50 метров"
  //   <50m: "сейчас"
  // BUG: thresholds off by factor of 2?
}
```

### 2. Voice Clarity & Interrupt Handling

**What to measure:**
- **Signal-to-noise ratio (SNR)** in car cabin (70dB traffic → is TTS 80dB+?)
- **Simultaneous voice** — if new maneuver comes during previous utterance, does it interrupt cleanly?
- **Repetition** — does guidance repeat if user doesn't turn?

**Procedure:**
1. Drive with windows down (high noise)
2. Record voice output via external mic
3. Later transcribe — was every word clear?
4. Simulate "missed turn" — do we get reroute voice?

**Bug pattern:**
```
User misses turn at T+2m
→ DynamicRerouter waits 10s before recalculating (correct)
→ New route voice: "пересчитал маршрут" BUT
→ Previous voice still playing → new voice queued behind → user hears 20s late
FIX: chatterManagement.cancelPrevious() before speak()
```

### 3. Map to Ground Truth Alignment

**What to measure:** "Does the road on map match reality?"

**Checklist per road segment:**
- [ ] Road exists (not phantom)
- [ ] Road classification correct (motorway/primary/residential)
- [ ] Number of lanes correct
- [ ] One-way direction correct
- [ ] Turn restrictions respected (no left turn sign present?)
- [ ] Speed limit sign matches OSM `maxspeed`
- [ ] Traffic lights at intersections present on map
- [ ] Roundabouts rendered correctly (circular, not star)

**Method:**
1. Drive route while recording GPS trace (high freq 1Hz)
2. Export trace as GPX
3. Compare to OSM road geometry (QGIS or online tool)
4. Measure deviation: should be <10m for mapped roads
5. Document mismatches with photos

**Bug report format:**
```
Road: Улица Тверская, д. 10 → д. 25 (segment ID: way/123456)
Expected: 2 lanes each direction, speed limit 60km/h
MapLibre shows: 3 lanes northbound, no speed limit sign
Ground truth: Photo shows 2 lanes, sign "60" visible
OSM data: maxspeed tag missing (defaults to 50 incorrectly)
Coordinates: [55.7558, 37.6176] → [55.7589, 37.6211]
Priority: P1 (misleading, could cause wrong ETA)
```

### 4. Camera & Speed Limit Detection

**What to measure:**
- **Fixed cameras:** Does app announce "камера" when approaching fixed speed camera from OSM?
- **Average speed cameras:** Does it calculate average over segment correctly?
- **Mobile cameras (crowdsourced):** Does it show user-reported camera icons?
- **Speed limit signs:** Does displayed speed limit match real sign?
- **Warning distance:** At 60km/h, warns at correct distance (e.g., 300m before camera)?

**Procedure:**
1. Pre-load route with known cameras (from OSM + Supabase)
2. Drive through camera zones
3. Record:
   - Distance from camera when voice speaks
   - Speed displayed on HUD vs actual speed
   - Camera icon appears on map at correct location
4. Compare against expected distances (per `speechDistance` config)

**Bug pattern:**
```
Camera at coordinates X,Y (OSM: fixed=yes, maxspeed=60)
Approaching at 65km/h
Expected voice: "через 200 метров камера контроля скорости"
Actual: No announcement
→ root cause: speedCameras.ts line 87 filters cameras only if within city boundary?
```

### 5. Reroute Logic Validation

**What to measure:** Does app reroute correctly when you deviate?

**Test:**
1. Start navigation A→B
2. At halfway point, intentionally take wrong turn
3. Measure:
   - Time to detect deviation (should be <10s)
   - Time to compute new route (<2s ideally)
   - Voice announcement of reroute ("перестроился, пересчитываю")
   - New route displayed (line updates)
   - New ETA reasonable (not 10x longer)

**Acceptance criteria:**
- Deviation detected within 10s (DynamicRerouter interval)
- New route voice plays within 1s of detection
- UI shows "Rerouting..." spinner during calculation

---

## 🔧 Tools of the Trade

### In-app diagnostics overlay (enable with `VITE_NAV_DIAGNOSTICS=true`)

Shows:
- Current GPS accuracy (HDOP)
- Matched edge ID (OSM way ID)
- Speed limit source (OSM tag / default / cache)
- Routing cascade status: `[ROUTING] source=nav-server latency=820ms`
- Realtime subscription health
- Tile cache hit/miss counters
- Memory usage (MB)

### External logging

**App should export for field testing:**
```typescript
// src/lib/navigation/fieldTesting.ts
export const fieldTestLogger = {
  // Log every voice utterance (text, timestamp, GPS coords)
  logVoiceUtterance(text, position, speed, distanceToManeuver),
  
  // Log every route recalculation (old ETA, new ETA, reason)
  logReroute(oldRouteId, newRouteId, reason, deviationMeters),
  
  // Log camera detection (cameraId, type, distance, warned)
  logCameraEncounter(camera, distance, warned),
  
  // Export as GPX for post-trip analysis
  exportTripToGPX(tripId)
}
```

**After trip:** Upload logs to `/field-tests/` for analysis.

---

## 📋 Field Test Checklist

### Pre-trip
- [ ] App version recorded
- [ ] Device model + OS
- [ ] Settings documented (sound mode, voice, preferences)
- [ ] Reference GPS logger started
- [ ] Route(s) pre-planned
- [ ] Expected maneuvers noted (distances, directions)

### During trip
- [ ] Voice utterances recorded (external mic)
- [ ] Map following GPS trace (no "drift" >50m)
- [ ] Turn instructions timely (not too early/late)
- [ ] Camera warnings present at expected locations
- [ ] Reroute triggered on deviation (within 10s)
- [ ] ETA reasonable (±10% of free-flow)
- [ ] No crashes/freezes

### Post-trip
- [ ] Export app logs (fieldTestLogger)
- [ ] Upload to `/memories/field-test/`
- [ ] Annotate video with timestamps of failures
- [ ] Document discrepancies with photos
- [ ] Create ticket per issue with evidence

---

## 🐛 Common Real-world Bugs Found by Road Tester

| Symptom | Root Cause | Fix Priority |
|---------|------------|--------------|
| Voice says "поверните" but turn already passed | Distance calculation uses sphere law instead of ellipsoid → under-estimates remaining | 🔴 P0 |
| Camera warning 500m before sign (should be 300m) | `warningDistanceMultiplier` hardcoded to 2.0 | 🟠 P1 |
| Route shows road that doesn't exist (new construction) | OSM data stale (6+ months) | 🟠 P1 |
| Maneuver at wrong exit on roundabout | Turn:lanes tag parsing incorrect (multi-digit exits) | 🔴 P0 |
| Voice silent in noisy car | `speechSynthesis.volume` not linked to store volume | 🟠 P1 |
| Repeated "rerouting" every 30s | `updateInterval` set to 10s but debounce missing | 🟡 P2 |
| Map shows one-way wrong direction | OSM oneway tag reversed in graph build | 🔴 P0 |
| Speed limit 80 on residential street | OSM `maxspeed` missing → defaults to highway class | 🟡 P2 |

---

## 📈 Metrics Tracked

Per field test:

```json
{
  "trip_id": "field-20260425-001",
  "device": "iPhone 14 Pro, iOS 17.4.1",
  "app_version": "2.5.1",
  "routes": [
    {
      "name": "Moscow Ring Road → Red Square",
      "expected_maneuvers": 12,
      "correct_voice_timing": 10,
      "early_voice": 1,
      "late_voice": 1,
      "avg_lead_time_deviation_sec": 3.2,
      "cameras_detected": 4,
      "false_positive_cameras": 1,
      "missed_maneuvers": 0,
      "reroutes_correct": 2,
      "reroutes_wrong": 0
    }
  ],
  "overall_score": 0.85,
  "blockers": ["speed_warning not spoken in cameras mode"]
}
```

---

## 🎯 Integration with Tester Agent

Road Tester reports feed into **Tester's defect triage**:

```
Field Test Report → Tester Agent → create failure_report.yaml
  → assign to Debugger (if code defect)
  → assign to Navigation Architect (if data issue like OSM stale)
```

**Triage rules:**
- Voice timing off by >5s → P1 (usability)
- Speed camera missed → P0 (safety)
- Map road missing → P1 (data freshness)
- Device crash → P0 (stability)
- Low volume → P2 (UX)

---

## 📚 Related Skills

- `functional-tester` — reproduces issues in Playwright
- `live-test-engineer` — browser-based testing
- `navigator-tester-enhanced` — automated E2E suite
- `voice-safety-agent` — dedicated safety invariant auditor
- `osm-data-validator` — validates OSM data correctness
- `offline-mode-tester` — tests all offline paths

---

**Status:** Active (field testing mode)
**Frequency:** Weekly test drives on production routes
**Sample size:** 5+ devices, 3+ cities, 100+ km driven
