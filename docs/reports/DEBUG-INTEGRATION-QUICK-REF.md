# 🔧 Debugger-Tester Integration — Quick Reference

## 📌 Для Tester Agent

### Когда FAIL в E2E тесте:

1. **Собирай evidence** (автоматически):
   - `screenshots/` — Playwright auto
   - `console_errors` — `page.on('console')`
   - `network_logs` — `page.on('request')`
   - `stack_trace` — `testInfo.error.stack`

2. **Генерируй failure_report.yaml**:
```bash
destination: /memories/session/failures/TEST-{YYYYMMDD}-{SEQ}.yaml
template: debugger-tester-integration/TEMPLATES.md#template-1
```

3. **Создай session dir**:
```bash
mkdir -p /memories/session/debug-sessions/DEBUG-{ID}/
cp failure_report.yaml debug-sessions/DEBUG-{ID}/
```

4. **Delegating to Mansoni**:
```yaml
payload:
  type: debug_request
  failure_report: "/path/to/TEST-xxx.yaml"
  action: "REPRODUCE → ISOLATE → ROOT CAUSE → FIX → VERIFY"
```

5. **Жди фикса** (session status: `awaiting_fix`)

6. **Когда Debugger запросит verification**:
```bash
# Primary failing test
npx playwright test e2e/send-message.spec.ts --grep="test_send_message_e2e"

# Regression suite
npm test -- messenger --coverage
```

7. **Обнови verification.yaml**:
```yaml
results:
  primary_test: {status: PASS|FAIL}
  regression_tests: {total, passed, failed}
verdict:
  status: VERIFIED_PASS|VERIFIED_FAIL
```

8. **Если PASS** → Mansoni закроет сессию
   **Если FAIL** → верни в Debugger с комментарием

---

## 📌 Для Debugger Agent

### Когда получаешь delegation от Mansoni:

1. **Прочитай failure_report.yaml**:
```bash
cat /memories/session/debug-sessions/${SESSION_ID}/failure_report.yaml
```

2. **Воспроизведи независимо** (не полагайся на Tester):
```bash
npm run dev
# Используй live-test-engineer skill или Playwright вручную
```

3. **Isolate**:
- Binary search кода
- Проверь network tab
- Проверь console errors
- Layer: UI → Network → Backend → DB → RLS

4. **Root Cause**:
- Найди конкретную строку
- Докажи (логи, трафик, код)
- Confidence ≥ 90%

5. **Fix** (минимальный):
- Измени только нужные строки
- Добавь recovery если нужно
- Проверь invariants

6. **Local verification**:
```bash
npx tsc --noEmit
npm test -- <affected-module>
```

7. **Запиши**:
- `debugger_notes.md` — timeline анализа
- `root_cause.md` — доказательства, паттерн
- `verification.yaml` — запрос Tester'у

8. **Request verification from Tester**:
```yaml
verification_id: VERIFY-20260425-042
related_failure: TEST-20260425-001
fix_id: DEBUG-20260425-042
test_plan:
  primary_test: "e2e/send-message.spec.ts::test_send_message_e2e"
  regression_scope: "messenger all"
  command: "npm test -- messenger"
```

9. **Жди ответа Tester'а** (session status: `verifying`)

10. **Если VERIFIED_FAIL** — переделай фикс (советуйся с code-review)
    **Если VERIFIED_PASS** — session закрывается Mansoni

---

## 📌 Для Mansoni (Orchestrator)

### Мониторинг активных сессий:

```bash
# List all open
find debug-sessions/ -name "metadata.json" | xargs grep '"status": "open"'

# List stale >4h
find debug-sessions/ -mmin +240 -name "metadata.json"

# Count by domain
grep -h "domain:" debug-sessions/*/metadata.json | sort | uniq -c
```

### Escalation rules (автоматические):

| Condition | Action |
|-----------|--------|
| `status='in_progress'` & `age>30min` | Ping Debugger: "status update?" |
| `status='fix_ready'` & `age>1h` | Ping Tester: "verify please" |
| `status='verifying'` & `age>10min` | Ping Tester: "stuck?" |
| `status='in_progress'` & `age>4h` | Escalate to `sequential-auditor` |
| `attempts >= 3` | Escalate to `mansoni-architect` |

### Metrics aggregation ( nightly ):

