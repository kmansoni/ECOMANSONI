# ПОЛНЫЙ АУДИТ МОДУЛЯ "ЗВОНКИ" (CALLS)

**Дата:** 2026-03-19  
**Версия:** 1.0

---

## Резюме для руководства (Executive Summary)

Модуль звонков в текущем состоянии **НЕ ГОТОВ к production-использованию**. Выявлено **59 проблем** в трёх слоях: серверный код (25), клиентский код (18), база данных (16). Из них **9 critic, 23 high-severity**.

Ключевые блокирующие проблемы:
1. **Сигнализация звонков полностью нерабочая** — `call.accept`/`decline`/`hangup` являются заглушками на сервере, не ретранслируются второй стороне
2. **Перехват звонков без аутентификации** — через `deviceId` hijacking в `HELLO` handler
3. **Crash сервера при сбое Redis** — нет `try/catch` в async message handler
4. **`call_type` несовместимость `'voice'` vs `'audio'`** — `INSERT` упадёт в production
5. **RPC-функции заблокированы для пользователей** — `REVOKE` от `authenticated` без замены на `service_role` path

---

## 1. Обзор архитектуры

### 1.1 Компоненты модуля

| Компонент | Файлы | Размер | Назначение |
|-----------|-------|--------|------------|
| calls-ws gateway | [`server/calls-ws/`](server/calls-ws/) (7 файлов) | ~77KB | WebSocket Gateway: auth, rooms, call signaling, E2EE relay |
| SFU Media Plane | [`server/sfu/`](server/sfu/) (3 файла) | ~60KB | mediasoup-based SFU: transport, produce, consume |
| Calls V2 SDK | [`src/calls-v2/`](src/calls-v2/) (9 файлов) | ~96KB | Клиентский SDK: WS client, key exchange, media encryption |
| VideoCallProvider | [`src/contexts/video-call/`](src/contexts/video-call/) (6 файлов) | ~97KB | React context: оркестрация SFU + P2P, UI state |
| Hooks | [`src/hooks/`](src/hooks/) (5 файлов) | ~61KB | React hooks: SFU calls, P2P calls, incoming, group, history |
| UI Components | [`src/components/chat/`](src/components/chat/) (5 файлов) | ~30KB | Экраны звонков, overlay, sheets |
| Utilities | [`src/lib/`](src/lib/) (6 файлов) | ~33KB | WebRTC config, TURN, wake lock, platform |
| E2EE Library | [`src/lib/e2ee/`](src/lib/e2ee/) (5 файлов) | ~22KB | SFrame, Insertable Streams, key exchange |
| Native | [`apps/mobile-shell/`](apps/mobile-shell/) (4 файла) | ~15KB | CallKit (iOS), ConnectionService (Android) |
| TURN Edge Function | [`supabase/functions/get-turn-credentials/`](supabase/functions/get-turn-credentials/) | ~14KB | HMAC-SHA1 credential issuer |
| DB Migrations | [`supabase/migrations/`](supabase/migrations/) (16 файлов) | N/A | Таблицы, RLS, RPCs, триггеры |
| Infrastructure | [`infra/calls/`](infra/calls/) (8 файлов) | ~13KB | Docker, coturn, PM2, systemd |
| Tests | [`src/test/`](src/test/) (11 файлов) | ~40KB | Unit + integration tests |
| **ИТОГО** | **~90 файлов** | **~560KB** | |

### 1.2 Архитектурная диаграмма (текущая)

```
┌─────────────┐     Supabase Realtime      ┌─────────────┐
│  Client A   │◄─────── DB polling ────────►│  Client B   │
│ (browser)   │    (call state changes)     │ (browser)   │
├─────────────┤                             ├─────────────┤
│VideoCallProv│                             │VideoCallProv│
│ useVideoCall│                             │ useVideoCall│
│ Sfu / P2P   │                             │ Sfu / P2P   │
└──┬──────┬───┘                             └──┬──────┬───┘
   │ WS   │ WS                                │ WS   │ WS
   ▼      ▼                                   ▼      ▼
┌──────┐┌──────┐                            ┌──────┐┌──────┐
│calls-││ SFU  │                            │calls-││ SFU  │
│  ws  ││server│◄── mediasoup workers ─────►│  ws  ││server│
└──────┘└──────┘                            └──────┘└──────┘
   │          │                                │         │
   ▼          ▼                                ▼         ▼
┌──────┐  ┌───────┐                         ┌──────┐
│Redis │  │coturn │ ◄──── TURN relay ──────►│coturn│
└──────┘  └───────┘                         └──────┘
```

