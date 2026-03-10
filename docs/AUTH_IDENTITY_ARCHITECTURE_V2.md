# Auth / Identity Architecture Blueprint v2 (Telegram-grade)

## 1. Scope and Goals

This document defines a production identity subsystem for a security-sensitive messenger.
It is server-authoritative, deterministic, auditable, and rollback-safe.

Primary goals:
- Single source of truth for identity/session state.
- Deterministic behavior across tabs/devices/network faults.
- Strong session lifecycle and revocation semantics.
- Strict privacy compartmentalization on shared devices.
- Enforceable invariants and CI release gates.

Out of scope:
- Full anti-fraud ML model.
- Product UX design details for account screens.

## 2. Core Principles

- Single writer for auth state: exactly one runtime orchestrator owns transitions.
- Fail-closed posture: on identity mismatch, force reauth.
- Server authority: session validity is determined by server registry, not client cache.
- No sensitive token persistence in JS-readable storage.
- Every persistent key is either user-scoped or auth-neutral.
- Every auth transition emits structured security events.

## 3. Account State Machine

Canonical states:
- `anonymous`
- `auth_pending`
- `authenticated`
- `profile_loading`
- `ready`
- `session_refreshing`
- `session_invalid`
- `reauth_required`
- `logout_in_progress`
- `revoked`
- `blocked`

Transition contract:
- `anonymous -> auth_pending`: user starts login.
- `auth_pending -> authenticated`: credentials/OTP validated, session created.
- `authenticated -> profile_loading`: bootstrap profile/settings.
- `profile_loading -> ready`: invariants pass and shell can render.
- `ready -> session_refreshing`: refresh in progress.
- `session_refreshing -> ready`: refresh success and invariant check pass.
- `session_refreshing -> session_invalid`: refresh fails or context binding fails.
- `session_invalid -> reauth_required`: hard transition, no soft recovery.
- `ready -> logout_in_progress`: explicit user logout.
- `logout_in_progress -> anonymous`: teardown complete and server acked revoke/unbind.
- `any -> revoked`: server-side revoke signal.
- `revoked -> reauth_required`: force reauth, no cached restore.
- `any -> blocked`: account policy lockout.

State guard rules:
- Authenticated shell is allowed only in `ready` and `session_refreshing`.
- Entering `ready` requires invariant pack success.
- Any invariant failure triggers `reauth_required`.

## 4. Session Registry (Server)

Session registry is mandatory and authoritative.

Required session fields:
- `session_id` (UUID, primary)
- `user_id` (UUID, indexed)
- `device_id` (UUID/string, indexed)
- `device_name` (string)
- `platform` (web/ios/android/desktop)
- `user_agent_hash` (string)
- `ip_region_bucket` (string, optional)
- `auth_method` (password/otp/sso)
- `trust_level` (low/medium/high)
- `risk_level` (low/medium/high/critical)
- `created_at` (timestamp)
- `last_seen_at` (timestamp)
- `max_age_expires_at` (timestamp)
- `idle_expires_at` (timestamp)
- `revoked_at` (timestamp nullable)
- `revoke_reason` (string nullable)
- `refresh_counter` (integer)
- `identity_contract_version` (string)

Invariants:
- Active session must have `revoked_at IS NULL`.
- `refresh_counter` is monotonic per session.
- Revoked session cannot transition back to active.

## 5. Device Lifecycle

Lifecycle:
- Register device on first successful auth.
- Upsert metadata on each refresh/heartbeat.
- Update `last_seen_at` on authenticated activity.
- Allow revoke-one-session and revoke-all-except-current.
- Expire stale sessions by idle and max-age policy.

Device trust semantics:
- Binding context uses `device_id + platform + user_agent_hash`.
- `ip_region_bucket` is advisory risk input, not hard binding.
- Context mismatch requires refresh denial and reauth escalation.

## 6. Token Lifecycle and Rotation

Policy:
- Refresh token rotation is required.
- Refresh token reuse detection is required.
- Reuse triggers chain revoke and security alert.
- Access token is short-lived and memory-only in client runtime.
- Refresh token is never persisted in JS-readable storage.

Replay protection:
- Refresh request includes session context binding metadata.
- Replayed or out-of-order refresh attempt hard-fails.

Offline behavior:
- If token is revoked while client offline, reconnect must converge to `reauth_required`.

## 7. Revocation Protocol

Supported server actions:
- `revoke(session_id)`
- `revoke_all_except(session_id, user_id)`
- `revoke_user(user_id)`

Client reaction contract:
- Revoke signal forces state `revoked -> reauth_required`.
- Clear active runtime identity immediately.
- Stop all privileged channels and background workers.
- Deny any local cache-based session resurrection.

Consistency budget:
- Tab convergence target: `p95 < 5s`, `p99 < 10s`.
- Logout propagation target: `< 1500ms` for same-origin tabs.

## 8. Logout Teardown Graph

Logout is complete only after all steps succeed or explicit fail-closed handling executes.

