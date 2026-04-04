# DEEP AUDIT: Мессенджер — ключевые файлы

**Дата**: 2026-04-03  
**Scope**: 12 файлов ядра мессенджера  
**Аудитор**: mansoni-reviewer  

---

## СВОДКА

| Метрика | Значение |
|---------|----------|
| Файлов проверено | 12 |
| CRITICAL | 7 |
| HIGH | 14 |
| MEDIUM | 19 |
| LOW | 8 |
| **Вердикт** | **FAIL** |

---

## 1. `src/lib/chat/protocolV11.ts` (143 строки)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | :13 | TypeScript | 🟡 MEDIUM | `(import.meta as any)` — потеря type safety. Используется `as any` для доступа к env. |
| 2 | :30 | TypeScript | 🟡 MEDIUM | `(import.meta as any)` — дублирование того же паттерна. |
| 3 | :62–65 | Логика | 🟠 HIGH | `nextClientWriteSeq` использует `localStorage` — при двух открытых вкладках одного пользователя будет race condition на инкремент. Два сообщения могут получить один и тот же seq. |
| 4 | :115–118 | Performance | 🟡 MEDIUM | `metricQueue.splice(0, metricQueue.length - 200)` — при переполнении очереди метрик старые записи молча отбрасываются. Нет логирования потерянных метрик. |
| 5 | :128–133 | TypeScript | 🟡 MEDIUM | `(supabase as any).rpc(...)` — вызов несуществующей в типах RPC через `as any`. Ошибка типа RPC не отлавливается на compile-time. |
| 6 | :134 | Ошибки обработки | 🟠 HIGH | `catch { }` при batch-отправке метрик — failed batch дропается молча. Если RPC `chat_ingest_client_metric_v11` не существует, *все* метрики навсегда теряются без диагностики. |

---

## 2. `src/lib/chat/messageOutbox.ts` (383 строки)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 7 | :87 | Баги | 🟡 MEDIUM | `openDb()` кэширует `_db` глобально. Если IndexedDB закрывает соединение (blocked event, upgrade от другой вкладки), `_db` станет невалидным, но кэш не инвалидируется. Все последующие операции упадут. |
| 8 | :109–112 | Логика | 🟡 MEDIUM | `idbPut` не проверяет `tx.oncomplete` / `tx.onerror`. Resolve на `req.onsuccess` запроса не гарантирует commit транзакции. |
| 9 | :281–283 | Баги | 🔴 CRITICAL | **Race condition**: `_sendFn!` — non-null assertion после проверки `if (!_sendFn) return` в начале функции. Но между проверкой и использованием `_sendFn` может стать `null` (вызов `destroyOutbox()` из другого потока). |
| 10 | :271–299 | Баги | 🟠 HIGH | Conversations обрабатываются **параллельно** (`Promise.allSettled(convPromises)`), но внутри каждой conversation — серийно. Если одна conversation зависает навсегда (sendFn не резолвится), весь outbox будет заблокирован, т.к. `_flushing = true` до `finally`. |
| 11 | :297 | Ошибки обработки | 🟠 HIGH | При ошибке отправки обработка conversation прерывается (`break`), что корректно для ordering. Но нет верхней границы на время ожидания `_sendFn` — если вызов зависнет, flush заблокируется навечно. Нужен timeout на каждый send. |
| 12 | :342–344 | Баги | 🟡 MEDIUM | `initOutbox()` защита `if (_flushTimer !== null) return` — идемпотентна. Но после `destroyOutbox()` + `initOutbox()` (HMR) `_db` = null, и первый flush попытается заново открыть DB. Это нормально, но `_sendFn` = null после destroy, значит flush будет no-op до повторного `registerSendFn()`. |

---

