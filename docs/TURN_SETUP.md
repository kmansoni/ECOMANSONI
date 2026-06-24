# TURN Setup Guide — Mansoni

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Mansoni TURN Data Path                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Call Bootstrap (primary path):                                     │
│                                                                     │
│  Client ──WS──▶ SFU Server (server/sfu/index.mjs)                  │
│                     │                                               │
│                     ├── TURN_SHARED_SECRET + TURN_URLS from .env   │
│                     │   → buildIceServers(userId)                   │
│                     │   → TRANSPORT_CREATED { iceServers }         │
│                     │                                               │
│  Client ◀─WS──▶ mediasoup (same SFU process)                       │
│                                                                     │
│  Fallback path (legacy P2P):                                        │
│                                                                     │
│  Client ──HTTP──▶ fetch(TURN_CREDENTIALS_URL)                       │
│                     ↓ fallback                                       │
│                  supabase.functions.invoke("turn-credentials")       │
│                     ↓ fallback                                       │
│                  Google STUN only                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Why TURN Matters

Without TURN, WebRTC ICE fails when:
- One or both peers are behind **symmetric NAT** (carrier-grade NAT / мобильная сеть)
- One or both peers are behind a **corporate firewall** that blocks UDP
- One or both peers have **strict firewall rules**

TURN relay lets calls work in these scenarios at the cost of bandwidth.

---

## Current State (2026-06-18)

| Component | Status | Value |
|---|---|---|
| coturn on VPS (`155.212.245.89`) | ✅ Running | UDP 3478, TCP 3478, TLS 5349 |
| TLS certificate | ✅ Valid | Let's Encrypt for `turn.mansoni.ru` |
| DNS `turn.mansoni.ru` | ✅ Resolves | `155.212.245.89` |
| `TURN_SHARED_SECRET` coturn | ✅ Set | `/etc/turnserver.conf` → `static-auth-secret` |
| `TURN_SHARED_SECRET` SFU | ✅ Synced | `/opt/mansoni/app/server/sfu/.env.production` |
| SFU inline TURN | ✅ Active | `TURN_URLS` set, credentials generation enabled |
| Edge Function secrets | ⚠️ Unknown | `TURN_SHARED_SECRET` may not be set in Supabase |

> **Secrets must match** between coturn and SFU, otherwise all TURN connections are rejected.
> Current: both use the same secret (64-char hex). If you need to rotate, update both.

---

## Setup for Development

**File:** `server/sfu/.env.development.sfu`

Already has:
```
TURN_SHARED_SECRET=dev_secret_for_testing_at_least_32_chars_long
```

Set TURN_URLS for local coturn:
```
TURN_URLS=turn:localhost:3478
```

Then run coturn locally (see "Local coturn" below).

---

## Setup for Production (VPS)

### Step 1: Install coturn

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y coturn

# Verify installation
turnserver --version
```

### Step 2: Configure coturn

Create `/etc/turnserver.conf`:

```hocon
# ── Basic ──────────────────────────────────────────────────────────
listening-port=3478
tls-listening-port=5349
alt-listening-port=3479
alt-tls-listening-port=5350

# ── Realm ─────────────────────────────────────────────────────────
realm=mansoni.ru
server-name=mansoni.ru
server-num=1

# ── Users (optional — static) ─────────────────────────────────────
# Only needed if NOT using REST API credentials
# lt-cred-mech

# ── REST API credentials (used by our SFU Edge Function) ───────────
static-auth-secret=CHANGE_ME_REPLACE_WITH_32_CHARS_SECRET

# ── Network ───────────────────────────────────────────────────────
# Replace with actual public IP of your VPS
external-ip=YOUR_VPS_PUBLIC_IP/255.255.255.255

# ── Logging ───────────────────────────────────────────────────────
no-stdout-log
log-file=/var/log/turnserver/turnserver.log

# ── Performance ───────────────────────────────────────────────────
max-allocate-live-time=3600
stale-nonce=600

