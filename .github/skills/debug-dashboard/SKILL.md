---
name: debug-dashboard
description: "Управление debug сессиями: создание/обновление session records, генерация index, сбор метрик. Use when: track debug sessions, generate dashboard, compute MTTR, analyse patterns."
user-invocable: false
---

# Debug Dashboard Manager

Управление debug-сессиями между Tester и Debugger агентами.

---

## 📁 Session Directory Structure

```
/memories/session/debug-sessions/
├── DEBUG-20260425-001/              # Session directory
│   ├── failure_report.yaml          # Input (Tester → Debugger)
│   ├── debugger_notes.md            # Debugger analysis
│   ├── root_cause.md                # RCA with evidence
│   ├── fix.patch                    # Applied changes (optional)
│   ├── verification.yaml            # Tester verification result
│   ├── regression_report.yaml       # Full regression results
│   └── metadata.json                # Auto-generated meta
├── DEBUG-20260425-002/
├── index.md                         # Master table (auto-updated)
└── metrics.json                     # KPI tracking (auto-updated)
```

---

## 🔄 Lifecycle of a Debug Session

### State 1: `open` — Failure detected
**Created by:** Tester Agent
**Files created:**
- `failure_report.yaml`
- Session directory `DEBUG-{ID}/`

**Actions:**
1. Tester generates failure_report after test FAIL
2. Tester delegates to Mansoni → Debugger
3. Mansoni creates session directory
4. Mansoni writes `failure_report.yaml`
5. Session status: `open`

### State 2: `in_progress` — Debugging
**Updated by:** Debugger Agent
**Files updated:**
- `debugger_notes.md`
- `root_cause.md`

**Actions:**
1. Debugger reads failure_report
2. Executes REPRODUCE → ISOLATE → ROOT CAUSE
3. Writes analysis to `debugger_notes.md`
4. Writes root_cause proof to `root_cause.md`
5. Updates session status: `in_progress`

### State 3: `fix_ready` — Fix applied
**Updated by:** Debugger Agent
**Files updated:**
- `fix.patch` (optional, usually commit already)
- `verification.yaml` (request to Tester)

**Actions:**
1. Debugger applies fix
2. Runs local verification (tsc, unit tests)
3. Creates `fix.patch` (or references commit)
4. Creates `verification.yaml` requesting Tester verification
5. Updates session status: `fix_ready`
6. Notifies Mansoni → Tester

### State 4: `verifying` — Tester validation
**Updated by:** Tester Agent
**Files updated:**
- `verification.yaml` (filled with results)
- `regression_report.yaml`

**Actions:**
1. Tester receives verification request
2. Runs specific failing test + regression suite
3. Updates `verification.yaml` with results
4. If regression failures → updates `regression_report.yaml`
5. Updates session status: `verifying` → `verified_pass` or `verified_fail`

### State 5: `closed` — Completed
**Updated by:** Mansoni (Orchestrator)
**Actions:**
1. Mansoni receives Tester confirmation
2. If PASS: close session, update metrics, commit fix
3. If FAIL: re-delegate to Debugger with feedback
4. Update `index.md` master table
5. Update `metrics.json`

---

## 📊 Index File (index.md)

**Auto-generated** after each session state change.