## 3. `src/lib/chat/recoveryV11.ts` (126 строк)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 13 | :78 | Баги | 🟠 HIGH | `acknowledgeReceipt` проверяет `watch.deviceId !== deviceId` и возвращает `null`. Если deviceId в receipt не совпадает (мульти-девайс), receipt игнорируется, timeout не отменяется, recovery продолжит retry. Может привести к дублированию re-sync операций. |
| 14 | :107–108 | Логика | 🟡 MEDIUM | `watch.attempt > maxAttempts` — off-by-one: если maxAttempts=5, то фактически будет 5 попыток (1..5), а не 6. Документация утверждает "max 5", но формула `> maxAttempts` означает failure на attempt=6. Это 5 tick'ов + 1 excess = корректно, но неочевидно. |
| 15 | :121–124 | Баги | 🟡 MEDIUM | Если `runStep` возвращает объект **без** `deferredMs` (undefined), вызывается `this.clear()` — recovery прекращается после 1 успешного шага. Это по дизайну, но если `runStep` в `useChat` возвращает `undefined` по ошибке (забыл return), recovery прервётся преждевременно. |

---

## 4. `src/hooks/useChat.tsx` (1632 строки)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 16 | — | Архитектура | 🔴 CRITICAL | **Файл 1632 строки** — превышает лимит 400 строк в 4 раза. `useConversations` + `useMessages` + `useCreateConversation` + все декодеры — всё в одном файле. Декомпозиция обязательна. |
| 17 | :329 | TypeScript | 🟡 MEDIUM | `mapWithConcurrency` определён внутри `useConversations` и обёрнут в `useCallback([], [])` — стабильная ссылка, но утилита не зависит от React state, лучше вынести за хук. |
| 18 | :666–667 | Баги | 🟠 HIGH | `scheduleDeliveredAck` — коллбэк зависит от `[conversationId, user]`, но `deliveredMaxSeqRef.current` шарится между рендерами. При смене `conversationId` ref не сбрасывается. ACK с максимальным seq от предыдущей беседы может уйти в новую. |
| 19 | :690 | Stale closure | 🟠 HIGH | `recoveryServiceRef.current` создаётся в useEffect и использует `runV11RecoveryRef.current`. Если recoveryPolicy меняется, старый service уничтожается и создаётся новый. Но между destroy и create может прийти receipt-событие, которое потеряется. |
| 20 | :718–720 | Реальные данные | 🟡 MEDIUM | `recoveryPolicyMetricSentRef` предотвращает повторную отправку метрики, но ref привязан к компоненту, не к конкретному policy. При HMR ref сбросится и метрика отправится снова. Несущественно. |
| 21 | :758–778 | Performance | 🟠 HIGH | **Fallback polling**: `fetchMessages()` перезагружает ВСЕ сообщения из DB каждые 3-15 секунд. Нет `since_seq` или `cursor` — при 1000+ сообщениях это O(n) SELECT + O(n) re-render каждые 3 секунды. |
| 22 | :955–963 | Баги | 🔴 CRITICAL | **Realtime DELETE подписка без фильтра**: `.on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" })` — подписка на ВСЕ удаления во всей таблице messages. При большой платформе каждый DELETE любого пользователя будет обрабатываться. Это и performance issue, и **потенциальная утечка данных** (ID удалённых сообщений других пользователей видны в payload). |
| 23 | :1201–1203 | Логика | 🟡 MEDIUM | `sendMediaMessage` формирует `fileName` (`user.id/${conversationId}/...`), но переменная `fileName` не используется — upload идёт через `uploadMedia(file, { bucket: 'chat-media' })` который сам генерирует путь. Мёртвый код. |
| 24 | :1054 | Баги | 🟡 MEDIUM | `inFlightFingerprintRef` защищает от двойной отправки, но fingerprint = `${conversationId}:${user.id}:${normalizedContent}`. Два одинаковых сообщения подряд (легитимный use case) будут заблокированы до завершения первого. |

---