**КРИТИЧЕСКАЯ ПРОБЛЕМА:** Call signaling (`accept`/`decline`/`hangup`) идёт через Supabase DB + Realtime polling, а НЕ через calls-ws WebSocket. Это архитектурное решение создаёт single point of failure.

### 1.3 Двойственность систем

Существуют ДВЕ несвязанные системы звонков:
- **`calls`** — таблица с state machine RPCs (`call_create_v1`, `call_accept_v1`, etc.)
- **`video_calls`** — таблица с триггерами уведомлений, проверкой missed calls

Клиентский код ([`useVideoCallSfu`](src/hooks/useVideoCallSfu.ts)) использует `video_calls`. State machine RPCs работают с `calls`. Системы не связаны между собой.

---

## 2. Серверные проблемы (25 шт.)

### 2.1 CRITICAL (3)

| ID | Файл | Описание | Воздействие |
|----|------|----------|-------------|
| S-01 | [`server/calls-ws/index.mjs:916`](server/calls-ws/index.mjs:916) | `call.accept`/`decline`/`cancel`/`hangup` — **заглушки**, только ACK отправителю, ничего не ретранслируется | Звонки невозможно принять/отклонить/завершить через WS. Полная нерабочая сигнализация |
| S-02 | [`server/calls-ws/index.mjs:593`](server/calls-ws/index.mjs:593) | `HELLO` handler регистрирует `deviceId` без аутентификации — атакующий перезаписывает чужой `deviceId` | Перехват входящих звонков произвольного пользователя |
| S-03 | [`server/calls-ws/index.mjs:518`](server/calls-ws/index.mjs:518) | Нет `try/catch` в async message handler — Redis failure → `unhandledRejection` → process crash | Первый же сбой Redis роняет весь signaling сервер |

### 2.2 HIGH (10)

| ID | Файл | Описание |
|----|------|----------|
| S-04 | [`server/calls-ws/index.mjs:1027`](server/calls-ws/index.mjs:1027) | `KEY_ACK` `fromDeviceId` не верифицируется — E2EE ACK spoofing |
| S-05 | [`server/calls-ws/index.mjs:907`](server/calls-ws/index.mjs:907) | `call.invite` без проверки принадлежности `to_device` → маршрутизация на чужой device |
| S-06 | [`server/calls-ws/index.mjs:830`](server/calls-ws/index.mjs:830) | `ROOM_JOIN` TOCTOU — race condition на проверке лимита участников |
| S-07 | [`server/calls-ws/index.mjs:1355`](server/calls-ws/index.mjs:1355) | `PEER_LEFT` не отправляется при disconnect, пустые комнаты не удаляются (memory leak) |
| S-08 | [`server/sfu/index.mjs`](server/sfu/index.mjs) (global) | SFU нет periodic JWT revalidation — отозванный токен работает до 1 часа |
| S-09 | [`server/sfu/index.mjs:347`](server/sfu/index.mjs:347) | SFU без `maxPayload` → DoS через 100MB JSON |
| S-10 | [`server/sfu/index.mjs:907`](server/sfu/index.mjs:907) | `REKEY_COMMIT` от любого участника сбрасывает E2EE epoch → DoS |
| S-11 | [`server/calls-ws/store/redisStore.mjs:15`](server/calls-ws/store/redisStore.mjs:15) | `retryStrategy: null` — Redis reconnection отключён |
| S-12 | [`server/calls-ws/store/redisStore.mjs:65`](server/calls-ws/store/redisStore.mjs:65) | Mailbox streams без TTL → unbounded Redis growth |
| S-13 | [`server/calls-ws/index.mjs:964`](server/calls-ws/index.mjs:964) | `KEY_PACKAGE` `fromDeviceId` не проверяется → message spoofing |

### 2.3 MEDIUM (8)

