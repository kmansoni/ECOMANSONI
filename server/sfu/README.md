# SFU service (control-plane + media-plane adapter)

This service now provides a working SFU control-plane foundation over WebSocket for:
- room lifecycle (`ROOM_CREATE`, `ROOM_JOIN`, snapshots, peer join/left),
- transport handshake intents (`TRANSPORT_CREATE`, `TRANSPORT_CONNECT`),
- producer/consumer intents (`PRODUCE`, `CONSUME`),
- E2EE coordination events (`E2EE_POLICY`, `REKEY_*`, `KEY_*`).

The service now supports two runtime modes:
- `fallback` (default): control-plane-only behavior compatible with current rollout.
- `mediasoup` (optional): real WebRTC transport/produce/consume path when enabled.

E2EE fail-closed behavior:
- If `SFU_E2EE_REQUIRED=1`, media intents (`TRANSPORT_*`, `PRODUCE`, `CONSUME`) are accepted only after `E2EE_READY` with `epoch` equal to current room epoch.
- After each `REKEY_COMMIT`, readiness is reset for all peers until they send `E2EE_READY` for the committed epoch.

## Run

```bash
npm run calls:sfu:dev
```

## Env

- `SFU_PORT` (default `8888`)
- `SFU_REGION` (ru|tr|ae, default `tr`)
- `SFU_NODE_ID` (default `local-sfu-1`)
- `SFU_E2EE_REQUIRED` (`1` by default)
- `SFU_REQUIRE_SFRAME` (`1` to require `sframe=true` capability in `E2EE_CAPS` before join)
- `SFU_HEARTBEAT_SEC` (default `10`)
- `SFU_ENABLE_MEDIASOUP` (`1` to enable mediasoup mode, default disabled)
- `SFU_REQUIRE_MEDIASOUP` (`1` by default in production; fail-closed if mediasoup is unavailable)
- `SFU_ANNOUNCED_IP` (optional announced IP for mediasoup transports)
- `SFU_RTC_MIN_PORT` / `SFU_RTC_MAX_PORT` (mediasoup RTC UDP/TCP range, defaults `40000-49999`)
- `SFU_MEDIASOUP_LOG_LEVEL` (`warn` by default)

Hard auth envs (required in production):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`)

Dev-only insecure auth switch:

- `CALLS_DEV_INSECURE_AUTH=1` (ignored in production)

Note: mediasoup dependency is optional for non-production environments; in production fail-closed mode (`SFU_REQUIRE_MEDIASOUP`), startup fails if mediasoup is unavailable.

Server endpoints:
- `GET /health` (`/healthz`, `/ready` aliases)
- `GET /metrics`
- `WS /ws`

Client rollout envs (web):
- `VITE_CALLS_V2_ENABLED=true`
- `VITE_CALLS_V2_WS_URL=wss://region-1.example.com/ws` (single endpoint)
- `VITE_CALLS_V2_WS_URLS=wss://region-1.example.com/ws,wss://region-2.example.com/ws` (multi-region failover)
- `VITE_CALLS_V2_REKEY_INTERVAL_MS=120000` (periodic E2EE epoch rotation)
- `VITE_CALLS_FRAME_E2EE_ADVERTISE_SFRAME=true` (advertise `sframe=true` in `E2EE_CAPS` when Insertable Streams are supported)

## Next phase (full SFU + E2EE)

- `mediasoup` workers per CPU core
- real DTLS/ICE negotiation and RTP transports
- producer/consumer binding to workers/routers
- frame-level media E2EE (Insertable Streams / SFrame-like key epochs)
- room migration with continuity and rekey quorum

Current implementation is intentionally control-plane-first to keep rollout incremental and safe.

## Reliability gates

Run reliability checks locally or in CI:

```bash
npm run calls:chaos:gate
```

This gate currently validates WS contract compatibility and reconnect/idempotency reliability tests.

Optional mediasoup smoke:

```bash
npm run calls:mediasoup:smoke
```

If `mediasoup` is not installed in the environment, smoke test exits with `skip` and success.