## 5. `src/calls-v2/wsClient.ts` (696 строк)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 25 | :162–165 | Баги | 🟠 HIGH | При `ws.onopen` сбрасываются `lastServerSeq = 0`, `seenServerMsgIds.clear()` — корректно для свежего соединения. Но если при переподключении сервер пошлёт сообщение с seq <= предыдущего (из replay buffer), оно будет принято (seq > 0). Дедупликация по `msgId` спасёт только если msgId совпадает. |
| 26 | :228–235 | Recovery | 🟡 MEDIUM | `close()` реджектит все pending ACKs с `"WS closed"`. Вызывающему коду нужно отличать "WS closed" от "ACK timeout" — оба вернут rejected Promise, но семантика разная. |
| 27 | :505–507 | Баги | 🟡 MEDIUM | `sendOrderedAcked` — `scheduleTimeout` и `onAckTimeout` содержат дублированную логику retry. Сложно поддерживать — изменение в одном месте может быть забыто во втором. |
| 28 | :575–579 | Логика | 🟡 MEDIUM | Дедупликация: `seenServerMsgIdQueue` имеет лимит `dedupWindowSize` (default 10000). При burst из 10001+ сообщений самые старые msgId удалятся и повторные станут возможны. |

---

## 6. `src/calls-v2/callStateMachine.ts` (228 строк)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 29 | :16–18 | TypeScript | 🟡 MEDIUM | `(typeof import.meta !== "undefined" && import.meta.env?.VITE_CALL_ENGINE_MODE)` — проверка `typeof import.meta` лишняя в Vite-окружении, но безвредна. |
| 30 | :96 | Архитектура | 🟢 LOW | `TRANSITIONS` map не содержит перехода `ending -> CALL_END` (повторный hangup). Если CALL_END вызовется дважды, второй проигнорируется (transition возвращает null). Корректное поведение. |
| 31 | — | Общее | 🟢 LOW | Файл чистый, хорошо структурирован. Серьёзных проблем не обнаружено. |

---

## 7. `src/hooks/useChannels.tsx` (874 строки)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 32 | — | Архитектура | 🟠 HIGH | **874 строки** — превышает лимит 400 в 2+ раза. `useChannels` + `useChannelMessages` + `useCreateChannel` + `useJoinChannel` в одном файле. |
| 33 | :247–265 | Performance | 🟠 HIGH | `fetchChannels` загружает все `is_public` каналы без `.limit()`. При 10000 публичных каналов — загрузится всё. |
| 34 | :279–290 | Performance | 🔴 CRITICAL | **N+1 запрос**: для каждого канала выполняется отдельный запрос за последним сообщением (`mapWithConcurrency(channelIds, 6, ...)`). При 100 каналах — 100 SQL запросов. Комментарий в коде осознанно отвергает batch-подход, но N+1 остаётся. |
| 35 | :621–625 | Баги | 🟡 MEDIUM | `subscribe` callback: при `"SUBSCRIBED"`, `"CHANNEL_ERROR"`, `"TIMED_OUT"`, `"CLOSED"` — refetch. Refetch на SUBSCRIBED — это лишний fetch (данные только что загрузились). |
| 36 | :761–762 | Логика | 🟡 MEDIUM | `editChannelMessage` — оптимистичное обновление, а при ошибке rollback. Но между optimistic update и ответом сервера может прийти realtime UPDATE, который перезапишет оптимистик. Rollback тогда откатит к старому content, потеряв realtime update. |

---

## 8. `src/lib/chat/sendError.ts` (108 строк)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 37 | :9 | TypeScript | 🟡 MEDIUM | `const anyErr = error as any` — потеря type safety. |
| 38 | :14–16 | TypeScript | 🟡 MEDIUM | `extractFullText` — тот же `as any` паттерн. |
| 39 | — | Общее | 🟢 LOW | Файл функционально корректен. Классификация ошибок адекватная. `isNonRecoverableSendError` правильно определяет бизнес-ошибки. |

---

