# Аудит E2EE звонков и WebRTC/SFU — 2026-03-31

> **Область проверки:** `src/calls-v2/` — полный стек E2EE поверх mediasoup SFU.  
> **Файлы:** [`sfuMediaManager.ts`](src/calls-v2/sfuMediaManager.ts), [`callKeyExchange.ts`](src/calls-v2/callKeyExchange.ts), [`callMediaEncryption.ts`](src/calls-v2/callMediaEncryption.ts), [`wsClient.ts`](src/calls-v2/wsClient.ts), [`rekeyStateMachine.ts`](src/calls-v2/rekeyStateMachine.ts), [`epochGuard.ts`](src/calls-v2/epochGuard.ts), [`hooks/useTurnCredentials.ts`](src/calls-v2/hooks/useTurnCredentials.ts), [`types.ts`](src/calls-v2/types.ts)

---

## ИТОГ

| Критичность | Кол-во |
|-------------|--------|
| 🔴 КРИТИЧНО  | 3      |
| 🟠 ВЫСОКАЯ  | 4      |
| 🟡 СРЕДНЯЯ  | 4      |
| 🟢 ИНФОРМАЦИОННО | 2 |

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### C-1 · ICE `failed` → только `close()`, без ICE restart

**Файл:** [`sfuMediaManager.ts:147-152`](src/calls-v2/sfuMediaManager.ts:147) (sendTransport) и [`sfuMediaManager.ts:186-190`](src/calls-v2/sfuMediaManager.ts:186) (recvTransport)

```typescript
this.sendTransport.on('connectionstatechange', (state: string) => {
  if (state === 'failed') {
    this.sendTransport?.close();  // ← транспорт просто закрывается
  }
});
```

**Проблема:** При ICE failure (`state === 'failed'`) транспорт закрывается без попытки ICE restart через [`wsClient.iceRestart()`](src/calls-v2/wsClient.ts:359). По WebRTC спецификации `failed` не всегда является окончательным — ICE restart (re-offer с новыми credentials) способен восстановить соединение. Сейчас любой временный разрыв (смена сети, мобильный роуминг) убивает звонок безвозвратно.

**Исправление:** добавить handler `connectionstatechange → 'failed'` → вызов `wsClient.iceRestart({ roomId, transportId })`, с максимум 3 попытками и exponential backoff перед окончательным `close()`.

---

### C-2 · `requireSenderReceiverAccessForE2ee: false` по умолчанию — незашифрованное медиа без ошибки

**Файл:** [`sfuMediaManager.ts:37-40`](src/calls-v2/sfuMediaManager.ts:37)

```typescript
constructor(options?: { requireSenderReceiverAccessForE2ee?: boolean }) {
  this.device = new Device();
  this.requireSenderReceiverAccessForE2ee = options?.requireSenderReceiverAccessForE2ee ?? false; // ← default false
}
```

**Проблема:** Если `producer.rtpSender` недоступен (mediasoup-client < 3.6, некоторые браузеры), E2EE transform **не устанавливается**, но `produce()` всё равно возвращает producer — медиа уходит на SFU незашифрованным. По умолчанию `requireSenderReceiverAccessForE2ee = false` означает что эта ситуация логируется только как warning, звонок продолжается.

**Исправление:** изменить default на `true` для продакшн. Либо добавить обязательную проверку в вызывающем коде — если `getProducerSender()` вернул `null`, запрещать `setupSenderTransform()` в `CallMediaEncryption`.

---

### C-3 · `KeyPackagePayload.senderPublicKey` опциональный — runtime crash в `processKeyPackage`

**Файл:** [`types.ts:301`](src/calls-v2/types.ts:301) и [`callKeyExchange.ts:363`](src/calls-v2/callKeyExchange.ts:363)

```typescript
// types.ts
export interface KeyPackagePayload {
  senderPublicKey?: string;     // ← optional
  ...
}

// callKeyExchange.ts — processKeyPackage вызван от WS payload
const senderPublicKeyRaw = base64ToBytes(pkg.senderPublicKey); // ← если undefined → crash
```

**Проблема:** `KeyPackageData` (внутренний) требует `senderPublicKey: string`, но `KeyPackagePayload` (WS-протокол, `types.ts`) объявляет это поле опциональным. Если сервер не включит поле — `base64ToBytes(undefined)` бросит исключение и сессия E2EE разрушится. Это не просто типовое несоответствие: если поле отсутствует у одного участника (старая версия сервера), весь звонок потеряет E2EE без явного сообщения пользователю.

**Исправление:**
1. Добавить guard в начало `processKeyPackage`: `if (!pkg.senderPublicKey) throw new Error(...)`.
2. Сделать `senderPublicKey: string` обязательным в `KeyPackagePayload`.