Ordered teardown:
1. Enter `logout_in_progress`.
2. Freeze outgoing privileged actions.
3. Revoke server session (or mark pending revoke for retry queue).
4. Unbind push token from user/session/device mapping.
5. Close websocket/realtime channels.
6. Stop presence and background sync loops.
7. Abort media uploads/download tasks.
8. Purge in-memory user stores.
9. Purge persistent user-scoped storage.
10. Purge crypto state (ratchet state, prekey cache, session key cache).
11. Reset optimistic UI state and query cache.
12. Emit `logout_completed` security event.
13. Transition to `anonymous`.

Post-condition checks:
- `active_ws_connections == 0`
- `presence_subscriptions == 0`
- `background_jobs == 0`
- No user-scoped keys from previous user remain.

## 9. Runtime Invariant Layer

Invariant pack (must run at bootstrap, refresh, tab-sync, and before entering `ready`):
- `activeUserId == authSession.user.id`
- `profile.user_id == authSession.user.id`
- `settings.user_id == authSession.user.id`
- Active session exists server-side and `revoked_at IS NULL`
- Identity contract version matches expected runtime version

Violation policy:
- Emit `identity_invariant_failed` event with reason code.
- Transition to `reauth_required`.
- Block authenticated shell rendering.

## 10. Transport and Perimeter Discipline

Required:
- No `ws://` for authenticated channels.
- No `http://` for auth/session endpoints in production.
- HSTS enforced.
- Secure cookie flags enforced (`Secure`, `HttpOnly`, `SameSite`).
- Strict origin/state/opener checks for popup/web-login flows.
- Reject unknown fields in auth payload schema.

## 11. Security Event Journal

Events are immutable and tamper-evident.

Minimum event set:
- `login_started`
- `login_succeeded`
- `login_failed`
- `login_denied`
- `session_refreshed`
- `session_refresh_reuse_detected`
- `session_revoked`
- `logout_started`
- `logout_completed`
- `settings_changed`
- `identity_invariant_failed`
- `suspicious_origin_rejected`
- `device_bound`
- `push_token_bound`
- `push_token_unbound`

Event requirements:
- `event_id`, `event_schema_version`, `occurred_at`
- `user_id`, `session_id`, `device_id` (if available)
- `correlation_id`, `trace_id`
- Tamper-evident hash chain pointer

## 12. Database Schema (Reference)

Recommended core tables:
- `auth_sessions_registry`
- `auth_devices`
- `auth_security_events`
- `auth_revocation_queue` (optional retry support)
- `auth_push_bindings`

Minimal indexes:
- Sessions: `(user_id, revoked_at)`, `(device_id)`, `(last_seen_at)`
- Security events: `(user_id, occurred_at DESC)`, `(event_type, occurred_at DESC)`
- Push bindings: `(user_id, device_id)`, unique on active token binding key

Retention:
- Session rows: retain revoked history for audit window.
- Security events: long retention with immutable storage policy.

## 13. Multi-Tab and Multi-Device Consistency Contract

Rules:
- One tab cannot silently diverge from auth state of another tab beyond convergence budget.
- Auth events are ordered by monotonic sequence per session.
- Stale event processing is ignored by sequence guard.

Required tests:
- `tab1 login -> tab2 reflects ready`
- `tab1 logout -> tab2 unauthenticated under SLA`
- `tab1 refresh -> tab2 remains consistent`
- `revoke while tab2 offline -> tab2 reauth_required on reconnect`

## 14. CI/CD Enforcement and Release Gates

Pipeline checks (blocking):
- Static scan: no forbidden multi-account switch paths in production bundle.
- Static scan: no sensitive tokens persisted in JS storage.
- Contract tests: auth payload schema strict mode (reject unknown fields).
- Chaos auth suite: refresh/revoke/network fault scenarios.
- Shared-device privacy suite: `A -> logout -> B` leakage checks.
- Storage forensic snapshot diff before/after logout.
- Rollback drill validation.

SLO gates:
- Auth error rate threshold.
- Auth latency p95 threshold.
- Session propagation p95 threshold.
- Security event ingestion loss threshold.

## 15. Migration Phases

Phase 0: Instrumentation and freeze
- Add invariant layer in monitor mode.
- Add event journal and observability baseline.

Phase 1: Single-writer auth orchestration
- Remove dual-writer flows.
- Enforce canonical state machine transitions.

Phase 2: Session registry + binding
- Introduce server registry and device binding context.
- Start refresh rotation and reuse detection.

Phase 3: Storage hardening and compartmentalization
- Remove client token vault.
- Migrate all persistent keys to user-scoped or auth-neutral.

Phase 4: Revocation and logout hardening
- Enable revoke-one/revoke-all-except-current.
- Enforce teardown graph and post-conditions.

Phase 5: Transport and perimeter hardening
- Enforce strict transport policy and web-login perimeter checks.

Phase 6: Cutover and cleanup
- Remove legacy multi-account runtime paths.
- Enable hard fail on invariant violations.

## 16. Acceptance Checklist (Ship Criteria)

Ship is allowed only if all are true:
- All blocker release gates pass.
- All must-fix controls pass.
- Rollback drill succeeds in target SLA.
- No shared-device privacy leakage in regression suite.
- Invariant violation rate is within accepted threshold.

---

This blueprint is designed to be used as an implementation contract, not only a policy document.
Each section should map to concrete code owners, tests, and migration PRs.
