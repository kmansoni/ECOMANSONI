# Auth / Identity Failure Map (Telegram-grade)

## 1. Purpose

This document defines failure scenarios for the auth/identity subsystem and the required system reaction.
It is an operational companion to:
- `docs/AUTH_IDENTITY_ARCHITECTURE_V2.md`
- `docs/SECURE_AUTH_ARCHITECTURE_SUPABASE.md`

Goal:
- Prevent ghost-auth states.
- Prevent privacy leaks on shared devices.
- Enforce deterministic fail-closed behavior.

## 2. Severity Levels

- `P0`: security/privacy incident risk, immediate release blocker.
- `P1`: high reliability risk, must be fixed in active cycle.
- `P2`: degraded UX/ops quality, planned hardening.

## 3. Global Response Rules

For any auth-critical failure:
1. Emit structured security event.
2. Run invariant check.
3. If invariant fails, transition to `reauth_required` (fail-closed).
4. Block authenticated shell unless state is `ready` or controlled `session_refreshing`.
5. Never resurrect session from stale client cache.

## 4. Failure Scenarios and Required Reaction

## F-001: Refresh Race in Same Runtime

- Severity: `P0`
- Trigger:
  - Parallel refresh attempts for same session.
- Detection:
  - Two refresh requests with same refresh lineage/counter window.
- Required reaction:
  - Accept first valid refresh only.
  - Reject second as replay/out-of-order.
  - Emit `session_refresh_reuse_detected` if token reuse pattern is observed.
- Client behavior:
  - Converge to server-authoritative session.
  - If mismatch remains, force `reauth_required`.
- Tests:
  - `auth-refresh-race.spec.ts`

## F-002: Token Replay From Different Device Context

- Severity: `P0`
- Trigger:
  - Refresh token replayed from mismatched context (`device_id/platform/ua_hash`).
- Detection:
  - Binding validation failure.
- Required reaction:
  - Hard deny refresh.
  - Revoke affected session chain.
  - Emit security event and raise alert threshold counters.
- Client behavior:
  - Enter `session_invalid -> reauth_required`.
- Tests:
  - `auth-refresh-replay.spec.ts`

## F-003: Session Revoked While Client Offline

- Severity: `P0`
- Trigger:
  - Session revoked server-side during offline window.
- Detection:
  - Reconnect refresh denied due to revoked status.
- Required reaction:
  - Deny all privileged operations.
  - Force reauth.
- Client behavior:
  - No authenticated shell rendering.
  - Purge privileged in-memory state.
- Tests:
  - `auth-revocation-offline.spec.ts`

## F-004: Multi-Tab Split-Brain

- Severity: `P0`
- Trigger:
  - Tab A is logged out/revoked while Tab B remains authenticated.
- Detection:
  - Cross-tab state diverges beyond convergence budget.
- Required reaction:
  - Broadcast/sequence sync from auth orchestrator.
  - Force Tab B to converge under SLA.
- SLA:
  - Logout propagation `< 1500ms` same-origin tabs.
  - Full convergence `p95 < 5s`, `p99 < 10s`.
- Tests:
  - `auth-multi-tab.spec.ts`

## F-005: Identity Drift (Session/Profile/Settings Mismatch)

- Severity: `P0`
- Trigger:
  - `activeUserId != session.user.id` OR
  - `profile.user_id != session.user.id` OR
  - `settings.user_id != session.user.id`.
- Detection:
  - Runtime invariant pack failure.
- Required reaction:
  - Emit `identity_invariant_failed` with reason code.
  - Fail-closed to `reauth_required`.
- Tests:
  - `auth-invariant-drift.spec.ts`

## F-006: Ghost Authenticated Shell After Refresh Failure

- Severity: `P0`
- Trigger:
  - Refresh fails but UI still renders authenticated shell.
- Detection:
  - State machine violation: shell rendered outside allowed states.
- Required reaction:
  - Immediate route guard cut to auth screen.
  - Invalidate auth query/cache segments.
- Tests:
  - `auth-shell-guard.spec.ts`

## F-007: Logout Teardown Incomplete

- Severity: `P0`
- Trigger:
  - Logout completes while WS/presence/background jobs still active.
- Detection:
  - Post-condition check fails.
- Required reaction:
  - Treat logout as failed-safe, continue teardown retries.
  - Block new authenticated actions.
- Required post-conditions:
  - `active_ws_connections == 0`
  - `presence_subscriptions == 0`
  - `background_jobs == 0`
