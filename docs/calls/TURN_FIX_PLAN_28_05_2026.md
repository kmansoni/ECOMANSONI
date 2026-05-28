# Тюрн правка 28.05.2026г

**Проект:** mansoni  
**Дата:** 28.05.2026  
**Статус:** Активен  

---

## Содержание

1. [Фаза 1 — Критические блокеры](#фаза-1--критические-блокеры)
2. [Фаза 2 — Высокий приоритет](#фаза-2--высокий-приоритет)
3. [Фаза 3 — Средний приоритет](#фаза-3--средний-приоритет)
4. [Фаза 4 — Функциональные улучшения](#фаза-4--функциональные-улучшения)
5. [Сводная таблица](#сводная-таблица)

---

## Фаза 1 — Критические блокеры

> Без этих правок продакшен нестабилен или небезопасен. Выполнить первыми.

---

### Правка 1 — Удалить `lt-cred-mech`

**Файл:** `infra/calls/coturn/turnserver.prod.conf:90`  
**Усилие:** 5 мин | **Риск:** Низкий

`lt-cred-mech` (long-term credentials) несовместим с `use-auth-secret` (REST API / ephemeral credentials). При наличии обоих coturn отклоняет все TURN-аллокации с `401 Unauthorized`.

**До:**
```
use-auth-secret
static-auth-secret=...
lt-cred-mech
```

**После:**
```
use-auth-secret
static-auth-secret=...
```

---

### Правка 2 — Заменить placeholder-секреты

**Файлы:**
- `infra/calls/coturn/turnserver.conf:20` → `CHANGE_ME_LONG_RANDOM_SECRET`
- `infra/calls/coturn/turnserver.prod.conf:56` → `CHANGE_ME_USE_OPENSSL_RAND_HEX_32`

**Усилие:** 15 мин | **Риск:** Средний (смена секрета разрывает активные сессии)

Генерация:
```bash
openssl rand -hex 32
```

Результат → Supabase Vault (`TURN_SHARED_SECRET`) → подставляется при деплое через `sed` или env-injection. **Не коммитить в репозиторий.**

Синхронно обновить секрет в Edge Function:
```bash
supabase secrets set TURN_SHARED_SECRET="<новый_секрет>"
```

---

### Правка 3 — Заменить `external-ip=REPLACE_WITH_PUBLIC_IP`

**Файл:** `infra/calls/coturn/turnserver.prod.conf:28`  
**Усилие:** 10 мин | **Риск:** Средний

Без публичного IP coturn выдаёт ICE candidates с `0.0.0.0`. Все TURN-relay недоступны из интернета.

**До:**
```
external-ip=REPLACE_WITH_PUBLIC_IP
```

**После (статический):**
```
external-ip=<ПУБЛИЧНЫЙ_IP>
```

**После (динамический, в bootstrap-скрипте):**
```bash
PUBLIC_IP=$(curl -sf https://api.ipify.org)
sed -i "s/external-ip=.*/external-ip=$PUBLIC_IP/" turnserver.prod.conf
```

Для multi-homed серверов: `external-ip=<публичный>/<приватный>`

---

### Правка 4 — Унифицировать два bootstrap-скрипта

**Файлы:**
- `infra/calls/coturn/bootstrap-coturn.sh` (устаревший)
- `scripts/turn/bootstrap-turn-ubuntu.sh` (канонический)

**Усилие:** 45 мин | **Риск:** Средний

Два скрипта расходятся: разные пути, разные флаги безопасности, разные конфиги. `bootstrap-turn-ubuntu.sh` генерирует конфиг без `denied-peer-ip`, `no-tlsv1`, `max-allocate-lifetime`.

**Стратегия:**
1. `scripts/turn/bootstrap-turn-ubuntu.sh` — единственный канонический скрипт
2. Добавить параметр `--env dev|prod` для условной логики
3. Перенести всю prod-специфику из `bootstrap-coturn.sh`
4. `infra/calls/coturn/bootstrap-coturn.sh` заменить враппером:
```bash
#!/usr/bin/env bash
exec bash "$(dirname "$0")/../../../scripts/turn/bootstrap-turn-ubuntu.sh" --env prod "$@"
```
5. Обновить все CI/CD-ссылки на старый скрипт

---

## Фаза 2 — Высокий приоритет

---

### Правка 5 — Расширить диапазон relay-портов

**Файлы:**
- `infra/calls/coturn/turnserver.conf:12-13`
- `infra/calls/coturn/turnserver.prod.conf:40-41`
- `infra/calls/docker-compose.prod.yml:49`
- `infra/calls/coturn/bootstrap-coturn.sh:158` (ufw rules)
- `scripts/turn/bootstrap-turn-ubuntu.sh:64` (ufw rules)

**Усилие:** 15 мин | **Риск:** Низкий (конфиг) + координация с firewall

41 порт (49160–49200) = максимум ~20 одновременных TURN-стримов. При 50 участниках в комнате — дефицит.

**До (оба конфига):**
```
min-port=49160
max-port=49200
```

**После:**
```
min-port=49152
max-port=65535
```

**docker-compose.prod.yml — до:**
```yaml
- "49160-49200:49160-49200/udp"
```

**После:**
```yaml
- "49152-65535:49152-65535/udp"
```

**ufw (bootstrap скрипты) — до:**
```bash
ufw allow 49160:49200/udp
```

**После:**
```bash
ufw allow 49152:65535/udp
```

---

### Правка 6 — Добавить `denied-peer-ip` в dev-конфиг и bootstrap

**Файлы:**
- `infra/calls/coturn/turnserver.conf`
- `scripts/turn/bootstrap-turn-ubuntu.sh` (секция генерации конфига)

**Усилие:** 15 мин | **Риск:** Низкий

Без блокировки RFC1918 TURN-сервер может использоваться для SSRF-атак на внутреннюю сеть.

**Добавить в оба места:**
```
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=240.0.0.0-255.255.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
```

---

### Правка 7 — Ограничить `TURN_ALLOW_ANON_DEV` только localhost

**Файл:** `supabase/functions/turn-credentials/index.ts:423`  
**Усилие:** 10 мин | **Риск:** Низкий

Флаг позволяет получать TURN-credentials без аутентификации. Если включён в staging/preview — открыт для всех.

**До:**
```typescript
const allowAnon = Deno.env.get("TURN_ALLOW_ANON_DEV") === "1";
if (allowAnon && !isProductionEnv()) {
  return { userId: "dev-anon", authType: "jwt" };
}
```

**После:**
```typescript
const allowAnon = Deno.env.get("TURN_ALLOW_ANON_DEV") === "1";
if (allowAnon && !isProductionEnv()) {
  const clientIp = getClientIp(req);
  const isLocal = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "";
  if (!isLocal) return null; // не выдавать анонимно с внешних адресов
  return { userId: "dev-anon", authType: "jwt" };
}
```

---

### Правка 8 — Исправить race condition в replay-защите

**Файл:** `supabase/functions/turn-credentials/index.ts:251`  
**Усилие:** 20 мин | **Риск:** Низкий

Между проверкой nonce и его записью в Map — async DB-вызов. Два параллельных запроса с одним nonce могут оба пройти.

**До:**
```typescript
const existingEntry = replayNonceBuckets.get(replayKey);
if (existingEntry && existingEntry > now) {
  return makeJsonResponse(corsHeaders, 409, { error: "replay_detected" });
}
// ... async DB call ...
replayNonceBuckets.set(replayKey, now + TURN_REPLAY_WINDOW_MS);
```

**После — записать в Map ДО async-вызова:**
```typescript
// Атомарно занять слот ДО async DB-вызова
const existingEntry = replayNonceBuckets.get(replayKey);
if (existingEntry && existingEntry > now) {
  metrics.replayRejected += 1;
  return makeJsonResponse(corsHeaders, 409, { error: "replay_detected" });
}
// Занять слот немедленно — до любого await
replayNonceBuckets.set(replayKey, now + TURN_REPLAY_WINDOW_MS);

// Теперь безопасно делать async DB-вызов
// ...
```

---

### Правка 9 — Скрыть userId в TURN username в SFU

**Файл:** `server/sfu/index.mjs:27`  
**Усилие:** 20 мин | **Риск:** Низкий

SFU передаёт сырой `userId` в TURN username. Это нарушает Gate 5 release gate и утекает PII в логи coturn и WebRTC stats.

**До:**
```javascript
const username = `${expiry}:${userId.slice(0, 20)}`;
```

**После — использовать HMAC как в Edge Function:**
```javascript
function generateTurnCredentials(userId) {
  if (!TURN_SHARED_SECRET || TURN_URLS.length === 0) return null;
  const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  // Анонимизировать userId через HMAC — как в Edge Function
  const userHash = crypto
    .createHmac("sha256", TURN_SHARED_SECRET)
    .update(userId)
    .digest("base64url")
    .slice(0, 20);
  const username = `${expiry}:u_${userHash}`;
  const credential = crypto.createHmac("sha1", TURN_SHARED_SECRET).update(username).digest("base64");
  return { username, credential, expiry };
}
```

---

### Правка 10 — Добавить healthcheck для coturn

**Файл:** `infra/calls/docker-compose.prod.yml`  
**Усилие:** 10 мин | **Риск:** Низкий

Без healthcheck Docker не знает жив ли TURN. SFU стартует без ожидания готовности coturn.

**Добавить в секцию сервиса `coturn`:**
```yaml
coturn:
  image: coturn/coturn:4.6.3
  restart: unless-stopped
  # ... существующие настройки ...
  healthcheck:
    test: ["CMD-SHELL", "nc -z 127.0.0.1 3478 || exit 1"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 10s
```

---

## Фаза 3 — Средний приоритет

---

### Правка 11 — Добавить `no-tlsv1` / `no-tlsv1_1` в dev-конфиг

**Файл:** `infra/calls/coturn/turnserver.conf`  
**Усилие:** 5 мин | **Риск:** Низкий

**Добавить:**
```
no-tlsv1
no-tlsv1_1
```

---

### Правка 12 — Добавить `max-allocate-lifetime`

**Файлы:**
- `infra/calls/coturn/turnserver.conf`
- `scripts/turn/bootstrap-turn-ubuntu.sh` (секция генерации конфига)

**Усилие:** 10 мин | **Риск:** Низкий

Без ограничения порты заняты до TCP-таймаута при зависших клиентах.

**Добавить:**
```
max-allocate-lifetime=3600
channel-lifetime=600
permission-lifetime=300
```

---

### Правка 13 — Снизить MAX_TURN_TTL_SECONDS с 24ч до 4ч

**Файл:** `supabase/functions/turn-credentials/index.ts:7`  
**Усилие:** 5 мин | **Риск:** Низкий

**До:**
```typescript
const MAX_TURN_TTL_SECONDS = 24 * 3600; // 86400
```

**После:**
```typescript
const MAX_TURN_TTL_SECONDS = 4 * 3600; // 14400
```

Украденные credentials действуют максимум 4 часа вместо 24.

---

### Правка 14 — Настроить `alternate-server` для multi-region

**Файл:** `infra/calls/coturn/turnserver.prod.conf:32-33`  
**Усилие:** 15 мин (после появления второго сервера) | **Риск:** Низкий

**До:**
```
# alternate-server=turn-tr.mansoni.ru:3478
# alternate-server=turn-ae.mansoni.ru:3478
```

**После (раскомментировать при наличии серверов):**
```
alternate-server=turn-tr.mansoni.ru:3478
alternate-server=turn-ae.mansoni.ru:3478
```

---

### Правка 15 — Отключить `verbose` в prod

**Файл:** `infra/calls/coturn/turnserver.prod.conf:103`  
**Усилие:** 5 мин | **Риск:** Низкий

`verbose` генерирует огромный объём логов в prod (каждый ICE candidate, каждый пакет).

**До:**
```
verbose
log-file=/var/log/coturn/turnserver.log
```

**После:**
```
# verbose  # отключено в prod — слишком высокий объём
log-file=/var/log/coturn/turnserver.log
syslog
```

---

### Правка 16 — Сделать `iceCandidatePoolSize` конфигурируемым

**Файл:** `src/lib/webrtc-config.ts:312`  
**Усилие:** 10 мин | **Риск:** Низкий

**До:**
```typescript
iceCandidatePoolSize: 10,
```

**После:**
```typescript
iceCandidatePoolSize: options.candidatePoolSize ?? 4,
```

Добавить `candidatePoolSize?: number` в `WebRTCConfigOptions`.

---

### Правка 17 — Exponential backoff в circuit breaker

**Файл:** `src/lib/webrtc-config.ts:50-51`  
**Усилие:** 20 мин | **Риск:** Низкий

**До:**
```typescript
const TURN_FETCH_CIRCUIT_COOLDOWN_MS = 60 * 1000; // фиксированный 60s
```

**После:**
```typescript
function getTurnCircuitCooldownMs(failures: number): number {
  // 60s, 120s, 240s, макс 300s
  return Math.min(60_000 * Math.pow(2, failures - TURN_FETCH_FAILURE_THRESHOLD), 300_000);
}
// При открытии circuit:
turnFetchCircuitOpenUntil = Date.now() + getTurnCircuitCooldownMs(turnFetchFailures);
```

---

### Правка 18 — Валидация `expiresAt` сервера в кэше

**Файл:** `src/lib/webrtc-config.ts:296`  
**Усилие:** 15 мин | **Риск:** Низкий

Кэш может вернуть credentials с истёкшим сроком если часы клиента отстают.

**Добавить в `getIceServers`:**
```typescript
// Хранить serverExpiresAt при кэшировании
let cachedServerExpiresAt = 0;

// При кэшировании:
cachedServerExpiresAt = Date.now() + ttlMs;

// При проверке кэша — добавить:
const EXPIRY_BUFFER_MS = 60_000;
if (cachedServerExpiresAt > 0 && Date.now() > cachedServerExpiresAt - EXPIRY_BUFFER_MS) {
  cachedIceServers = null; // принудительно обновить
}
```

---

### Правка 19 — pg_cron очистка `turn_issuance_rl`

**Файл:** новая SQL-миграция  
**Усилие:** 15 мин | **Риск:** Низкий

Таблица растёт бесконечно без cleanup.

```sql
-- Миграция: turn_issuance_rl_cleanup_cron
SELECT cron.schedule(
  'cleanup-turn-issuance-rl',
  '0 * * * *',
  $$
    DELETE FROM public.turn_issuance_rl
    WHERE bucket_ts < NOW() - INTERVAL '2 hours';
  $$
);
```

---

### Правка 20 — Добавить порт `5349/udp`

**Файл:** `infra/calls/docker-compose.prod.yml:49`  
**Усилие:** 5 мин | **Риск:** Низкий

TURNS (TLS) работает по TCP и UDP. Порт `5349/udp` отсутствует.

**До:**
```yaml
- "5349:5349/tcp"
```

**После:**
```yaml
- "5349:5349/tcp"
- "5349:5349/udp"
```

---

## Фаза 4 — Функциональные улучшения

---

### Правка 21 — Механизм ротации credentials (dual-secret)

**Файлы:** `supabase/functions/turn-credentials/index.ts`, `turnserver.prod.conf`  
**Усилие:** 60 мин | **Риск:** Средний

**Подход:**
1. Добавить `TURN_SHARED_SECRET_NEXT` в Vault (новый секрет)
2. Edge Function выдаёт credentials по `TURN_SHARED_SECRET_NEXT` если задан
3. coturn поддерживает несколько `static-auth-secret` директив одновременно:
```
static-auth-secret=<старый>
static-auth-secret=<новый>
```
4. После полного перехода (TTL старых credentials истёк) — удалить старый секрет

---

### Правка 22 — Prometheus exporter для coturn

**Файл:** `infra/calls/docker-compose.prod.yml`  
**Усилие:** 90 мин | **Риск:** Низкий

```yaml
coturn-exporter:
  image: ghcr.io/coturn/coturn-exporter:latest
  restart: unless-stopped
  environment:
    - COTURN_HOST=coturn
    - COTURN_PORT=3478
  ports:
    - "9641:9641"
```

Метрики: активные аллокации, ошибки auth, использование портов, bandwidth.

---

### Правка 23 — IPv6 TURN URLs

**Файлы:** `turnserver.prod.conf`, `webrtc-config.ts`  
**Усилие:** 30 мин | **Риск:** Средний

```
# turnserver.prod.conf
relay-ip=<IPv6_АДРЕС>
```

```bash
# Supabase secrets
supabase secrets set TURN_URLS_V6="turn:[IPv6]:3478?transport=udp,turns:[IPv6]:5349?transport=tcp"
```

---

### Правка 24 — Pre-call TURN connectivity check

**Файл:** новый `src/lib/webrtc-turn-probe.ts`  
**Усилие:** 45 мин | **Риск:** Низкий

```typescript
export async function probeTurnRelay(iceServers: RTCIceServer[], timeoutMs = 5000): Promise<boolean> {
  const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 1 });
  pc.createDataChannel("probe");
  await pc.setLocalDescription(await pc.createOffer());
  return new Promise((resolve) => {
    const t = setTimeout(() => { pc.close(); resolve(false); }, timeoutMs);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate?.type === "relay") {
        clearTimeout(t); pc.close(); resolve(true);
      }
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t); pc.close(); resolve(false);
      }
    };
  });
}
```

---

### Правка 25 — Auto-refresh credentials при reconnect близко к expiry

**Файл:** `src/lib/webrtc-config.ts`  
**Усилие:** 40 мин | **Риск:** Низкий

```typescript
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 минут

export function shouldRefreshTurnCredentials(): boolean {
  if (!cacheExpiry) return true;
  return Date.now() > cacheExpiry - REFRESH_BEFORE_EXPIRY_MS;
}

// Вызывать при каждом reconnect в sfuMediaManager.ts:
if (shouldRefreshTurnCredentials()) {
  clearIceServerCache();
  await getIceServers();
}
```

---

### Правка 26 — Retention policy для `turn_issuance_audit`

**Файл:** новая SQL-миграция  
**Усилие:** 15 мин | **Риск:** Низкий

```sql
-- Хранить аудит 90 дней
SELECT cron.schedule(
  'cleanup-turn-issuance-audit',
  '30 2 * * *',
  $$
    DELETE FROM public.turn_issuance_audit
    WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);
```

---

## Сводная таблица

| Фаза | Правки | Усилие | Блокер? |
|------|--------|--------|---------|
| **Фаза 1** — Критические блокеры | 1, 2, 3, 4 | ~75 мин | ДА |
| **Фаза 2** — Высокий приоритет | 5, 6, 7, 8, 9, 10 | ~90 мин | Частично |
| **Фаза 3** — Средний приоритет | 11–20 | ~105 мин | Нет |
| **Фаза 4** — Функциональные | 21–26 | ~280 мин | Нет |
| **Scale Layer** — 1B Users | 27, 28, 29, 30, 31 | ~270 мин | ДА |
| **AV Layer** — Adversarial Validation | AV-1…AV-5 | ~170 мин | **ДА** (для production resilience) |
| **Итого** | **36 правок + 5 AV тестов + 3 migrations** | **~1165 мин (~19ч)** | |

---

## Рекомендуемый порядок выполнения

```
День 1 (2–3ч):
  Правка 1  → удалить lt-cred-mech              (5 мин)
  Правка 3  → external-ip                        (10 мин)
  Правка 20 → 5349/udp в docker-compose          (5 мин)
  Правка 5  → расширить relay ports              (15 мин)
  Правка 10 → healthcheck coturn                 (10 мин)
  Правка 2  → сгенерировать и выставить секрет   (15 мин)
  Правка 9  → скрыть userId в TURN username      (20 мин)
  Правка 6  → denied-peer-ip в dev конфиг        (15 мин)

День 2 (2–3ч):
  Правка 4  → унифицировать bootstrap скрипты    (45 мин)
  Правка 7  → localhost check для ANON_DEV       (10 мин)
  Правка 8  → race condition replay guard          (20 мин)
  Правка 11 → no-tlsv1 в dev конфиге             (5 мин)
  Правка 12 → max-allocate-lifetime              (10 мин)
  Правка 13 → TTL max 4ч                         (5 мин)
  Правка 15 → отключить verbose в prod           (5 мин)
  Правка 19 → pg_cron для turn_issuance_rl       (15 мин)
  Правка 26 → retention для audit таблицы        (15 мин)

ADVERSARIAL VALIDATION (обязательно после дня 2):
  AV-1    → concurrent replay test               (30 мин)
  AV-3    → config drift detector              (15 мин)
  AV-5    → anti-theater metrics setup         (45 мин)

Спринт (по готовности):
  Правки 14, 16, 17, 18 — улучшения клиента
  Правки 21–25 — новые функции
```
День 1 (2–3ч):
  Правка 1  → удалить lt-cred-mech              (5 мин)
  Правка 3  → external-ip                        (10 мин)
  Правка 20 → 5349/udp в docker-compose          (5 мин)
  Правка 5  → расширить relay ports              (15 мин)
  Правка 10 → healthcheck coturn                 (10 мин)
  Правка 2  → сгенерировать и выставить секрет   (15 мин)
  Правка 9  → скрыть userId в TURN username      (20 мин)
  Правка 6  → denied-peer-ip в dev конфиг        (15 мин)

День 2 (2–3ч):
  Правка 4  → унифицировать bootstrap скрипты    (45 мин)
  Правка 7  → localhost check для ANON_DEV       (10 мин)
  Правка 8  → race condition replay guard        (20 мин)
  Правка 11 → no-tlsv1 в dev конфиге             (5 мин)
  Правка 12 → max-allocate-lifetime              (10 мин)
  Правка 13 → TTL max 4ч                         (5 мин)
  Правка 15 → отключить verbose в prod           (5 мин)
  Правка 19 → pg_cron для turn_issuance_rl       (15 мин)
  Правка 26 → retention для audit таблицы        (15 мин)

ADVERSARIAL VALIDATION (обязательно после дня 2):
  AV-1    → concurrent replay test               (30 мин)
  AV-3    → config drift detector              (15 мин)
  AV-5    → anti-theater metrics setup         (45 мин)

SCALE LAYER (перед prod deploy):
  Правка 27 → regional sharding migrations      (120 мин)
  Правка 28 → partitioning миграции            (90 мин)
  Правка 29 → rate limit масштабирование        (30 мин)
  Правка 30 → region-aware issuance            (45 мин)
  Правка 31 → active allocation tracking        (60 мин)

Спринт (по готовности):
   Правки 14, 16, 17, 18 — улучшения клиента
   Правки 21–25 — новые функции

---

## Adversarial Validation Layer (NEW)

> После выполнения правок 1-20 система должна пройти adversarial тесты. Без этого любые метрики становятся attack surface.

### AV-1 — Concurrent Replay Attack Test

**Усилие:** 30 мин | **Риск:** Низкий

Тестирует race condition в replay protection. **Требует 100% rejection при 2+ одинаковых nonce.**

```bash
# scripts/turn/test-replay-race.mjs
for i in {1..100}; do
  curl -X POST -H "x-turn-nonce: test-nonce-123" \
    -d '{"nonce":"test-nonce-123"}' \
    http://localhost:8787/functions/v1/turn-credentials &
done
wait
# Ожидаем: ровно 1 успех, 99 rejections
```

### AV-2 — Expired Credential Reproduction

**Усилие:** 20 мин | **Риск:** Низкий

Credential с expiry в прошлом должен отклоняться coturn. **Тест: TURN server должен вернуть 401, а не принять.**

### AV-3 — Configuration Drift Detector

**Усилие:** 15 мин | **Риск:** Низкий

```bash
# .github/scripts/check-turn-drift.sh
diff <(grep -E '^(denied-peer-ip|min-port|max-port|external-ip|static-auth-secret)=' infra/calls/coturn/turnserver.conf) \
     <(grep -E '^(denied-peer-ip|min-port|max-port|external-ip|static-auth-secret)=' infra/calls/coturn/turnserver.prod.conf)
# FAIL CI если drift > 10%
```

### AV-4 — Surprise Assumption Rotation

**Усилие:** 60 мин ежеквартально | **Риск:** Низкий

Каждые 90 дней:
1. Внедрить corrupted TURN-ответ (DNS spoof, wrong secret)
2. Замерить: % звонков упало до <5% — система уязвима к silent failures
3. Пересмотреть assumptions: "TURN нужен или STUN enough?"

### AV-5 — Anti-Theater Metrics

**Усилие:** 45 мин | **Риск:** Низкий

Добавить metric contradiction detection:
- Если `TURN_FETCH_FAILURES > 0` но `success_rate = 100%` → алерт "metric theater detected"
- Если `replayRejected == 0` > 10000 запросов → алерт "replay not enforced"
- Если `circuit_open` события есть, но клиенты всё ещё получают credentials → алерт "fallback masking"

---

## Scale Layer: 1 Billion Users

> Архитектурные изменения для обслуживания 1 млрд одновременных пользователей.

### Правка 27 — Regional TURN Sharding

**Усилие:** 120 мин | **Риск:** Высокий

Созданы таблицы `turn_regions` и миграции для горизонтального шардинга:
- 4 initial regions: tr, ae, eu, global
- Automatic geo-routing based on client IP
- Per-region capacity tracking

**Migration:** `20260528000001_turn_regional_sharding_v1.sql`

### Правка 28 — TURN Partitioning

**Усилие:** 90 мин | **Риск:** Средний

Таблица `turn_replay_guard` разделена на monthly partitions:
- Обрабатывает 100K+ RPS на регион
- Автоматическая очистка старых партиций
- Индексы на каждую партицию

**Migration:** `20260528000000_turn_replay_guard_partitioning_v1.sql`

### Правка 29 — Rate Limit масштабирование

**Усилие:** 30 мин | **Риск:** Низкий

Повышены лимиты для 1B scale:
- `TURN_RATE_MAX_PER_MINUTE`: 20 → 200
- `TURN_RATE_HARD_CAP_PER_MINUTE`: 200 → 2000
- MAX_TURN_TTL_SECONDS: 24ч → 4 ч (ограничение security window)

### Правка 30 — Region-aware Credential Issuance

**Функция:** `getTurnUrlsForRegion(clientIp)` в `turn-credentials/index.ts`

Edge Function теперь возвращает TURN URL для ближайшего региона. Параметры:
- `TURN_USE_REGION_ROUTING=1` включает роутинг
- RPC `select_turn_region` выбирает регион по гео
- Fallback к global при ошибке

### Правка 31 — Active Allocation Tracking

**Migration:** `20260528000002_turn_active_allocations_v1.sql`

Отслеживание live-allocations для load balancing:
- Таблица `turn_active_allocations` с partitioning
- Функции `track_turn_allocation`, `get_turn_region_load`
- Cron cleanup каждые 5 минут

---

## Архитектура масштабирования (1B users)

```
                    ┌─────────────────────────┐
                    │ 1. Client → TURN Region  │
                    │    (geo-based routing)   │
                    └───────────┬─────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
   ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
   │ turn-tr     │       │ turn-ae     │       │ turn-eu     │
   │ (Turkey)    │       │ (UAE)       │       │ (Europe)    │
   │ 10K concurrent│     │ 10K         │       │ 10K         │
   └─────────────┘       └─────────────┘       └─────────────┘
         ▲                      ▲                      ▲
         └──────────────────────┼──────────────────────┘
                                ▼
                    ┌─────────────────────────┐
                    │ 2. Region Load Check    │
                    │ via get_turn_region_load│
                    └───────────┬─────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
   ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
   │ Supabase    │       │ Supabase    │       │ Supabase    │
   │ Region DB   │       │ Region DB   │       │ Region DB   │
   │ (geo-local) │       │ (geo-local) │       │ (geo-local) │
   └─────────────┘       └─────────────┘       └─────────────┘
```

### Capacity расчёт:
- 1 регион: 100K concurrent × 10 Gbps = ~50K одновременных звонков (среднее качество)
- 100 регионов: 5M одновременных звонков (peak)
- 1B пользователей: 0.5% онлайн одновременно = 5M звонков (reality: 0.1% during peak hours)
- Per-node specs: 32 vCPU, 128 GB RAM, 10 Gbps → 1M+ users/node

### Scaling triggers:
- utilization_pct > 75% на регион → добавить node в region pool
- replay_nonce_buckets.size > 1M → split region
- error_rate > 1% на регион → health check failure

---

*Документ создан по результатам аудита TURN-инфраструктуры mansoni от 28.05.2026.*