## 9. `src/lib/chat/rpcErrorPolicyV11.ts` (24 строки)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 40 | :17 | Логика | 🟢 LOW | Только два кода обрабатываются (`ERR_RESYNC_THROTTLED`, `ERR_RESYNC_RANGE_UNAVAILABLE`). Все остальные — `rethrow`. Минимальная policy, но корректная для текущего набора серверных кодов. |

---

## 10. `src/components/chat/ChatConversation.tsx` (1881 строк)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 41 | — | Архитектура | 🔴 CRITICAL | **1881 строк** — превышает лимит 400 в 4.7 раза! Самый тяжёлый компонент проекта. Объединяет: виртуализацию, шифрование, реакции, форварды, пины, scheduled, звонки, mentions, inline bots, recording, settings. Критически необходима декомпозиция. |
| 42 | :135–142 | Performance | 🔴 CRITICAL | `VirtualizedMessages` использует **хук `useVirtualizer` внутри условного ветвления**. Если `messages.length` колеблется около `VIRTUALIZE_THRESHOLD` (60), то при переходе 59→60→59 хук будет монтироваться/размонтироваться, вызывая полный сброс scroll state. Нарушает React Rules of Hooks (хуки нельзя вызывать условно). |
| 43 | :148–151 | Performance | 🟠 HIGH | `useLayoutEffect` в `VirtualizedMessages` вызывается при каждом изменении `messages.length`. `scrollToIndex` на каждый новый incoming message — пользователь не сможет прокрутить вверх, его постоянно будет выбрасывать вниз. |
| 44 | :131 | TypeScript | 🟠 HIGH | `VirtualizedMessages` принимает `callbacks: any`, `style: any` — полная потеря типизации. |
| 45 | :299 | Stale closure | 🟡 MEDIUM | `sendInFlightRef` защищает от двойной отправки, но `handleSendMessage` не обёрнут в `useCallback` — новая функция на каждый рендер не ломает логику (ref стабилен), но передаётся в ChatInputBar как нестабильный проп, вызывая ре-рендер ребёнка. |
| 46 | :815–843 | Performance | 🟡 MEDIUM | `useEffect` для нотификационного звука создаёт `AudioContext` + `OscillatorNode` на КАЖДОЕ новое входящее сообщение. AudioContext не переиспользуется между сообщениями. При быстрой переписке — массовое создание AudioContext. |

---

## 11. `src/components/chat/ChatInputBar.tsx` (466 строк)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 47 | — | Архитектура | 🟡 MEDIUM | 466 строк — незначительно превышает лимит 400. Приемлемо, но можно вынести recording UI в отдельный компонент. |
| 48 | :132–139 | Безопасность | 🟢 LOW | `handleKeyDown` обрабатывает Enter/Tab/Arrows для mentions — корректно. Нет XSS рисков, т.к. input — controlled textarea. |
| 49 | :325–331 | Performance | 🟡 MEDIUM | `SendOptionsMenu` + onMouseDown/onMouseUp/onTouchStart/onTouchEnd на send button — 6 обработчиков на одной кнопке. Сложная логика long-press для scheduled. Нет debounce — быстрый double-tap может вызвать два `onSend()`. |

---

## 12. `src/components/chat/ChatMessageItem.tsx` (695 строк)

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 50 | — | Архитектура | 🟠 HIGH | 695 строк — превышает лимит 400 в 1.7 раза. |
| 51 | :95 | Performance | 🟡 MEDIUM | Компонент не обёрнут в `React.memo`. При каждом ре-рендере родителя (ввод текста, scrolling) ВСЕ видимые ChatMessageItem перерисовываются. |
| 52 | :358 | Безопасность | 🟢 LOW | `sanitizeReceivedText` применяется к `message.content` и `decryptedCache[message.id]`. dangerouslySetInnerHTML НЕ используется. XSS-риск минимален. |
| 53 | :333 | Логика | 🟡 MEDIUM | `try { giftData = JSON.parse(message.content || "{}"); } catch (error)` — если content не JSON, giftData = пустой объект. Все поля будут fallback. UI покажет «Подарок» с пустыми значениями без информирования пользователя. |
| 54 | :537 | Баги | 🟡 MEDIUM | `onLongPressStart` привязан и к `onMouseDown` и к `onTouchStart`. На тач-устройствах оба события стреляют — long press timer запустится дважды, context menu может появиться дважды. |

