# User Activity Module Architecture

## Проблема

Сейчас активность пользователя в проекте разорвана на несколько независимых контуров:

- `screen_time` считается через `user_screen_time`, но пинг долгое время жил только в экране настроек.
- контентная аналитика (`story`, `reel`) идёт через firehose в Redpanda/ClickHouse.
- `SettingsActivitySection` читает `likes/comments/reposts` напрямую из таблиц Supabase и не использует агрегированную аналитику.
- `telemetry_events` в Supabase хранит сырые JSON-события, но не является каноническим источником продуктовой активности.

В итоге платформа не умеет честно ответить на базовые вопросы:

- сколько времени пользователь провёл в приложении;
- сколько времени он провёл по модулям: messenger, reels, posts, settings, marketplace;
- сколько экранов открыл и как между ними перемещался;
- сколько сообщений отправил, прочитал, сколько диалогов открыл;
- как связать raw logs, продуктовые агрегаты и экран `Ваша активность`.

## Каноническая схема

### 1. Raw event log

Канонический путь для продуктовой активности: `client -> analytics-ingest -> Redpanda -> ClickHouse`.

Почему именно он:

- уже существует в проекте;
- подходит для большого объёма append-only событий;
- не мешает OLTP-нагрузке Supabase;
- даёт дешёвые rollup-агрегации по времени, модулю, экрану, пользователю, объекту.

`public.telemetry_events` в Supabase остаётся для operational / внутренней телеметрии, аудита фоновых процессов и локальных fallback-сценариев, но не должен быть главным хранилищем пользовательской продуктовой аналитики.

### 2. Serving layer

Пользовательские экраны не должны читать raw tables напрямую.

Нужен отдельный serving layer:

- агрегаты по screen time и module usage;
- агрегаты по messenger activity;
- агрегаты по content consumption;
- экспорт активности пользователя.

Рекомендуемый путь:

- raw + rollups живут в ClickHouse;
- Edge Function или backend gateway читает готовые агрегаты;
- frontend работает только с нормализованным API `activity-summary`.

### 3. Supabase как transactional source

Supabase остаётся источником истины для transactional-сущностей:

- likes;
- comments;
- reposts;
- saved posts;
- user settings;
- relationships, profiles, messages.

Но экран активности не должен строить продуктовую статистику на прямом чтении этих таблиц. Эти данные должны входить в итоговый activity API как уже собранные срезы.

## Целевая таксономия событий

### Object types

- `app`
- `screen`
- `module`
- `story`
- `reel`
- `post`
- `profile`
- `chat`
- `conversation`
- `message`

### Core event types

- `session_start`
- `session_end`
- `screen_view`
- `screen_leave`
- `navigation`
- `heartbeat`

### Content events

- `view_start`
- `view_progress`
- `view_end`
- `exit`
- `tap_forward`
- `tap_back`
- `like_toggle`
- `comment_open`
- `comment_send`
- `share_open`
- `share_complete`
- `reaction`
- `link_click`

### Messenger events

- `composer_open`
- `composer_submit`
- `message_send`
- `message_read`

## Минимальный обязательный payload

Каждое событие должно сохранять:

- `actor_id`
- `device_id`
- `session_id`
- `object_type`
- `object_id`
- `owner_id`
- `event_type`
- `event_ts`
- `props`

Для screen/module событий в `props` обязательно:

- `module_id`
- `pathname`
- `search`
- `from_module_id` / `to_module_id` при навигации

Для messenger событий в `props` обязательно:

- `conversation_id`
- `peer_type`
- `message_kind`
- `delivery_state` при необходимости

## Агрегаты, которые должен уметь модуль активности

### User activity summary

- `screen_time_today_seconds`
- `screen_time_7d_seconds`
- `screen_time_30d_seconds`
- `active_days_30d`
- `sessions_today`
- `sessions_7d`

### Module usage

- `messenger_seconds`
- `reels_seconds`
- `feed_seconds`
- `settings_seconds`
- `marketplace_seconds`
- `live_seconds`
- `crm_seconds`
- `insurance_seconds`
- `taxi_seconds`

### Consumption

- `reels_viewed_count`
- `reels_completed_count`
- `posts_viewed_count`
- `stories_viewed_count`
- `profiles_opened_count`

### Messenger activity

- `conversations_opened_count`
- `messages_sent_count`
- `messages_read_count`
- `attachments_sent_count`
- `voice_messages_sent_count`

### Social activity

- `likes_given_count`
- `comments_written_count`
- `reposts_done_count`
- `saved_posts_count`

## Serving API

Нужен единый API-модуль, а не набор прямых запросов из UI.

### `GET /activity/summary`

Возвращает:

- totals за сегодня / 7 дней / 30 дней;
- module usage breakdown;
- текущие streak / active days;
- top screens.

### `GET /activity/content`

Возвращает:

- reels viewed / completed / skipped;
- posts viewed;
- stories viewed;
- content interaction totals.

### `GET /activity/messenger`

Возвращает:

- opened conversations;
- sent/read messages;
- attachment activity;
- usage by DM / group / channel.

### `GET /activity/export`

Возвращает готовый экспорт данных пользователя одним ответом.

## Что уже сделано в этом проходе

- глобальный `screen time` больше не привязан к экрану настроек;
- в приложение добавлен общий `app activity` tracker;
- firehose-контракт расширен под `app`, `screen`, `module`, `chat`, `conversation`, `message`;
- добавлены события `session_start`, `session_end`, `screen_view`, `screen_leave`, `navigation`.

Это базовый слой, на который можно подключать messenger, feed, profile и settings без создания параллельных подсистем.

## Следующие этапы

### Этап 1. Глобальная телеметрия

- завершить instrumenting всех роутов и модулей;
- писать screen/module activity для всего приложения;
- прекратить локальные костыли уровня `SettingsPage -> pingScreenTime`.

### Этап 2. Messenger instrumentation

- логировать `conversation_open` как `screen_view`/`navigation` по экрану чата;
- логировать `composer_open`, `message_send`, `message_read`;
- разделять DM / group / channel в `props.peer_type`.

### Этап 3. Feed and post instrumentation

- довести post/profile tracking до того же стандарта, что уже есть у reels/stories;
- убрать расхождение между counters в Supabase и raw firehose-событиями.

### Этап 4. Rollups

Добавить новые rollup-таблицы или materialized views в ClickHouse:

- `user_activity_rollup_5m_v1`
- `user_activity_rollup_day_v1`
- `module_activity_rollup_day_v1`
- `messenger_activity_rollup_day_v1`

### Этап 5. Activity API

- сделать backend endpoint / edge function для summary/content/messenger/export;
- перевести `SettingsActivitySection` на агрегированный API.

## Антипаттерны

- не считать время приложения из одного экрана;
- не строить модуль активности прямыми выборками из десятка таблиц в UI;
- не дублировать одну и ту же активность и в Supabase telemetry, и в ClickHouse как два независимых источника истины;
- не добавлять новые точечные RPC под каждый экран, если событие уже должно проходить через общий firehose.

## Рекомендуемый вердикт

Канонический activity module для проекта должен быть гибридным:

- ClickHouse firehose = raw logs + time-based rollups;
- Supabase = transactional source + user-facing auth/RLS layer;
- Edge Functions / backend = serving API для экранов активности и экспорта.

Именно этот путь даст честную статистику по reels, posts, messenger и времени в приложении без разрастания ad hoc логики в React-экранах.