| ID | Файл | Описание |
|----|------|----------|
| S-14 | [`server/sfu/mediaPlane.mjs:265`](server/sfu/mediaPlane.mjs:265) | `ensureRouter` race → дублирующиеся routers + утечка mediasoup worker |
| S-15 | [`server/calls-ws/store/redisStore.mjs:226`](server/calls-ws/store/redisStore.mjs:226) | Room version keys без TTL |
| S-16 | [`supabase/functions/get-turn-credentials/index.ts:96`](supabase/functions/get-turn-credentials/index.ts:96) | `getClientIp` доверяет `X-Forwarded-For` → IP spoof / rate limit bypass |
| S-17 | [`server/sfu/index.mjs:284`](server/sfu/index.mjs:284) | `isLikelyBase64` отклоняет base64url → E2EE handshake failure |
| S-18 | [`server/sfu/mediaPlane.mjs:215`](server/sfu/mediaPlane.mjs:215) | Worker death не инвалидирует stale транспорты |
| S-19 | [`supabase/functions/get-turn-credentials/index.ts:201`](supabase/functions/get-turn-credentials/index.ts:201) | TURN rate limit fail-open при DB downtime |
| S-20 | [`server/calls-ws/store/redisStore.mjs:186`](server/calls-ws/store/redisStore.mjs:186) | `SADD` + `EXPIRE` non-atomic для rekey need set |
| S-21 | [`server/calls-ws/index.mjs:1082`](server/calls-ws/index.mjs:1082) | `REKEY_BEGIN` fan-out включает отправителя |

### 2.4 LOW (4)

| ID | Описание |
|----|----------|
| S-22 | `TURN_AUTH_SECRET` минимум 16 символов — рекомендуется 32 |
| S-23 | Нет `process.on('unhandledRejection')` handler |
| S-24 | `seq:undefined` в `ROOM_SNAPSHOT` ломает sequence tracking |
| S-25 | Auth cache eviction по insertion order, не по TTL |

---

## 3. Клиентские проблемы (18 шт.)

### 3.1 CRITICAL (4)

| ID | Файл | Описание | Воздействие |
|----|------|----------|-------------|
| C-01 | [`src/contexts/video-call/VideoCallProvider.tsx:1840`](src/contexts/video-call/VideoCallProvider.tsx:1840) | `declineCall` уведомляет через DB `UPDATE` + Realtime — ненадёжно при потере Realtime | Звонящий никогда не узнает об отклонении |
| C-02 | [`src/hooks/useVideoCallSfu.ts:368`](src/hooks/useVideoCallSfu.ts:368) | Нет таймаута ожидания ответа — caller зависает навечно в состоянии `"calling"` | Бесконечный вызов без timeout |
| C-03 | [`src/contexts/video-call/VideoCallProvider.tsx:1273`](src/contexts/video-call/VideoCallProvider.tsx:1273) | `consumeUnsub` снимается через 10 минут `setTimeout` — новые media tracks после 10 мин не обрабатываются | Медиа пира пропадает после 10 мин звонка |
| C-04 | [`src/contexts/video-call/VideoCallProvider.tsx:699`](src/contexts/video-call/VideoCallProvider.tsx:699) | `onConnectionStateChange` unsubscribe вызывается немедленно — соединение неотслеживаемо | WS reconnect после bootstrap не обнаруживается |

### 3.2 HIGH (6)

| ID | Файл | Описание |
|----|------|----------|
| C-05 | [`src/contexts/video-call/VideoCallProvider.tsx:1102`](src/contexts/video-call/VideoCallProvider.tsx:1102) | Race condition: двойной `bootstrapCallsV2Room` без lock |
| C-06 | [`src/contexts/video-call/VideoCallProvider.tsx:1031`](src/contexts/video-call/VideoCallProvider.tsx:1031) | `KEY_ACK` отправляется даже при провале key exchange → E2EE broken |
| C-07 | [`src/contexts/video-call/VideoCallProvider.tsx:975`](src/contexts/video-call/VideoCallProvider.tsx:975) | Отсутствующая подпись в `KEY_PACKAGE` заменяется random вместо rejection |
| C-08 | [`src/hooks/useVideoCallSfu.ts:550`](src/hooks/useVideoCallSfu.ts:550) | Polling каждые 1500ms в дополнение к Realtime — 40 req/min на звонок |
| C-09 | [`src/calls-v2/rekeyStateMachine.ts:97`](src/calls-v2/rekeyStateMachine.ts:97) | Утечка таймера `messageIdCleanupTimer` при повторном `closeCallsV2` |
| C-10 | [`src/hooks/useIncomingCalls.ts:195`](src/hooks/useIncomingCalls.ts:195) | `cleanupStaleRingingCalls` при каждом монтировании — убивает звонки других вкладок |

### 3.3 MEDIUM (6)

