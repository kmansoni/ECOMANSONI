# SFU service (stub)

This directory is a scaffold for the future mediasoup SFU service.

## Why stub first

We keep existing P2P calls intact while building the next-gen stack:
- Calls WS gateway + Directory + TURN
- Then replace internals of this service with mediasoup

## Run (stub)

```bash
npm run calls:sfu:dev
```

## Env

- `SFU_PORT` (default `8888`)
- `SFU_REGION` (ru|tr|ae, default `tr`)
- `SFU_NODE_ID` (default `local-sfu-1`)

## Production plan (mediasoup)

- `mediasoup` workers per CPU core
- UDP/TCP port range (example): `40000-40100`
- Health endpoints used by Directory to migrate rooms when node unhealthy

This is intentionally minimal; real mediasoup implementation will follow the WS contract pack.
