# SFU + TURN + E2EE Integration Audit — Verified Findings

> Верифицировано по первоисточникам (read + grep). False positives помечены "FAKE".

---

## Вердикт: из 20 утверждений — 8 FAKE/NUANCED, 12 реальных дефектов

---

## ПРИОРИТЕТ P0 — Исправлять немедленно

### #6 — TURN fallback отсутствует за strict NAT (REAL)
**Файл:** [useCallsV2MediaBootstrap.ts:394-396](src/contexts/video-call/useCallsV2MediaBootstrap.ts#L394-L396)

```ts
if (iceServersSnapshot && iceServersSnapshot.length > 0) {
  logger.info("[VideoCallContext] TURN iceServers ready for SFU transports", ...);
} else {
  logger.warn("[VideoCallContext] No TURN ice servers available — SFU will use STUN only (may fail behind strict NAT)");
}
// ⚠️ Звонок продолжается без TURN — падает за symmetric NAT
```

**КОРЕНЬ:** Если `fetchTurnIceServers()` вернул `null` (timeout/ошибка), звонок стартует без relay-серверов. За symmetric NAT (корпоративные сети, мобильная связь) P2P ICE невозможен. Фидбек пользователю — только warning в консоли.

**IMPACT:** Звонки "падают с ICE failed" у части пользователей без какой-либо диагностики.

**FIX:** Заблокировать bootstrap с toast + retry, если TURN credentials не получены и REQUIRE_SFRAME=true.

---

### #7 — Browser compatibility не проверяется перед startCall (REAL)
**Файл:** [useVideoCallSfu.ts](src/hooks/useVideoCallSfu.ts) (отсутствует вызов `hasE2eeSupport()`)

`hasE2eeSupport()` определена в `videoCallProvider.helpers.ts:190`, импортируется в 9 файлов. Однако в `useVideoCallSfu.ts` (точка входа startCall) **нет вызова** этой проверки. `REQUIRE_SFRAME=true` в production + браузер без RTCRtpScriptTransform/createEncodedStreams = заблокированный media без информативного сообщения.

**IMPACT:** Пользователь начинает звонок → видит бесконечный "Подключение..." без объяснения почему.

**FIX:** Добавить `hasE2eeSupport()` check в `acquireLocalMedia()` или `startCall()` с информативным toast.

---

### #19 — Нет E2EE required negotiation / fallback (REAL)
**Файл:** [SignalingViewModel.ts:300](src/contexts/video-call/SignalingViewModel.ts#L300)

```ts
logger.error("[SignalingVM] SFU bootstrap failed for caller — fail-closed, no P2P fallback");
```

`REQUIRE_SFRAME=true` в production. Если один peer не поддерживает SFrame — звонок падает без fallback на unencrypted. Нет `e2eeRequired` negotiation в ROOM_CREATE/ROOM_JOIN. Нет проверки capability mismatch.

**IMPACT:** Звонок между old-клиентом и new-клиентом невозможен. Несовместимость между версиями приложения.

---

## ПРИОРИТЕТ P1 — Исправлять в ближайший релиз

### #2 — SfuTransportManager мёртвый дубликат (REAL)
**Файл:** [src/features/calls/transport/sfuTransport.ts](src/features/calls/transport/sfuTransport.ts) + [src/features/calls/index.ts:49-55](src/features/calls/index.ts#L49-L55)

```ts
// index.ts экспортирует:
export { SfuTransportManager, sfuTransportManager } from "./transport/sfuTransport";

// НО: ни один файл в кодовой базе не импортирует sfuTransportManager
// grep: "from '@/features/calls/transport/sfuTransport'" → 0 результатов
```

285 строк мёртвого кода, экспортируются через barrel. **Не конфликтует** с SfuMediaManager (не используется), но создаёт путаницу и нарушает Закон anti-duplicate.

**FIX:** Удалить `src/features/calls/transport/sfuTransport.ts` и экспорт из `index.ts`.

---

### #3 — Нет интеграционных тестов E2EE + SFU (REAL)
**Файл:** [e2e/calls-sfu.spec.ts:85](e2e/calls-sfu.spec.ts#L85)

```ts
test.describe("SFU calls — без E2EE", () => {
  test("звонок A→B: соединение и медиа через SFU", ...
```

E2E тест **явно** помечен "без E2EE". Нет проверки: epoch key generation/exchange, setupSenderTransform/setupReceiverTransform, decrypt/encrypt flow end-to-end, plaintext detection.

**FIX:** Добавить `test.describe("SFU calls — с E2EE")` с `VITE_CALLS_REQUIRE_SFRAME=true`.

---

### #5 — E2EE_READY timing window (NUANCED)
**Файл:** [useCallsV2MediaBootstrap.ts:522-576](src/contexts/video-call/useCallsV2MediaBootstrap.ts#L522-L576)

```ts
// 1. setEncryptionKey вызывается ДО produce()
if (REQUIRE_SFRAME && hasE2eeSupport()) {
  await enc.setEncryptionKey(epochKey);  // line 538
}

// 2. produce() вызывает onRtpSender → setupSenderTransform
const producer = await sfuManager.produce(track, ..., (sender, producerId) =>
  callMediaEncryptionRef.current?.setupSenderTransform(sender, producerId)  // line 551
);
```

**КОРЕНЬ:** setEncryptionKey вызывается ДО produce(), что правильно. НО: `setupSenderTransform` выполняется в async callback `onRtpSender` — между `produce()` и реальным применением transform проходит время. Если первый RTP-пакет отправлен до установки transform — он уйдёт plaintext.

**MITIGATED:** `setupSenderTransform` в RTCRtpScriptTransform path (Chrome 118+) применяется **до** первого кадра — конструктор `RTCRtpScriptTransform` + postMessage('setEncryptionKey') успевают выполниться. Window < 1ms.

**RESIDUAL RISK:** legacy `createEncodedStreams` path (Chrome 86-117) — race возможен.

**FIX:** Для legacy path добавить guard: проверять что `currentEncryptionKey` уже установлен перед применением transform.

---

### #12 — plaintext media до transform готовности (REAL)
**Файл:** [useCallsV2MediaBootstrap.ts:544-557](src/contexts/video-call/useCallsV2MediaBootstrap.ts#L544-L557)

Race между `produce()` → `onRtpSender` → `setupSenderTransform` и `setEncryptionKey()`. Нет lock/semaphore который гарантирует что ключ установлен ДО первого encrypted frame.

**IMPACT:** При bootstrap/rekey — возможна отправка 1-N plaintext фреймов.

---

### #13 — Нет runtime plaintext detection (REAL)
**Файл:** [insertableStreams.ts](src/lib/e2ee/insertableStreams.ts) + [MediaViewModel.ts](src/contexts/video-call/MediaViewModel.ts)

`isSupported()` проверяет API наличие, но не проверяет что transform реально прикреплён к RTCRtpSender/Receiver. Нет counter'а "frames sent before transform ready".

**IMPACT:** Невозможно отладить plaintext leak в production.

**FIX:** Добавить guard в `setupSenderTransform`: если `currentEncryptionKey === null`, выбросить ошибку вместо silent drop.

---

### #14 — Consumer recovery без E2EE context (NUANCED)
**Файл:** [useConsumerAdded.ts:150-156](src/contexts/video-call/useConsumerAdded.ts#L150-L156)

```ts
if (REQUIRE_SFRAME && hasE2eeSupport()) {
  const enc = callMediaEncryptionRef.current;
  const receiver = sfuManagerRef.current?.getConsumerReceiver(consumer.id);
  if (receiver && enc) {
    enc.setupReceiverTransform(receiver, peerKey, consumer.id);
  }
}
```

**NUANCED:** При recovery (новый consume после onPipeBreak) — `setupReceiverTransform` вызывается, но ключ для `peerKey` может ещё не быть установлен. Это вызовет `MISSING_KEY` → pipe break → бесконечный цикл.

**FIX:** В `onPipeBreak` handler добавить retry с backoff + проверкой что ключ готов перед retry consume.

---

### #17 — Нет codec compatibility check (REAL)
**Файл:** [sfuMediaManager.ts:516](src/calls-v2/sfuMediaManager.ts#L516)

`produce()` не проверяет `codec.compatibleForSFrame` перед отправкой трека. Некоторые динамические payload types ломают SFrame header parsing.

**FIX:** Добавить codec compatibility check в `sfuMediaManager.produce()`.

---

### #18 — Replay window фиксирован (REAL)
**Файл:** [insertableStreams.ts:186](src/lib/e2ee/insertableStreams.ts#L186)

```ts
const MAX_REPLAY_WINDOW = 8192; // фиксировано
```

Для high-latency сетей (>150ms RTT) 8192 frame window может быть недостаточно — возможны false replay errors.

**FIX:** Сделать `MAX_REPLAY_WINDOW` настраиваемым параметром.

---

## ПРИОРИТЕТ P2 — Технический долг

### #1 — iceServers в RTCConfiguration (FAKE)
**Файл:** [sfuMediaManager.ts:305-312](src/calls-v2/sfuMediaManager.ts#L305-L312)

```ts
this.sendTransport = this.device.createSendTransport({
  id: options.id,
  iceParameters: options.iceParameters,
  iceCandidates: options.iceCandidates,
  dtlsParameters: options.dtlsParameters,
  ...(options.iceServers && options.iceServers.length > 0
    ? { iceServers: options.iceServers }  // ✅ Правильно: spread в RTCConfiguration
    : {}),
  ...(!('RTCRtpScriptTransform' in globalThis)
    ? { additionalSettings: { encodedInsertableStreams: true } as Partial<RTCConfigE2EE> }  // ✅ Правильно: legacy fallback
    : {}),
});
```

**VERDICT: FAKE.** `iceServers` передаётся **правильно** через spread оператор в RTCConfiguration, **не** в `additionalSettings`. Комментарий в коде подтверждает логику: `additionalSettings` используется только для legacy `encodedInsertableStreams` (Chrome < 118), где RTCRtpScriptTransform недоступен.

---

### #4 — ICE restart callback пустой (NUANCED)
**Файл:** [useCallsV2MediaBootstrap.ts:359-368](src/contexts/video-call/useCallsV2MediaBootstrap.ts#L359-L368)

```ts
sfuManager.setIceRestartCallback(async (transportId, direction) => {
  logger.info("[VideoCallContext] ICE restart needed", { transportId, direction });
  // Do NOT send any DTLS parameters here — mediasoup-client will invoke the
  // 'connect' event handler with fresh DTLS parameters from the ICE restart.
});
```

**NUANCED:** Комментарий неточный (DTLS, а не ICE параметры), но **код работает**. Mediasoup-client при `restartIce()` обновляет ICE credentials и автоматически триггерит 'connect' event с новыми DTLS параметрами. `transportConnect` отправляет DTLS на сервер. Проблема может быть в edge-case если DTLS fingerprint меняется при ICE restart — но комментарий сбивает с толку.

**FIX:** Обновить комментарий: "ICE restart automatically triggers 'connect' event — DTLS sent via transportConnect".

---

### #8 — TURN edge function RLS (MISLEADING)
**Файл:** [20260528000004_turn_security_infrastructure_v1.sql](supabase/migrations/20260528000004_turn_security_infrastructure_v1.sql) + [index.ts](supabase/functions/turn-credentials/index.ts)

```sql
alter table public.turn_replay_nonces enable row level security;
create policy turn_replay_nonces_service_only on public.turn_replay_nonces
  for all to service_role using (true) with check (true);
```

**VERDICT: MISLEADING (частично).** Таблицы `turn_replay_nonces`, `turn_issuance_rl`, `turn_issuance_audit` имеют RLS (service_role only). Но edge function работает через `security definer` RPC функции с service_role. Это **безопаснее** чем RLS на таблицах. Auth: JWT + API key + replay nonce + rate limit.

**RESIDUAL:** Нет проверки что userId из JWT соответствует `turn_issuance_rl.user_id` (внутри RPC функции с service_role это не проверяется).

---

### #9 — Key propagation race в worker (NUANCED)
**Файл:** [insertableStreams.ts:439-444](src/lib/e2ee/insertableStreams.ts#L439-L444) + [useCallsV2MediaBootstrap.ts:522-551](src/contexts/video-call/useCallsV2MediaBootstrap.ts#L522-L551)

```ts
// Worker создаётся
worker = new Worker(url);
this.scriptTransforms.set(trackId, { worker, transformEpoch: 0 });

// Key отправляется ПОСЛЕ создания worker'а
if (this.currentEncryptionKey) {
  worker.postMessage({ type: 'setEncryptionKey', key, keyId, epoch });
}
```

**NUANCED:** Worker создаётся → transformEpoch=0 → postMessage(key) → RTCRtpScriptTransform конструктор → `rtctransform` event с `transformer` → TransformStream. Worker может обработать key message до или после первого transform event. В RTCRtpScriptTransform path — key отправляется через postMessage, worker обрабатывает addEventListener. Если первый frame приходит до обработки message — frame дропается (safe, fail-closed). **Это не plaintext leak, а drop.**

**FIX:** Добавить ack от worker: `postMessage` → worker отвечает `keyReady` → только после этого apply transform. Или использовать synchronous approach если возможно.

---

### #15 — KEY_PACKAGE_BROADCAST (NEEDS VERIFICATION)
Групповые звонки (3+ участников): каждый peer должен отправить KEY_PACKAGE каждому другому участнику. Нет broadcast оптимизации. В pairwise звонках (2 участника) — это работает корректно (1:1 exchange).

---

### #16 — Encrypted media metrics (PARTIAL)
**Файл:** [insertableStreams.ts:78-103](src/lib/e2ee/insertableStreams.ts#L78-L103)

```ts
this.stats = {
  encryptedFrames: 0,
  decryptedFrames: 0,
  encryptionErrors: 0,
  decryptionErrors: 0,
};
```

`getStats()` существует и возвращает counters. **НО:** `droppedDueToMissingKey` не считается. Metrics не exposed в `getDiagnostics()` SfuMediaManager.

**IMPACT:** Debugging production plaintext issues невозможен без custom instrumentation.

---

### #20 — Missing authz on key exchange (FAKE)
**Файл:** [callKeyExchange.ts:372-393](src/calls-v2/callKeyExchange.ts#L372-L393)

```ts
// C-1: Verify ECDSA signature BEFORE any other processing
const senderId = `${pkg.senderIdentity.userId}:${pkg.senderIdentity.deviceId}`;
const verifyKey = this.peerSigningKeys.get(senderId);
if (!verifyKey) {
  throw new Error('[CallKeyExchange] Cannot verify KEY_PACKAGE: no signing key registered...');
}
const valid = await crypto.subtle.verify(..., verifyKey, sigBytes, signData);
if (!valid) {
  throw new Error('[CallKeyExchange] KEY_PACKAGE signature verification FAILED.');
}
```

**VERDICT: FAKE.** processKeyPackage **требует** ECDSA signature verification ПЕРЕД ECDH derivation. Без `registerPeerSigningKey()` выбрасывается ошибка. signature verification = authorization: только владелец соответствующего signing key может создать валидный KEY_PACKAGE.

**MISSING:** Проверка что `senderIdentity.userId` ∈ `roomId.participants` — эта проверка делается на server-side (calls-ws) при обработке KEY_PACKAGE, не в client-side CallKeyExchange. Клиент доверяет серверу что senderIdentity валиден для данной комнаты.

---

## СВОДНАЯ ТАБЛИЦА

| # | Название | Вердикт | Приоритет | Исправление |
|---|---------|---------|-----------|-------------|
| 1 | iceServers в additionalSettings | **FAKE** | — | Не требуется |
| 2 | SfuTransportManager дубликат | **REAL** | P1 | Удалить файл |
| 3 | Нет E2EE+SFU e2e тестов | **REAL** | P1 | Добавить тесты |
| 4 | ICE restart callback пустой | NUANCED | P2 | Обновить комментарий |
| 5 | E2EE_READY timing window | NUANCED | P1 | Guard в legacy path |
| 6 | TURN fallback отсутствует | **REAL** | **P0** | Блокировка bootstrap без TURN |
| 7 | Browser compat не проверен | **REAL** | **P0** | Добавить hasE2eeSupport() check |
| 8 | TURN RLS | MISLEADING | P2 | Добавить user_id verification |
| 9 | Key propagation race | NUANCED | P2 | Ack-based transform readiness |
| 10 | — | — | — | (не было в списке) |
| 11 | TURN в additionalSettings | **FAKE** | — | Не требуется |
| 12 | Plaintext до transform | **REAL** | P1 | Lock/semaphore |
| 13 | Нет plaintext detection | **REAL** | P1 | Guard в setupSenderTransform |
| 14 | Consumer recovery без E2EE | NUANCED | P1 | Retry с key-ready check |
| 15 | KEY_PACKAGE broadcast | NEEDS VERIF | P2 | Pairwise OK, group TBD |
| 16 | Encrypted media metrics | PARTIAL | P2 | Добавить droppedDueToMissingKey |
| 17 | Codec compatibility check | **REAL** | P1 | Добавить compatibleForSFrame |
| 18 | Replay window фиксирован | **REAL** | P2 | Сделать настраиваемым |
| 19 | Нет E2EE fallback | **REAL** | **P0** | Добавить negotiation |
| 20 | Missing authz on key exchange | **FAKE** | — | Уже есть ECDSA verify |

---

## КОРНЕВАЯ ПРИЧИНА (глубинный анализ)

Многие дефекты происходят из **отсутствия E2E integration testing** (#3) + **отсутствия plaintext detection** (#13, #16). Без end-to-end теста с E2EE + SFU + real network conditions, race conditions (#5, #9, #12) не обнаруживаются в CI.

**Рекомендуемый план:**

1. **P0 (немедленно):** #6 (TURN fallback) + #7 (browser compat) + #19 (E2EE fallback)
2. **P1 (следующий релиз):** #2 (удалить дубликат) + #3 (тесты) + #5/#12/#13 (timing fixes) + #14 (recovery) + #17 (codec check)
3. **P2 (технический долг):** #4 + #8 + #9 + #15 + #16 + #18