| ID | Описание |
|----|----------|
| C-11 | `EpochKeyMaterial._rawBytes` не зануляется при ротации эпохи |
| C-12 | `GlobalCallOverlay` `logger.info` на каждый рендер |
| C-13 | `declineCall` stale closure → decline может не сработать |
| C-14 | `SfuMediaManager` нет ICE restart при `failed` state |
| C-15 | [`src/calls-v2/wsClient.ts`](src/calls-v2/wsClient.ts) `lastServerSeq` не сбрасывается при reconnect |
| C-16 | Двойное состояние incoming call — `detectedIncomingCall` vs `pendingIncomingCall` |

### 3.4 LOW (2)

| ID | Описание |
|----|----------|
| C-17 | Dead code: `toBase64Utf8` с void suppression |
| C-18 | Unconditional `logger.info` в render body [`VideoCallProvider`](src/contexts/video-call/VideoCallProvider.tsx) |

---

## 4. Проблемы базы данных (16 шт.)

### 4.1 CRITICAL (3)

| ID | Миграция | Описание |
|----|----------|----------|
| D-01 | [`supabase/migrations/req_0140_call_signaling_state_machine.sql:124`](supabase/migrations/req_0140_call_signaling_state_machine.sql:124) | `call_type 'voice'` vs `CHECK 'audio'/'video'` — `INSERT` упадёт |
| D-02 | [`supabase/migrations/req_0140_call_signaling_state_machine.sql:129`](supabase/migrations/req_0140_call_signaling_state_machine.sql:129) | Race condition в busy-check без `FOR UPDATE` → два звонка на одного callee |
| D-03 | [`supabase/migrations/critical_security_hardening_v1.sql:192`](supabase/migrations/critical_security_hardening_v1.sql:192) | `REVOKE` от `authenticated` → все call RPCs заблокированы для клиентов |

### 4.2 HIGH (7)

| ID | Описание |
|----|----------|
| D-04 | Дублирующиеся `SELECT`-политики на `calls` |
| D-05 | `video_calls.status` нет `CHECK` constraint |
| D-06 | Двойная публикация missed-событий в outbox |
| D-07 | Нет FK на `auth.users` для `caller_id`/`callee_id` |
| D-08 | Архитектурный дублизм: `calls` vs `video_calls` |
| D-09 | `turn_issuance_rl` растёт бесконечно, нет cleanup |
| D-10 | `p_ip='*'` конфлатирует per-ip и user-only bucket |

### 4.3 MEDIUM/LOW (6)

| ID | Описание |
|----|----------|
| D-11 | `updated_at` без `NOT NULL` в `calls` |
| D-12 | `check_missed_calls()` без `SKIP LOCKED` |
| D-13 | `end_reason TEXT` без `CHECK` constraint |
| D-14 | `video_call_signals` нет TTL/cleanup |
| D-15 | Категория `'calls'` не в `notification_category` |
| D-16 | `turn_replay_guard` cleanup только per-scope |

---

## 5. Архитектурные проблемы

### 5.1 Разделение ответственности сигнализации

**Текущее:** Call signaling (`invite`/`accept`/`decline`/`hangup`) идёт через Supabase DB + Realtime.  
**Проблема:** Latency 100–500ms+ через DB round-trip vs <50ms через прямой WS.  
**Рекомендация:** Реализовать полную сигнализацию через [`calls-ws`](server/calls-ws/) WebSocket, DB использовать только как persistence layer.

### 5.2 Две параллельные системы звонков

**Текущее:** Таблица `calls` (новая, с state machine) и `video_calls` (старая, без state machine) существуют параллельно.  
**Проблема:** Клиентский код использует `video_calls`, RPCs работают с `calls`. Данные не синхронизированы.  
**Рекомендация:** Мигрировать на единую таблицу `calls` с state machine RPCs.

### 5.3 VideoCallProvider.tsx — God Object (89KB)

**Текущее:** Один файл [`VideoCallProvider.tsx`](src/contexts/video-call/VideoCallProvider.tsx) (89KB) содержит всю логику: SFU, P2P legacy, E2EE, rekey, TURN, media, state.  
**Рекомендация:** Разделить на 5–7 focused хуков: `useSfuConnection`, `useCallSignaling`, `useE2EE`, `useMedia`, `useCallState`.

### 5.4 Отсутствие LiveKit

Несмотря на упоминание LiveKit в задании, **проект НЕ использует LiveKit**. Вместо этого используется собственная реализация на базе **mediasoup** (SFU) + **coturn** (TURN). Это технически обоснованное решение, но требует значительно больше кода поддержки.

