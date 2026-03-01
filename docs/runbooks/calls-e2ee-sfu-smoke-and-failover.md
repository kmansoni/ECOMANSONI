# Calls E2EE+SFU Smoke and Failover Runbook

## Scope

This runbook validates production readiness for calls with E2EE+SFU under:
- strict ICE/TURN behavior,
- WS reconnect and multi-region failover,
- periodic E2EE rekey/epoch rotation,
- SLO telemetry samples.

## Required Env (Web Client)

- `VITE_CALLS_V2_ENABLED=true`
- `VITE_CALLS_V2_WS_URLS=wss://sfu-ru.example.com/ws,wss://sfu-tr.example.com/ws`
- `VITE_CALLS_V2_REKEY_INTERVAL_MS=120000`
- `VITE_TURN_CREDENTIALS_URL` (or Supabase function configured)

## Required Env (SFU Nodes)

- `SFU_REGION=ru|tr|ae`
- `SFU_NODE_ID=<unique-node-id>`
- `SFU_E2EE_REQUIRED=1`
- `SFU_HEARTBEAT_SEC=10`

## Health and Metrics Checks

Run on each region node:

1. `GET /healthz` returns:
   - `ok=true`
   - correct `region`
   - correct `nodeId`
   - `wsReady=true`

2. `GET /metrics` returns:
   - `rooms`
   - `peers`
   - `producers`
   - `roomsByRegion`

3. Verify `uptimeSec` is increasing and endpoints are stable for at least 10 minutes.

## Smoke Scenario (Single Call)

1. Start call A -> B.
2. Confirm setup completes and call is connected.
3. Confirm local audio/video produce requests were sent in control-plane.
4. Confirm incoming producer events trigger consume requests.
5. Keep call alive for at least 3 minutes and verify no unexpected disconnect.

Expected:
- call setup success,
- RTT and packet-loss telemetry samples emitted,
- no permanent signaling stalls.

## Failover Scenario (Region/WS Failure)

1. With active call, make current WS endpoint unavailable.
2. Verify client auto-reconnect starts with backoff.
3. Verify endpoint rotation to the next URL from `VITE_CALLS_V2_WS_URLS`.
4. Verify signaling recovers without hard app reload.

Expected:
- reconnect attempts are bounded,
- failover endpoint is used,
- control-plane resumes.

## ICE/TURN Degradation Scenario

1. Simulate restrictive network / UDP blocked.
2. Verify relay fallback path is used.
3. Force ICE failure and verify ICE restart attempts are performed.
4. Verify call either recovers or fails fast with explicit reason.

Expected:
- no silent hang,
- deterministic retry behavior,
- clear terminal failure path if unrecoverable.

## E2EE Rekey Scenario

1. Run call for > 2 rekey intervals.
2. Verify `REKEY_BEGIN` / `REKEY_COMMIT` events appear.
3. Verify epoch only moves forward (no rollback accepted).

Expected:
- monotonic epoch progression,
- no desync rollback,
- no media interruption beyond transient blips.

## SLO Validation Targets

Minimum rollout gate (p95 unless stated):
- call setup time <= 4000 ms,
- RTT <= 250 ms,
- packet loss <= 3%,
- reconnect recovery <= 10 s,
- call setup success rate >= 99.0%.

## Rollback Triggers

Rollback immediately if any of:
- setup success rate drops below 97% for 10 minutes,
- reconnect loops exceed max attempts for > 2% active calls,
- sustained packet loss > 5% for 5+ minutes,
- epoch desync/rollback detected.

## Known Current Limitations

- Media plane is still transitional and not fully backed by production-grade SFU worker orchestration.
- Rekey currently coordinates epochs but does not yet enforce full frame-level cryptographic validation pipeline.
- Control-plane resilience is significantly improved, but end-to-end chaos automation is still required before declaring GA.

## Post-Deploy Checklist

- [ ] All SFU regions healthy (`/healthz`, `/metrics`)
- [ ] Web env uses multi-endpoint list
- [ ] TURN credentials endpoint is healthy
- [ ] Smoke single-call passed
- [ ] Failover scenario passed
- [ ] Rekey scenario passed
- [ ] SLO thresholds passed
- [ ] No blocker alerts for 30+ minutes

## GitHub Branch Protection (Required Checks)

Set branch protection on `main` with required status checks:

- `CI (Frontend) / Calls Gates`
- `CI (Frontend) / frontend`
- `CI (Frontend) / TURN Release Gate` (if secrets are available for your PR model)

Recommended branch protection options:

- Require pull request before merging.
- Require approvals (>=1) and dismiss stale approvals on new commits.
- Require conversation resolution before merge.
- Require branches to be up to date before merging.

Quick setup path:

1. GitHub -> `Settings` -> `Branches`.
2. Add/edit protection rule for `main`.
3. Enable required status checks and select checks above.
4. Save and verify on a test PR touching calls files.

## PR Reviewer Checklist (Calls)

Use this checklist for PRs that touch calls signaling/media/reliability paths.

- [ ] Scope is limited to calls domain and avoids unrelated refactors.
- [ ] Feature flags are preserved (`VITE_CALLS_V2_ENABLED`, endpoint list, rekey interval).
- [ ] WS changes keep idempotency (`msgId` stability on retries) and reconnect backoff.
- [ ] Multi-endpoint failover behavior is covered by tests or explicit validation notes.
- [ ] E2EE epoch flow remains monotonic (no rollback acceptance).
- [ ] ICE/TURN behavior is explicit (relay fallback / ICE restart path not regressed).
- [ ] Metrics/SLO impact is described (setup time, RTT, loss, reconnect recovery).
- [ ] `npm run calls:chaos:gate` is green in CI for the PR.
- [ ] If mediasoup path is changed: smoke result is attached (`passed` or expected `skipped`).
- [ ] Rollback plan is present for risky control-plane/media-plane changes.
