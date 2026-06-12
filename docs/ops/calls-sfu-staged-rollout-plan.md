# Staged Rollout Plan: SFU E2EE Call System

> **Version:** 1.0 — Phase F  
> **Owner:** Engineering / On-call  
> **Last updated:** 2026-03-04  
> **Related runbook:** [`docs/runbooks/calls-sfu-e2ee-production-runbook.md`](../runbooks/calls-sfu-e2ee-production-runbook.md)

---

## Table of Contents

1. [Pre-requisites Checklist](#1-pre-requisites-checklist)
2. [Stage 1: Internal (Day 1–3)](#2-stage-1-internal-day-13)
3. [Stage 2: Canary 1% (Day 4–7)](#3-stage-2-canary-1-day-47)
4. [Stage 3: Canary 10% (Day 8–11)](#4-stage-3-canary-10-day-811)
5. [Stage 4: Canary 50% (Day 12–15)](#5-stage-4-canary-50-day-1215)
6. [Stage 5: Full Rollout (Day 16+)](#6-stage-5-full-rollout-day-16)
7. [Stage 6: Legacy Deletion (Day 23+)](#7-stage-6-legacy-deletion-day-23)
8. [Kill-switch Protocol](#8-kill-switch-protocol)
9. [Communication Plan](#9-communication-plan)

---

## 1. Pre-requisites Checklist

All items must be checked before beginning Stage 1.

### Testing
- [ ] All **39 unit tests** green (`npm test -- --coverage`)
- [ ] All **16 CI gate checks** pass (`node scripts/calls/e2ee-sfu-integration-gate.mjs`)
- [ ] Chaos gate passes (`node scripts/calls-chaos-gate.mjs`)
- [ ] WS contract validation passes (`node scripts/calls/validate-ws-contracts.mjs`)
- [ ] mediasoup smoke test passes (`node scripts/calls-mediasoup-smoke.mjs`)

### Infrastructure
- [ ] `mediasoup` native addon built for **production platform** (Linux x64 / ARM64)
- [ ] TURN servers (coturn) configured, deployed, and smoke-tested (`node scripts/turn/smoke-turn-credentials.mjs`)
- [ ] Redis available for distributed state (`SFU_STORE=redis` in prod env)
- [ ] `SFU_REQUIRE_MEDIASOUP=1` set in production environment
- [ ] `SFU_E2EE_REQUIRED=1` set in production environment

### Observability
- [ ] Prometheus metrics pipeline configured and scraping `calls-ws:3000/metrics`
- [ ] Grafana dashboard imported (all panels from runbook Section 3)
- [ ] All alert rules deployed (runbook Section 4)
- [ ] PagerDuty / on-call rotation configured for CRITICAL alerts

### Process
- [ ] Production runbook reviewed by on-call team
- [ ] Rollback procedure **tested** in staging (Level 1 and Level 3 rollback verified)
- [ ] Incident playbooks accessible to all engineers in rotation
- [ ] #calls-migration Slack channel created and on-call team added

### Sign-off
- [ ] Tech lead sign-off
- [ ] Security review of E2EE threat model (`docs/calls/E2EE_THREAT_MODEL.md`)
- [ ] On-call lead approval to proceed

---

## 2. Stage 1: Internal (Day 1–3)

### Target

Team members only (internal user IDs manually whitelisted).

### Configuration

```bash
# Enable for internal users only
VITE_CALLS_V2_ENABLED=true
VITE_CALLS_V2_USER_ALLOWLIST=user_id_1,user_id_2,user_id_3  # team member IDs

# Server
SFU_REQUIRE_MEDIASOUP=1
SFU_E2EE_REQUIRED=1
```

### Test Protocol

1. Each team member makes **at least 2 calls** (1:1 and group)
2. Test scenarios:
   - Normal call setup and teardown
   - Call with NAT traversal (from outside office network)
   - Rekey during active call (add new participant)
   - Network interruption and reconnect
   - Mobile browser (if applicable)
3. Log observations in #calls-migration

### Success Criteria

| Metric | Target |
|--------|--------|
| Total calls | ≥ 10 |
| Call failures | 0 |
| Setup latency | < 5s (subjective) |
| E2EE active | Confirmed in 100% of calls |
| Regressions vs legacy | None |

### Go/No-Go Gate

**Manual review.** Team lead reviews all test reports from #calls-migration. Any failure = No-Go.

**Go-ahead command:**
```bash
# Tag the build for canary promotion
git tag v2-calls-canary-1pct
git push origin v2-calls-canary-1pct
```

---

## 3. Stage 2: Canary 1% (Day 4–7)

### Target

1% of random production users (random hash bucket based on userId).

### Configuration

```bash
# Client: 1% bucket (userId hash % 100 < 1)
VITE_CALLS_V2_ENABLED=true
VITE_CALLS_V2_CANARY_PERCENT=1

# Server unchanged from Stage 1
SFU_REQUIRE_MEDIASOUP=1
SFU_E2EE_REQUIRED=1
```

### Monitoring — Required Checks Every 4 Hours

```bash
# Setup success rate (should be ≥ 99%)
curl -s 'http://metrics:9090/api/v1/query?query=rate(calls_setup_success_total{result="success"}[15m])/rate(calls_setup_success_total[15m])'

# Compare with legacy (control group)
# SFU error rate vs legacy error rate — no regression

# Plaintext media (must be 0)
curl -s 'http://metrics:9090/api/v1/query?query=calls_e2ee_plaintext_fallback_total'
```

### Success Criteria

| Metric | Target |
|--------|--------|
| Call setup success rate | ≥ 99% |
| Setup latency p95 | ≤ 5 000 ms |
| Plaintext media incidents | 0 |
| Error rate vs legacy | No statistically significant regression |
| KEY_ACK success rate | ≥ 99.5% |

### Auto-Rollback Trigger

```yaml
# This alert triggers automatic rollback to Stage 1 (internal only)
- alert: CanaryAutoRollback
  expr: |
    rate(calls_setup_success_total{result="success"}[5m])
    / rate(calls_setup_success_total[5m]) < 0.95
  for: 5m
  annotations:
    action: "ROLLBACK: set VITE_CALLS_V2_CANARY_PERCENT=0 and redeploy"
```

**Manual rollback:**
```bash
VITE_CALLS_V2_CANARY_PERCENT=0
# Redeploy frontend
npm run build && ./scripts/deploy.sh
```

### Go/No-Go Gate

All success criteria met for **48 consecutive hours**. No open incident tickets.

---

## 4. Stage 3: Canary 10% (Day 8–11)

### Target

10% of production users.

### Configuration

```bash
VITE_CALLS_V2_CANARY_PERCENT=10
```

### Additional Monitoring — Mobile-Specific

```bash
# Background/foreground reconnect rate (mobile users)
curl -s 'http://metrics:9090/api/v1/query?query=rate(calls_ws_reconnect_total{client_type="mobile"}[1h])'

# Network handoff recovery time (WiFi → cellular)
curl -s 'http://metrics:9090/api/v1/query?query=histogram_quantile(0.95,calls_reconnect_duration_ms_bucket{network_change="true"})'

# ICE restart success rate
curl -s 'http://metrics:9090/api/v1/query?query=rate(calls_transport_ice_restart_success_total[1h])/rate(calls_transport_ice_restart_total[1h])'
```

### Success Criteria

| Metric | Target |
|--------|--------|
| All Stage 2 SLOs | Met |
| Mobile reconnect p95 | ≤ 10 000 ms |
| Network handoff recovery p95 | ≤ 15 000 ms |
| No regression vs legacy | Confirmed for mobile clients |

### Go/No-Go Gate

All success criteria met for **72 consecutive hours** (3 days).

---

## 5. Stage 4: Canary 50% (Day 12–15)

### Target

50% of production users. First stage with meaningful concurrent load.

### Configuration

```bash
VITE_CALLS_V2_CANARY_PERCENT=50
```

### Load Testing (Day 12)

Before ramping to 50%, run load tests:

```bash
# Simulate concurrent rooms
node scripts/calls-mediasoup-smoke.mjs --rooms=50 --participants-per-room=4

# Worker scaling test
# Verify mediasoup workers scale correctly under load
# Expected: 1 worker per 100 concurrent participants (tune per hardware)
```

Expected worker scaling behavior:
- Baseline: 4 workers for up to ~400 concurrent participants
- Alert if any worker CPU > 80% sustained
- Verify new rooms distributed evenly across workers

### Monitoring — Load-Specific

```bash
# Worker CPU per instance
curl -s 'http://metrics:9090/api/v1/query?query=calls_worker_cpu_utilization'

# Room distribution (should be even)
curl -s 'http://sfu-server:3000/workers'

# Memory: mediasoup allocates ~10MB per room
# Alert if total SFU memory > 80% of available
```

### Success Criteria

| Metric | Target |
|--------|--------|
| All previous SLOs | Met |
| Worker CPU p95 | < 70% |
| Room distribution | No single worker > 2x average load |
| No OOM errors | Confirmed |

### Go/No-Go Gate

72 hours at 50% with all SLOs met. Load test report reviewed and approved.

---

## 6. Stage 5: Full Rollout (Day 16+)

### Target

100% of production users. Legacy P2P disabled.

### Configuration

```bash
VITE_CALLS_V2_CANARY_PERCENT=100
# or
VITE_CALLS_V2_ENABLED=true  # for all users, no allowlist

# Disable legacy P2P feature flags (if any)
VITE_LEGACY_P2P_ENABLED=false
```

### 7-Day Observation Window (Day 16–22)

Monitor all SLOs continuously. No changes to calls system during this period unless responding to incidents.

**Daily check (automated):**
```bash
node scripts/check-kpi-status.mjs --module=calls
```

**Day 22 — Final Assessment:**

| Check | Pass Condition |
|-------|----------------|
| Setup success rate | ≥ 99% sustained over 7 days |
| No plaintext incidents | 0 |
| P95 setup latency | ≤ 5 000 ms |
| All open incidents | Resolved or accepted |
| Error budget consumed | < 50% of monthly budget |

### Go/No-Go Gate for Stage 6

Tech lead + security team sign-off required to proceed with legacy deletion.

---

## 7. Stage 6: Legacy Deletion (Day 23+)

### ⚠️ Irreversible — Requires explicit approval

After 7-day observation window passes with all SLOs met.

### Files to Delete

```bash
# 1. Legacy P2P call hook
rm src/hooks/calls/useVideoCall.ts

# 2. Legacy video_call_signals table handlers (in server or Supabase)
# Remove handlers for: video_call_offer, video_call_answer, video_call_candidate
# Remove from: server/calls-ws/index.mjs (legacy broadcast section)

# 3. Supabase broadcast signaling code
# Remove: supabase realtime channel subscription for call signaling
# Retained: SFU WebSocket connection only

# 4. Remove simple-peer dependency
npm uninstall simple-peer
```

### Code Cleanup Checklist

- [ ] `src/hooks/calls/useVideoCall.ts` deleted
- [ ] `@deprecated` references to legacy hook removed from all imports
- [ ] `video_call_signals` Supabase table handler code removed from server
- [ ] Supabase broadcast channel subscription for P2P signaling removed
- [ ] `simple-peer` removed from `package.json`
- [ ] `npm install` runs clean (no missing deps)
- [ ] All 39 tests still pass after deletion
- [ ] CI gate passes after deletion

### Tech Debt Items to Close

- [ ] JIRA/Linear: "Replace P2P calls with SFU" — close as Done
- [ ] JIRA/Linear: "Remove simple-peer dependency" — close as Done
- [ ] JIRA/Linear: "E2EE for video calls" — close as Done
- [ ] Update architecture diagram in `docs/` to remove P2P paths
- [ ] Archive legacy call flow documentation

---

## 8. Kill-switch Protocol

### Automatic Kill-switch

The system automatically reverts to the **previous rollout stage** (not legacy P2P) when:

| Trigger | Action |
|---------|--------|
| Setup success < 95% for 5 min | Auto-revert: reduce `VITE_CALLS_V2_CANARY_PERCENT` to previous stage value |
| Plaintext media detected | Emergency: set `VITE_CALLS_V2_ENABLED=false`, page security team |

Automation script (called by alertmanager webhook):
```bash
# scripts/calls/auto-rollback.sh
#!/bin/bash
CURRENT_STAGE=$1
case $CURRENT_STAGE in
  100) NEW_PERCENT=50 ;;
  50)  NEW_PERCENT=10 ;;
  10)  NEW_PERCENT=1  ;;
  *)   NEW_PERCENT=0  ;;
esac
echo "VITE_CALLS_V2_CANARY_PERCENT=$NEW_PERCENT" >> .env.production
# Trigger redeployment via CI
curl -X POST "$CI_TRIGGER_URL" -d "ref=main&variables[ROLLBACK_CANARY]=$NEW_PERCENT"
```

### Manual Kill-switch

Any on-call engineer can revert at any time:

```bash
# Via feature flag (fastest — no redeploy needed if using runtime flags)
# Set in feature flag service:
calls_v2_canary_percent = 0

# Via environment variable + redeploy:
VITE_CALLS_V2_CANARY_PERCENT=0
npm run build && ./scripts/deploy.sh

# Verify rollback
curl http://sfu-server:3000/health
# Monitor setup success rate
```

### What Kill-switch Does NOT Do

- ❌ Does **not** return to legacy P2P protocol (P2P is deprecated, not a fallback)
- ❌ Does **not** disable E2EE on remaining users (once set, stays E2EE)
- ✅ Reduces blast radius by limiting SFU users to already-validated cohort
- ✅ Version rollback (Level 3) is always available for complete revert

### Kill-switch Decision Authority

| Severity | Who Can Activate | Approval Needed |
|----------|-----------------|-----------------|
| Automatic trigger | System | None |
| Setup success < 99% | On-call engineer | None (self-authorize) |
| Plaintext media | On-call engineer | None (security incident) |
| Manual revert at discretion | On-call engineer | Notify tech lead |

---

## 9. Communication Plan

### Internal

**Channel:** `#calls-migration` (Slack)

| Event | Message |
|-------|---------|
| Stage advancement | "🟢 Calls SFU: advancing to Stage N — [metric summary]" |
| Alert fired | "🟡 Calls SFU Alert: [alert name] — investigating" |
| Incident declared | "🔴 Calls SFU Incident: [description] — [incident commander]" |
| Rollback activated | "⚠️ Calls SFU: rollback to Stage N — [reason]" |
| Stage 5 complete | "✅ Calls SFU: full rollout complete, 7-day observation started" |
| Stage 6 started | "🗑️ Calls SFU: legacy deletion approved, starting cleanup" |

**Incident commander rotation:** follows existing on-call rotation.

### External

**No user-facing announcement required.** This is a transparent infrastructure migration.

- Users will not notice the switch (same UI, same call quality or better)
- No changelog entry in user-visible release notes
- If users report issues during canary, handle via normal support channels

### Escalation Path

```
On-call Engineer
      │ (15 min no resolution)
      ▼
Tech Lead
      │ (30 min, incident expanding)
      ▼
Engineering Manager
      │ (security incident or data breach)
      ▼
Security Team + CTO
```

---

*Document maintained by Engineering. Update stage status after each advancement.*
