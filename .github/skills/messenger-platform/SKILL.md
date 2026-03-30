---
name: messenger-platform
description: "Глубокие знания о платформе мессенджера. Use when: чат, сообщения, каналы, группы, звонки, уведомления, реакции, стикеры, голосовые сообщения, видеокружки, пинг, статус онлайн, набор текста, доставка, прочтение, E2EE, push notifications, модерация, спам, пересылка, цитирование, поиск по сообщениям."
---

# Messenger Platform — Полная экспертиза

Этот skill содержит ВСЕ знания, необходимые для создания production-quality мессенджера уровня Telegram/WhatsApp.

## Доставка сообщений

### Гарантии доставки
- **At-least-once delivery**: клиент повторяет отправку до получения ACK
- **Дедупликация**: каждое сообщение имеет `client_message_id` (UUID v4, генерируется клиентом). Сервер отклоняет дубликаты по UNIQUE constraint
- **Optimistic UI**: сообщение появляется мгновенно со статусом "отправляется" (серые часики), затем обновляется на "отправлено" (одна галка), "доставлено" (две серые), "прочитано" (две синие)
- **Retry**: экспоненциальный backoff — 1s, 2s, 4s, 8s, 16s, max 30s. После 5 попыток — показать ошибку с кнопкой "Повторить"

### Статусы сообщения
```
pending → sent → delivered → read → failed
```
- `pending` — создано клиентом, ещё не подтверждено сервером
- `sent` — сервер подтвердил запись в БД
- `delivered` — устройство получателя получило через Realtime/push
- `read` — получатель открыл чат и увидел сообщение
- `failed` — сервер вернул ошибку (RLS, validation, rate limit)

### Порядок сообщений
- `created_at` + `sort_key` (serial). `created_at` может совпадать (bulk send)
- Клиент сортирует по `sort_key ASC`
- При подгрузке истории: cursor-based pagination по `sort_key`

## Real-time

### WebSocket / Supabase Realtime
- Подписка на `postgres_changes` для таблицы messages с фильтром `channel_id`
- **Reconnection**: exponential backoff, max 30s, jitter ±20%
- **Heartbeat**: каждые 30s, timeout 10s → reconnect
- **Capacity**: Supabase Free — 200 concurrent connections, Pro — 500. Превышение → 429

### Typing indicators
- Клиент отправляет через Realtime Broadcast: `channel.send({ type: 'broadcast', event: 'typing', payload: { user_id } })`
- Debounce: отправлять не чаще 1 раз в 3 секунды
- Timeout: если нет нового события 5s → убрать индикатор
- В группах: показывать max 3 "набирает" (остальные "+N")

### Presence (онлайн-статус)
- Supabase Realtime Presence: `channel.track({ user_id, online_at: new Date() })`
- Показ: "онлайн", "был(а) N мин назад", "был(а) сегодня в HH:MM", "был(а) вчера", "был(а) DD.MM"
- Privacy setting: allow_online_status (только для контактов / никто / все)
- Anti-abuse: не показывать точное время last_seen (округлять до 5 мин)

## Медиа

### Отправка изображений
1. Клиент: сжатие JPEG quality 85%, max dimension 2048px, thumbnail 200px quality 60%
2. Upload: Supabase Storage, bucket `chat-media`, path `{channel_id}/{message_id}/{filename}`
3. RLS Storage: только участники канала могут читать
4. Прогресс: показывать % загрузки на placeholder
5. Retry: при ошибке загрузки — 3 попытки, затем "не отправлено"
6. Limit: max 10 изображений за одно сообщение, max 20MB на файл

### Голосовые сообщения
- Формат: WebM Opus (Chrome/Android), MP4 AAC (Safari/iOS)
- Max длительность: 15 минут
- Waveform: генерировать при записи, хранить как массив [0..1] из 64 точек
- UI: play/pause, waveform визуализация, скорость (1x, 1.5x, 2x), текущая позиция
- Auto-play next: в ленте голосовые проигрываются последовательно

