# Полный аудит real-time элементов проекта

> Дата: 2026-03-26  
> Статус: Аудит завершён, готово к реализации

---

## Оглавление

1. [Архитектура real-time транспортов](#1-архитектура-real-time-транспортов)
2. [Реестр всех real-time событий](#2-реестр-всех-real-time-событий)
3. [Детальный анализ каждого элемента](#3-детальный-анализ-каждого-элемента)
4. [Критические дефекты](#4-критические-дефекты)
5. [План исправлений](#5-план-исправлений)

---

## 1. Архитектура real-time транспортов

Проект использует следующие каналы передачи:

| Транспорт | Где используется | Протокол |
|-----------|-----------------|----------|
| Supabase Realtime — Postgres Changes | Сообщения, чаты, уведомления, статусы | WebSocket через Phoenix Channel |
| Supabase Realtime — Broadcast | Typing индикатор в DM, видеозвонки сигналинг, live reactions | WebSocket Broadcast |
| Supabase Realtime — Presence | Typing индикатор в хуке useTypingIndicator, live viewers, group video call | WebSocket Presence |
| Собственный WebSocket сервер | Calls V2 — SFU сигналинг | WS через `server/calls-ws/index.mjs` |
| Polling fallback | Сообщения чата, статус звонка | HTTP с адаптивным интервалом |

---

## 2. Реестр всех real-time событий

### Статусы:
- ✅ **Реализовано** — работает корректно
- ⚠️ **Частично** — реализовано с дефектами или неполно
- ❌ **Отсутствует** — не реализовано, но должно быть

| # | Событие | Статус | Файл |
|---|---------|--------|------|
| 1 | Typing индикатор в DM | ⚠️ | `ChatConversation.tsx` |
| 2 | Typing индикатор в группах | ❌ | — |
| 3 | Online/offline статус | ⚠️ | `usePresence.tsx`, `useUserPresenceStatus.ts` |
| 4 | RT сообщения в DM | ✅ | `useChat.tsx` |
| 5 | RT сообщения в каналах | ✅ | `useChannelMessages` — test shows RT hooks |
| 6 | RT сообщения в группах | ✅ | `useGroupMessages` — test shows RT hooks |
| 7 | Delivery status: sent | ✅ | `useReadReceipts.ts`, `useDeliveryStatus.ts` |
| 8 | Delivery status: delivered | ❌ | `markAsDelivered` — НЕ вызывается |
| 9 | Delivery status: read | ⚠️ | `useReadReceipts.ts` |
| 10 | Обновление списка чатов RT | ✅ | `useChat.tsx` l.611-654 |
| 11 | Счётчики непрочитанных RT | ⚠️ | Зависят от refetch, нет атомарного обновления |
| 12 | Реакции на сообщения | ✅ | `useMessageReactions.ts` |
| 13 | Уведомления RT | ✅ | `useNotifications.ts` |
| 14 | Звонки входящие RT | ✅ | `useIncomingCalls.ts` |
| 15 | Видео звонок сигналинг | ✅ | `useVideoCall.ts` |
| 16 | Групповой видео звонок | ✅ | `useGroupVideoCall.ts` |
| 17 | Аудио комнаты | ✅ | `useAudioRoom.ts` |
| 18 | Треды RT | ✅ | `useChatThreads.ts` |
| 19 | Закреплённые сообщения RT | ✅ | `usePinnedMessages.ts` |
| 20 | Закреплённые чаты RT | ✅ | `usePinnedChats.ts` |
| 21 | Опросы RT | ✅ | `usePolls.ts` |
| 22 | Запланированные сообщения | ✅ | `useScheduledMessages.ts` |
| 23 | Сохранённые сообщения | ✅ | `useSavedMessages.ts` |
| 24 | Секретные чаты | ✅ | `useSecretChat.ts` |
| 25 | Папки чатов RT | ✅ | `useChatFolders.ts` |
| 26 | Архивированные чаты RT | ✅ | `useArchivedChats.ts` |
| 27 | Настройки пользователя RT | ✅ | `user-settings.ts` |
| 28 | Сессии пользователя RT | ✅ | `useUserSessions.ts` |
| 29 | Экстренные сигналы RT | ✅ | `useEmergencySignals.ts` |
| 30 | Суперг-группы заявки RT | ✅ | `useSupergroup.ts` |
| 31 | Топики в группах RT | ✅ | `useGroupTopics.ts` |
| 32 | Live stream viewers presence | ✅ | `useLiveViewers.ts` |
| 33 | Live stream reactions | ✅ | `useLiveReactions.ts` |
| 34 | Live stream chat | ✅ | `useLiveChat.ts` |
| 35 | Такси: позиция водителя RT | ✅ | `realtimeTracking.ts` |
| 36 | Такси: заказы водителя RT | ✅ | `driverService.ts` |
| 37 | Такси: чат водитель/пассажир | ✅ | `driverChat.ts` |
| 38 | Видеозвонок SFU state | ✅ | `useVideoCallSfu.ts` |
| 39 | Recording voice/video activity indication | ⚠️ | `ChatConversation.tsx` — только DM |
| 40 | Offline detection + reconnect | ⚠️ | Нет `beforeunload` для `last_seen_at` |

---

## 3. Детальный анализ каждого элемента

### 3.1 Typing индикатор — DM

**Файлы:** [`ChatConversation.tsx`](src/components/chat/ChatConversation.tsx:616), [`useTypingIndicator.ts`](src/hooks/useTypingIndicator.ts:1)

**Текущее состояние:** ⚠️ ЧАСТИЧНО РЕАЛИЗОВАНО — ДУБЛИРОВАНИЕ ЛОГИКИ

**Проблема:** Существуют ДВЕ независимые реализации:

1. **В `ChatConversation.tsx`** — используется `supabase.channel().broadcast()` напрямую:
   - Канал: `typing:${conversationId}`
   - Event: `typing` через Broadcast
   - Payload: `{ user_id, is_typing: boolean, activity: "typing"|"recording_voice"|"recording_video" }`
   - Throttle: 700ms
   - Auto-stop: 2000ms
   - Timeout входящего: 3500ms
   - **Работает только для DM** (`if (isGroup) return`)

2. **В `useTypingIndicator.ts`** — более зрелая реализация через Presence:
   - Канал: `typing:${conversationId}` через Presence
   - Payload: `{ user_id, display_name, avatar_url, ts }`
   - Throttle: 2000ms
   - Auto-stop: 4000ms
   - Expire: 6000ms
   - Поддерживает multi-user, multi-device
   - Строит label: «Алиса печатает…», «Алиса и Боб печатают…»
   - **НЕ ИСПОЛЬЗУЕТСЯ НИГДЕ В КОМПОНЕНТАХ**

**Рекомендация:** Удалить inline-реализацию из `ChatConversation.tsx`, интегрировать `useTypingIndicator` для DM и групп.

---

### 3.2 Typing индикатор — Группы

**Текущее состояние:** ❌ ОТСУТСТВУЕТ

В `ChatConversation.tsx` строка 618: `if (isGroup) return` — typing полностью отключён для групп.  
В `GroupConversation.tsx` — нет ни одного упоминания typing или presence.

`useTypingIndicator.ts` уже поддерживает multi-user typing и готов к групповому использованию, но не подключён.

**Рекомендация:** Подключить `useTypingIndicator` в `GroupConversation.tsx`.

---

### 3.3 Online/Offline статус пользователя

**Файлы:** [`usePresence.tsx`](src/hooks/usePresence.tsx:1), [`useUserPresenceStatus.ts`](src/hooks/useUserPresenceStatus.ts:1)

**Текущее состояние:** ⚠️ ЧАСТИЧНО РЕАЛИЗОВАНО

**Механизм записи** (`usePresence.tsx`):
- Обновляет `profiles.last_seen_at` каждые 15 сек через `UPDATE`
- Обновляет при `visibilitychange` и `focus`
- **НЕТ** обновления при `beforeunload`/`pagehide` — при закрытии вкладки `last_seen_at` остаётся свежим на 15 сек назад, а не сбрасывается

**Механизм чтения** (`useUserPresenceStatus.ts`):
- Загружает `last_seen_at` + `status_emoji` + `status_sticker_url` из profiles
- Подписывается на Postgres Changes UPDATE на profiles
- Периодический poll: каждые 30 сек
- Tick каждые 5 секунд для пересчёта «онлайн»/«был(а) N мин назад»
- `ONLINE_WINDOW_MS = 45000` (45 сек окно)

**Дефекты:**
1. **Нет `beforeunload`**: при закрытии вкладки пользователь показывается онлайн ещё ~45 сек
2. **Нет мгновенного offline**: используется polling на `last_seen_at`, НЕ Supabase Presence. Задержка до 45 секунд
3. **Throttle на UPDATE**: каждые 15 сек пишет в БД — при 100K пользователей это 6.6K UPDATE/сек
4. **Fallback при ошибке столбцов**: graceful деградация если `status_emoji`/`status_sticker_url` отсутствуют

**Рекомендация:**
- Добавить `beforeunload`/`pagehide` → очистка `last_seen_at` или обновление с текущим временем
- Рассмотреть Supabase Presence для мгновенного offline detection (но это дорого при масштабе)
- Уменьшить `ONLINE_WINDOW_MS` до 30 сек для более быстрого перехода в offline

---

### 3.4 Доставка и прочтение сообщений (Delivery Status)

**Файлы:** [`useDeliveryStatus.ts`](src/hooks/useDeliveryStatus.ts:1), [`useReadReceipts.ts`](src/hooks/useReadReceipts.ts:1), [`MessageStatus.tsx`](src/components/chat/MessageStatus.tsx:1), [`DeliveryTick.tsx`](src/components/chat/DeliveryTick.tsx:1), [`OutboxStatusTick.tsx`](src/components/chat/OutboxStatusTick.tsx:1)

**Текущее состояние:** ⚠️ КРИТИЧЕСКИЕ ДЕФЕКТЫ

**Статусы:**
- `sending` → часики ⏱ (locальный статус до confirmации) — ✅ работает
- `sent` → одна серая галочка ✓ — ✅ работает
- `delivered` → две серые галочки ✓✓ — ❌ **НЕ СРАБАТЫВАЕТ**
- `read` → две синие галочки ✓✓ — ⚠️ срабатывает только при открытии чата
- `failed` → красный ✗ — ✅ работает

**Проблема «delivered» статуса:**

`useReadReceipts.ts` строка 79-96 определяет `markAsDelivered()` который делает:
```typescript
await supabaseAny.from('messages').update({
  delivery_status: 'delivered',
  delivered_at: new Date().toISOString(),
}).in('id', messageIds).neq('sender_id', user?.id ?? '').eq('conversation_id', conversationId);
```

**Но `markAsDelivered` НЕ ВЫЗЫВАЕТСЯ НИГДЕ в компонентах!**

Компонент ChatConversation использует `markAsRead` из `useReadReceipts` (строка 191):
```typescript
const { getMessageStatus, markAsRead } = useReadReceipts(conversationId);
```

А `markAsDelivered` просто не деструктурируется и не вызывается.

**Последствие:** Сообщения перескакивают из `sent` сразу в `read`, минуя `delivered`. Две серые галочки (доставлено) никогда не появляются.

**Для `useDeliveryStatus.ts`** — альтернативная реализация, использует `message_read_receipts` таблицу с server-side trigger. Это более правильная архитектура, но используется из других мест.

**Рекомендация:**
1. Вызывать `markAsDelivered` при получении сообщения через Realtime INSERT (когда клиент получателя получает сообщение, но чат не открыт)
2. Или перейти целиком на `useDeliveryStatus` с server-side triggers
3. Унифицировать: сейчас есть ДВА хука для одной задачи

---

### 3.5 Обновление списка чатов и счётчиков непрочитанных

**Файл:** [`useChat.tsx`](src/hooks/useChat.tsx:611) — `useConversations()`

**Текущее состояние:** ✅/⚠️ РАБОТАЕТ, НО НЕ ОПТИМАЛЬНО

**Механизм:**
- V11: подписка на `chat_inbox_projection` с фильтром `user_id=eq.${userId}` — ✅
- Legacy: подписка на `conversations` UPDATE (без фильтра!) — ⚠️ слишком широкая подписка
- При получении события: debounced refetch через `scheduleConversationsRefetch()` (300ms)

**Дефекты:**
1. **Legacy подписка без фильтра**: получает UPDATE от ВСЕХ чатов всех пользователей → лишний трафик и refetch
2. **Не атомарный unread count**: вместо инкремента в payload, делается полный refetch списка через RPC
3. **Задержка 300ms на debounce**: при быстрых сообщениях unread badge может отставать

---

### 3.6 Реакции на сообщения

**Файл:** [`useMessageReactions.ts`](src/hooks/useMessageReactions.ts:1)

**Текущее состояние:** ✅ РЕАЛИЗОВАНО

- Подписка: `postgres_changes` на `message_reactions` с фильтром `conversation_id=eq.${conversationId}`
- При любом изменении (`*`): полный re-fetch реакций
- UI: отображение emoji + count + hasReacted

**Примечание:** При получении RT-события делается `fetchReactions()` — полный refetch вместо инкрементального обновления. При большом кол-ве сообщений это неэффективно, но корректно.

---

### 3.7 Уведомления

**Файл:** [`useNotifications.ts`](src/hooks/useNotifications.ts:277)

**Текущее состояние:** ✅ РЕАЛИЗОВАНО

- Подписка: `postgres_changes` INSERT на `notifications` с фильтром `user_id=eq.${userId}`
- При INSERT: добавляет в список, инкрементирует `unreadCount`
- Дедупликация: проверка `prev.some(x => x.id === notif.id)`

---

### 3.8 Входящие звонки

**Файл:** [`useIncomingCalls.ts`](src/hooks/useIncomingCalls.ts:227)

**Текущее состояние:** ✅ РЕАЛИЗОВАНО

- Primary: calls-ws WS relay (через VideoCallProvider)
- Fallback: `postgres_changes` INSERT + UPDATE на `video_calls` с фильтром `callee_id=eq.${userId}`
- Фильтрация: игнорируются звонки старше 60 сек и не в статусе `ringing`
- Дедупликация: Set `notifiedCalls`

---

### 3.9 Live Stream система

**Файлы:** [`useLiveViewers.ts`](src/hooks/useLiveViewers.ts), [`useLiveReactions.ts`](src/hooks/useLiveReactions.ts), [`useLiveChat.ts`](src/hooks/useLiveChat.ts)

**Текущее состояние:** ✅ ПОЛНОСТЬЮ РЕАЛИЗОВАНО

- **Viewers**: Supabase Presence `live:${sessionId}:viewers` — ✅
- **Reactions**: Supabase Broadcast `live:${sessionId}:reactions` — ✅
- **Chat**: Postgres Changes на `live_chat_messages` INSERT/UPDATE/DELETE — ✅

---

### 3.10 Calls V2 WebSocket

**Файлы:** [`wsClient.ts`](src/calls-v2/wsClient.ts), [`server/calls-ws/index.mjs`](server/calls-ws/index.mjs)

**Текущее состояние:** ✅ ПОЛНОСТЬЮ РЕАЛИЗОВАНО

- Собственный WS клиент с reconnect, heartbeat (8сек ping, 16сек timeout)
- Failover между несколькими endpoint'ами
- Sequence-based ordering
- JWT auth
- Server-side: rate limiting, room management, E2EE caps

---

## 4. Критические дефекты

### DEFECT-001: `markAsDelivered` не вызывается

**Файл:** [`useReadReceipts.ts`](src/hooks/useReadReceipts.ts:79)  
**Серьёзность:** HIGH  
**Влияние:** Двойная галочка «доставлено» (серая ✓✓) никогда не появляется

**Триггер:** Когда клиент-получатель получает INSERT из Realtime, нужно вызвать `markAsDelivered` для входящих сообщений. Сейчас при получении realtime INSERT вызывается только `scheduleDeliveredAck` в `useChat.tsx` (l.1033-1037), который делает RPC `ack_delivered_v1`, но НЕ обновляет `delivery_status` напрямую через `markAsDelivered`.

**Исправление:** В useChat.tsx при обработке INSERT для входящих сообщений (sender !== me) — вызывать обновление delivery_status, или полагаться на серверный trigger `ack_delivered_v1` (если он обновляет delivery_status).

---

### DEFECT-002: Дублирование typing — два конкурирующих механизма

**Файлы:** [`ChatConversation.tsx`](src/components/chat/ChatConversation.tsx:616), [`useTypingIndicator.ts`](src/hooks/useTypingIndicator.ts:1)  
**Серьёзность:** MEDIUM  
**Влияние:** Используется менее надёжная inline-реализация; более зрелый хук не задействован

**Исправление:** Заменить inline broadcast в ChatConversation на useTypingIndicator.

---

### DEFECT-003: Typing не работает в группах

**Файл:** [`ChatConversation.tsx`](src/components/chat/ChatConversation.tsx:618) — `if (isGroup) return`  
**Серьёзность:** HIGH  
**Влияние:** В групповых чатах нет индикатора печатания

**Исправление:** Подключить `useTypingIndicator` в GroupConversation.

---

### DEFECT-004: Нет `beforeunload` для presence

**Файл:** [`usePresence.tsx`](src/hooks/usePresence.tsx:1)  
**Серьёзность:** MEDIUM  
**Влияние:** При закрытии вкладки пользователь показывается «в сети» ещё ~45 секунд

**Исправление:** Добавить `beforeunload`/`pagehide` listener.

---

### DEFECT-005: Legacy подписка conversations без фильтра

**Файл:** [`useChat.tsx`](src/hooks/useChat.tsx:632)  
**Серьёзность:** LOW  
**Влияние:** Каждый UPDATE любого чата триггерит refetch для ВСЕХ пользователей

**Исправление:** Добавить фильтр или перейти на V11 inbox projection.

---

### DEFECT-006: Два хука для delivery status (`useReadReceipts` + `useDeliveryStatus`)

**Файлы:** [`useReadReceipts.ts`](src/hooks/useReadReceipts.ts), [`useDeliveryStatus.ts`](src/hooks/useDeliveryStatus.ts)  
**Серьёзность:** MEDIUM  
**Влияние:** Путаница, разные API, разные механизмы (один пишет в messages напрямую, другой через `message_read_receipts`)

**Исправление:** Унифицировать в один хук, предпочтительно `useDeliveryStatus` с server-side trigger.

---

## 5. План исправлений

### TODO

- [ ] **DEFECT-001**: Подключить `markAsDelivered` — при Realtime INSERT входящего сообщения, когда чат НЕ открыт, вызывать markAsDelivered. Когда чат открыт — сразу markAsRead.
- [ ] **DEFECT-002**: Заменить inline broadcast typing в `ChatConversation.tsx` на хук `useTypingIndicator`. Удалить 50+ строк inline-кода, добавить одну строку хука.
- [ ] **DEFECT-003**: Подключить `useTypingIndicator` в `GroupConversation.tsx`. Отображать typing label в шапке группы.
- [ ] **DEFECT-004**: В `usePresence.tsx` добавить `beforeunload`/`pagehide` → финальный UPDATE `last_seen_at` с текущим временем. Рассмотреть sendBeacon для надёжности.
- [ ] **DEFECT-005**: Добавить фильтр `filter: \`id=in.(ids_of_user_conversations)\`` или полностью мигрировать на V11 inbox.
- [ ] **DEFECT-006**: Унифицировать `useReadReceipts` и `useDeliveryStatus` в один хук. `useDeliveryStatus` имеет более чистую архитектуру (server-side triggers).
- [ ] **BONUS**: Добавить запись голосового/видео activity в typing канал для групп (не только DM).
- [ ] **BONUS**: При записи голосового сообщения broadcast activity `recording_voice` в typing канал.

---

## Схема данных real-time событий

### Typing Broadcast (DM — текущая реализация)
```
Channel: typing:${conversationId}
Type: broadcast
Event: typing
Payload: {
  user_id: string,
  is_typing: boolean,
  activity: "typing" | "recording_voice" | "recording_video"
}
```

### Typing Presence (useTypingIndicator — рекомендуемая)
```
Channel: typing:${conversationId}  
Type: presence
Key: ${userId}
Payload: {
  user_id: string,
  display_name: string,
  avatar_url: string | null,
  ts: number  // Date.now()
}
```

### Messages Realtime
```
Channel: messages:${conversationId}
Type: postgres_changes
Events: INSERT, UPDATE, DELETE
Table: messages
Filter: conversation_id=eq.${conversationId}
Payload: full row (id, conversation_id, sender_id, content, seq, delivery_status, ...)
```

### Delivery Status Update
```
Channel: delivery-status:${conversationId}:${userId}
Type: postgres_changes  
Event: UPDATE
Table: messages
Filter: conversation_id=eq.${conversationId}
Payload.new: { id, sender_id, delivery_status }
```

### Chat List Updates
```
Channel: conversations-updates-v11
Type: postgres_changes
Event: *
Table: chat_inbox_projection
Filter: user_id=eq.${userId}
→ triggers refetch of full conversation list
```

### Notifications
```
Channel: notifications-v2-realtime
Type: postgres_changes
Event: INSERT
Table: notifications  
Filter: user_id=eq.${userId}
Payload.new: full notification row
```

### User Presence
```
Mechanism: Polling UPDATE → profiles.last_seen_at every 15sec
Read: postgres_changes UPDATE on profiles + polling 30sec
Online window: 45 seconds
```

### Message Reactions
```
Channel: message_reactions:${conversationId}
Type: postgres_changes
Event: *
Table: message_reactions
Filter: conversation_id=eq.${conversationId}
→ triggers full refetch of all reactions
```
