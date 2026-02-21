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
- `CALLS_TURN_USERNAME` / `CALLS_TURN_CREDENTIAL` (optional; static creds for dev)
- `CALLS_DEDUP_TTL_SEC` (default `600`)
- `CALLS_KEY_TTL_MS` (default `120000`)

## Notes

- This dev gateway uses in-memory state.
- Production will replace this with the multi-region Call API + Directory + SFU coordinator.