### Видеокружки (video circles)
- Формат: WebM VP9 (Chrome), MP4 H.264 (Safari)
- Max длительность: 60 секунд
- Размер: 384x384 круглый crop
- AutoPlay: без звука при видимости в viewport, со звуком по тапу
- Thumbnail: первый кадр как JPEG
- Max size: 12MB

### Документы
- Любой тип файла
- Max size: 50MB
- Показать: иконка типа файла, имя, размер, кнопка скачивания
- Preview: PDF inline, изображения, аудио (встроенный плеер)

### Стикеры
- Quick stickers: массив из 20 emoji, рендерить в сетке 5 столбцов
- Стикерпаки: загрузка из Supabase Storage, кэширование в IndexedDB
- Размер отображения: 120x120px
- Отправка: сообщение с `type: 'sticker'`, `content: emoji или sticker_id`

## Реакции

### Архитектура
- Таблица: `message_reactions(message_id, user_id, emoji, created_at)` с UNIQUE на (message_id, user_id, emoji)
- Одно emoji = одна реакция от пользователя (toggle: добавить или убрать)
- Max различных emoji на сообщение: 20
- **Max реакций от одного пользователя на одно сообщение: 3**
- Показывать: emoji + count, подсвечивать свою реакцию
- Long-press на count: показать список реагировавших

### Rate limiting
- **Реакции: max 30 в минуту на пользователя** (защита от спама)
- Клиент: optimistic UI + debounce 300ms
- Сервер: rate limit через RPC с проверкой last_reaction_at

## Каналы

### Типы
- Публичный канал: любой может найти и подписаться
- Приватный канал: вступить только по инвайт-ссылке
- Broadcast: только админы публикуют, подписчики читают

### Роли
```
owner → admin → moderator → subscriber (read-only)
```
- **owner**: все права, передача владения, удаление канала
- **admin**: публикация, удаление чужих постов, управление участниками, настройки
- **moderator**: удаление чужих постов, мут участников
- **subscriber**: чтение, реакции, (опционально) комментарии

### Лимиты каналов
- Max подписчиков на канал: 200,000
- Max каналов, на которые подписан пользователь: 500
- Max длина поста: 4096 символов
- Max медиа в посте: 10 файлов
- Max пинов: 1 текущий (предыдущий открепляется)
- Post rate limit: max 1 пост в 3 секунды (анти-спам)

### Auto-delete
- Варианты: никогда, 24 часа, 7 дней, 30 дней
- Реализация: pg_cron job каждый час + `WHERE auto_delete_seconds > 0 AND created_at < NOW() - INTERVAL`
- После удаления: `ON DELETE CASCADE` для реакций, медиа помечаются для garbage collection

### Уведомления
- Per-channel настройки: все, muted, muted на N часов/до даты, отключены
- Silent publish: автор может отправить без уведомления подписчикам
- Digest: если >50 непрочитанных — группировать в одно push-уведомление

## Группы (отличия от каналов)

- Все участники могут писать
- Max участников: 200 (для E2EE), 1000 (без E2EE)
- Typing indicators показываются
- Read receipts для всех сообщений
- Mentions: `@username` или `@all` (для admin/owner)
- Reply: цитирование с выделением оригинала

## Mentions (@упоминания)

### Механизм
1. Ввод `@` → показать dropdown с участниками
2. Фильтрация по имени (fuzzy, case-insensitive)
3. Выбор → вставка `@[DisplayName](user_id)` в текст
4. Рендер: `@DisplayName` как кликабельная ссылка синего цвета
5. Уведомление: push + badge для упомянутого

### Rate limit mentions
- Max mentions per message: 10
- `@all` — только admin/owner, max 1 раз в 10 минут

## Поиск

