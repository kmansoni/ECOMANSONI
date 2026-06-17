# План декомпозиции Supabase types.ts

## Текущее состояние

- **Размер файла**: ~28KB, ~28,500 строк
- **Таблиц**: ~268 (глубоко вложенные в Database['public']['Tables'])
- **Строк**: каждый table имеет Row/Insert/Update/Relationships
- **Проблема**: авто-генерируемый тип, ручное редактирование бессмысленно

## Цель

Кастомизация генерации типов через supabase CLI с модульной декомпозицией по доменам.

## Декомпозиция по доменам

### 1. Core (Базовые сущности)
```
src/lib/supabase/tables/core.ts
```
Таблицы: profiles, auth_accounts, auth_sessions, auth_devices, user_sessions, settings

### 2. Chat (Сообщения и диалоги)
```
src/lib/supabase/tables/chat.ts
```
Таблицы: conversations, messages, chat_participants, chat_messages, chat_attachments, direct_messages, group_messages

### 3. Social (Посты, лайки, комменты)
```
src/lib/supabase/tables/social.ts
```
Таблицы: posts, comments, likes, follows, stories, reels, reel_reactions, reel_effects

### 4. Calls (Видеозвонки)
```
src/lib/supabase/tables/calls.ts
```
Таблицы: video_calls, call_participants, sip_config, webrtc_signals

### 5. Navigation (Навигация)
```
src/lib/supabase/tables/navigation.ts
```
Таблицы: navigator_settings, navigator_waypoints, traffic_data, route_cache

### 6. Commerce (Товары, заказы, оплата)
```
src/lib/supabase/tables/commerce.ts
```
Таблицы: products, orders, cart_items, payments, taxi_rides, shop_items

### 7. Bots (Боты и автоматизация)
```
src/lib/supabase/tables/bots.ts
```
Таблицы: bots, bot_sessions, bot_handlers, bot_messages, bot_webhooks, bot_tokens

### 8. Admin (Администрирование)
```
src/lib/supabase/tables/admin.ts
```
Таблицы: admin_users, admin_roles, admin_permissions, feature_flags, kill_switches

### 9. Ads (Рекламная система)
```
src/lib/supabase/tables/ads.ts
```
Таблицы: ad_campaigns, ad_creatives, ad_impressions

### 10. Insurance (Страхование)
```
src/lib/supabase/tables/insurance.ts
```
Таблицы: insurance_quotes, insurance_policies, insurance_settings

## Реализация

### Шаг 1: Конфигурация генерации
Создать `supabase/config.toml` с разделением схем:
```toml
[db.tables.core]
schema = "public"
tables = ["profiles", "auth_accounts", ...]

[db.tables.chat]  
schema = "public"
tables = ["conversations", "messages", ...]
```

### Шаг 2: Генератор типов
Создать скрипт `scripts/supabase/generate-types.ts`:
- Читает схему из supabase/migrations
- Извлекает таблицы по доменам
- Генерирует отдельные файлы типов
- Экспортирует объединённый тип в `src/lib/supabase/types.ts`

### Шаг 3: Обновление импортов
```typescript
// Было
import type { Database } from '@/integrations/supabase/types'

// Стало
import type { ChatTables } from '@/lib/supabase/tables/chat'
```

### Шаг 4: Миграция dbLoose
Сохранить `dbLoose` как fallback для новых таблиц, но добавить
техническую документацию ссылку на конкретный домен при добавлении таблицы.

## Алгоритм добавления новой таблицы

1. Создать миграцию в `supabase/migrations/`
2. Добавить имя таблицы в соответствующий домен в `supabase/config.toml`
3. Запустить `npm run supabase:gen-types`
4. Types автоматически сгенерятся с правильной типизацией

## Индексы для проверки качества

| Метрикс | До | После |
|---------|-----|-----|
| Размер types.ts | 28KB | <5KB (ре-экспорты) |
| Файлов типов | 1 | ~11 |
| Время typecheck | baseline | -20% (меньше to-сheck) |
| Навигируемость | плохая | отличная |

## См. также

- `supabase/migrations/` — источник правды для схемы БД
- `scripts/phase1/update-types.mjs` — текущий процесс генерации