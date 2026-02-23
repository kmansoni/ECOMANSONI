# TURN / Calls Release Gate (v1)

Цель: гарантировать, что TURN credentials не утекут через WS, выдаются только аутентифицированным пользователям,
и защищены от abuse (rate limit), а клиент корректно инвалидацирует ICE cache.

## Gate 0 — Preconditions (must)
1) В прод-среде для edge function выставлено `ENV=prod` (или эквивалент продового режима).
2) В секретах edge function присутствует `SUPABASE_SERVICE_ROLE_KEY`.
3) Выставлен `TURN_RATE_MAX_PER_MINUTE` (или подтверждён безопасный default).
4) TURN data-plane (coturn) доступен и настроен (relay ports / external-ip / tls если нужно).

## Gate 1 — WS must never issue credentials (P0)
5) `ROOM_JOIN_OK` не содержит `username`, `credential`, `CALLS_TURN_*` или аналогичных полей.
   Допустимо: `iceServers(urls-only)` и/или `turnUrls` + `credsVia="edge_function"`.

## Gate 2 — Edge function auth + rate limit (P0/P1)
6) `turn-credentials`:
   - Без Authorization → 401
   - Authorization=anon key → 401
   - Authorization=user access_token → 200 (iceServers содержит turn + short-lived creds)
7) Rate limit:
   - > MAX выдач в минуту (user+ip и user-only корзины) → 429
   - После окна (60s) → снова 200

## Gate 3 — RL RPC/table isolation (P0)
8) PostgREST:
   - `/rest/v1/rpc/turn_issuance_rl_hit_v1` не вызывается authenticated JWT (ожидаем 401/403)
   - `/rest/v1/turn_issuance_rl` не читается authenticated JWT (ожидаем 401/403)

## Gate 4 — No service-role leaks (P0)
9) Логи edge function не содержат:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - дампов env
   - raw credentials

## Gate 5 — Privacy / correlation (P1)
10) Username в TURN creds не содержит raw userId (используется hash/opaque id).

## Gate 6 — Client correctness (P1)
11) Клиент всегда получает creds через edge function (`getIceServers()` → `turn-credentials`) и
    инвалидация ICE cache происходит автоматически на:
    - online/offline
    - connection change (если доступно)
    - reconnect логике сигналинга/звонка

## Gate 7 — End-to-End path (P0)
12) E2E: в сетевых условиях, требующих relay (symmetric NAT / UDP blocked), выбранный candidate pair = `relay`
    и звонок устанавливается/восстанавливается после смены сети.

---

## Как прогонять
- `npm run turn:verify` (локально/CI)
- `REQUIRE_TURN_SMOKE=1` делает smoke blocking (без env — fail, не skip)