### По сообщениям
- Full-text search через PostgreSQL `tsvector/tsquery`
- Индекс: `GIN` на `to_tsvector('russian', content)`
- Highlighting: `ts_headline()` для выделения совпадений
- Фильтры: по автору, по дате, по типу (текст, медиа, документ)
- Pagination: 20 результатов, cursor-based

### По контактам / каналам
- `ILIKE '%query%'` на display_name
- Limit 20, debounce 300ms на клиенте

## Push-уведомления

### FCM (Android)
- Token регистрация: при логине и при обновлении (`messaging.getToken()`)
- Хранение: таблица `push_tokens(user_id, token, platform, updated_at)`
- Payload: `{ notification: { title, body }, data: { type, channel_id, message_id } }`
- Channels: `messages` (звук), `calls` (вибрация + звук), `system` (тихо)
- Batch: max 500 токенов в одном multicast

### APNs (iOS)
- Certificate: `.p8` key, Key ID, Team ID
- Payload: `{ aps: { alert: { title, body }, badge: count, sound: 'default' } }`
- Background: content-available для тихих обновлений

### Группировка
- Android: group by channel_id, collapse_key
- iOS: thread-id = channel_id
- Badge count: total unread across all chats

## Модерация

### Контент
- Hashtag blocking: список запрещённых хэштегов, проверка при отправке
- Spam detection: одинаковые сообщения > 3 раз в минуту → предупреждение
- Report: кнопка "пожаловаться" → запись в `reports(reporter_id, message_id, reason)`

### Пользователи
- Ban: admin может забанить на N часов/перманентно
- Mute: нельзя писать N минут/часов
- Shadowban: пользователь видит свои сообщения, другие — нет

## Звонки

### WebRTC
- Signaling: WebSocket сервер (`calls-ws`)
- SFU: mediasoup для групповых звонков (>2 участников)
- P2P: для 1-1 звонков (STUN/TURN)
- ICE: предпочтение `relay` для мобильных сетей (NAT traversal)

### Сигнализация
```
caller → offer → server → offer → callee
callee → answer → server → answer → caller
both → ice-candidate → server → ice-candidate → peer
```

### Лимиты звонков
- Max длительность: 4 часа
- Max участников: 8 (P2P), 50 (SFU)
- Audio codec: Opus 48kHz
- Video codec: VP8/VP9, max 720p
- Bandwidth limit: audio 32kbps, video 250-1500kbps adaptive

## Offline-режим

### Стратегия
- Сообщения кэшируются в IndexedDB (последние 100 на канал)
- Отправка в offline → очередь в IndexedDB → отправка при reconnect
- Conflict resolution: server timestamp wins
- Медиа: только из кэша браузера, placeholder если не загружено

## Безопасность

### E2EE (End-to-End Encryption)
- MessageKeyBundle паттерн: каждый чат имеет свой набор ключей
- Key rotation: при добавлении/удалении участника
- Forward secrecy: новые ключи не дешифруют старые сообщения
- Не применяется к каналам (broadcast — серверное шифрование)

### Rate Limiting (сводная таблица)

| Действие | Лимит | Окно |
|----------|-------|------|
| Отправка сообщений | 30 | 1 мин |
| Реакции | 30 | 1 мин |
| Реакции на одно сообщение от одного юзера | 3 | — |
| Загрузка медиа | 20 | 1 час |
| Mentions @all | 1 | 10 мин |
| Создание каналов | 5 | 1 день |
| Инвайт-ссылки | 10 | 1 час |
| API запросы (общий) | 300 | 1 мин |
| Поиск | 10 | 1 мин |
| Звонки | 10 | 1 час |

### Input Validation

| Поле | Ограничение |
|------|-------------|
| Сообщение текст | 1–4096 символов, trim whitespace |
| Имя канала | 3–64 символа, без спецсимволов |
| Описание канала | 0–512 символов |
| Display name | 2–32 символа |
| Bio | 0–256 символов |
| Инвайт-код | 8–16 alphanumeric |