# ── Security ───────────────────────────────────────────────────────
denied-peer-ip=0.0.0.0-0.0.0.0
denied-peer-ip=::0-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
```

### Step 3: Update SFU environment on VPS

In `server/sfu/.env.production` (or wherever your production env lives):

```bash
# coturn server address
TURN_URLS=turn:turn.mansoni.ru:3478,turns:turn.mansoni.ru:5349

# MUST match the static-auth-secret in coturn.conf
TURN_SHARED_SECRET=CHANGE_ME_REPLACE_WITH_32_CHARS_SECRET

# coturn TTL must match SFU's TURN_TTL_SECONDS (default: 3600)
TURN_TTL_SECONDS=3600

# Optional: redundant STUN (coturn has built-in STUN)
STUN_URLS=stun:stun.mansoni.ru:3478,stun:stun.l.google.com:19302
```

### Step 4: Start coturn

```bash
# Enable coturn as a service
sudo systemctl enable coturn
sudo systemctl start coturn

# Verify it's listening
sudo ss -tlnp | grep -E '3478|5349'

# Test with trickle ICE
# https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

### Step 5: Set Supabase Edge Function secrets (for fallback path)

```bash
supabase secrets set TURN_SHARED_SECRET=<same_secret_as_in_coturn.conf>
```

If not set, the Edge Function returns `turn_not_configured` and falls back to STUN-only.
**This is a fallback for legacy P2P — SFU handles TURN credentials inline and does not depend on this.**

> ⚠️ Use the **same secret** as `static-auth-secret` in coturn.conf and `TURN_SHARED_SECRET` in SFU `.env.production`.
> Current value (2026-06-18): `c7b82b1f1c4a9a927f5b6a0503e4297847bb6333b1c5a022b8173541c72c523b`

---

## DNS Records

```
turn.mansoni.ru    A     <VPS_IP>
stun.mansoni.ru   A     <VPS_IP>
```

---

## Testing

### Trickle ICE test
1. Open https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
2. In "STUN or TURN URI", enter: `turn:turn.mansoni.ru:3478`
3. Click "Add server"
4. Click "Gather candidates"

Expected output with coturn running:
```
Done. Gathered 4 candidates
✓ host  ::1
✓ srflx <your_public_ip>:54728 (STUN)
✓ relay <your_public_ip>:57362 (TURN)
✓ relay <your_public_ip>:57363 (TURN)  [for TURN/TLS]
```

### In-app test
Place two users behind different mobile networks (no WiFi, no same LAN).
- Without TURN: ICE fails → "connecting..." forever
- With TURN: relay candidate selected → call connects

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `srflx` candidates but no `relay` | coturn not running or firewall blocking | Check coturn status, open UDP 3478 |
| `ERROR: missing relay` | coturn not reachable or `external-ip` wrong | Verify public IP, check `ss -tlnp` |
| `ERROR: connection refused` | coturn not started | `systemctl start coturn` |
| Edge Function returns `turn_not_configured` | `TURN_SHARED_SECRET` not set in Supabase secrets | Set via `supabase secrets set TURN_SHARED_SECRET=...` |
| SFU returns no TURN in `TRANSPORT_CREATED` | `TURN_SHARED_SECRET` or `TURN_URLS` empty in SFU env | Check `.env.production` on VPS |
| STUN-only fallback works | Coturn not configured — expected in dev | This is fine for dev with direct connections |
| **All TURN connections rejected** | **Secrets mismatch between SFU and coturn** | **Compare `TURN_SHARED_SECRET` in SFU `.env.production` with `static-auth-secret` in coturn.conf** |
| TLS handshake fails | Cert not found or wrong path | Check `/etc/letsencrypt/live/turn.mansoni.ru/` exists |

---

## Monitoring

Check coturn logs for relay usage:
```bash
sudo tail -f /var/log/turnserver/turnserver.log | grep -E "relay|peer|token"
```

Key metrics to track:
- Relay candidates generated per hour
- Bandwidth used by TURN relay
- Number of active TURN allocations
