# Secure Auth Architecture for Supabase (Web SPA + Multi‑Account)

## Problem statement
Storing Supabase `access_token` / `refresh_token` in `localStorage` (or any JS-readable storage) is **high-risk under XSS**:
- XSS can exfiltrate tokens immediately.
- Multi-account increases blast radius (multiple sessions at once).

Goal: keep a **production-grade** multi-account experience while ensuring **refresh material is not JS-readable**.

Non-goal: “perfect security” in a pure SPA without any server. Without a server (or SSR helpers), you cannot fully protect refresh tokens from XSS.

## Recommended target: BFF session service + HttpOnly refresh cookie
### High-level idea
Introduce a small **Backend-For-Frontend (BFF)** (can be a lightweight Node service, or Supabase Edge Functions + a dedicated domain) that:
- Stores **refresh token** in an **HttpOnly, Secure, SameSite** cookie.
- Issues **short-lived access tokens** to the SPA (kept **in memory only**).
- Performs token refresh server-side.

### Token handling
- **Browser (SPA)**
  - Holds only an **access token** in memory (React context / query client).
  - Never persists refresh tokens.
  - On page reload, it calls BFF `/session` to get a fresh access token.

- **BFF**
  - Stores refresh token in `Set-Cookie: sb-refresh=...; HttpOnly; Secure; SameSite=Lax; Path=/`.
  - Rotates refresh tokens when possible.
  - Provides endpoints to refresh and to switch active account.

### Supabase request flow
Two viable modes (choose one):

**Mode A (recommended for least change): SPA talks to Supabase directly with access token**
- SPA calls BFF to obtain/refresh access token.
- SPA sets `Authorization: Bearer <access_token>` when calling Supabase (PostgREST, Realtime, Storage).
- When access token expires, SPA calls BFF refresh endpoint.

Pros: keeps existing Supabase RLS model.
Cons: stolen in-memory access token is still usable, but it’s short-lived.

**Mode B (maximum isolation): SPA talks only to BFF; BFF proxies to Supabase**
- SPA never calls Supabase directly.
- BFF validates cookie session and calls Supabase using the user’s JWT (or service role + RLS bypass is NOT recommended).

Pros: centralizes control and rate limiting.
Cons: bigger implementation, more operational burden.

For this repo, Mode A is usually the best first step.

## Multi-account model (secure)
### Current model (unsafe)
- Per-account refresh tokens are kept in `localStorage`.

### Target model
- SPA stores only an **account index** (safe metadata) locally:
  - `accountId`, `display_name`, `avatar_url`, `lastActiveAt`, etc.
  - No refresh/access tokens.

- BFF stores per-device per-account refresh material server-side.

### Device binding
Use existing `device_id` concept:
- SPA generates `device_id` and sends it to BFF once.
- BFF maps `(device_id, account_id) -> encrypted refresh token`.

Encryption options:
- App-level encryption with a server secret.
- Better: KMS-managed key (if available).

## Endpoints (minimal)
All endpoints are same-origin with the SPA so cookies work.

- `POST /api/auth/login/otp/send` (phone/email OTP send)
- `POST /api/auth/login/otp/verify` -> sets refresh cookie + returns access token + user
- `POST /api/auth/session/refresh` -> rotates cookie, returns new access token
- `POST /api/auth/logout` -> clears cookie

Multi-account:
- `GET /api/accounts` -> list accounts bound to `device_id`
- `POST /api/accounts/switch` -> sets cookie for selected account, returns new access token
- `POST /api/accounts/add` -> completes OTP verify and stores refresh token under device
- `POST /api/accounts/remove` -> removes refresh token mapping (server-side) and updates index

## Frontend changes
1) Supabase client
- Keep `persistSession: false` and `autoRefreshToken: false`.
- Add an auth header injector that reads access token from in-memory state.

2) Vault (multi-account)
- Remove storage of `accessToken`/`refreshToken`.
- Keep only:
  - `activeAccountId`
  - accounts index
  - `deviceId`

3) App bootstrap
- On startup, call `GET /api/auth/session` (or `/refresh`) to obtain an access token for the active account.

4) Account switch
- Call `POST /api/accounts/switch`.
- On success:
  - replace in-memory access token
  - reset query cache
  - re-init realtime

## Security hardening checklist (still required)
Even with HttpOnly cookies:
- Add a strict CSP (no `unsafe-inline`, no `unsafe-eval`), ideally with nonces.
- Use Trusted Types (where possible).
- Audit any HTML injection (`dangerouslySetInnerHTML`, markdown renderers, linkify).
- Lock down third-party scripts.

## Migration plan (incremental, low-risk)
### Phase 0 — Prep
- Add feature flag `VITE_BFF_AUTH=1`.
- Keep legacy localStorage flow as fallback (dev only) during rollout.

### Phase 1 — Introduce BFF
- Implement the endpoints above.
- Use same domain as SPA (or a subdomain with proper cookie configuration).

### Phase 2 — Dual-write / token upload (one-time)
For existing users with tokens in localStorage:
- On first run with `VITE_BFF_AUTH=1`, SPA posts current refresh token to BFF once:
  - `POST /api/accounts/import` with `(device_id, account_id, refresh_token)`.
- BFF stores encrypted refresh token and confirms.
- SPA clears refresh tokens from localStorage.

### Phase 3 — Switch SPA to BFF-first
- SPA obtains access tokens only via BFF.
- Disable any code paths that read refresh tokens from localStorage.

### Phase 4 — Remove legacy
- Remove import endpoint.
- Remove legacy password/OTP bypasses (or keep dev-gated only).

### Phase 5 — Enforce
- Server-side: rotate refresh tokens and revoke on suspicious activity.
- Add monitoring/alerting for auth endpoints.

## Notes on Supabase specifics
- Supabase JS client in a pure SPA assumes JS-readable persistence.
- To get HttpOnly refresh tokens, you need a server/BFF (or SSR auth helpers).
- Access tokens are JWTs used by PostgREST/RLS. Keeping them short-lived reduces damage if stolen.
