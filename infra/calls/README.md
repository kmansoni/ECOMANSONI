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
