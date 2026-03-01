# Полная спецификация платформы ботов и мини-приложений "Фазер"

## Содержание

1. [Обзор системы](#1-обзор-системы)
2. [База данных](#2-база-данных)
3. [Bot API](#3-bot-api)
4. [Типы сообщений](#4-типы-сообщений)
5. [Клавиатуры и кнопки](#5-клавиатуры-и-кнопки)
6. [Inline режим](#6-inline-режим)
7. [Медиа контент](#7-медиа-контент)
8. [Платежи](#8-платежи)
9. [Игры](#9-игры)
10. [Мини-приложения](#10-мини-приложения)
11. [Бизнес функции](#11-бизнес-функции)
12. [Аналитика](#12-аналитика)
13. [Модерация](#13-модерация)
14. [Безопасность](#14-безопасность)
15. [Rate Limiting](#15-rate-limiting)
16. [Webhooks и Polling](#16-webhooks-и-polling)
17. [Frontend компоненты](#17-frontend-компоненты)
18. [Интеграция с чатами](#18-интеграция-с-чатами)

---

## 1. Обзор системы

### 1.1 Архитектура

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────┤
│   Web Client    │   Mobile App    │   Desktop App   │   External API      │
│   (React)       │   (React Native │   (Electron)    │   (Webhooks)        │
└────────┬────────┴────────┬────────┴────────┬────────┴──────────┬──────────┘
         │                 │                 │                   │
         ▼                 ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Auth       │  │  Bot API    │  │  Mini App   │  │  Webhook       │  │
│  │  Gateway    │  │  Gateway    │  │  Gateway    │  │  Handler       │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
└─────────┼────────────────┼────────────────┼──────────────────┼────────────┘
          │                │                │                   │
          ▼                ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICES                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  User      │  │  Bot       │  │  Message   │  │  Payment       │  │
│  │  Service   │  │  Service   │  │  Service   │  │  Service       │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Mini App  │  │  Analytics │  │  Game      │  │  Notification   │  │
│  │  Service   │  │  Service   │  │  Engine    │  │  Service        │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE (Supabase)                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  users  │ │  bots   │ │ messages│ │ sessions│ │ analytics│ │ payments│  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Компоненты системы

| Компонент | Описание | Технология |
|-----------|----------|------------|
| API Gateway | Маршрутизация запросов | Express/Next.js API |
| Bot Service | Управление ботами | Node.js |
| Message Service | Обработка сообщений | Node.js + Redis |
| Payment Service | Платежи | Node.js + Stripe/ЮKassa |
| Game Engine | Игры | Node.js + WebSocket |
| Analytics Service | Сбор метрик | ClickHouse/Postgres |
| Notification Service | Push-уведомления | FCM/APNS |

---

## 2. База данных

### 2.1 Основные таблицы

```sql
-- Пользователи платформы (расширение auth.users)
CREATE TABLE platform_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    is_premium BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Боты
CREATE TABLE bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE,
    
    -- Идентификация
    username TEXT UNIQUE NOT NULL CHECK (username ~* '^faser_[a-zA-Z0-9_]{4,32}$'),
    display_name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    background_url TEXT,
    
    -- Настройки
    is_public BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT true,
    is_paid BOOLEAN DEFAULT false,
    price DECIMAL(10,2) DEFAULT 0,
    
    -- Модерация
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending', 'rejected', 'deleted')),
    rejection_reason TEXT,
    moderation_notes TEXT,
    flagged_count INTEGER DEFAULT 0,
    
    -- Параметры
    language_code TEXT DEFAULT 'ru',
    can_join_groups BOOLEAN DEFAULT true,
    can_read_all_group_messages BOOLEAN DEFAULT false,
    support_inline_queries BOOLEAN DEFAULT false,
    
    -- Статистика
    subscribers_count INTEGER DEFAULT 0,
    messages_count BIGINT DEFAULT 0,
    
    -- Временные метки
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_message_at TIMESTAMPTZ,
    
    -- Индексы
    CONSTRAINT bot_owner_unique UNIQUE (owner_id, username)
);

-- Токены доступа ботов
CREATE TABLE bot_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL CHECK (length(token) >= 32),
    token_hash TEXT NOT NULL,
    name TEXT,
    permissions JSONB DEFAULT '["send_message"]',
    ip_whitelist TEXT[],
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
);

-- Команды ботов
CREATE TABLE bot_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    command TEXT NOT NULL CHECK (command ~* '^[a-zA-Z0-9_]{1,32}$'),
    description TEXT NOT NULL CHECK (length(description) <= 256),
    sort_order INTEGER DEFAULT 0,
    
    -- Параметры команды
    params JSONB DEFAULT '{}',
    requires_admin BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(bot_id, command)
);

-- Процессоры (для платежей)
CREATE TABLE bot_processors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'yookassa', 'cryptobot')),
    provider_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(bot_id, provider)
);

-- Подписки на ботов
CREATE TABLE bot_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    user_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    
    -- Подписка
    plan_id UUID REFERENCES bot_plans(id),
    started_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    auto_renew BOOLEAN DEFAULT true,
    
    -- Оплата
    payment_method TEXT,
    last_payment_at TIMESTAMPTZ,
    next_payment_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(bot_id, user_id)
);

-- Планы подписки ботов
CREATE TABLE bot_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    interval TEXT NOT NULL CHECK (interval IN ('day', 'week', 'month', 'year')),
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Webhook конфигурации
CREATE TABLE bot_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    url TEXT NOT NULL CHECK (url ~* '^https?://'),
    secret_token TEXT,
    is_active BOOLEAN DEFAULT true,
    
    -- События
    events TEXT[] DEFAULT ARRAY['message', 'callback_query', 'inline_query'],
    
    -- Настройки
    max_retries INTEGER DEFAULT 3,
    timeout_ms INTEGER DEFAULT 30000,
    
    -- Статистика
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Сообщения ботов
CREATE TABLE bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL,
    message_id UUID,
    
    -- Тип
    type TEXT DEFAULT 'text' CHECK (type IN ('text', 'photo', 'video', 'audio', 'document', 'sticker', 'animation', 'voice', 'video_note', 'location', 'venue', 'contact', 'game', 'invoice', 'successful_payment', 'poll', 'dice')),
    
    -- Контент
    text TEXT,
    entities JSONB,
    media_url TEXT,
    media_file_id TEXT,
    thumb_url TEXT,
    
    -- Клавиатура
    reply_markup JSONB,
    
    -- Статус
    status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    error_message TEXT,
    
    -- Временные метки
    sent_at TIMESTAMPTZ DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    
    -- Индексы
    INDEX idx_bot_messages_bot_id (bot_id),
    INDEX idx_bot_messages_chat_id (chat_id),
    INDEX idx_bot_messages_sent_at (sent_at)
);

-- Callback запросы (inline кнопки)
CREATE TABLE bot_callbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    message_id UUID REFERENCES bot_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    chat_id UUID,
    data TEXT,
    game_short_name TEXT,
    
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'alert')),
    answer_text TEXT,
    show_alert BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    answered_at TIMESTAMPTZ
);

-- Inline запросы
CREATE TABLE bot_inline_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    query TEXT NOT NULL,
    offset TEXT,
    location TEXT,
    
    results JSONB,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Платежи ботов
CREATE TABLE bot_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    chat_id UUID,
    
    -- Платёж
    provider TEXT NOT NULL,
    provider_charge_id TEXT,
    invoice_payload TEXT,
    shipping_option_id TEXT,
    
    -- Сумма
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    
    -- Статус
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
    
    -- Чеok
    receipt_url TEXT,
    provider_response JSONB,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    paid_at TIMESTAMPTZ
);

-- Мини-приложения
CREATE TABLE mini_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
    
    -- Идентификация
    slug TEXT UNIQUE NOT NULL CHECK (slug ~* '^[a-zA-Z0-9_-]{3,32}$'),
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    screenshot_urls TEXT[],
    
    -- URL и интеграция
    url TEXT NOT NULL,
    webhook_url TEXT,
    
    -- Настройки
    is_published BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    category TEXT,
    tags TEXT[],
    
    -- Безопасность
    allowed_origins TEXT[],
    required_permissions TEXT[],
    
    -- Статистика
    launches_count BIGINT DEFAULT 0,
    unique_users_count INTEGER DEFAULT 0,
    avg_session_duration INTEGER DEFAULT 0,
    
    -- Модерация
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    rejection_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ
);

-- Запуски мини-приложений
CREATE TABLE mini_app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mini_app_id UUID REFERENCES mini_apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    chat_id UUID,
    
    -- Контекст
    platform_token TEXT,
    start_params JSONB,
    
    -- Метрики
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- События
    events JSONB DEFAULT '[]'
);

-- Игры
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES platform_profiles(id) ON DELETE CASCADE,
    
    -- Игра
    short_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    photo_url TEXT,
    
    -- Параметры
    max_players INTEGER DEFAULT 2,
    is_multiplayer BOOLEAN DEFAULT true,
    game_url TEXT,
    
    -- Статистика
    plays_count BIGINT DEFAULT 0,
    high_scores JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(bot_id, short_name)
);

-- Сессии игр
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    
    -- Участники
    players JSONB NOT NULL,
    current_player_index INTEGER DEFAULT 0,
    
    -- Состояние
    state JSONB DEFAULT '{}',
    score JSONB DEFAULT '{}',
    
    -- Статус
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'cancelled')),
    
    -- Временные метки
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    last_action_at TIMESTAMPTZ
);

-- Аналитика ботов
CREATE TABLE bot_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    
    -- Метрики
    date DATE NOT NULL,
    new_subscribers INTEGER DEFAULT 0,
    total_subscribers INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    callbacks_received INTEGER DEFAULT 0,
    inline_queries_received INTEGER DEFAULT 0,
    
    -- Удержание
    daily_active_users INTEGER DEFAULT 0,
    monthly_active_users INTEGER DEFAULT 0,
    
    -- География
    top_countries JSONB DEFAULT '[]',
    top_cities JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(bot_id, date)
);

-- Жалобы на ботов
CREATE TABLE bot_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES platform_profiles(id) ON DELETE SET NULL,
    
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'scam', 'inappropriate', 'copyright', 'privacy', 'other')),
    description TEXT,
    evidence_urls TEXT[],
    
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
    resolution_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- Логи ошибок ботов
CREATE TABLE bot_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
    
    -- Ошибка
    error_type TEXT NOT NULL,
    error_message TEXT,
    stack_trace TEXT,
    
    -- Контекст
    user_id UUID,
    chat_id UUID,
    message_id UUID,
    endpoint TEXT,
    
    -- Отладка
    request_data JSONB,
    response_data JSONB,
    
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.2 Расширение типов

```sql
-- Расширение типов чатов для поддержки ботов
ALTER TYPE chat_folder_item_kind ADD VALUE 'bot';
ALTER TYPE chat_folder_item_kind ADD VALUE 'mini_app';
ALTER TYPE chat_folder_item_kind ADD VALUE 'game';

-- Создание новых типов для бота
CREATE TYPE bot_chat_type AS ENUM ('private', 'group', 'supergroup', 'channel');
CREATE TYPE message_entity_type AS ENUM (
    'mention', 'hashtag', 'bot_command', 'url', 'email', 
    'bold', 'italic', 'underline', 'strikethrough', 
    'code', 'pre', 'text_link', 'text_mention',
    'phone_number', 'cashtag', 'spoiler'
);
CREATE TYPE keyboard_type AS ENUM ('reply', 'inline', 'remove');
CREATE TYPE payment_provider AS ENUM ('stripe', 'yookassa', 'cryptobot', 'sberbank');
```

---

## 3. Bot API

### 3.1 Полный список методов

#### 3.1.1 Управление ботом

| Метод | Описание | Параметры |
|-------|----------|-----------|
| `getMe` | Информация о боте | - |
| `logOut` | Выход из аккаунта бота | - |
| `close` | Закрыть бота | - |
| `getAdministrators` | Получить список администраторов | chat_id |
| `getMemberCount` | Получить количество участников | chat_id |
| `getChat` | Получить информацию о чате | chat_id |
| `getChatAdministrators` | Получить администраторов чата | chat_id |
| `getChatMember` | Получить участника чата | chat_id, user_id |
| `getChatMembersCount` | Получить количество участников | chat_id |
| `setChatDescription` | Установить описание чата | chat_id, description |
| `setChatTitle` | Установить название чата | chat_id, title |
| `setChatPhoto` | Установить фото чата | chat_id, photo |
| `deleteChatPhoto` | Удалить фото чата | chat_id |
| `pinChatMessage` | Закрепить сообщение | chat_id, message_id, disable_notification |
| `unpinChatMessage` | Открепить сообщение | chat_id, message_id |
| `unpinAllChatMessages` | Открепить все сообщения | chat_id |
| `leaveChat` | Покинуть чат | chat_id |

#### 3.1.2 Сообщения

| Метод | Описание | Параметры |
|-------|----------|-----------|
| `sendMessage` | Отправить сообщение | chat_id, text, parse_mode, entities, disable_web_page_preview, disable_notification, reply_to_message_id, allow_sending_without_reply, reply_markup |
| `editMessageText` | Редактировать текст | chat_id, message_id, text, parse_mode, entities, disable_web_page_preview, reply_markup |
| `editMessageCaption` | Редактировать подпись | chat_id, message_id, caption, parse_mode, entities, reply_markup |
| `editMessageMedia` | Редактировать медиа | chat_id, message_id, media, reply_markup |
| `editMessageReplyMarkup` | Редактировать клавиатуру | chat_id, message_id, reply_markup |
| `deleteMessage` | Удалить сообщение | chat_id, message_id |
| `deleteMessages` | Удалить несколько сообщений | chat_id, message_ids |
| `forwardMessage` | Переслать сообщение | chat_id, from_chat_id, message_id, disable_notification |
| `forwardMessages` | Переслать несколько | chat_id, from_chat_id, message_ids, disable_notification |
| `copyMessage` | Копировать сообщение | chat_id, from_chat_id, message_id, ... |
| `copyMessages` | Копировать несколько | chat_id, from_chat_id, message_ids, ... |
| `pinChatMessage` | Закрепить | chat_id, message_id, disable_notification |
| `unpinChatMessage` | Открепить | chat_id, message_id |

#### 3.1.3 Медиа

| Метод | Описание |
|-------|----------|
| `sendPhoto` | Отправить фото |
| `sendAudio` | Отправить аудио |
| `sendDocument` | Отправить документ |
| `sendVideo` | Отправить видео |
| `sendAnimation` | Отправить анимацию (GIF) |
| `sendVoice` | Отправить голосовое |
| `sendVideoNote` | Отправить видео-заметку |
| `sendLocation` | Отправить геолокацию |
| `sendVenue` | Отправить место |
| `sendContact` | Отправить контакт |
| `sendSticker` | Отправить стикер |
| `getFile` | Получить файл |
| `getFileUrl` | Получить URL файла |

#### 3.1.4 Опросы и игральные кости

| Метод | Описание |
|-------|----------|
| `sendPoll` | Отправить опрос |
| `sendDice` | Отправить игральную кость |
| `stopPoll` | Остановить опрос |

#### 3.1.5 Интерактивные клавиатуры

| Метод | Описание |
|-------|----------|
| `answerCallbackQuery` | Ответить на callback |
| `setChatMenuButton` | Установить кнопку меню |
| `getChatMenuButton` | Получить кнопку меню |
| `setMyCommands` | Установить команды |
| `getMyCommands` | Получить команды |
| `deleteMyCommands` | Удалить команды |
| `setMyDefaultAdministratorRights` | Установить права админа по умолчанию |
| `getMyDefaultAdministratorRights` | Получить права админа по умолчанию |
| `setMyShortDescription` | Установить короткое описание |
| `getMyShortDescription` | Получить короткое описание |
| `setMyDescription` | Установить описание |
| `getMyDescription` | Получить описание |
| `setMyName` | Установить имя |
| `getMyName` | Получить имя |

#### 3.1.4 Inline режим

| Метод | Описание |
|-------|----------|
| `answerInlineQuery` | Ответить на inline запрос |
| `answerWebAppQuery` | Ответить на web app запрос |

#### 3.1.7 Платежи

| Метод | Описание |
|-------|----------|
| `sendInvoice` | Отправить счёт |
| `createInvoiceLink` | Создать ссылку на счёт |
| `answerShippingQuery` | Ответить на запрос доставки |
| `answerPreCheckoutQuery` | Ответить на предоплату |

#### 3.1.8 Трансляции

| Метод | Описание |
|-------|----------|
| `sendChatAction` | Отправить действие |
| `uploadStickerFile` | Загрузить стикер |
| `createNewStickerSet` | Создать набор стикеров |
| `addStickerToSet` | Добавить в набор |
| `setStickerPositionInSet` | Установить позицию |
| `deleteStickerFromSet` | Удалить из набора |
| `setStickerSetThumb` | Установить thumb |

#### 3.1.9 Чат-боты (Chatbots)

| Метод | Описание |
|-------|----------|
| `approveChatJoinRequest` | Одобрить запрос на вступление |
| `declineChatJoinRequest` | Отклонить запрос на вступление |
| `restrictChatMember` | Ограничить участника |
| `promoteChatMember` | Повысить участника |
| `setChatAdministratorCustomTitle` | Установить титул |
| `banChatMember` | Забанить участника |
| `unbanChatMember` | Разбанить участника |
| `banChatSenderChat` | Забанить канал |
| `unbanChatSenderChat` | Разбанить канал |

#### 3.1.10 Дополнительные методы

| Метод | Описание |
|-------|----------|
| `getUserChatBoots` | Получить чат-боты пользователя |
| `getUpdates` | Получить обновления (polling) |
| `setWebhook` | Установить webhook |
| `deleteWebhook` | Удалить webhook |
| `getWebhookInfo` | Получить информацию о webhook |
| `getUpdatesOffset` | Получить обновления со смещением |

### 3.2 Webhook Events (входящие события)

```typescript
// Все типы входящих обновлений от webhook
type Update = 
    | MessageUpdate
    | EditedMessageUpdate
    | ChannelPostUpdate
    | EditedChannelPostUpdate
    | InlineQueryUpdate
    | ChosenInlineResultUpdate
    | CallbackQueryUpdate
    | ShippingQueryUpdate
    | PreCheckoutQueryUpdate
    | PollUpdate
    | PollAnswerUpdate
    | MyChatMemberUpdate
    | ChatMemberUpdate
    | ChatJoinRequestUpdate;

interface MessageUpdate {
    update_id: number;
    message: Message;
}

interface EditedMessageUpdate {
    update_id: number;
    edited_message: EditedMessage;
}

interface CallbackQueryUpdate {
    update_id: number;
    callback_query: CallbackQuery;
}

interface InlineQueryUpdate {
    update_id: number;
    inline_query: InlineQuery;
}

interface ChatMemberUpdate {
    update_id: number;
    chat_member: ChatMemberUpdated;
}

interface ChatJoinRequestUpdate {
    update_id: number;
    chat_join_request: ChatJoinRequest;
}
```

---

## 4. Типы сообщений

### 4.1 Полный тип Message

```typescript
interface Message {
    message_id: number;
    message_thread_id?: number;
    from?: User;
    sender_chat?: Chat;
    date: number;
    chat: Chat;
    forward_from?: User;
    forward_from_chat?: Chat;
    forward_from_message_id?: number;
    forward_signature?: string;
    forward_sender_name?: string;
    forward_date?: number;
    is_topic_message?: boolean;
    forum_topic_created?: ForumTopic;
    forum_topic_closed?: ForumTopic;
    forum_topic_reopened?: ForumTopic;
    reply_to_message?: Message;
    venue?: Venue;
    location?: Location;
    new_chat_members?: User[];
    left_chat_member?: User;
    new_chat_title?: string;
    new_chat_photo?: ChatPhoto[];
    delete_chat_photo?: boolean;
    group_chat_created?: boolean;
    supergroup_chat_created?: boolean;
    channel_chat_created?: boolean;
    migrate_to_chat_id?: number;
    migrate_from_chat_id?: number;
    pinned_message?: Message;
    invoice?: Invoice;
    successful_payment?: SuccessfulPayment;
    connected_website?: string;
    passport_data?: PassportData;
    proximity_alert_triggered?: ProximityAlertTriggered;
    forum_topic_edit?: ForumTopicEdit;
    video_chat_scheduled?: VideoChatScheduled;
    video_chat_started?: VideoChatStarted;
    video_chat_ended?: VideoChatEnded;
    video_chat_participants_invited?: VideoChatParticipantsInvited;
    web_app_data?: WebAppData;
    reply_markup?: InlineKeyboardMarkup;
    
    // Тип контента
    text?: string;
    photo?: PhotoSize[];
    audio?: Audio;
    document?: Document;
    animation?: Animation;
    video?: Video;
    video_note?: VideoNote;
    voice?: Voice;
    contact?: Contact;
    location?: Location;
    poll?: Poll;
    dice?: Dice;
    sticker?: Sticker;
}
```

### 4.2 MessageEntity (сущности в тексте)

```typescript
interface MessageEntity {
    type: 'mention' | 'hashtag' | 'bot_command' | 'url' | 'email' 
        | 'bold' | 'italic' | 'underline' | 'strikethrough' 
        | 'code' | 'pre' | 'text_link' | 'text_mention'
        | 'phone_number' | 'cashtag' | 'spoiler';
    offset: number;
    length: number;
    url?: string;
    user?: User;
    language?: string;
}
```

---

## 5. Клавиатуры и кнопки

### 5.1 Inline Keyboard (инлайн клавиатура)

```typescript
interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][];
}

interface InlineKeyboardButton {
    text: string;
    url?: string;
    callback_data?: string;
    web_app?: WebAppInfo;
    login_url?: LoginUrl;
    switch_inline_query?: string;
    switch_inline_query_current_chat?: string;
    callback_game?: CallbackGame;
    pay?: boolean;
}

interface WebAppInfo {
    url: string;
}

interface LoginUrl {
    url: string;
    forward_text?: string;
    bot_username?: string;
    request_write_access?: boolean;
}
```

### 5.2 Reply Keyboard (обычная клавиатура)

```typescript
interface ReplyKeyboardMarkup {
    keyboard: KeyboardButton[][];
    resize_keyboard?: boolean;
    one_time_keyboard?: boolean;
    input_field_placeholder?: string;
    selective?: boolean;
}

interface KeyboardButton {
    text: string;
    request_user?: RequestUser;
    request_chat?: RequestChat;
    request_contact?: boolean;
    request_location?: boolean;
    request_poll?: KeyboardButtonPollType;
    web_app?: WebAppInfo;
}

interface KeyboardButtonPollType {
quiz' | '    type: 'regular';
}

interface RequestUser {
    request_id: string;
    user_is_bot?: boolean;
    user_is_premium?: boolean;
}

interface RequestChat {
    request_id: string;
    chat_is_channel?: boolean;
    chat_is_group?: boolean;
    chat_is_forum?: boolean;
    chat_has_username?: boolean;
    chat_is_created?: boolean;
    user_administrator_rights?: ChatAdministratorRights;
    bot_administrator_rights?: ChatAdministratorRights;
    bot_is_member?: boolean;
}
```

### 5.3 Кнопки оплаты

```typescript
interface InlineKeyboardButton {
    pay?: boolean;  // Оплата
}

interface CheckoutInfo {
    name?: string;
    phone_number?: string;
    email?: string;
    shipping_address?: ShippingAddress;
}
```

---

## 6. Inline режим

### 6.1 Inline Query

```typescript
interface InlineQuery {
    id: string;
    from: User;
    query: string;
    offset: string;
    chat_type?: 'private' | 'group' | 'supergroup' | 'channel';
    location?: Location;
}
```

### 6.2 Inline Results

```typescript
type InlineQueryResult = 
    | InlineQueryResultArticle
    | InlineQueryResultPhoto
    | InlineQueryResultGif
    | InlineQueryResultMpeg4Gif
    | InlineQueryResultVideo
    | InlineQueryResultAudio
    | InlineQueryResultVoice
    | InlineQueryResultDocument
    | InlineQueryResultLocation
    | InlineQueryResultVenue
    | InlineQueryResultContact
    | InlineQueryResultGame
    | InlineQueryResultCachedPhoto
    | InlineQueryResultCachedGif
    | InlineQueryResultCachedMpeg4Gif
    | InlineQueryResultCachedVideo
    | InlineQueryResultCachedAudio
    | InlineQueryResultCachedVoice
    | InlineQueryResultCachedDocument
    | InlineQueryResultCachedSticker
    | InlineQueryResultLink
    | InlineQueryResultCachedLink
    | InlineQueryResultArticleMore;

interface InlineQueryResultArticle {
    type: 'article';
    id: string;
    title: string;
    input_message_content: InputMessageContent;
    reply_markup?: InlineKeyboardMarkup;
    url?: string;
    hide_url?: boolean;
    description?: string;
    thumb_url?: string;
    thumb_width?: number;
    thumb_height?: number;
}

interface InlineQueryResultPhoto {
    type: 'photo';
    id: string;
    photo_url: string;
    thumb_url: string;
    photo_width?: number;
    photo_height?: number;
    title?: string;
    description?: string;
    caption?: string;
    parse_mode?: string;
    reply_markup?: InlineKeyboardMarkup;
    input_message_content?: InputMessageContent;
}

interface InputMessageContent {
    message_text: string;
    parse_mode?: string;
    entities?: MessageEntity[];
    disable_web_page_preview?: boolean;
}
```

---

## 7. Медиа контент

### 7.1 Типы медиа

```typescript
interface PhotoSize {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
}

interface Audio {
    file_id: string;
    file_unique_id: string;
    duration: number;
    performer?: string;
    title?: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
    thumb?: PhotoSize;
}

interface Document {
    file_id: string;
    file_unique_id: string;
    thumb?: PhotoSize;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
}

interface Video {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    duration: number;
    thumb?: PhotoSize;
    mime_type?: string;
    file_size?: number;
}

interface Animation {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    duration: number;
    thumb?: PhotoSize;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
}

interface Voice {
    file_id: string;
    file_unique_id: string;
    duration: number;
    mime_type?: string;
    file_size?: number;
}

interface VideoNote {
    file_id: string;
    file_unique_id: string;
    length: number;
    duration: number;
    thumb?: PhotoSize;
    file_size?: number;
}

interface Sticker {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    is_animated: boolean;
    is_video: boolean;
    thumb?: PhotoSize;
    emoji?: string;
    set_name?: string;
    premium_animation?: File;
    mask_position?: MaskPosition;
    file_size?: number;
}
```

### 7.2 Загрузка файлов

```typescript
// Multipart загрузка
interface InputMedia {
    type: 'photo' | 'video' | 'animation' | 'audio' | 'document' | 'sticker' | 'voice' | 'video_note';
    media: string;  // file_id или URL
    thumb?: string;
    caption?: string;
    parse_mode?: string;
    caption_entities?: MessageEntity[];
    width?: number;
    height?: number;
    duration?: number;
    supports_streaming?: boolean;
    has_spoiler?: boolean;
}
```

---

## 8. Платежи

### 8.1 Параметры платежей

```typescript
interface Invoice {
    title: string;
    description: string;
    start_parameter: string;
    currency: string;
    total_amount: number;
}

interface LabeledPrice {
    label: string;
    amount: number;  // в копейках/центах
}

interface ShippingAddress {
    country_code: string;
    state: string;
    city: string;
    street_line1: string;
    street_line2: string;
    post_code: string;
}

interface OrderInfo {
    name?: string;
    phone_number?: string;
    email?: string;
    shipping_address?: ShippingAddress;
}

interface SuccessfulPayment {
    currency: string;
    total_amount: number;
    invoice_payload: string;
    shipping_option_id?: string;
    order_info?: OrderInfo;
    telegram_payment_charge_id: string;
    provider_payment_charge_id: string;
}
```

### 8.2 Провайдеры

```typescript
// Stripe
interface StripeConfig {
    provider: 'stripe';
    stripe_api_key: string;
    stripe_publishable_key: string;
    provider_token: string;  // Connect account token
}

// ЮKassa
interface YookassaConfig {
    provider: 'yookassa';
    shop_id: string;
    secret_key: string;
    return_url: string;
}

// CryptoBot
interface CryptobotConfig {
    provider: 'cryptobot';
    api_token: string;
}
```

---

## 9. Игры

### 9.1 Типы игр

```typescript
interface Game {
    title: string;
    description: string;
    photo: PhotoSize;
    text?: string;
    text_entities?: MessageEntity[];
    animation?: Animation;
}

interface GameHighScore {
    position: number;
    user: User;
    score: number;
}
```

### 9.2 Игровой движок

```typescript
// WebSocket для игр
interface GameWebSocket {
    game_id: string;
    session_id: string;
    players: Player[];
    
    // Сообщения
    join: (player_id: string) => void;
    leave: (player_id: string) => void;
    action: (action: GameAction) => void;
    state: () => GameState;
    
    // События
    onPlayerJoin: (player: Player) => void;
    onPlayerLeave: (player: Player) => void;
    onStateChange: (state: GameState) => void;
    onGameEnd: (winner: Player, stats: GameStats) => void;
}
```

---

## 10. Мини-приложения

### 10.1 Архитектура Mini App

```typescript
interface MiniApp {
    // Основное
    id: string;
    slug: string;
    name: string;
    url: string;
    
    // Безопасность
    allowed_origins: string[];
    csp_policy: string;
    
    // API для mini app
    initParams: InitParams;
    ready: () => void;
    close: () => void;
    
    // Хуки
    onReady: (callback: () => void) => void;
    onClose: (callback: () => void) => void;
    onInvoiceClosed: (callback: (data: InvoiceClosedData) => void) => void;
    onPaymentAuthorized: (callback: (data: PaymentData) => void) => void;
    
    // Методы
    expand: () => void;
    hapticFeedback: (style: 'light' | 'medium' | 'heavy' | 'selection') => void;
    openLink: (url: string) => void;
    openTelegramLink: (url: string) => void;
}

interface InitParams {
    bot_id: string;
    user_id: string;
    chat_id?: string;
    start_param?: string;
    theme_params?: ThemeParams;
    auth_date: number;
    hash: string;
}

interface ThemeParams {
    bg_color: string;
    text_color: string;
    hint_color: string;
    link_color: string;
    button_color: string;
    button_text_color: string;
    secondary_bg_color: string;
}
```

### 10.2 Mini App API

```typescript
// Глобальный объект в mini app
declare global {
    interface Window {
        Telegram: {
            WebApp: MiniApp;
        };
    }
}

// Методы WebApp
interface MiniApp {
    // Инициализация
    initData: string;  // JWT токен
    initDataUnsafe: InitDataUnsafe;
    version: string;
    platform: 'android' | 'ios' | 'web';
    
    // Управление
    ready(): void;
    close(): void;
    expand(): void;
    isExpanded: boolean;
    
    // UI
    setHeaderColor(color: string): void;
    setBackgroundColor(color: string): void;
    enableClosingConfirmation(enabled: boolean): void;
    
    // Haptic Feedback
    HapticFeedback: {
        impactOccurred(style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid'): void;
        notificationOccurred(type: 'success' | 'warning' | 'error'): void;
        selectionChanged(): void;
    };
    
    // Biometric
    BiometricManager: {
        isRequested: boolean;
        isGranted: boolean;
        request(): Promise<boolean>;
    };
    
    // Платежи
    openInvoice(url: string, callback?: (data: InvoiceClosedData) => void): void;
    
    // Popup
    showPopup(params: PopupParams, callback?: (data: PopupClosedData) => void): void;
    showAlert(message: string, callback?: () => void): void;
    showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
    
    // Сканер
    scanCodeQR(callback: (data: string) => void): void;
    
    // Файлы
    showScanFilePopup(params: { request_multiple?: boolean }, callback?: (files: InputFile[]) => void): void;
    
    // Location
    getLocation(callback: (data: LocationData) => void): void;
    
    // Events
    onEvent(event: string, callback: Function): void;
    offEvent(event: string, callback: Function): void;
}

interface PopupParams {
    title?: string;
    message: string;
    buttons?: PopupButton[];
}

interface PopupButton {
    id?: string;
    type?: 'ok' | 'cancel' | 'close' | 'destructive';
    text?: string;
}
```

---

## 11. Бизнес функции

### 11.1 Бизнес сообщения

```typescript
interface BusinessMessage {
    message_id: number;
    from: User;
    sender_chat?: Chat;
    business_connection_id: string;
    chat: Chat;
    date: number;
    edit_date?: number;
    media_group_id?: string;
    author_signature?: string;
    text?: string;
    // ... остальные поля Message
}

interface BusinessConnection {
    id: string;
    user: User;
    user_chat_id: number;
    is_enabled: boolean;
    can_read_all_group_messages: boolean;
    custom_title?: string;
}
```

### 11.2 Трансформации

```typescript
interface MessageTransform {
    // Трансформации для бизнеса
    transformToBusiness?: {
        add_greeting?: boolean;
        add_signature?: boolean;
    };
    
    // Пересылка
    forward?: {
        from_chat_id: number;
        remove_caption?: boolean;
    };
}
```

---

## 12. Аналитика

### 12.1 Метрики

```typescript
interface BotAnalytics {
    // Аудитория
    subscribers: {
        total: number;
        new_today: number;
        new_this_week: number;
        new_this_month: number;
        churn: number;
        churn_rate: number;
    };
    
    // Активность
    engagement: {
        daily_active_users: number;
        monthly_active_users: number;
        messages_per_user: number;
        retention_rate: number;
    };
    
    // Доходы (для платных ботов)
    revenue: {
        total: number;
        this_month: number;
        subscriptions_active: number;
        arpu: number;  // Average Revenue Per User
    };
    
    // География
    geography: {
        top_countries: CountryStats[];
        top_cities: CityStats[];
    };
    
    // Устройства
    devices: {
        mobile: number;
        desktop: number;
        web: number;
    };
}

interface CountryStats {
    country_code: string;
    users: number;
    percentage: number;
}
```

### 12.2 События аналитики

```typescript
interface AnalyticsEvent {
    event: string;
    bot_id: string;
    user_id?: string;
    timestamp: number;
    properties: Record<string, any>;
    context: {
        platform: string;
        language: string;
        timezone: string;
    };
}

// События
const AnalyticsEvents = {
    MESSAGE_SENT: 'message.sent',
    MESSAGE_RECEIVED: 'message.received',
    BUTTON_CLICKED: 'button.clicked',
    SUBSCRIPTION_CREATED: 'subscription.created',
    SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
    PAYMENT_COMPLETED: 'payment.completed',
    MINI_APP_LAUNCHED: 'mini_app.launched',
    GAME_STARTED: 'game.started',
    GAME_COMPLETED: 'game.completed',
    INLINE_QUERY: 'inline.query',
};
```

---

## 13. Модерация

### 13.1 Система модерации

```typescript
interface ModerationConfig {
    // Автоматическая модерация
    auto_moderation: {
        enabled: boolean;
        filters: {
            spam: boolean;
            offensive: boolean;
            scam: boolean;
            copyright: boolean;
        };
        action: 'delete' | 'warn' | 'ban';
        threshold: number;
    };
    
    // Ручная модерация
    manual_moderation: {
        enabled: boolean;
        reviewers: string[];
        approval_required: boolean;
    };
    
    // Жалобы
    reports: {
        enabled: boolean;
        auto_threshold: number;
    };
}

interface ModerationAction {
    type: 'warning' | 'mute' | 'kick' | 'ban' | 'delete';
    duration?: number;  // для временных
    reason: string;
    evidence: string[];
    moderator_id: string;
    timestamp: number;
}
```

---

## 14. Безопасность

### 14.1 Аутентификация

```typescript
interface BotAuth {
    // Токены
    token: string;
    token_hash: string;
    
    // IP whitelist
    ip_whitelist: string[];
    
    // Права
    permissions: ('send_message' | 'send_media' | 'send_poll' | 'manage_chat' | 'pin_message')[];
    
    // Валидация
    validateRequest: (req: Request) => boolean;
}

interface WebhookSecurity {
    // Проверка подписи
    verifySignature: (payload: string, signature: string, secret: string) => boolean;
    
    // secret_token для webhook
    secret_token: string;
    
    // IP диапазоны
    allowed_ips: string[];
}
```

### 14.2 Rate Limiting

```typescript
interface RateLimitConfig {
    // Ограничения для бота
    bot_limits: {
        messages_per_second: number;
        messages_per_minute: number;
        messages_per_hour: number;
        messages_per_day: number;
    };
    
    // Ограничения для пользователя
    user_limits: {
        messages_per_minute: number;
        messages_per_hour: number;
    };
    
    // Ограничения для чата
    chat_limits: {
        messages_per_minute: number;
        messages_per_hour: number;
    };
}
```

---

## 15. Rate Limiting (подробно)

### 15.1 Ограничения

```typescript
// Стандартные лимиты для бесплатных ботов
const FREE_BOT_LIMITS = {
    messages_per_second: 30,
    messages_per_minute: 1000,
    messages_per_hour: 10000,
    messages_per_day: 100000,
    callbacks_per_minute: 100,
    inline_per_minute: 50,
    webhooks_per_hour: 100,
};

// Лимиты для премиум ботов
const PREMIUM_BOT_LIMITS = {
    messages_per_second: 100,
    messages_per_minute: 10000,
    messages_per_hour: 100000,
    messages_per_day: 1000000,
    callbacks_per_minute: 1000,
    inline_per_minute: 500,
    webhooks_per_hour: 1000,
};
```

### 15.2 Обработка

```typescript
interface RateLimitResponse {
    success: boolean;
    retry_after?: number;
    limit: number;
    remaining: number;
    reset_at: number;
}

// Headers
interface RateLimitHeaders {
    'X-RateLimit-Limit': number;
    'X-RateLimit-Remaining': number;
    'X-RateLimit-Reset': number;
    'Retry-After': number;  // при 429
}
```

---

## 16. Webhooks и Polling

### 16.1 Webhook

```typescript
interface WebhookConfig {
    url: string;
    secret_token?: string;
    max_connections: number;
    allowed_updates: UpdateType[];
    drop_pending_updates: boolean;
}

interface WebhookInfo {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    last_synchronization_error_date?: number;
    max_connections?: number;
    allowed_updates?: UpdateType[];
}
```

### 16.2 Polling

```typescript
interface PollingConfig {
    timeout: number;  // seconds
    limit: number;    // количество обновлений
    allowed_updates: UpdateType[];
}

interface UpdatesGetParams {
    offset: number;
    limit: number;
    timeout: number;
    allowed_updates: UpdateType[];
}
```

---

## 17. Frontend компоненты

### 17.1 Компоненты React

```tsx
// BotChat - чат с ботом
interface BotChatProps {
    botId: string;
    botName: string;
    botAvatar?: string;
    initialMessages?: Message[];
    onSendMessage?: (text: string, replyMarkup?: ReplyMarkup) => Promise<void>;
    onInlineButtonClick?: (callbackData: string) => Promise<void>;
    onOpenMiniApp?: (appSlug: string, params?: Record<string, string>) => void;
    onOpenGame?: (gameShortName: string) => void;
    onOpenInvoice?: (invoiceUrl: string) => void;
    onFileUpload?: (file: File) => Promise<string>;  // Returns file_id
    onError?: (error: Error) => void;
}

export function BotChat({
    botId,
    botName,
    botAvatar,
    initialMessages,
    onSendMessage,
    onInlineButtonClick,
    onOpenMiniApp,
    onOpenGame,
    onOpenInvoice,
    onFileUpload,
    onError
}: BotChatProps) {
    // ... реализация
}

// MiniAppFrame - фрейм мини-приложения
interface MiniAppFrameProps {
    url: string;
    appId: string;
    
    // Контекст
    botContext?: {
        bot_id: string;
        user_id: string;
        chat_id?: string;
        auth_date: number;
        hash: string;
    };
    
    // Настройки
    fullscreen?: boolean;
    darkMode?: boolean;
    backgroundColor?: string;
    headerColor?: string;
    
    // callbacks
    onReady?: () => void;
    onClose?: () => void;
    onPaymentAuthorized?: (data: PaymentData) => void;
    onInvoiceClosed?: (data: InvoiceClosedData) => void;
    onExpand?: (expanded: boolean) => void;
    onError?: (error: Error) => void;
}

export function MiniAppFrame({
    url,
    appId,
    botContext,
    fullscreen,
    darkMode,
    backgroundColor,
    headerColor,
    onReady,
    onClose,
    onPaymentAuthorized,
    onInvoiceClosed,
    onExpand,
    onError
}: MiniAppFrameProps) {
    // ... реализация
}

// BotInlineKeyboard - инлайн клавиатура
interface BotInlineKeyboardProps {
    buttons: InlineKeyboardButton[][];
    onButtonClick: (button: InlineKeyboardButton) => void;
    loading?: boolean;
}

export function BotInlineKeyboard({ buttons, onButtonClick, loading }: BotInlineKeyboardProps) {
    // ... реализация
}

// BotReplyKeyboard - реплай клавиатура
interface BotReplyKeyboardProps {
    buttons: KeyboardButton[][];
    resize?: boolean;
    oneTime?: boolean;
    placeholder?: string;
    onButtonClick: (button: KeyboardButton) => void;
}

export function BotReplyKeyboard({
    buttons,
    resize,
    oneTime,
    placeholder,
    onButtonClick
}: BotReplyKeyboardProps) {
    // ... реализация
}

// BotMessage - сообщение от бота
interface BotMessageProps {
    message: Message;
    onMediaClick?: (media: MediaItem) => void;
    onPollVote?: (pollId: string, optionIds: number[]) => void;
    onGamePlay?: (gameShortName: string) => void;
    onInvoicePay?: (invoice: Invoice) => void;
}

export function BotMessage({
    message,
    onMediaClick,
    onPollVote,
    onGamePlay,
    onInvoicePay
}: BotMessageProps) {
    // ... реализация
}

// BotList - список ботов для добавления
interface BotListProps {
    category?: string;
    search?: string;
    onBotSelect: (bot: Bot) => void;
    onCreateBot?: () => void;
}

export function BotList({
    category,
    search,
    onBotSelect,
    onCreateBot
}: BotListProps) {
    // ... реализация
}

// BotProfile - профиль бота
interface BotProfileProps {
    bot: Bot;
    isOwner: boolean;
    isSubscribed: boolean;
    onSubscribe?: () => void;
    onUnsubscribe?: () => void;
    onMessage?: () => void;
    onShare?: () => void;
    onSettings?: () => void;  // для владельца
    onEdit?: () => void;      // для владельца
    onAnalytics?: () => void; // для владельца
}

export function BotProfile({
    bot,
    isOwner,
    isSubscribed,
    onSubscribe,
    onUnsubscribe,
    onMessage,
    onShare,
    onSettings,
    onEdit,
    onAnalytics
}: BotProfileProps) {
    // ... реализация
}
```

### 17.2 Хуки

```tsx
// useBot - управление ботом
function useBot(botId: string) {
    const [bot, setBot] = useState<Bot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    
    const refresh = async () => { /* ... */ };
    const updateSettings = async (settings: Partial<Bot>) => { /* ... */ };
    const enable = async () => { /* ... */ };
    const disable = async () => { /* ... */ };
    
    return { bot, loading, error, refresh, updateSettings, enable, disable };
}

// useBotMessages - сообщения бота
function useBotMessages(botId: string, chatId: string) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    
    const loadMore = async () => { /* ... */ };
    const sendMessage = async (text: string, replyMarkup?: ReplyMarkup) => { /* ... */ };
    const editMessage = async (messageId: string, text: string) => { /* ... */ };
    const deleteMessage = async (messageId: string) => { /* ... */ };
    
    return { messages, loading, hasMore, loadMore, sendMessage, editMessage, deleteMessage };
}

// useBotCommands - команды бота
function useBotCommands(botId: string) {
    const [commands, setCommands] = useState<BotCommand[]>([]);
    
    const addCommand = async (command: BotCommand) => { /* ... */ };
    const updateCommand = async (id: string, command: Partial<BotCommand>) => { /* ... */ };
    const deleteCommand = async (id: string) => { /* ... */ };
    const reorderCommands = async (ids: string[]) => { /* ... */ };
    
    return { commands, addCommand, updateCommand, deleteCommand, reorderCommands };
}

// useBotSubscriptions - подписки на бота
function useBotSubscriptions(botId: string) {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [stats, setStats] = useState<SubscriptionStats>({});
    
    const subscribe = async (planId?: string) => { /* ... */ };
    const unsubscribe = async () => { /* ... */ };
    const cancelSubscription = async () => { /* ... */ };
    
    return { subscriptions, stats, subscribe, unsubscribe, cancelSubscription };
}

// useMiniApps - мини-приложения
function useMiniApps(ownerId?: string) {
    const [apps, setApps] = useState<MiniApp[]>([]);
    const [loading, setLoading] = useState(true);
    
    const createApp = async (app: CreateMiniAppInput) => { /* ... */ };
    const updateApp = async (id: string, data: Partial<MiniApp>) => { /* ... */ };
    const deleteApp = async (id: string) => { /* ... */ };
    const publishApp = async (id: string) => { /* ... */ };
    
    return { apps, loading, createApp, updateApp, deleteApp, publishApp };
}

// useBotAnalytics - аналитика
function useBotAnalytics(botId: string, period: 'day' | 'week' | 'month') {
    const [analytics, setAnalytics] = useState<BotAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    
    const refresh = async () => { /* ... */ };
    
    return { analytics, loading, refresh };
}

// useWebhook - webhook настройки
function useWebhook(botId: string) {
    const [webhook, setWebhook] = useState<WebhookConfig | null>(null);
    const [loading, setLoading] = useState(true);
    
    const setWebhook = async (url: string, secret?: string) => { /* ... */ };
    const deleteWebhook = async () => { /* ... */ };
    const testWebhook = async () => { /* ... */ };
    
    return { webhook, loading, setWebhook, deleteWebhook, testWebhook };
}
```

### 17.3 API Сервисы

```typescript
// botApi.ts
class BotAPI {
    private baseUrl: string;
    private token: string;
    
    // Сообщения
    async sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<Message>;
    async editMessageText(chatId: string, messageId: string, text: string, options?: EditOptions): Promise<Message | boolean>;
    async deleteMessage(chatId: string, messageId: string): Promise<boolean>;
    async forwardMessage(chatId: string, fromChatId: string, messageId: string): Promise<Message>;
    
    // Медиа
    async sendPhoto(chatId: string, photo: string | InputFile, options?: SendMediaOptions): Promise<Message>;
    async sendVideo(chatId: string, video: string | InputFile, options?: SendMediaOptions): Promise<Message>;
    async sendDocument(chatId: string, document: string | InputFile, options?: SendMediaOptions): Promise<Message>;
    async sendSticker(chatId: string, sticker: string | InputFile): Promise<Message>;
    
    // Клавиатуры
    async sendKeyboard(chatId: string, text: string, keyboard: ReplyMarkup): Promise<Message>;
    async answerCallback(callbackId: string, text?: string, showAlert?: boolean): Promise<boolean>;
    
    // Inline
    async answerInlineQuery(inlineQueryId: string, results: InlineResult[], cacheTime?: number): Promise<boolean>;
    
    // Платежи
    async sendInvoice(chatId: string, invoice: Invoice, keyboard?: InlineKeyboardMarkup): Promise<Message>;
    async answerShippingQuery(shippingQueryId: string, ok: boolean, options?: ShippingOptions): Promise<boolean>;
    async answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<boolean>;
    
    // Управление
    async getMe(): Promise<User>;
    async getChat(chatId: string): Promise<Chat>;
    async getChatMember(chatId: string, userId: string): Promise<ChatMember>;
    
    // Команды
    async setMyCommands(commands: BotCommand[]): Promise<boolean>;
    async getMyCommands(): Promise<BotCommand[]>;
    
    // Webhook
    async setWebhook(url: string, options?: WebhookOptions): Promise<boolean>;
    async deleteWebhook(): Promise<boolean>;
    async getWebhookInfo(): Promise<WebhookInfo>;
}
```

---

## 18. Интеграция с чатами

### 18.1 Расширение системы папок

```typescript
// Добавить в useChatFolders.ts
export type ChatFolderItemKind = "dm" | "group" | "channel" | "bot" | "mini_app" | "game";

// Новые системные папки
const SYSTEM_FOLDERS: ChatFolder[] = [
    { id: "all", name: "Все", system_kind: "all", sort_order: -400 },
    { id: "personal", name: "Личные", system_kind: "chats", sort_order: -399 },
    { id: "groups", name: "Группы", system_kind: "groups", sort_order: -398 },
    { id: "channels", name: "Каналы", system_kind: "channels", sort_order: -397 },
    { id: "bots", name: "Боты", system_kind: "bots", sort_order: -396 },  // НОВАЯ
    { id: "mini_apps", name: "Приложения", system_kind: "mini_apps", sort_order: -395 }, // НОВАЯ
];
```

### 18.2 Интеграция с ChatsPage

```tsx
// Добавление вкладки "Боты" в ChatsPage
function ChatsPage() {
    const { folders, itemsByFolderId, activeTabId, setActiveTabId } = useChatFolders();
    
    // Новые системные папки
    const systemFolders = useMemo(() => [
        ...folders.filter(f => f.system_kind === 'all'),
        ...folders.filter(f => f.system_kind === 'chats'),
        ...folders.filter(f => f.system_kind === 'groups'),
        ...folders.filter(f => f.system_kind === 'channels'),
        ...folders.filter(f => f.system_kind === 'bots'),    // НОВАЯ
        ...folders.filter(f => f.system_kind === 'mini_apps'), // НОВАЯ
    ], [folders]);
    
    // При выборе папки "Боты" - показать ботов
    const activeFolder = folders.find(f => f.id === activeTabId);
    const showBots = activeFolder?.system_kind === 'bots';
    
    return (
        <div className="chats-page">
            <FolderTabs folders={systemFolders} />
            
            {showBots ? (
                <BotChatList />
            ) : (
                <ChatList />
            )}
        </div>
    );
}

// Компонент для списка ботов
function BotChatList() {
    const { bots, loading } = useUserBots();
    const { createConversation } = useCreateConversation();
    
    return (
        <div className="bot-list">
            {bots.map(bot => (
                <BotChatItem
                    key={bot.id}
                    bot={bot}
                    onClick={() => createConversation({ type: 'bot', bot_id: bot.id })}
                />
            ))}
            
            <AddBotButton />
        </div>
    );
}
```

---

## 19. Дополнительные функции

### 19.1 Автоответчик

```typescript
// AI-powered автоответчик для ботов
interface AutoReply {
    id: string;
    bot_id: string;
    name: string;
    
    // Триггеры
    triggers: {
        type: 'keyword' | 'regex' | 'ai' | 'always';
        value?: string;
    }[];
    
    // Ответ
    response: {
        type: 'text' | 'media' | 'command' | 'ai';
        content: string;
        media_url?: string;
    }[];
    
    // Условия
    conditions: {
        user_status?: 'new' | 'existing' | 'subscribed';
        time_range?: { start: string; end: string };
        day_of_week?: number[];
    };
    
    // Статистика
    stats: {
        triggered_count: number;
        success_count: number;
    };
}
```

### 19.2 Рассылки

```typescript
// Массовые рассылки для ботов
interface Broadcast {
    id: string;
    bot_id: string;
    name: string;
    
    // Аудитория
    audience: {
        type: 'all' | 'segment' | 'filter';
        segment_id?: string;
        filters?: Filter[];
    };
    
    // Контент
    content: {
        type: 'text' | 'media' | 'template';
        text?: string;
        media?: MediaItem[];
        template_id?: string;
        keyboard?: InlineKeyboardMarkup;
    };
    
    // Расписание
    schedule?: {
        type: 'now' | 'scheduled' | 'recurring';
        send_at?: Date;
        recurring?: {
            interval: 'daily' | 'weekly' | 'monthly';
            time: string;
            day_of_week?: number;
            day_of_month?: number;
        };
    };
    
    // Статистика
    stats: {
        total: number;
        sent: number;
        delivered: number;
        read: number;
        failed: number;
        clicked: number;
    };
    
    status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
}
```

### 19.3 Чат-боты (AI)

```typescript
// AI чат-бот с интеграцией LLM
interface AIChatbot {
    id: string;
    bot_id: string;
    
    // AI провайдер
    provider: 'openai' | 'anthropic' | 'cohere' | 'custom';
    model: string;
    api_key: string;
    
    // Промпт
    system_prompt: string;
    context_messages: number;
    
    // Настройки генерации
    generation: {
        temperature: number;
        max_tokens: number;
        top_p: number;
    };
    
    // Ограничения
    limits: {
        messages_per_day: number;
        tokens_per_day: number;
        cost_per_1k_tokens: number;
    };
    
    // Память
    memory: {
        type: 'none' | 'context_window' | 'vector_store';
        vector_store_id?: string;
    };
}
```

### 19.4 Каналы и группы

```typescript
// Публикация в каналах от имени бота
interface ChannelPost {
    id: string;
    bot_id: string;
    channel_id: string;
    
    content: {
        text?: string;
        media?: MediaItem[];
        keyboard?: InlineKeyboardMarkup;
    };
    
    // Отправка
    send_options: {
        send_as_channel: boolean;
        signature?: string;
        disable_notification: boolean;
    };
    
    // Статистика
    stats: {
        views: number;
        forwards: number;
        reactions: number;
    };
}

// Автопостинг из RSS/Atom
interface RSSFeed {
    id: string;
    bot_id: string;
    channel_id: string;
    
    feed_url: string;
    title: string;
    
    // Фильтры
    filters: {
        keywords_include?: string[];
        keywords_exclude?: string[];
        max_age_hours?: number;
    };
    
    // Форматирование
    template: {
        format: 'title_only' | 'title_description' | 'custom';
        template?: string;
        include_link: boolean;
        link_preview: boolean;
    };
    
    // Расписание
    check_interval_minutes: number;
    last_check_at: Date;
    
    status: 'active' | 'paused' | 'error';
}
```

### 19.5 Кнопка меню бота

```typescript
// Menu button в чате
interface MenuButton {
    type: 'commands' | 'web_app' | 'default';
    text?: string;
    web_app?: WebAppInfo;
}

// Команды меню (для menu_button_type = commands)
interface BotMenuCommand {
    command: string;
    description: string;
}
```

### 19.6 Deep Linking

```typescript
// Deep links для ботов
interface DeepLink {
    // URL: https://faser.ru/bot/username?start=param
    // или: faser://open?bot=username&start=param
    
    // Параметры
    bot_username: string;
    start_param?: string;
    game_short_name?: string;
    
    // Обработка
    onStart: (param: string) => void;
    onGameSelect: (game: string) => void;
}
```

### 19.7 Диплинки для Mini Apps

```typescript
// Deep links для мини-приложений
interface MiniAppDeepLink {
    // URL: https://faser.ru/app/slug?start=param
    app_slug: string;
    start_param?: string;
    
    // Контекст
    bot_username?: string;
    user_id?: string;
}
```

---

## 20. API аутентификация

### 20.1 Типы токенов

```typescript
// Пользовательский токен (для владельцев ботов)
interface UserToken {
    type: 'user';
    user_id: string;
    permissions: ('bot:create' | 'bot:manage' | 'bot:analytics' | 'payment:manage')[];
    expires_at?: Date;
}

// Токен бота
interface BotToken {
    type: 'bot';
    bot_id: string;
    permissions: string[];
    ip_whitelist?: string[];
    expires_at?: Date;
}

// Токен Mini App
interface MiniAppToken {
    type: 'mini_app';
    app_id: string;
    user_id: string;
    chat_id?: string;
    permissions: string[];
    expires_at?: Date;
}

// Platform токен (для Mini App)
interface PlatformToken {
    type: 'platform';
    mini_app_id: string;
    user_id: string;
    chat_id?: string;
    signature: string;
    auth_date: number;
}
```

---

## 21. Примеры интеграции

### 21.1 Пример создания бота

```javascript
// API вызов
const response = await fetch('/api/bots', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        display_name: 'Мой Бот',
        description: 'Полезный бот для управления задачами',
        username: 'faser_my_task_bot',
        can_join_groups: true,
        can_read_all_group_messages: false
    })
});

const bot = await response.json();
// {
//   "id": "bot_uuid",
//   "username": "faser_my_task_bot",
//   "token": "12345:ABCDefGhiJklMnop",
//   "api_url": "https://api.faser.ru"
// }
```

### 21.2 Пример отправки сообщения

```javascript
const botApi = new BotAPI(botToken);

await botApi.sendMessage(chatId, 'Привет! Выберите действие:', {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '📝 Задачи', callback_data: 'tasks_list' },
                { text: '➕ Новая задача', callback_data: 'task_create' }
            ],
            [
                { text: '⚙️ Настройки', callback_data: 'settings' },
                { text: '🎮 Играть', web_app: { url: 'https://mygame.faser.ru' } }
            ]
        ]
    }
});
```

### 21.3 Пример Mini App

```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body>
    <h1 id="username"></h1>
    <button id="sendData">Отправить данные боту</button>
    
    <script>
        const tg = Telegram.WebApp;
        
        // Инициализация
        tg.ready();
        
        // Получить данные пользователя
        const initData = tg.initDataUnsafe;
        document.getElementById('username').textContent = 
            initData.user?.first_name || 'User';
        
        // Отправить данные
        document.getElementById('sendData').onclick = () => {
            tg.sendData(JSON.stringify({
                action: 'save_data',
                data: { key: 'value' }
            }));
        };
        
        // Haptic feedback
        tg.HapticFeedback.impactOccurred('medium');
    </script>
</body>
</html>
```

---

## 22. Рекомендации по реализации

### 22.1 Порядок реализации

| Приоритет | Компонент | Описание |
|-----------|-----------|----------|
| P0 | Bot API Core | Базовые методы: getMe, sendMessage, webhook |
| P0 | База данных | Все таблицы и миграции |
| P1 | Inline keyboards | Кнопки с callback_data |
| P1 | Медиа | Отправка фото, видео, документов |
| P1 | Команды | setMyCommands, getMyCommands |
| P2 | Платежи | Базовая интеграция Stripe/ЮKassa |
| P2 | Mini Apps | Фрейм и базовый API |
| P3 | Inline mode | Поиск ботов в чате |
| P3 | Аналитика | Статистика использования |
| P4 | Игры | Простые игры |
| P4 | AI чат-боты | Интеграция с LLM |
| P5 | Бизнес | Расширенные бизнес-функции |

### 22.2 Масштабирование

- **Шардирование**: По bot_id для таблицы сообщений
- **Кэширование**: Redis для частых запросов (getMe, commands)
- **Очереди**: Redis/RabbitMQ для отправки сообщений
- **WebSocket**: Для real-time обновлений в mini apps
- **CDN**: Для медиафайлов

### 22.3 Мониторинг

- Логирование всех запросов
- Метрики latency и error rate
- Alerting на аномалии
- Трассировка запросов (OpenTelemetry)

---

## 23. Безопасность

### 23.1 Checklist

- [ ] HTTPS для всех endpoints
- [ ] Rate limiting на всех endpoints
- [ ] Валидация входящих данных
- [ ] Sanitization HTML в сообщениях
- [ ] CSP для Mini Apps
- [ ] Логирование действий
- [ ] Аудит безопасности
- [ ] Bug bounty программа

---

*Спецификация создана: 2026-02-28*
*Версия: 1.0*
