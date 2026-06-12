# Production Runbook: SFU E2EE Call System

> **Version:** 1.0 — Phase F  
> **Owner:** On-call team  
> **Last updated:** 2026-03-04  
> **Scope:** SFU-only call pipeline with end-to-end encryption (mediasoup + SFrame)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [SLO Definitions](#2-slo-definitions)
3. [Key Metrics to Monitor](#3-key-metrics-to-monitor)
4. [Alert Rules](#4-alert-rules)
5. [Incident Playbooks](#5-incident-playbooks)
6. [Rollback Procedure](#6-rollback-procedure)
7. [Health Check Endpoints](#7-health-check-endpoints)

---

## 1. Architecture Overview

### Call Flow Diagram (SFU-only)

```
Client A                    SFU Server (mediasoup)            Client B
────────                    ──────────────────────            ────────
useVideoCallSfu             calls-ws (WebSocket)              useVideoCallSfu
     │                             │                               │
     │─── WS connect ─────────────>│                               │
     │<── JOIN_ACK ────────────────│                               │
     │                             │<──── WS connect ──────────────│
     │                             │───── JOIN_ACK ───────────────>│
     │                             │                               │
     │─── KEY_PACKAGE ────────────>│──── KEY_PACKAGE ─────────────>│
     │<── KEY_PACKAGE ─────────────│<─── KEY_PACKAGE ──────────────│
     │                             │                               │
     │  [ECDH key exchange]        │                   [ECDH key exchange]
     │  CallKeyExchange            │                   CallKeyExchange
     │  → epoch key derived        │                   → epoch key derived
     │                             │                               │
     │─── TRANSPORT_CREATE ───────>│                               │
     │<── TRANSPORT_CREATED ───────│                               │
     │─── TRANSPORT_CONNECT ──────>│  [DTLS handshake]             │
     │<── TRANSPORT_CONNECTED ─────│                               │
     │                             │                               │
     │─── PRODUCE ────────────────>│                               │
     │<── PRODUCED ────────────────│                               │
     │  [SFrame encrypt]           │  [SFU routes                  │
     │  CallMediaEncryption        │   ciphertext only]            │
     │                             │──── CONSUMER_ADDED ──────────>│
     │                             │                         [SFrame decrypt]
     │                             │                         CallMediaEncryption
     │                             │                               │
     │  Media: encrypted RTP ─────>│──── encrypted RTP ───────────>│
     │  (AES-128-GCM SFrame)       │  (SFU never sees plaintext)   │
```

### Components and Their Roles

| Component | Location | Role |
|-----------|----------|------|
| `useVideoCallSfu` | `src/hooks/calls/useVideoCallSfu.ts` | Main call hook, SFU-only, replaces P2P |
| `SfuMediaManager` | `src/lib/calls/SfuMediaManager.ts` | mediasoup-client Device lifecycle, Transport/Producer/Consumer management |
| `CallKeyExchange` | `src/lib/calls/CallKeyExchange.ts` | ECDH P-256 + HKDF-SHA256 + AES-256-KW key exchange |
| `CallMediaEncryption` | `src/lib/calls/CallMediaEncryption.ts` | SFrame transform orchestration, Insertable Streams |
| `RekeyStateMachine` | `src/lib/calls/RekeyStateMachine.ts` | Quorum-driven rekey, cooldown, abort policy |
| `EpochGuard` | `src/lib/calls/EpochGuard.ts` | Fail-closed E2EE enforcement, monotonic epoch |
| `calls-ws` | `server/calls-ws/index.mjs` | WebSocket signaling server, mediasoup Workers/Routers |
| TURN/coturn | `infra/calls/coturn/` | ICE relay for NAT traversal |

### Trust Model Summary

- **SFU is untrusted**: receives only encrypted RTP (SFrame ciphertext)
- **Key exchange is peer-to-peer**: ECDH via signaling relay, SFU cannot derive keys
- **EpochGuard enforces fail-closed**: no media flows without active E2EE epoch
- **Anti-replay**: TTL-based `messageId` deduplication on all signaling messages

---

## 2. SLO Definitions

| SLO | Target | Measurement Window | Error Budget |
|-----|--------|--------------------|--------------|
| **Call Setup Success Rate** | ≥ 99% | Rolling 5 min | 1% |
| **Call Setup Latency p95** | ≤ 5 000 ms | Rolling 1 h | — |
| **Reconnect Recovery p95** | ≤ 10 000 ms | Rolling 1 h | — |
| **Rekey Abort Rate** | < 0.5% | Rolling 15 min | — |
| **KEY_ACK Success Rate** | ≥ 99.5% | Rolling 15 min | 0.5% |
| **E2EE Epoch Sync Failure** | < 0.1% | Rolling 1 h | — |
| **ICE/TURN Success Rate** | ≥ 98% | Rolling 1 h | 2% |
| **Plaintext Media Fallback** | 0 incidents | All-time | 0 |

### SLO Definitions Detail

**Call Setup Success Rate** — % of calls that progress from `JOIN` to `MEDIA_CONNECTED` state without failure. Denominator: all JOIN attempts. Numerator: joins that reach MEDIA_CONNECTED within 30s.

**Call Setup Latency p95** — 95th percentile time from `JOIN` WebSocket message to first media packet decrypted (MEDIA_CONNECTED event). Measured client-side via `calls.setup.duration_ms`.

**Reconnect Recovery p95** — 95th percentile time from WebSocket disconnect detection to reconnect + media resumption. Includes ICE restart if needed.

**Rekey Abort Rate** — % of rekey attempts that end in `REKEY_ABORT` (timeout > 15s or quorum failure) vs total rekey initiations.

**KEY_ACK Success Rate** — % of `KEY_PACKAGE` messages that receive `KEY_ACK` from all participants within 5s.

**E2EE Epoch Sync Failure** — % of media frames rejected by `EpochGuard` due to epoch mismatch (not counting expected rollback attempts).

**ICE/TURN Success Rate** — % of ICE negotiations that succeed (including TURN relay fallback).

**Plaintext Media Fallback** — Any case where media flows without SFrame encryption. Must be zero. `EpochGuard` fail-closed prevents this by design.

---

## 3. Key Metrics to Monitor

### Prometheus Metric Definitions

```
# Call setup timing
calls_setup_duration_ms{quantile="0.5|0.95|0.99"} — histogram
calls_setup_success_total                          — counter (label: result="success|failure")

# E2EE key exchange
calls_e2ee_key_ack_total{result="acked|sent"}      — counter
calls_e2ee_rekey_abort_total                       — counter
calls_e2ee_epoch_desync_total                      — counter
calls_e2ee_decrypt_fail_ratio                      — gauge (sliding window)

# Transport layer
calls_transport_dtls_connect_ms{quantile}          — histogram
calls_transport_ice_success_total{result}          — counter

# Media routing (SFU)
calls_media_produce_success_total                  — counter
calls_media_consume_success_total                  — counter

# WebSocket signaling
calls_ws_reconnect_total                           — counter
calls_ws_message_dedup_total                       — counter
```

### Dashboard Panels (Grafana)

| Panel | Query | Alert |
|-------|-------|-------|
| Setup Success Rate | `rate(calls_setup_success_total{result="success"}[5m]) / rate(calls_setup_success_total[5m])` | < 99% → WARNING |
| Setup Latency p95 | `histogram_quantile(0.95, calls_setup_duration_ms_bucket)` | > 5000ms → WARNING |
| Rekey Abort Rate | `rate(calls_e2ee_rekey_abort_total[15m]) / rate(calls_e2ee_rekey_total[15m])` | > 0.5% → WARNING |
| KEY_ACK Rate | `rate(calls_e2ee_key_ack_total{result="acked"}[15m]) / rate(calls_e2ee_key_ack_total{result="sent"}[15m])` | < 99.5% → WARNING |
| Epoch Desync | `rate(calls_e2ee_epoch_desync_total[1h])` | > 0.1% → WARNING |
| ICE Success Rate | `rate(calls_transport_ice_success_total{result="success"}[1h]) / rate(calls_transport_ice_success_total[1h])` | < 98% → WARNING |
| Plaintext Incidents | `calls_e2ee_plaintext_fallback_total` | > 0 → CRITICAL |
| WS Reconnects | `rate(calls_ws_reconnect_total[1m])` | > 50/min → INFO |

---

## 4. Alert Rules

### CRITICAL Alerts (page on-call immediately)

```yaml
- alert: CallSetupSuccessRateCritical
  expr: |
    rate(calls_setup_success_total{result="success"}[5m])
    / rate(calls_setup_success_total[5m]) < 0.95
  for: 5m
  severity: critical
  annotations:
    summary: "Call setup success rate below 95% for 5 minutes"
    runbook: "https://wiki/runbooks/calls-sfu-e2ee#incident-1-no-connection"

- alert: PlaintextMediaDetected
  expr: calls_e2ee_plaintext_fallback_total > 0
  for: 0m
  severity: critical
  annotations:
    summary: "SECURITY: Plaintext media fallback detected"
    runbook: "https://wiki/runbooks/calls-sfu-e2ee#rollback-procedure"
```

### WARNING Alerts (notify on-call, no page)

```yaml
- alert: CallSetupSuccessRateWarning
  expr: |
    rate(calls_setup_success_total{result="success"}[15m])
    / rate(calls_setup_success_total[15m]) < 0.99
  for: 15m
  severity: warning
  annotations:
    summary: "Call setup success rate below 99% for 15 minutes"

- alert: RekeyAbortRateHigh
  expr: |
    rate(calls_e2ee_rekey_abort_total[15m])
    / rate(calls_e2ee_rekey_total[15m]) > 0.02
  for: 15m
  severity: warning
  annotations:
    summary: "Rekey abort rate above 2% — possible rekey storm"
    runbook: "https://wiki/runbooks/calls-sfu-e2ee#incident-3-rekey-storm"

- alert: KeyAckRateLow
  expr: |
    rate(calls_e2ee_key_ack_total{result="acked"}[15m])
    / rate(calls_e2ee_key_ack_total{result="sent"}[15m]) < 0.98
  for: 15m
  severity: warning
  annotations:
    summary: "KEY_ACK rate below 98% — clients may be missing key packages"
```

### INFO Alerts (Slack notification only)

```yaml
- alert: HighWsReconnectRate
  expr: rate(calls_ws_reconnect_total[1m]) > 50
  for: 2m
  severity: info
  annotations:
    summary: "WebSocket reconnect rate > 50/min — possible network instability"
```

---

## 5. Incident Playbooks

### Incident 1: "Нет соединения" — ICE Failure

**Symptoms:** Users report calls not connecting. `calls_transport_ice_success_total{result="failure"}` elevated. Setup success rate dropping.

**Step 1: Confirm ICE failure**
```bash
# Check ICE failure rate last 10 min
curl -s 'http://metrics-server:9090/api/v1/query?query=rate(calls_transport_ice_success_total{result="failure"}[10m])'

# Check TURN server reachability
curl -v http://turn-server:3478/health
```

**Step 2: Test TURN credentials**
```bash
node scripts/turn/smoke-turn-credentials.mjs
```

**Step 3: Check coturn logs**
```bash
docker logs coturn --tail 100 | grep -E "ERROR|WARN|allocation"
```

**Step 4: Verify TURN config**
```bash
# Check turnserver.prod.conf
cat infra/calls/coturn/turnserver.prod.conf

# Ensure external-ip is set correctly
grep external-ip infra/calls/coturn/turnserver.prod.conf
```

**Step 5: If TURN is down — restart**
```bash
docker-compose -f infra/calls/docker-compose.prod.yml restart coturn
# Monitor ICE success rate recovery
```

**Resolution:** ICE success rate returns to ≥ 98% within 5 minutes.

---

### Incident 2: "E2EE Desync" — Epoch Mismatch Recovery

**Symptoms:** Users report audio/video freezing or dropping. `calls_e2ee_epoch_desync_total` elevated. `calls_e2ee_decrypt_fail_ratio` > 0.

**Step 1: Confirm epoch desync**
```bash
curl -s 'http://metrics-server:9090/api/v1/query?query=rate(calls_e2ee_epoch_desync_total[5m])'
```

**Step 2: Check EpochGuard state via server logs**
```bash
docker logs calls-ws --tail 200 | grep -E "epoch|EPOCH|EpochGuard"
```

**Step 3: Identify affected rooms**
```bash
# Get active rooms count
curl http://sfu-server:3000/rooms

# Look for rooms with high epoch errors in logs
docker logs calls-ws --tail 500 | grep "epoch_desync" | awk '{print $5}' | sort | uniq -c | sort -rn
```

**Step 4: Force rekey in affected room**

Desync typically self-resolves via `RekeyStateMachine` automatic trigger. If not within 30s:
- Instruct users to leave and rejoin the call
- This triggers fresh `CallKeyExchange` and clean epoch start

**Step 5: If systemic (>10 rooms affected)**
- Check for deployment/version mismatch between clients
- Verify `EpochGuard` version consistency: all clients must be on same build
- Consider activating rollback if > 5% of calls affected

**Resolution:** Epoch desync rate returns to < 0.1% within 10 minutes after rejoin.

---

### Incident 3: "Rekey Storm" — Rate Limit and Cooldown

**Symptoms:** `calls_e2ee_rekey_abort_total` spiking. High CPU on calls-ws. `RekeyStateMachine` emitting multiple REKEY_ABORT per minute.

**Step 1: Confirm rekey storm**
```bash
curl -s 'http://metrics-server:9090/api/v1/query?query=rate(calls_e2ee_rekey_abort_total[5m])'
# If > 2% of rekey attempts aborting, this is a storm
```

**Step 2: Identify trigger**
```bash
# Check for participant churn (join/leave events)
docker logs calls-ws --tail 500 | grep -E "JOIN|LEAVE|REKEY_INIT" | wc -l

# Check RekeyStateMachine cooldown enforcement
docker logs calls-ws --tail 200 | grep "rekey_cooldown"
```

**Step 3: Server-side rate limit**

`RekeyStateMachine` has built-in cooldown (min 30s between rekeys). If storm persists:
```bash
# Temporarily increase rekey cooldown via env var (if supported)
# or deploy config patch:
SFU_REKEY_MIN_INTERVAL_MS=60000  # increase from 30s to 60s
docker-compose -f infra/calls/docker-compose.prod.yml up -d calls-ws
```

**Step 4: If large room is causing storm**
- Identify the room ID from logs
- Force-terminate by removing from active rooms:
```bash
# Via admin API (if available)
curl -X DELETE http://sfu-server:3000/rooms/{roomId}
```

**Resolution:** Rekey abort rate < 0.5% for 5 consecutive minutes.

---

### Incident 4: "Partial Region Outage" — Failover Procedure

**Symptoms:** Calls failing in specific geographic region. ICE failures localized to one TURN server / SFU worker.

**Step 1: Identify affected region**
```bash
# Check worker status
curl http://sfu-server:3000/workers

# Check TURN server health per region
for region in eu-west us-east ap-south; do
  echo "=== $region ==="
  curl -s "http://turn-$region:3478/health" || echo "UNREACHABLE"
done
```

**Step 2: Remove failed worker from routing**
```bash
# calls-ws supports worker isolation
# Set environment variable to exclude failed worker
SFU_DISABLED_WORKERS=worker-2 docker-compose up -d calls-ws
```

**Step 3: Redirect traffic to healthy region**
```bash
# Update DNS / load balancer to exclude failed TURN
# In coturn config, remove failed peer
# Reload coturn
docker-compose -f infra/calls/docker-compose.prod.yml restart coturn
```

**Step 4: Monitor recovery**
```bash
# Watch setup success rate per region
watch -n 10 'curl -s "http://metrics-server:9090/api/v1/query?query=calls_setup_success_total" | jq .'
```

**Resolution:** Setup success rate ≥ 99% globally within 10 minutes of failover.

---

### Incident 5: "DTLS Handshake Failure" — Certificate/Config Check

**Symptoms:** `calls_transport_dtls_connect_ms` histogram showing timeouts. Users stuck at "Connecting..." state. Logs show DTLS errors.

**Step 1: Check DTLS errors in logs**
```bash
docker logs calls-ws --tail 300 | grep -iE "dtls|certificate|fingerprint"
```

**Step 2: Verify mediasoup DTLS certificates**
```bash
# mediasoup uses self-signed certs by default — check rotation
docker exec calls-ws node -e "
const mediasoup = require('mediasoup');
mediasoup.createWorker().then(w => {
  console.log(JSON.stringify(w.dtlsParameters, null, 2));
  process.exit(0);
});
"
```

**Step 3: Check client fingerprint matching**

DTLS fingerprint must match between `TRANSPORT_CREATED` server response and client's `TRANSPORT_CONNECT` payload. Mismatch = handshake failure.

```bash
# Validate WS contract
node scripts/calls/validate-ws-contracts.mjs
```

**Step 4: Restart workers to regenerate certificates**
```bash
docker-compose -f infra/calls/docker-compose.prod.yml restart calls-ws
# Monitor DTLS connect times
```

**Resolution:** DTLS connect p95 < 2000ms within 5 minutes of worker restart.

---

### Incident 6: "Consumer Not Receiving Media" — SFU Routing Debug

**Symptoms:** Caller hears/sees nothing. Producer active on sender side, but consumer not receiving. `calls_media_consume_success_total` low.

**Step 1: Verify producer is active**
```bash
docker logs calls-ws --tail 200 | grep -E "PRODUCE|producer_id"
# Confirm producer created and listed in room
curl http://sfu-server:3000/rooms/{roomId}/producers
```

**Step 2: Check consumer creation**
```bash
docker logs calls-ws --tail 200 | grep -E "CONSUME|consumer_id|CONSUMER_ADDED"
# CONSUMER_ADDED must be sent to receiving client
```

**Step 3: Verify RTP capabilities match**
```bash
# Client must send LOAD_DEVICE before consuming
# Check RTP capabilities negotiation in logs
docker logs calls-ws --tail 100 | grep "rtpCapabilities"
```

**Step 4: Check Router RTP capabilities**
```bash
# Codec mismatch between router and device can prevent consumer creation
# Verify supported codecs in calls-ws config
grep -A 20 "mediaCodecs" server/calls-ws/index.mjs
```

**Step 5: Force consumer re-creation**
- Instruct receiver to disconnect and reconnect
- This triggers fresh `CONSUME` request chain
- Monitor `calls_media_consume_success_total`

**Resolution:** Consumer receiving media within 30s of re-join.

---

## 6. Rollback Procedure

### Level 1: Feature Flag Rollback (during canary stages)

```bash
# Client-side: disable SFU call hook, fall back to legacy warning UI
# Set in deployment environment:
VITE_CALLS_V2_ENABLED=false

# Rebuild and redeploy frontend
npm run build
# Deploy to CDN / static hosting
```

> ⚠️ `useVideoCall.ts` (legacy P2P) was deprecated in Phase D. After Stage 5 (full rollout) and Stage 6 (legacy deletion), there is no P2P fallback — only version rollback is available.

### Level 2: Server Config Rollback

```bash
# Allow non-mediasoup fallback mode (if server supports it)
SFU_REQUIRE_MEDIASOUP=0

# Disable E2EE enforcement (emergency only — security risk)
# SFU_E2EE_REQUIRED=0  ← DO NOT USE unless authorized by security team

docker-compose -f infra/calls/docker-compose.prod.yml up -d calls-ws
```

### Level 3: Full Deployment Rollback

```bash
# Revert to previous Docker image
docker-compose -f infra/calls/docker-compose.prod.yml pull calls-ws:previous
docker-compose -f infra/calls/docker-compose.prod.yml up -d calls-ws

# Verify health
curl http://sfu-server:3000/health
```

### Rollback Decision Matrix

| Condition | Action | Time Limit |
|-----------|--------|------------|
| Setup success < 95% for 5min | Auto-revert to previous rollout stage | Immediate |
| Plaintext media detected | Emergency rollback Level 3 | Immediate |
| Setup success < 99% for 15min | WARNING → manual review, prepare Level 1 | 15 min |
| Rekey abort > 2% for 15min | Investigate → Level 2 config if needed | 30 min |

---

## 7. Health Check Endpoints

### SFU Server (`calls-ws`)

```
GET http://sfu-server:3000/health
```
**Response (healthy):**
```json
{
  "status": "ok",
  "workers": 4,
  "rooms": 12,
  "uptime_s": 86400
}
```
**HTTP 200** = healthy. Any non-200 or connection refused = CRITICAL alert.

---

```
GET http://sfu-server:3000/metrics
```
**Response:** Prometheus text format. Used by Grafana scrape job.

---

```
GET http://sfu-server:3000/rooms
```
**Response:**
```json
{
  "count": 12,
  "rooms": [
    { "id": "room-abc123", "participants": 3, "producers": 6 }
  ]
}
```
Useful for capacity monitoring and incident investigation.

### TURN Server (coturn)

```bash
# TCP health check
nc -zv turn-server 3478

# TURN allocation smoke test
node scripts/turn/smoke-turn-credentials.mjs
```

### WebSocket Signaling

```bash
# WebSocket connectivity check
node scripts/calls/validate-ws-contracts.mjs

# Smoke test (creates room, joins, checks media negotiation)
node scripts/calls-mediasoup-smoke.mjs
```

---

*Document maintained by on-call team. Update after each incident. Review quarterly.*