---

## 🟠 ВЫСОКИЕ ПРОБЛЕМЫ

### H-1 · `sendOrderedAcked` бросает немедленно при `state !== OPEN` — очередь не работает

**Файл:** [`wsClient.ts:481-485`](src/calls-v2/wsClient.ts:481)

```typescript
private send(frame: WsEnvelopeV1) {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    throw new Error("WS is not open");  // ← нет очереди при reconnecting
  }
  this.ws.send(JSON.stringify(frame));
}
```

**Проблема:** При кратковременном разрыве (state = `reconnecting`) любой вызов `roomJoin`, `consume`, `keyPackage` и т.д. немедленно бросает исключение. Это означает, что весь call flow прерывается при переподключении. После успешного reconnect клиенту придётся вручную перезапустить всю последовательность join → transport create → produce, иначе звонок не восстановится.

**Исправление:** Добавить outbound queue: при `reconnecting` ставить frame в очередь, отправлять все queued frames после перехода в `connected`.

---

### H-2 · `consumer` не слушает `producerclose` — zombie consumers

**Файл:** [`sfuMediaManager.ts:262-301`](src/calls-v2/sfuMediaManager.ts:262)

**Проблема:** В `consume()` нет `consumer.on('producerclose', ...)`. Когда удалённый участник отключается, SFU закрывает его producer и посылает `producerclose` event через SCTP data channel. Если consumer не обрабатывает это событие — он остаётся в Map `consumers` как закрытый, track перестаёт получать данные, но UI не обновляется. Со временем накапливаются zombie-consumers.

**Исправление:**
```typescript
consumer.on('producerclose', () => {
  this.consumers.delete(consumer.id);
  this.consumerReceivers.delete(consumer.id);
  // emit event для VideoCallContext чтобы обновить UI
});
```

---

### H-3 · `Device` не закрывается в `SfuMediaManager.close()` — утечка при повторном join

**Файл:** [`sfuMediaManager.ts:366-392`](src/calls-v2/sfuMediaManager.ts:366)

**Проблема:** `close()` закрывает транспорты, producers и consumers, но `this.device` (mediasoup `Device`) никогда не переинициализируется. Если клиент покидает комнату и заходит снова (`new SfuMediaManager()` не вызывается), вызов `loadDevice()` на уже загруженном device с новыми `routerRtpCapabilities` не выполнится — строка 101: `if (!this.device.loaded) return`. Новые capabilities от нового join будут проигнорированы.

**Исправление:** В `close()` заменить `this.device` на новый экземпляр:
```typescript
this.device = new Device();
```

---

### H-4 · Двойной `unwrapKey` в `processKeyPackage` — кратковременный extractable ключ в памяти

**Файл:** [`callKeyExchange.ts:407-429`](src/calls-v2/callKeyExchange.ts:407)

```typescript
const epochCryptoKey = await crypto.subtle.unwrapKey(..., false, ...);  // non-extractable
const epochExtractable = await crypto.subtle.unwrapKey(..., true, ...); // extractable ← уязвимость
const rawBuf = await crypto.subtle.exportKey('raw', epochExtractable);
```

**Проблема:** Хотя `epochExtractable` не сохраняется в полях класса, он существует в памяти JS heap до момента когда GC соберёт его. В threat model с атакой через heap dump (memory inspector DevTools, heap snapshot) raw bytes ключа экспонированы. Для браузерного E2EE это допустимый компромисс, но он должен быть явно задокументирован как known risk.

**Рекомендация:** Добавить в JSDoc явное указание на этот риск. Рассмотреть альтернативу: хранить `_rawBytes` только в sender, передавать через `createKeyPackage` параметром вместо хранения в `EpochKeyMaterial`.

---

## 🟡 СРЕДНИЕ ПРОБЛЕМЫ

### M-1 · TURN fetch не имеет deduplication — параллельные запросы к edge function

**Файл:** [`hooks/useTurnCredentials.ts:40-120`](src/calls-v2/hooks/useTurnCredentials.ts:40)

**Проблема:** Если несколько компонентов вызывают `fetchTurnIceServers()` одновременно (например, при первом рендере call UI), все они пройдут проверку кеша и параллельно обратятся к edge function. Комментарий в коде признаёт это, но отмечает как "безопасно". Однако это лишние запросы + дополнительная нагрузка на Supabase edge functions.

**Исправление:** Добавить `fetchInFlightRef`:
```typescript
const fetchInFlight = useRef<Promise<RTCIceServer[] | null> | null>(null);
// ...
if (fetchInFlight.current) return fetchInFlight.current;
fetchInFlight.current = doFetch().finally(() => { fetchInFlight.current = null; });
return fetchInFlight.current;
```

---