```markdown
# Debug Sessions Dashboard

**Generated:** 2026-04-25T15:00:00Z
**Active sessions:** 3
**Total sessions:** 156
**MTTR (30d avg):** 47m
**Fix success rate:** 94%

## Active Sessions

| ID | Domain | Test | Status |Priority| Debugger | Duration |
|----|--------|------|--------|--------|----------|----------|
| DEBUG-20260425-001 | messenger | test_send_message_e2e | ✅ VERIFIED PASS | P0 | mansoni-debugger | 1h 15m |
| DEBUG-20260425-002 | calls | test_e2ee_handshake | 🔄 VERIFYING | P0 | mansoni-debugger | 50m |
| DEBUG-20260425-003 | navigator | test_offline_maps | ⏳ IN_PROGRESS | P2 | mansoni-debugger | 20m |

## Recent Closed (last 7 days)

| ID | Domain | Test | Final Status | Fix Commit | MTTR |
|----|--------|------|--------------|------------|------|
| DEBUG-20260424-098 | messenger | test_edit_message | ✅ FIXED | abc123 | 2h 30m |
| DEBUG-20260424-095 | calls | test_sfu_scaling | ✅ FIXED | abc118 | 3h 45m |
| DEBUG-20260423-112 | navigator | test_route_reroute | ✅ FIXED | abc115 | 1h 05m |

## By Domain

| Domain | Open | In Progress | Fixed (30d) | Common Causes |
|--------|------|-------------|-------------|---------------|
| messenger | 1 | 1 | 42 | CORS (8), RLS (6), Race (4) |
| calls | 1 | 0 | 28 | SFU config (5), E2EE (4), ICE (3) |
| navigator | 1 | 1 | 31 | OSRM timeout (6), Tile load (5) |
| shop | 0 | 0 | 18 | Payment webhook (4), Inventory (3) |

## Top Failure Patterns (last 30 days)

| Pattern | Count | Avg MTTR | Status |
|---------|-------|----------|--------|
| CORS misconfiguration | 8 | 35m | 🔄 Active |
| RLS policy missing | 6 | 50m | 🔄 Active |
| Race condition (async) | 4 | 1h 20m | ⚠️ Needs pattern fix |
| Edge Function timeout | 3 | 45m | 🔄 Active |
| Supabase type mismatch | 2 | 1h 05m | ✅ Fixed (typegen) |

**Action:** Consider creating `cors-policy-enforcer` skill to prevent future CORS bugs.
```

---

## 📈 Metrics (metrics.json)

```json
{
  "generated_at": "2026-04-25T15:00:00Z",
  "period": "last_30_days",
  "summary": {
    "total_sessions": 156,
    "active_sessions": 3,
    "closed_last_7d": 24,
    "closed_last_30d": 153
  },
  "mttr": {
    "min_minutes": 12,
    "max_minutes": 340,
    "avg_minutes": 47,
    "p50_minutes": 38,
    "p90_minutes": 105,
    "p99_minutes": 280,
    "target_minutes": 60,
    "trend": "decreasing"  // improving
  },
  "fix_success": {
    "first_try": 0.78,
    "second_try": 0.94,
    "third_try": 0.97,
    "total_success_rate": 0.94,
    "target": 0.95
  },
  "repoduction": {
    "reproducible": 0.96,
    "flaky": 0.04,
    "environment_specific": 0.02
  },
  "root_cause": {
    "correct_first_guess": 0.82,
    "took_2_attempts": 0.13,
    "took_3plus_attempts": 0.05
  },
  "regression": {
    "regression_introduced": 0.02,
    "regression_caught_by_tester": 0.98,
    "mean_regressions_per_fix": 0.03
  },
  "by_domain": {
    "messenger": { "sessions": 48, "mttr": 52, "success_rate": 0.92 },
    "calls": { "sessions": 31, "mttr": 67, "success_rate": 0.90 },
    "navigator": { "sessions": 35, "mttr": 41, "success_rate": 0.96 },
    "shop": { "sessions": 22, "mttr": 38, "success_rate": 0.95 }
  },
  "common_causes": [
    { "cause": "CORS misconfiguration", "count": 8, "domain": "messenger" },
    { "cause": "RLS policy missing", "count": 6, "domain": "messenger" },
    { "cause": "Race condition", "count": 4, "domain": "calls" },
    { "cause": "Edge Function timeout", "count": 3, "domain": "shop" }
  ]
}
```

---

## 🔍 Query Commands

### List all open sessions
```bash
find /memories/session/debug-sessions/ -name "failure_report.yaml" -exec grep -l "status: open" {} \;
```

### Find sessions by domain
```bash
grep -r "domain: messenger" /memories/session/debug-sessions/ | cut -d/ -f5
```

### Get MTTR trend (last 7 days)
```bash
jq '[.[] | select(.closed_at > (now - (7*24*60*60)))] |
    map(.mttr_minutes) |
    {min: min, max: max, avg: (add / length)}' metrics.json
```

### Find patterns
```bash
grep -r "root_cause:" /memories/session/debug-sessions/*/root_cause.md | \
  sort | uniq -c | sort -rn | head -20
```

---

## 🛠️ Usage

