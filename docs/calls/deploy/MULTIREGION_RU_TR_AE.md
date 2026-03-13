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