---

## 6. Оценка E2E-тестируемости

### 6.1 Текущее состояние

**Звонки в текущем состоянии НЕ РАБОТАЮТ end-to-end** по следующим причинам:

1. **Сигнализация заглушена** (S-01) — `accept`/`decline` не доставляются через WS
2. **`call_type` crash** (D-01) — RPC упадёт при первом вызове
3. **RPCs заблокированы** (D-03) — клиент не может вызвать `call_create_v1`

### 6.2 Что нужно для запуска E2E теста

1. Исправить 9 CRITICAL багов
2. Запустить серверы: `calls-ws`, `sfu`, Redis, coturn
3. Настроить environment variables (`SUPABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `TURN_SECRET`)
4. Открыть два браузера с разными пользователями
5. Инициировать звонок через UI

### 6.3 Checklist для первого успешного звонка

- [ ] Fix S-01: Реализовать relay `call.accept`/`decline`/`hangup` через [`calls-ws`](server/calls-ws/index.mjs)
- [ ] Fix S-02: Привязать `deviceId` к authenticated `userId`
- [ ] Fix S-03: Добавить `try/catch` в async handler
- [ ] Fix D-01: Исправить `call_type 'voice'` → `'audio'` или обновить `CHECK`
- [ ] Fix D-03: Вернуть `GRANT` на call RPCs для `authenticated` ИЛИ добавить `service_role` path
- [ ] Fix C-02: Добавить 60s timeout на ожидание ответа
- [ ] Fix C-03: Убрать 10-минутный `setTimeout` на `consumeUnsub`
- [ ] Fix C-04: Не отписываться от `onConnectionStateChange` немедленно

---

## 7. План исправлений по приоритетам

### Sprint 1 — Критический (1–2 дня) — Baseline: звонки работают

| Задача | Оценка | Файлы |
|--------|--------|-------|
| Реализовать relay `call.accept`/`decline`/`hangup` в calls-ws | 4h | [`server/calls-ws/index.mjs`](server/calls-ws/index.mjs) |
| Добавить `try/catch` в ws message handler | 1h | [`server/calls-ws/index.mjs`](server/calls-ws/index.mjs) |
| Привязать `deviceId` к `userId` в `HELLO` | 2h | [`server/calls-ws/index.mjs`](server/calls-ws/index.mjs) |
| Fix `call_type 'voice'` vs `'audio'` | 0.5h | Новая миграция |
| Fix `REVOKE`/`GRANT` на call RPCs | 0.5h | Новая миграция |
| Fix busy-check race condition (advisory lock) | 1h | Новая миграция |
| Добавить 60s call timeout на клиенте | 1h | [`src/hooks/useVideoCallSfu.ts`](src/hooks/useVideoCallSfu.ts) |
| Убрать 10min `consumeUnsub` | 0.5h | [`src/contexts/video-call/VideoCallProvider.tsx`](src/contexts/video-call/VideoCallProvider.tsx) |
| Fix `onConnectionStateChange` immediate unsub | 0.5h | [`src/contexts/video-call/VideoCallProvider.tsx`](src/contexts/video-call/VideoCallProvider.tsx) |

### Sprint 2 — Высокий приоритет (3–5 дней) — Безопасность и стабильность

| Задача | Оценка |
|--------|--------|
| Верифицировать `fromDeviceId` в `KEY_ACK` и `KEY_PACKAGE` | 2h |
| Проверять принадлежность `to_device` в `call.invite` | 2h |
| Добавить `maxPayload` в SFU WebSocket | 0.5h |
| Реализовать JWT revalidation в SFU | 3h |
| Защитить `REKEY_COMMIT` (проверять инициатора) | 2h |
| Fix Redis `retryStrategy` + mailbox TTL | 2h |
| Fix `PEER_LEFT` при disconnect + cleanup пустых комнат | 2h |
| Добавить `CHECK` constraint на `video_calls.status` | 0.5h |
| Добавить FK constraints на `auth.users` | 0.5h |
| Fix двойного outbox-события | 1h |
| `KEY_ACK` только при успешном key exchange | 1h |
| Убрать random fallback для подписи `KEY_PACKAGE` | 0.5h |
| Fix [`wsClient`](src/calls-v2/wsClient.ts) `lastServerSeq` сброс при reconnect | 0.5h |
| Fix base64url в `isLikelyBase64` | 0.5h |

### Sprint 3 — Средний приоритет (1 неделя) — Оптимизация

| Задача | Оценка |
|--------|--------|
| Рефакторинг [`VideoCallProvider.tsx`](src/contexts/video-call/VideoCallProvider.tsx) (89KB → 5–7 хуков) | 2d |
| Унификация `calls`/`video_calls` таблиц | 1d |
| Добавить `pg_cron` cleanup для `turn_issuance_rl` | 2h |
| Fix `ensureRouter` race condition | 2h |
| ICE restart в `SfuMediaManager` | 3h |
| Fix `cleanupStaleRingingCalls` multi-tab | 2h |
| Убрать polling 1500ms (улучшить Realtime reliability) | 3h |
| Добавить `process.on('unhandledRejection')` | 1h |
| Trusted proxy для TURN `getClientIp` | 1h |

---

## 8. Конфигурация TURN/STUN (текущая)

### 8.1 Coturn Production

Файл: [`infra/calls/coturn/turnserver.prod.conf`](infra/calls/coturn/turnserver.prod.conf)

- TLS включён (Let's Encrypt)
- Listening port: 3478 (UDP/TCP) + 5349 (TLS)
- Relay ports: 49152–65535
- HMAC-SHA1 auth (static-auth-secret)
- Fingerprint + lt-cred-mech

### 8.2 Client Config

Файл: [`src/lib/webrtc-config.ts`](src/lib/webrtc-config.ts)

- Dynamic TURN credentials fetch через Edge Function
- Circuit breaker pattern для TURN failures
- Fallback на STUN-only при TURN unavailable
- Request nonce для replay protection

### 8.3 Рекомендации по конфигурации

- ✅ TLS на TURN — реализовано
- ✅ Time-limited credentials — реализовано
- ✅ Replay guard — реализовано
- ⚠️ STUN сервер: используется Google STUN — рассмотреть свой
- ⚠️ Max relay ports: 49152–65535 (16K+ ports) — достаточно для MVP
- ❌ Нет мониторинга TURN bandwidth/sessions
- ❌ Нет geographic selection ближайшего TURN

---

## 9. Соответствие Best Practices

### WebRTC/SFU

| Практика | Статус | Комментарий |
|----------|--------|-------------|
| ICE Trickle | ✅ | Через mediasoup |
| DTLS-SRTP | ✅ | Через mediasoup |
| ICE Restart | ❌ | Не реализовано на клиенте |
| Simulcast | ❓ | Не обнаружено в конфиге |
| SVC | ❌ | Не используется |
| Bandwidth estimation | ❌ | Не реализовано |
| Adaptive bitrate | ❌ | Не реализовано |

### E2EE

| Практика | Статус | Комментарий |
|----------|--------|-------------|
| SFrame (draft-ietf-sframe-enc) | ✅ | Реализовано |
| ECDH key exchange | ✅ | P-256 через WebCrypto |
| Epoch key rotation (rekey) | ✅ | State machine реализован |
| Key zeroization | ⚠️ | Только в `destroy()`, не при epoch eviction |
| Identity verification | ⚠️ | ECDSA подпись есть, но fallback на random |
| Forward secrecy | ✅ | Через epoch rotation |
| Post-compromise security | ✅ | Через rekey |

---

## 10. Заключение

Модуль звонков представляет собой **масштабную и амбициозную реализацию** E2EE SFU-based calling с собственным signaling сервером, mediasoup SFU, coturn TURN, полноценным E2EE (SFrame + ECDH + epoch rotation). Документация ([`docs/e2ee-sfu-architecture.md`](docs/e2ee-sfu-architecture.md) — 57KB+ архитектурный документ, 37 JSON-схем, state machines, trace files) свидетельствует о серьёзном проектировании.

Однако **реализация не завершена**:
- Call signaling — заглушки
- Две несвязанные системы звонков в БД
- Критические security holes (`deviceId` hijacking, `fromDeviceId` spoofing)
- Отсутствие error boundaries
- 89KB God Object ([`VideoCallProvider.tsx`](src/contexts/video-call/VideoCallProvider.tsx))

**Для доведения до рабочего состояния** требуется примерно **2–3 недели** работы одного senior full-stack разработчика, с фокусом на Sprint 1 (1–2 дня для первого работающего звонка).

---

*Отчёт подготовлен на основе статического анализа кода. E2E тестирование не проводилось из-за обнаруженных блокирующих проблем.*
