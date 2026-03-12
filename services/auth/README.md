# Auth Service

Standalone JWT auth microservice for OTP start/verify, refresh, and revoke flows.

## Quick Start

1. Copy [.env.example](.env.example) values into your runtime environment.
2. Install dependencies:

```bash
npm ci
```

3. Run in dev mode:

```bash
npm run dev
```

4. Build and run:

```bash
npm run build
npm run start
```

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ACCESS_TOKEN_SECRET`

If any required variable is missing, the service exits on startup.

## Security-Sensitive Environment Variables

- `AUTH_TRUSTED_PROXIES`
  - Comma-separated list of direct reverse-proxy IPs that are allowed to supply `X-Forwarded-For`.
  - Keep empty unless the service is behind a trusted proxy you control.
- `OTP_RL_IP_MAX`
- `OTP_RL_PHONE_MAX`
- `OTP_RL_WINDOW_MS`
  - Define sliding-window limits for `POST /v1/auth/start`.

## Recommended Production Baseline

- Use a long random value for `ACCESS_TOKEN_SECRET`.
- Set `SMS_STUB=false`.
- Configure `AUTH_TRUSTED_PROXIES` to your ingress/reverse-proxy IP(s).
- Keep OTP rate-limit variables explicit (do not rely on defaults).
