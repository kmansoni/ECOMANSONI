# Calls infra (dev)

Local dev infra for the Calls stack.

## Start

```bash
docker compose -f infra/calls/docker-compose.yml up -d
```

## TURN secret

Edit `infra/calls/coturn/turnserver.conf` and replace:

- `static-auth-secret=CHANGE_ME_LONG_RANDOM_SECRET`

This secret must match what the credentials issuer (Supabase Edge Function `turn-credentials` or Call API) uses to generate REST auth credentials.

## Ports

- TURN/STUN: `3478/udp`, `3478/tcp`
- TURNS: `5349/tcp` (TLS) — certificate not configured in dev
- Relay UDP range: `49160-49200/udp`

## Notes

- This compose is for development. Production requires public IP configuration (`external-ip`) and proper TLS certificates for `turns:`.

## Production quick start (self-hosted TURN, no third-party dependency)

1) Buy a VPS with a public IP (EU is usually best for reachability).
2) Create DNS: `turn.<your-domain>` → `<VPS_PUBLIC_IP>`.
3) On the VPS, obtain a TLS cert for `turn.<your-domain>` (Let's Encrypt).
4) Edit:
	- `infra/calls/coturn/turnserver.prod.conf`
	  - set `external-ip`, `realm`, `server-name`, `static-auth-secret`, and cert paths.
5) Start:

```bash
docker compose -f infra/calls/docker-compose.prod.yml up -d
```

6) In Supabase secrets set:
	- `TURN_URLS` = `turn:turn.<your-domain>:3478?transport=udp,turn:turn.<your-domain>:3478?transport=tcp,turns:turn.<your-domain>:5349?transport=tcp`
	- `TURN_SHARED_SECRET` = same as `static-auth-secret`
	- `TURN_TTL_SECONDS=3600`

