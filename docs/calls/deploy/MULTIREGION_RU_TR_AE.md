# Multi-region deployment (RU/TR/AE) — Calls platform

Target regions:
- `ru` — Russia/CIS
- `tr` — Turkey
- `ae` — UAE

## Topology (recommended)

Per region:
- SFU pool: 2+ nodes (mediasoup)
- TURN pool: 2 nodes (coturn)

Global:
- Calls WS gateway / Call API (stateless)
- Room Directory (Redis/KeyDB)
- Health aggregator

## Room affinity

- Each room is pinned to a region (picked by RTT probe at creation).
- All participants join the room region.

## Failover

- If SFU node unhealthy: migrate room to another node in same region.
- If entire region unhealthy: (later) cross-region migration with reconnection.

## TURN

- Prefer regional TURN endpoints.
- Client policy:
  - start `all`
  - after `forceRelayAfterMs` do `ICE_RESTART` with `relay`

## DNS

- `call.mansoni.ru` (global)
- `sfu-ru.mansoni.ru`, `sfu-tr.mansoni.ru`, `sfu-ae.mansoni.ru`
- `turn-ru.mansoni.ru`, `turn-tr.mansoni.ru`, `turn-ae.mansoni.ru`

## Observability (must-have)

- Prometheus + Grafana
- SFU node health + worker load
- TURN allocations + relayed bytes
- Client QoE stats (RTT/jitter/packet loss)

## Security Baseline (WSS + Trusted Proxies)

For production signaling hardening (`calls-ws` and `sfu`):
- Only secure transport must be accepted (`wss://` / TLS-terminated proxy).
- `x-forwarded-proto` is trusted only from known proxy IPs.

Required GitHub Actions secrets:
- `CALLS_JOIN_TOKEN_SECRET`
- `CALLS_WS_TRUSTED_PROXIES`
- `SFU_TRUSTED_PROXIES`
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Example values for trusted proxies:
- `CALLS_WS_TRUSTED_PROXIES=127.0.0.1,10.0.0.10,10.0.0.11`
- `SFU_TRUSTED_PROXIES=127.0.0.1,10.0.0.10,10.0.0.11`

Set/update secrets via GitHub CLI:

```bash
gh secret set CALLS_JOIN_TOKEN_SECRET --repo kmansoni/ECOMANSONI --body "<strong-random-secret>"
gh secret set CALLS_WS_TRUSTED_PROXIES --repo kmansoni/ECOMANSONI --body "127.0.0.1,10.0.0.10,10.0.0.11"
gh secret set SFU_TRUSTED_PROXIES --repo kmansoni/ECOMANSONI --body "127.0.0.1,10.0.0.10,10.0.0.11"
```

Deployment pipeline now enforces:
- fail-fast if required secrets are missing,
- security policy smoke test (`calls-ws` secure transport + E2EE caps),
- readiness checks for RU/TR/AE endpoints.