```bash
# MTTR (mean time to resolve)
jq '[.sessions[] | select(.status=="closed" and .closed_at > (now-604800))] |
    map(.closed_at - .started_at) | add / length' metrics.json

# Fix success rate
jq '[.sessions[]] | map(if .final_status=="VERIFIED_PASS" then 1 else 0 end) |
    add / length' metrics.json

# Top patterns
grep -h "pattern:" debug-sessions/*/root_cause.md | sort | uniq -c | sort -rn
```

---

## 📂 Directory Structure Reference

```
/memories/session/
├── failures/                          # Tester создаёт при каждом FAIL
│   ├── TEST-20260425-001.yaml         # Автоматически
│   ├── TEST-20260425-002.yaml
│   └── index.md                       # Summary таблица
│
└── debug-sessions/                    # Mansoni создаёт при delegation
    ├── DEBUG-20260425-001/            # Per-session dir
    │   ├── failure_report.yaml        # Input (от Tester'а)
    │   ├── debugger_notes.md          # Debugger analysis (пишет Debugger)
    │   ├── root_cause.md              # RCA с доказательствами (пишет Debugger)
    │   ├── fix.patch                  # Applied changes (optional)
    │   ├── verification.yaml          # Запрос + результат верификации (пишет Tester)
    │   ├── regression_report.yaml     # Full regression results (пишет Tester)
    │   └── metadata.json              # Auto (status, timestamps, assignees)
    ├── DEBUG-20260425-002/
    ├── index.md                       # Master table (auto-updated)
    └── metrics.json                   # KPIs (auto-updated)
```

---

## 🎯 Statuses & Transitions

```
┌─────────┐
│  open   │  ← Tester creates session, failure_report.yaml written
└────┬────┘
     │ Mansoni assigns to Debugger
     ▼
┌──────────────┐
│in_progress   │  ← Debugger reproducing, isolating, finding root cause
└──────┬───────┘
       │ Debugger has fix, requests verification
       ▼
┌──────────────┐
│  fix_ready   │  ← Fix applied, local verification passed
└──────┬───────┘
       │ Tester receives verification request
       ▼
┌──────────────┐
│  verifying   │  ← Tester running primary + regression tests
└──────┬───────┘
       │ Tester returns result
       ├────────────────────┐
       │                    │
       ▼                    ▼
┌──────────────┐    ┌──────────────┐
│  closed      │    │  rework_     │
│  (PASS)      │    │  needed      │
└──────────────┘    └──────────────┘
                         │ Debugger reworks
                         └──────────────────┐
                                            │
                                            ▼
                                      (back to fix_ready)
```

---

## 📊 Metrics Reference

**В metrics.json:**

```json
{
  "sessions": {
    "total": 156,
    "active": 3,
    "closed_last_7d": 24
  },
  "mttr_minutes": 47,
  "fix_success_rate": 0.94,
  "reproduction_rate": 0.96,
  "root_cause_accuracy": 0.82,
  "regression_rate": 0.02,
  "by_domain": {
    "messenger": { "mttr": 52, "success": 0.92 }
  },
  "common_causes": [
    { "cause": "CORS", "count": 8 }
  ]
}
```

---

## 🚨 Escalation Matrix

| Status | Age | Escalate To | Reason |
|--------|-----|-------------|--------|
| `in_progress` | 30 min | `mansoni-architect` | Stuck, needs architectural insight |
| `fix_ready` | 1 hour | `mansoni-reviewer` | Fix needs peer review |
| `verifying` | 10 min | `mansoni-tester` | Verification stuck |
| Any | 4 hours | `sequential-auditor` | Deep systemic audit |
| Any | 3 attempts | `mansoni-architect` + `auditor` | Pattern of failures |

---

## 🔍 Quick Queries

**Active sessions:**
```bash
grep -l '"status": "in_progress"' /memories/session/debug-sessions/*/metadata.json
```

**Sessions by domain:**
```bash
grep -h '"domain":' debug-sessions/*/metadata.json | sort | uniq -c
```

**MTTR trend:**
```bash
jq '.mttr | .avg_minutes' metrics.json
```

**Top failure patterns:**
```bash
grep -h "pattern:" debug-sessions/*/root_cause.md | sort | uniq -c | sort -rn | head -10
```

---

**Last updated:** 2026-04-25
**Protocol version:** 1.0
**Compatible agents:** mansoni-tester, mansoni-debugger, mansoni (orchestrator)