### M-2 · `destroy()` в `CallKeyExchange` — двойная зачистка `_rawBytes` currentEpochKey

**Файл:** [`callKeyExchange.ts:477-516`](src/calls-v2/callKeyExchange.ts:477)

**Проблема:** В `destroy()` сначала проходит цикл по `this.epochKeys` (который включает `currentEpochKey`), зачищая `_rawBytes`. Затем снова `this.currentEpochKey._rawBytes.fill(0)`. Второй вызов идентичен первому — к этому моменту буфер уже зачищен. Логически безвредно, но создаёт путаницу.

**Исправление:** убрать дублирующий блок после цикла.

---

### M-3 · `CallMediaEncryption.isReady()` — требует хотя бы одного peer, ложно-negative при одиночном входе

**Файл:** [`callMediaEncryption.ts:174-176`](src/calls-v2/callMediaEncryption.ts:174)

```typescript
isReady(): boolean {
  return this.hasEncryptionKey && this.peerDecryptionEpochs.size > 0;
}
```

**Проблема:** В момент между join'ом в комнату и приходом первого пира `isReady()` возвращает `false`, даже если encryption key уже установлен. Если вызывающий код использует `isReady()` как guard для начала produce — медиа может быть задержано или не начато. Семантически правильнее разделить: "готов к отправке" (только `hasEncryptionKey`) и "готов к приёму" (есть peer keys).

---

### M-4 · `rekeyStateMachine` — нет принудительного rekey при `PEER_LEFT`

**Файл:** [`rekeyStateMachine.ts:50-65`](src/calls-v2/rekeyStateMachine.ts:50)

**Проблема:** `RekeyEvent.type` содержит `'PEER_LEFT'` как отдельный тип события, но state machine не инициирует автоматический rekey при уходе участника. По протоколу E2EE при выходе участника необходимо rotate ключи (forward secrecy на уровне сессии). Если вызывающий код (VideoCallContext) не вызывает `initiateRekey()` при `PEER_LEFT` — выбывший участник теоретически имеет epoch key и может дешифровать медиа.

**Рекомендация:** Добавить в state machine автоматический переход `onPeerLeft → initiateRekey()` (если участник не leader — отправить сигнал лидеру).

---

## 🟢 ИНФОРМАЦИОННО

### I-1 · `heartbeatMs` по умолчанию 10 сек — на мобильных сетях может быть недостаточно

**Файл:** [`types.ts:34`](src/calls-v2/types.ts:34)

По умолчанию heartbeat интервал 10 сек. На мобильных сетях с агрессивным NAT keepalive iOS/Android может потребоваться 5–7 сек. Рекомендуется добавить platform-aware default в конфиг.

---

### I-2 · `wsClient` — последовательность `seq` не сбрасывается при reconnect

**Файл:** [`wsClient.ts:169-184`](src/calls-v2/wsClient.ts:169)

При reconnect `lastServerSeq = 0` и `seenServerMsgIds.clear()` корректно сбрасываются. Однако `this.expectedSeq` (outgoing sequence) **не сбрасывается** — при переподключении сервер получит seq с того места, на котором остановился клиент. Это правильно если сервер поддерживает resumption, но если сервер не поддерживает сессию — ожидает seq=1 после reconnect, а получит seq=50. Необходимо согласовать поведение с сервером.

---

## Карта проблем по файлам

| Файл | Проблемы |
|------|----------|
| [`sfuMediaManager.ts`](src/calls-v2/sfuMediaManager.ts) | C-1, C-2, H-2, H-3 |
| [`callKeyExchange.ts`](src/calls-v2/callKeyExchange.ts) | C-3 (частично), H-4, M-2 |
| [`types.ts`](src/calls-v2/types.ts) | C-3 |
| [`wsClient.ts`](src/calls-v2/wsClient.ts) | H-1, I-2 |
| [`callMediaEncryption.ts`](src/calls-v2/callMediaEncryption.ts) | M-3 |
| [`rekeyStateMachine.ts`](src/calls-v2/rekeyStateMachine.ts) | M-4 |
| [`hooks/useTurnCredentials.ts`](src/calls-v2/hooks/useTurnCredentials.ts) | M-1 |

---

## Приоритет исправлений

```
Неделя 1 (блокируют продакшн):
  C-1 — ICE restart при failed
  C-2 — requireSenderReceiverAccessForE2ee default
  C-3 — senderPublicKey null-guard

Неделя 2 (влияют на надёжность):
  H-1 — outbound queue при reconnecting
  H-2 — producerclose handler
  H-3 — Device reset при close()
  M-4 — автоматический rekey при PEER_LEFT

Неделя 3 (качество кода):
  H-4 — документировать heap risk
  M-1 — dedup TURN requests
  M-2, M-3 — мелкие правки
```
