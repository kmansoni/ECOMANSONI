# Post-Deploy Verification 2026-03-26

## Scope

- Git commit: `4700d01`
- Branch: `main`
- Remote sync: complete (`main == origin/main`)
- Rollback tag: `rollback/origin-main-20260326-0648`

## Deployment State

- Guarded Supabase deploy completed successfully earlier in the session.
- Database push completed.
- Edge functions deploy completed.
- GitHub synchronized to the deployed commit.

## Verification Results

### Passed

1. `npm run turn:smoke`
   - `turn-credentials` returned `ok: true`
   - TURN credentials present
   - replay guard returned `409 replay_detected`
   - rate limit returned `429` as expected

2. `npm run reels:control-plane:smoke`
   - suppression set flow passed
   - forbidden action suppression passed
   - idempotency replay passed
   - hysteresis rejection passed
   - manual clear passed
   - config validation contract passed

### Non-blocking / informational

1. `npm run calls:mediasoup:smoke`
   - skipped because `mediasoup` dependency is not installed in the current environment

### Failed

1. `npm run calls:sfu:readiness`
   - `wss://sfu-ru.mansoni.ru/ws`: `AUTH failed: UNAUTHENTICATED Invalid accessToken`
   - `wss://sfu-tr.mansoni.ru/ws`: connection and room flow progressed, but readiness probe finished with `ok=false`
   - `wss://sfu-ae.mansoni.ru/ws`: connection and room flow progressed, but readiness probe finished with `ok=false`
   - `joinCapsA=false`, `joinCapsB=false`, `getRouterSupported=false`, `getRouterCapsOk=false` for all summarized failures

## Release Assessment

- Chat, migration, database, and control-plane deployment path is verified.
- TURN issuance path is verified.
- Reels control-plane RPC path is verified.
- Calls/SFU production readiness is not verified and currently remains the primary release risk.

## Recommended Next Actions

1. Inspect production SFU auth/token validation for region mismatch or issuer/ref drift, starting with `wss://sfu-ru.mansoni.ru/ws` because it fails earliest at `AUTH`.
2. Compare WS contract behavior on `tr` and `ae` against the readiness probe expectations for `JOIN_CAPS` and router capability messages.
3. Keep rollback anchored to `rollback/origin-main-20260326-0648` if calls/SFU regression affects user traffic.

## Rollback Reference

If rollback is required, revert application state to tag `rollback/origin-main-20260326-0648` and redeploy from that point.