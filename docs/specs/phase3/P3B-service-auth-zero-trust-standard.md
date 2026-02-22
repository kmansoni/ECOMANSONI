# P3B — Service-to-Service Auth Standard (Zero-trust)

Дата: 2026-02-22

Цель: единый стандарт аутентификации/авторизации между сервисами, чтобы:
- исключить “доверие по сети”,
- упростить ротацию ключей,
- обеспечить аудит и минимальные права.

---

## 1) Принцип
- Never trust network.
- Каждый сервисный вызов аутентифицирован и авторизован.

---

## 2) Токены (baseline)

### 2.1 Формат
- Signed JWT (service-issued) с:
  - `iss` (issuer)
  - `sub` (service identity)
  - `aud` (target service)
  - `exp` (короткий TTL, 5–15 минут)
  - `scope` (набор прав)
  - `jti` (idempotency/audit)

### 2.2 TTL
- access token: 10 минут
- refresh/rotation: через secret manager

### 2.3 Scopes
Примеры:
- `reels:config:activate`
- `moderation:decision:write`
- `events:ingest`

---

## 3) mTLS (рекомендовано для Phase 3+)

- mTLS между сервисами в private network.
- Сертификаты ротируются каждые 30–90 дней.

---

## 4) Authorization

- Target service проверяет:
  - подпись токена
  - `aud`
  - `exp`
  - `scope`

---

## 5) Audit

Каждый service-call логирует:
- `trace_id`
- `jti`
- `caller_service`
- `target_service`
- `scope`

---

## 6) Kill-switch

- `deny_all_service_calls_except_allowlist`
- `rotate_keys_emergency`

---

## 7) Acceptance

Готово если:
- единый формат токенов
- единые scopes
- TTL и rotation правила
- аудит service calls
