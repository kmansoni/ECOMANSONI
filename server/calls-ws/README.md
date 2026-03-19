# Calls WS gateway (dev)

Development WS gateway implementing the Calls WS envelope, ordering (`seq`) and ACK frames.

This is a scaffold to start contract testing and to later connect:
- Global Room Directory (Redis/KeyDB)
- SFU (mediasoup)
- TURN credentials issuer (Supabase Edge Function or Call API)

## Run

```bash
npm install
npm run calls:validate
# start Redis + coturn (separate terminal)
docker compose -f infra/calls/docker-compose.yml up -d
npm run calls:ws:dev
```

## Env

- `CALLS_WS_PORT` (default `8787`)
- `REDIS_URL` (default `redis://127.0.0.1:6379`) — required for Streams mailbox
- `CALLS_TURN_URLS` (optional, comma-separated): e.g. `turn:127.0.0.1:3478,turn:127.0.0.1:3478?transport=tcp`
- `CALLS_WS_REQUIRE_SECURE_TRANSPORT` (default `1` in production-like env, `0` disables check)
- `CALLS_WS_TRUSTED_PROXIES` (comma-separated proxy IPs trusted for `x-forwarded-proto`, e.g. `127.0.0.1,::1`)
- `CALLS_REQUIRE_SFRAME_CAPS` (default `1`; set `0` only for temporary compatibility)
- `CALLS_REQUIRE_DOUBLE_RATCHET_CAPS` (default `1`; requires `doubleRatchet=true` in `E2EE_CAPS`)

NOTE: `calls-ws` never issues TURN credentials. It only advertises TURN URLs; credentials are issued by the `turn-credentials` edge function.
- `CALLS_DEDUP_TTL_SEC` (default `600`)
- `CALLS_KEY_TTL_MS` (default `120000`)

## Notes

- This dev gateway uses in-memory state.
- Production will replace this with the multi-region Call API + Directory + SFU coordinator.