- Tests:
  - `auth-logout-hygiene.spec.ts`

## F-008: Shared Device Data Bleed (A -> Logout -> B)

- Severity: `P0`
- Trigger:
  - User B sees drafts/caches/artifacts from user A.
- Detection:
  - Storage forensic diff / e2e artifact checks.
- Required reaction:
  - Block release.
  - Patch key-scoping and purge logic.
- Tests:
  - `shared-device-privacy.spec.ts`

## F-009: Push Token Stale Binding

- Severity: `P0`
- Trigger:
  - Push token remains bound to old user/session after account switch/logout.
- Detection:
  - Binding mismatch in `auth_push_bindings` checks.
- Required reaction:
  - Unbind stale mapping.
  - Rebind only to current valid `(user_id, device_id, session_id)`.
- Risk:
  - Cross-user notification leakage.
- Tests:
  - `auth-push-binding.spec.ts`

## F-010: Web-Login Origin/State Contract Violation

- Severity: `P0`
- Trigger:
  - Origin mismatch, state mismatch, opener mismatch, expired callback.
- Detection:
  - Trust contract validation failure.
- Required reaction:
  - Reject payload, emit `suspicious_origin_rejected`.
  - Never hydrate local session from rejected callback.
- Tests:
  - `web-login-trust-contract.spec.ts`

## F-011: Schema Smuggling in Auth Payload

- Severity: `P1`
- Trigger:
  - Callback payload includes unknown fields.
- Detection:
  - Strict schema validator rejects extra keys.
- Required reaction:
  - Hard reject payload.
- Tests:
  - `auth-schema-strictness.spec.ts`

## F-012: Event Journal Integrity Break

- Severity: `P1`
- Trigger:
  - Hash-chain break or missing sequence in security events.
- Detection:
  - Integrity verifier detects tamper or loss.
- Required reaction:
  - Raise security incident.
  - Freeze release until root cause identified.
- Tests:
  - `auth-event-integrity.spec.ts`

## F-013: Rollback Leaves Auth in Mixed Version

- Severity: `P1`
- Trigger:
  - Rollback deployed but clients/DB contracts partially diverge.
- Detection:
  - Invariant/error spikes after rollback.
- Required reaction:
  - Execute rollback post-check protocol.
  - Enforce compatibility mode gates.
- SLA:
  - Rollback complete `<= 10 min`.
- Tests:
  - `auth-rollback-drill.spec.ts`

## F-014: Transport Downgrade / Insecure Channel

- Severity: `P1`
- Trigger:
  - `http://` auth endpoint or `ws://` privileged channel in production.
- Detection:
  - Transport enforcement scanner and runtime guard.
- Required reaction:
  - Block request/channel.
  - Emit security event.
- Tests:
  - `auth-transport-enforcement.spec.ts`

## F-015: Session Registry Unavailable

- Severity: `P1`
- Trigger:
  - Session registry read/write outage.
- Detection:
  - Registry calls fail beyond retry budget.
- Required reaction:
  - No optimistic bypass.
  - Degrade to fail-closed for privileged actions.
  - Keep unauthenticated surface available.
- Tests:
  - `auth-registry-outage.spec.ts`

## 5. Operational Alerting Map

Critical alerts (`P1 page`):
- `session_refresh_reuse_detected > threshold`
- `identity_invariant_failed > threshold`
- `revoked_session_attempt > threshold`
- `push_binding_mismatch > threshold`

Reliability alerts (`P2 page`):
- auth latency p95 breach
- session propagation p95 breach
- event ingestion loss > target

Suggested defaults:
- auth error rate > 1%
- login failures > 50/min
- revoked session spikes > 5/min

## 6. Release Blocking Matrix

Release is blocked if any of these fail:
- Any `P0` scenario test.
- Shared-device privacy suite.
- Storage forensic no-leak check.
- Event integrity verification.
- Rollback drill.

## 7. Ownership Model

Each failure scenario must have:
- code owner
- test owner
- observability owner
- runbook link

Recommended runbook naming:
- `runbooks/auth/F-001-refresh-race.md`
- `runbooks/auth/F-002-token-replay.md`
- ...

## 8. Implementation Notes

- Keep this map synced with `AUTH_IDENTITY_ARCHITECTURE_V2.md` states and invariants.
- Every new auth feature must add:
  - at least one failure scenario entry,
  - one test case,
  - one event schema update (if required).

---

This failure map is an enforcement artifact.
If a scenario exists here without tests and runbook coverage, the auth perimeter is considered incomplete.
