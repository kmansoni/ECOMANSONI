# TURN Service: Production Blueprint (Telegram/WhatsApp Class)

## 1. Architecture

### Control Plane
- Endpoint: `supabase/functions/turn-credentials`
- Auth: JWT (Supabase) or API key (`x-turn-api-key`)
- Credential format: coturn REST auth (RFC 5766 §9.2)
  - `username = <expiry_unix>:u_<hashed_user>`
  - `credential = base64(hmac-sha1(TURN_SHARED_SECRET, username))`
- TTL policy:
  - Min: 1 hour
  - Max: 24 hours
  - Default: 1 hour

### Data Plane
- TURN relay: self-hosted coturn (`infra/calls/coturn/turnserver.prod.conf`)
- Transport: UDP 3478 + TURNS TCP 5349
- Relay ports: 49160-49200 (tunable)
- Dual-stack: IPv4 + IPv6 listeners

## 2. Security Model

- Replay protection:
  - `x-turn-nonce` / `x-request-id` replay window enforcement
- Rate limiting:
  - local user+ip buckets
  - durable Supabase RL RPC `turn_issuance_rl_hit_v1`
- PII minimization:
  - user hash in TURN username
  - hashed IP scope in RL/audit
- Caching policy:
  - `Cache-Control: no-store`
- Credential theft mitigation:
  - short-lived credentials
  - no static creds in frontend

## 3. Observability

### Edge Function metrics
- total requests
- success / unauthorized / rate_limited / replay_rejected / errors
- avg/max latency
- in-memory cache sizes

### Audit table
- `public.turn_issuance_audit`
- fields: request_id, auth_type, user_hash, ip_hash, outcome, status_code, latency_ms, ttl_seconds, error_code, region_hint, created_at

### SLOs
- p95 issuance latency: < 200 ms
- error rate (5m): < 1%
- rate-limited ratio (15m): < 5% (investigate abuse or bad client retries)

## 4. Frontend Strategy

File: `src/lib/webrtc-config.ts`

- Dynamic TURN fetch before call setup
- Every TURN request MUST send both `x-turn-nonce` and `x-request-id`
- The JSON body MUST mirror the same values as `{ nonce, requestId }`
- Circuit breaker for TURN endpoint failures
- Cache with policy:
  - if TTL > 1h -> cache for TTL - 1h
  - else cache for 50% of TTL
- Graceful fallback:
  - STUN-only on TURN unavailability
- Relay policy:
  - best-effort `relay` when requested
  - automatic downgrade to `all` if TURN absent

## 5. Coturn Deployment Checklist

1. Set shared secret:
- `TURN_SHARED_SECRET` in Supabase Vault
- same value as `static-auth-secret` in coturn

2. TLS:
- valid certificate for TURN domain
- only `turns:` endpoints in critical regions where possible

3. Network:
- open TCP/UDP 3478
- open TCP 5349
- open relay UDP range 49160-49200

4. Dual-stack:
- add `listening-ip=0.0.0.0`
- add `listening-ip=::`

5. Multi-region:
- deploy at least 3 regions (e.g. RU/TR/AE)
- publish all region URLs via `TURN_URLS`/`TURN_URLS_V6`
- optionally configure `alternate-server` hints in coturn

## 6. Alerting Rules

- TURN issuance p95 > 500 ms for 10 min
- TURN issuance error ratio > 2% for 5 min
- sudden jump in rate-limited responses (>20% for 10 min)
- coturn node CPU > 80% for 15 min
- coturn bandwidth > 80% of NIC capacity
- active allocations near expected capacity threshold

## 7. Troubleshooting Runbook

## Symptom A: Calls fail with relay-only policy
1. Check `turn-credentials` response includes `turn:`/`turns:` URLs.
2. Check the client request includes `x-turn-nonce` / `x-request-id` and JSON body `{ nonce, requestId }`.
3. If the edge function returns `400 invalid_request`, treat it as client/server contract drift first, not TURN infra failure.
4. Check TTL and `expiresAt` not expired.
5. Verify coturn secret matches Supabase `TURN_SHARED_SECRET`.
6. Confirm firewall for 3478/5349 + relay range.
7. If still failing, temporarily switch to `all` policy (STUN+TURN) and inspect ICE candidate logs.

## Symptom B: `rate_limited` spikes
1. Inspect `turn_issuance_audit` grouped by `ip_hash`/`user_hash`.
2. Verify client retry loop is not too aggressive.
3. Increase `TURN_RATE_MAX_PER_MINUTE` cautiously.
4. Keep hard cap (`TURN_RATE_HARD_CAP_PER_MINUTE`) to absorb abuse.

## Symptom C: High issuance latency
1. Check Supabase function cold starts / region placement.
2. Validate RL RPC latency and DB load.
3. Enable API-key path for trusted server-to-server traffic if JWT validation is bottleneck.

## Symptom D: TURN works in one region only
1. Verify each region DNS resolves and cert CN/SAN matches.
2. Validate each endpoint in `TURN_URLS` is reachable from clients.
3. Remove unhealthy endpoint from `TURN_URLS` until restored.

## 8. Alternatives

### Twilio Network Traversal
- Pros: fastest time-to-market, global POPs, mature SLA
- Cons: cost grows quickly at scale, vendor lock-in

### Metered.ca / Xirsys
- Pros: simple managed TURN, lower ops burden
- Cons: fewer knobs for deep hardening, regional constraints

### Self-hosted coturn (current path)
- Pros: lowest long-term cost, full control, privacy
- Cons: requires ops maturity (monitoring, failover, security patching)

## 9. Cost Model (rough order of magnitude)

Assumptions:
- TURN relay-heavy traffic average per monthly active user:
  - 100K users: ~0.5 GB/user/month
  - 1M users: ~0.7 GB/user/month
  - 10M users: ~1.0 GB/user/month
- Blended egress: $0.03-$0.07 per GB (region dependent)

Estimated monthly relay egress:
- 100K users: 50 TB -> ~$1.5K-$3.5K
- 1M users: 700 TB -> ~$21K-$49K
- 10M users: 10 PB -> ~$300K-$700K

Infra overhead (compute + observability) typically adds ~10-25%.
Managed providers may be 1.3x-3x these numbers depending on plan and region mix.

## 10. Recommended rollout

1. Stage rollout by region (canary 5% -> 25% -> 100%).
2. Enable strict alerts before full rollout.
3. Keep STUN fallback enabled during ramp.
4. Run chaos drills:
- disable one TURN region
- simulate RL backend outage
- rotate shared secret in maintenance window