---

## CROSS-FILE АНАЛИЗ

### Import-цепочки
Все импорты корректны. Битых путей не обнаружено.

### Критические архитектурные проблемы

| Проблема | Файлы | Impact |
|----------|-------|--------|
| Нарушение Rules of Hooks | ChatConversation.tsx:135 | useVirtualizer вызывается условно — React может сломать state |
| Файлы-гиганты | useChat.tsx (1632), ChatConversation.tsx (1881) | Невозможно поддерживать, тестировать, code review |
| Polling всех сообщений | useChat.tsx:758 | O(n) каждые 3-15 сек, не масштабируется |
| DELETE без фильтра | useChat.tsx:955 | Утечка metadata + performance |
| N+1 для каналов | useChannels.tsx:279 | 100 каналов = 100 SQL запросов |
| localStorage seq race | protocolV11.ts:62 | Дубли seq при нескольких вкладках |
| Outbox sendFn hang | messageOutbox.ts:271 | Без timeout → бесконечный block |

---

## ПРИОРИТИЗИРОВАННЫЙ ПЛАН ИСПРАВЛЕНИЙ

### P0 — Немедленно (CRITICAL)

1. **ChatConversation.tsx:135** — `useVirtualizer` вызывается условно. Разделить на два компонента: `SimpleMessageList` и `VirtualizedMessageList`, каждый со своим хуком.
2. **useChat.tsx:955** — DELETE подписка без filter. Добавить `filter: conversation_id=eq.${conversationId}` или хотя бы проверять conversation_id перед обработкой.
3. **useChat.tsx** / **ChatConversation.tsx** — декомпозиция на модули <400 строк.
4. **messageOutbox.ts:281** — добавить timeout на `_sendFn` вызов (30 сек).
5. **useChannels.tsx:279** — заменить N+1 на batch-запрос с window function.

### P1 — В ближайшем спринте (HIGH)

6. **protocolV11.ts:62** — заменить localStorage seq на BroadcastChannel или SharedWorker для multi-tab safety.
7. **useChat.tsx:758** — polling с cursor/since_seq вместо full fetch.
8. **useChat.tsx:666** — сбрасывать `deliveredMaxSeqRef` при смене conversationId.
9. **recoveryV11.ts:78** — логировать игнорирование receipt с mismatched deviceId.
10. **ChatConversation.tsx:148** — auto-scroll только если пользователь был near-bottom.

### P2 — Улучшения (MEDIUM/LOW)

11. **ChatMessageItem.tsx** — обернуть в `React.memo` с custom comparator.
12. **ChatInputBar.tsx:325** — добавить debounce на double-tap send.
13. **wsClient.ts:505** — DRY: объединить scheduleTimeout и onAckTimeout.
14. **useChannels.tsx:247** — добавить `.limit(500)` на каналы.

---

## ОЦЕНКА

| Направление | Оценка /10 |
|-------------|-----------|
| Безопасность | 6/10 — нет XSS, но DELETE без filter = data leak |
| Корректность | 5/10 — Rules of Hooks нарушение, race conditions |
| UI полнота | 7/10 — loading/empty/error покрыты |
| UX/Доступность | 6/10 — aria-labels есть, но auto-scroll агрессивен |
| Архитектура | 3/10 — 3 файла >1000 строк, N+1 queries |
| Заглушки | 9/10 — заглушек не обнаружено |
| Инварианты | 6/10 — seq race, deviceId mismatch в recovery |
| Recovery | 6/10 — recovery service есть, но outbox без timeout |

**VERDICT: FAIL** — 7 CRITICAL находок требуют немедленного исправления.