### For Tester Agent

After test failure:

```typescript
async function onTestFailure(testRun) {
  const failureId = generateFailureId();
  const report = buildFailureReport(testRun);
  const sessionDir = `/memories/session/debug-sessions/${failureId}`;

  // Create session directory
  fs.mkdirSync(sessionDir, { recursive: true });

  // Save failure report
  fs.writeFileSync(`${sessionDir}/failure_report.yaml`, yaml.dump(report));

  // Update index
  await updateDashboardIndex('open', failureId, report);

  // Delegate to mansoni
  return `Test FAIL: ${failureId}. Delegating to mansoni-debugger.`;
}
```

### For Debugger Agent

On receiving delegation:

```typescript
async function debugSession(failureId) {
  const sessionDir = `/memories/session/debug-sessions/${failureId}`;
  const report = yaml.load(fs.readFileSync(`${sessionDir}/failure_report.yaml`));

  // Update status
  await updateSessionStatus(failureId, 'in_progress');

  // REPRODUCE → ISOLATE → ROOT CAUSE
  const analysis = await performDebug(report);

  // Write notes
  fs.writeFileSync(`${sessionDir}/debugger_notes.md`, analysis.notes);
  fs.writeFileSync(`${sessionDir}/root_cause.md`, analysis.rootCause);

  // Apply fix, verify locally
  await applyFix(analysis.fix);
  await updateSessionStatus(failureId, 'fix_ready');

  // Request Tester verification
  await requestTesterVerification(failureId);
}
```

### For Mansoni (Orchestrator)

Route messages:

```typescript
// Monitor session state
setInterval(async () => {
  const active = await getActiveSessions();
  for (const session of active) {
    if (session.status === 'verifying' && session.age > '10min') {
      // Escalate stale verification
      await escalateTo('mansoni-reviewer', session);
    }
  }
}, 300000); // every 5 min
```

---

## 📋 Automation Rules

### Auto-escalation

| Condition | Threshold | Action |
|-----------|-----------|--------|
| No root cause identified | 30 min | Escalate to `mansoni-architect` |
| Fix attempted but verification FAIL | 1 hour | Escalate to `mansoni-reviewer` |
| Session stuck in `verifying` > 10 min | 10 min | Ping Tester agent |
| Session age > 4 hours | 4 hours | Escalate to `sequential-auditor` |

### Auto-metrics

After each session state change:
1. Update `/memories/session/metrics.json`
2. Recalculate MTTR, success rate
3. Detect new pattern → add to `common_causes`
4. If pattern count > 5 → suggest new prevention rule

### Auto-index rebuild

```bash
# Nightly job
rebuild-index() {
  find /memories/session/debug-sessions/ -name "metadata.json" | sort | while read meta; do
    extract summary into index.md
  done
}
```

---

## 🎯 Dashboard Queries ( через mansoni )

```bash
# Open active sessions
mansoni "Покажи активные debug-сессии"
→ читает index.md, выводит таблицу

# MTTR по домену
mansoni "Каков MTTR для messenger за последние 7 дней?"
→ читает metrics.json, фильтрует по domain, вычисляет

# Частые причины багов
mansoni "Какие самые частые root causes?"
→ парсит root_cause.md файлы, агрегирует

# Session details
mansoni "Покажи DEBUG-20260425-001"
→ читает всю директорию, выводит полный контекст
```

---

## 🔄 Sync with Other Agents

**Tester → Debugger:** Automatic on FAIL (via failure_report.yaml)

**Debugger → Tester:** via verification.yaml + explicit notification

**Debugger → Mansoni:** status updates after each phase

**Mansoni → Reviewer:** Escalation when timeout or low confidence

**Mansoni → Architect:** When systemic pattern detected (>5 occurrences)

---

## 🗑️ Session Retention

- **Active sessions:** keep indefinitely
- **Closed sessions (last 90 days):** keep
- **Closed sessions (>90 days):** archive to `/memories/archive/debug-sessions/`
- **Metrics:** keep 365 days for trend analysis

---

**Version:** 1.0
**Owner:** mansoni-debugger
**Dependencies:** mansoni-tester, mansoni, mansoni-debugger
**Created:** 2026-04-25
