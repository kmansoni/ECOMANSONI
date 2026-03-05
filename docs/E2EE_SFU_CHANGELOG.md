# E2EE SFU Call Pipeline — Changelog

> Full migration history: P2P WebRTC → SFU-only + End-to-End Encryption

---

## [Unreleased] — Phase A–F Implementation

### Phase A: Protocol Parity + mediasoup-client Integration

- Installed `mediasoup-client` dependency (removed `simple-peer` P2P)
- Created `SfuMediaManager` — full mediasoup-client Device lifecycle management (create, load, connect)
- Strengthened WS contract types: `DtlsParameters`, `RtpParameters`, `RtpCapabilities` properly typed
- Fixed `TRANSPORT_CONNECT`, `PRODUCE`, `CONSUME` payloads to match server schema (breaking contract fixes)
- Added `CONSUMED` / `CONSUMER_ADDED` event handling for remote media streams
- Added `LOAD_DEVICE` → server RTP capabilities negotiation flow

### Phase B: Real E2EE Key Exchange + Media Encryption

- Created `CallKeyExchange` — ECDH P-256 + HKDF-SHA256 + AES-256-KW key exchange
- Created `CallMediaEncryption` — SFrame transform orchestration via Insertable Streams API
- Replaced STUB KEY_PACKAGE with real ECDH ephemeral key exchange
- Connected `MediaEncryptor` (Insertable Streams) to call pipeline producer/consumer tracks
- Identity binding: `userId + deviceId + sessionId` included in signed KEY_PACKAGE
- ECDSA signing of KEY_PACKAGE for participant identity verification

### Phase C: Rekey State Machine + Epoch Gating

- Created `RekeyStateMachine` — formal state machine with quorum-driven epoch commit
  - States: `IDLE → REKEY_PENDING → COLLECTING_ACKS → COMMITTED → IDLE`
  - REKEY_ABORT policy: 15s deadline timeout
  - Minimum cooldown: 30s between rekey initiations
- Created `EpochGuard` — fail-closed E2EE enforcement
  - No media frames pass without active E2EE epoch
  - Monotonic epoch enforcement (no rollback, no reuse)
- Anti-replay: TTL-based `messageId` deduplication on all signaling messages
- Monotonic epoch check integration with SFrame decrypt pipeline
- Deadline-based REKEY_ABORT policy with participant timeout tracking

### Phase D: SFU-only Production + Legacy Removal

- Created `useVideoCallSfu` — SFU-only call hook, direct replacement for `useVideoCall` P2P hook
- Deprecated `useVideoCall.ts` (legacy P2P, marked `@deprecated`, not yet deleted)
- Removed `simple-peer` from active code paths
- Created production environment configurations:
  - `SFU_REQUIRE_MEDIASOUP=1` — rejects non-mediasoup connections
  - `SFU_E2EE_REQUIRED=1` — rejects non-SFrame media
- Updated `docker-compose.prod.yml` for SFU-only deployment topology
- Production TURN server configuration (`infra/calls/coturn/turnserver.prod.conf`)

### Phase E: Tests & CI Gates

- **39 unit tests** covering:
  - `CallKeyExchange` — ECDH derivation, KEY_PACKAGE signing, KEY_ACK verification
  - `RekeyStateMachine` — all state transitions, timeout, quorum, abort
  - `EpochGuard` — fail-closed enforcement, monotonic check, desync detection
  - `CallMediaEncryption` — SFrame encrypt/decrypt, epoch gating
- **16 CI gate checks** in `scripts/calls/e2ee-sfu-integration-gate.mjs`:
  - WS contract validation
  - E2EE required flags check
  - Epoch guard enforcement verification
  - Anti-replay deduplication check
  - Rekey state machine integrity
  - Legacy P2P code absence check
- Updated `scripts/calls-chaos-gate.mjs` with E2EE gate step integration

### Phase F: Observability, Runbook & Rollout Plan

- Production runbook with SLO definitions and alert thresholds:
  - [`docs/runbooks/calls-sfu-e2ee-production-runbook.md`](./runbooks/calls-sfu-e2ee-production-runbook.md)
- Staged rollout plan (Internal → 1% → 10% → 50% → 100% → Legacy deletion):
  - [`docs/ops/calls-sfu-staged-rollout-plan.md`](./ops/calls-sfu-staged-rollout-plan.md)
- E2EE threat model with 15 threat entries, key lifecycle documentation:
  - [`docs/calls/E2EE_THREAT_MODEL.md`](./calls/E2EE_THREAT_MODEL.md)
- Prometheus metric definitions for all call SLOs
- Alert rules (CRITICAL / WARNING / INFO) with severity thresholds
- 6 incident playbooks (ICE failure, epoch desync, rekey storm, regional outage, DTLS failure, consumer routing)
- Kill-switch protocol with manual and automatic rollback procedures

---

## SLO Summary (as of Phase F)

| SLO | Target |
|-----|--------|
| Call Setup Success Rate | ≥ 99% |
| Call Setup Latency p95 | ≤ 5 000 ms |
| Reconnect Recovery p95 | ≤ 10 000 ms |
| Rekey Abort Rate | < 0.5% |
| KEY_ACK Success Rate | ≥ 99.5% |
| E2EE Epoch Sync Failure | < 0.1% |
| ICE/TURN Success Rate | ≥ 98% |
| Plaintext Media Fallback | 0 incidents |

---

## Architecture Summary

```
Before (P2P):   Client A ←──── WebRTC P2P ────→ Client B
After  (SFU):   Client A → SFU (mediasoup) → Client B
                           ↑
                    SFrame E2EE: SFU sees only ciphertext
```

**Key invariant:** SFU server is fully untrusted. It routes only SFrame-encrypted RTP.  
Epoch keys are derived via ECDH peer-to-peer; the SFU relay cannot derive them.

---

*Changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.*
