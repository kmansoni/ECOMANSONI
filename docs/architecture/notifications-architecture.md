# Архитектура системы уведомлений — Mansoni

## 1. Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    FRONTEND (React)                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  NotificationsPage │  │ NotificationItem │  │ NotificationBadge │                   │
│  │  (страница)      │  │  (элемент)       │  │  (бейдж счётчика) │                   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘                     │
│  ┌────────────────────────────────┐  ┌─────────────────────────────────────────┐        │
│  │    notificationFiltersModel    │  │    notificationGroupingModel           │        │
│  │    (фильтрация: you/following) │  │    (группировка Instagram-style)        │        │
│  └────────────────────────────────┘  └─────────────────────────────────────────┘        │
│  ┌──────────────────┐  ┌──────────────────────────────────────────────────────────┐    │
│  │ useNotifications │  │  useUnifiedCounterStore (Zustand)                       │    │
│  │  (hooks)         │  │  — notificationsUnread, decrementNotifications()        │    │
│  └──────────────────┘  └──────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────┐  ┌────────────────────────────────────────────┐     │
│  │  lib/push/serviceWorker.ts    │  │  public/sw.js (Service Worker Push)        │     │
│  │  — initPushNotifications()    │  │  — showNotification, notificationclick     │     │
│  └────────────────────────────────┘  └────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    BACKEND (Supabase)                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              TABLES                                              │   │
│  ├─────────────────────────────────────────────────────────────────────────────────┤   │
│  │  notifications              — пользовательские in-app уведомления (лента)      │   │
│  │  notification_settings      — настройки (likes, comments, follows...)          │   │
│  │  notification_exceptions    — исключения по контактам/группам                  │   │
│  │  notification_category_settings — категории уведомлений                        │   │
│  │  notification_schedules     — расписание (quiet hours)                         │   │
│  │  device_tokens              — токены устройств (APNs/FCM)                      │   │
│  │  notification_events        — события для push-роутера                         │   │
│  │  notification_deliveries    — лог доставки push                                │   │
│  │  push_tokens                — web push токены                                  │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                         EDGE FUNCTIONS                                           │   │
│  ├─────────────────────────────────────────────────────────────────────────────────┤   │
│  │  login-notify/           — уведомления о входе (security)                      │   │
│  │  taxi-notifications/    — уведомления такси (status change)                    │   │
│  │  live-vod-process/      — уведомления стримерам                                 │   │
│  │  live-reminder-notify/  — напоминания о трансляциях                            │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                      POSTGRES FUNCTIONS (RPC)                                    │   │
│  ├─────────────────────────────────────────────────────────────────────────────────┤   │
│  │  enqueue_notification_event()   — создание события для роутера                 │   │
│  │  claim_notification_events()    — claim событий (FOR UPDATE SKIP LOCKED)       │   │
│  │  upsert_device_token()          — регистрация устройства                       │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼ HTTP REST
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SERVICES                                             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                 notification-router (Node.js + BullMQ + Redis)                  │   │
│  ├─────────────────────────────────────────────────────────────────────────────────┤   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │   │
│  │  │  routing/    │  │  routing/    │  │  routing/    │  │  handlers/   │        │   │
│  │  │  audience.ts │  │  dedup.ts    │  │  collapse.ts │  │  message.ts  │        │   │
│  │  │  (аудитория) │  │  (дедуплик.) │  │  (группиров.)│  │  incomingCall│        │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────────────┐   │   │
│  │  │  providers/  │  │  providers/  │  │  queue.ts (BullMQ)                   │   │   │
│  │  │  fcm.ts      │  │  apns.ts     │  │  — notif:high (calls)                │   │   │
│  │  │  (Android)   │  │  (iOS)       │  │  — notif:normal (messages)           │   │   │
│  │  └──────────────┘  └──────────────┘  │  — notif:low (digests)               │   │   │
│  │                                      └──────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────┐  ┌────────────────────────────────────────────────────┐    │
│  │  FCM (Firebase Cloud   │  │  APNs (Apple Push Notification service)           │    │
│  │  Messaging)            │  │                                                    │    │
│  └────────────────────────┘  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. База данных — схема таблиц

### 2.1 Core Tables

```sql
-- =====================================================
-- notifications — пользовательские in-app уведомления
-- =====================================================
CREATE TABLE public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,  -- like, comment, follow, mention, story_reaction, live, dm, system
  title           TEXT,
  body            TEXT NOT NULL,
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type     TEXT,            -- post, reel, story, comment, profile
  target_id       UUID,
  data            JSONB DEFAULT '{}',
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE NOT is_read;

-- RLS: пользователь видит только свои уведомления
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON notifications 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON notifications 
  FOR UPDATE USING (auth.uid() = user_id);
```

### 2.2 Device Tokens (Push)

```sql
-- =====================================================
-- device_tokens — токены устройств для Push
-- =====================================================
CREATE TABLE public.device_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  provider        TEXT NOT NULL CHECK (provider IN ('apns', 'fcm')),
  token           TEXT NOT NULL,
  app_build       INTEGER,
  app_version     TEXT,
  locale          TEXT,
  timezone        TEXT,
  last_seen_at    TIMESTAMPTZ,
  is_valid        BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  call_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,  -- отдельный флаг для звонков
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider, token),
  UNIQUE(user_id, device_id)
);

CREATE INDEX idx_device_tokens_user_valid 
  ON device_tokens(user_id, is_valid, push_enabled);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_tokens_select_own" ON device_tokens 
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "device_tokens_insert_own" ON device_tokens 
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "device_tokens_update_own" ON device_tokens 
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "device_tokens_service_role_all" ON device_tokens 
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
```

### 2.3 Notification Events (Queue)

```sql
-- =====================================================
-- notification_events — очередь для notification-router
-- =====================================================
CREATE TABLE public.notification_events (
  event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('message', 'incoming_call', 'security')),
  status          TEXT NOT NULL DEFAULT 'pending' 
                  CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 0 AND 9),
  -- 0-3: low (digests), 4-6: normal, 7-9: high (calls, security)
  collapse_key    TEXT,        -- группировка для Android
  dedup_key       TEXT,        -- дедупликация
  ttl_seconds     INTEGER NOT NULL DEFAULT 60 CHECK (ttl_seconds BETWEEN 1 AND 86400),
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  last_error      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_events_claim 
  ON notification_events(status, available_at, priority DESC, created_at ASC);
CREATE INDEX idx_notification_events_user_created 
  ON notification_events(user_id, created_at DESC);

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_events_service_role_all" ON notification_events 
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
```

### 2.4 Delivery Log

```sql
-- =====================================================
-- notification_deliveries — лог доставки push
-- =====================================================
CREATE TABLE public.notification_deliveries (
  delivery_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES notification_events(event_id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  provider        TEXT NOT NULL CHECK (provider IN ('apns', 'fcm')),
  status          TEXT NOT NULL 
                  CHECK (status IN ('queued', 'sent', 'failed', 'invalid_token', 'dropped')),
  attempts        INTEGER NOT NULL DEFAULT 1,
  provider_message_id TEXT,
  error_code      TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_deliveries_event 
  ON notification_deliveries(event_id, created_at DESC);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_deliveries_service_role_all" ON notification_deliveries 
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
```

### 2.5 User Settings

```sql
-- =====================================================
-- notification_settings — настройки пользователя
-- =====================================================
CREATE TABLE public.notification_settings (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  likes                 BOOLEAN DEFAULT true,
  comments              BOOLEAN DEFAULT true,
  follows               BOOLEAN DEFAULT true,
  mentions              BOOLEAN DEFAULT true,
  story_reactions       BOOLEAN DEFAULT true,
  live_notifications    BOOLEAN DEFAULT true,
  dm_notifications      BOOLEAN DEFAULT true,
  push_notifications    BOOLEAN DEFAULT true,
  pause_all             BOOLEAN DEFAULT false,
  pause_until           TIMESTAMPTZ
);
-- + расширенные колонки из 20260219210000:
-- notif_sound_id, notif_vibrate, notif_show_text, notif_show_sender

-- =====================================================
-- notification_exceptions — исключения по контактам
-- =====================================================
CREATE TABLE public.notification_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id       UUID NOT NULL,  -- user_id или conversation_id
  target_type     TEXT NOT NULL,  -- 'user' | 'conversation'
  level           TEXT NOT NULL DEFAULT 'all' 
                  CHECK (level IN ('all', 'mentions', 'muted')),
  mute_until      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, target_id, target_type)
);

-- =====================================================
-- notification_schedules — расписание (quiet hours)
-- =====================================================
CREATE TABLE public.notification_schedules (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled         BOOLEAN DEFAULT true,
  start_time      TEXT NOT NULL DEFAULT '22:00',  -- HH:MM
  end_time        TEXT NOT NULL DEFAULT '08:00',
  override_mentions BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Backend — RPC Functions

### 3.1 Enqueue Notification

```sql
CREATE OR REPLACE FUNCTION public.enqueue_notification_event(
  p_type          TEXT,
  p_user_id       UUID,
  p_payload       JSONB,
  p_priority      INTEGER DEFAULT 5,
  p_ttl_seconds   INTEGER DEFAULT 60,
  p_collapse_key  TEXT DEFAULT NULL,
  p_dedup_key     TEXT DEFAULT NULL,
  p_max_attempts  INTEGER DEFAULT 5
)
RETURNS public.notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.notification_events;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'enqueue_notification_event requires service_role';
  END IF;
  
  INSERT INTO public.notification_events (
    type, status, user_id, payload, priority, ttl_seconds, 
    collapse_key, dedup_key, max_attempts
  )
  VALUES (
    p_type, 'pending', p_user_id, p_payload, p_priority, p_ttl_seconds,
    p_collapse_key, p_dedup_key, p_max_attempts
  )
  RETURNING * INTO v_row;
  
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification_event(...) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_event(...) TO service_role;
```

### 3.2 Claim Events (for Worker)

```sql
CREATE OR REPLACE FUNCTION public.claim_notification_events(p_limit INTEGER DEFAULT 100)
RETURNS SETOF public.notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'claim_notification_events requires service_role';
  END IF;
  
  RETURN QUERY
  WITH picked AS (
    SELECT ne.event_id
    FROM public.notification_events ne
    WHERE ne.status = 'pending'
      AND ne.available_at <= NOW()
    ORDER BY ne.priority DESC, ne.created_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_events ne
  SET status = 'processing',
      attempts = ne.attempts + 1,
      updated_at = NOW()
  FROM picked
  WHERE ne.event_id = picked.event_id
  RETURNING ne.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_events(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_events(INTEGER) TO service_role;
```

### 3.3 Upsert Device Token

```sql
CREATE OR REPLACE FUNCTION public.upsert_device_token(
  p_device_id     TEXT,
  p_platform      TEXT,
  p_provider      TEXT,
  p_token         TEXT,
  p_app_build     INTEGER DEFAULT NULL,
  p_app_version   TEXT DEFAULT NULL,
  p_locale        TEXT DEFAULT NULL,
  p_timezone      TEXT DEFAULT NULL
)
RETURNS public.device_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_id UUID; v_row public.device_tokens;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'upsert_device_token requires authenticated user';
  END IF;
  
  INSERT INTO public.device_tokens (
    user_id, device_id, platform, provider, token,
    app_build, app_version, locale, timezone, 
    last_seen_at, is_valid, updated_at
  )
  VALUES (
    v_user_id, p_device_id, p_platform, p_provider, p_token,
    p_app_build, p_app_version, p_locale, p_timezone,
    NOW(), TRUE, NOW()
  )
  ON CONFLICT (user_id, device_id)
  DO UPDATE SET
    platform = EXCLUDED.platform,
    provider = EXCLUDED.provider,
    token = EXCLUDED.token,
    app_build = EXCLUDED.app_build,
    app_version = EXCLUDED.app_version,
    locale = EXCLUDED.locale,
    timezone = EXCLUDED.timezone,
    last_seen_at = NOW(),
    is_valid = TRUE,
    updated_at = NOW()
  RETURNING * INTO v_row;
  
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_device_token(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_device_token(...) TO authenticated, service_role;
```

---

## 4. Frontend — Компоненты и хуки

### 4.1 Структура файлов

```
src/
├── pages/
│   ├── NotificationsPage.tsx          # главная страница уведомлений
│   └── NotificationSettingsPage.tsx   # настройки
│
├── components/notifications/
│   ├── NotificationItem.tsx           # элемент уведомления (swipe-to-delete)
│   ├── NotificationBadge.tsx          # бейдж на иконке
│   ├── NotificationFilters.tsx        # табы "Ты" / "Подписки"
│   ├── NotificationGrouping.tsx       # группировка
│   ├── NotificationsDrawer.tsx        # drawer (быстрый просмотр)
│   ├── notificationFiltersModel.ts    # логика фильтрации
│   └── notificationGroupingModel.ts   # логика группировки
│
├── hooks/
│   ├── useNotifications.ts            # основной hook
│   ├── useLoginNotifications.ts       # login events
│   ├── useChatNotifications.ts        # chat events
│   └── useNotificationPreferences.tsx # настройки
│
├── lib/push/
│   ├── serviceWorker.ts               # регистрация SW, подписка
│   ├── autoRegister.ts                # авто-регистрация
│   └── deviceTokens.ts                # управление токенами
│
├── stores/
│   └── useUnifiedCounterStore.ts      # счётчик unread
│
└── components/layout/
    └── BottomNav.tsx                  # навигация с badge
```

### 4.2 Типы (useNotifications.ts)

```typescript
export interface Notification {
  id: string;
  user_id: string;
  type: "like" | "comment" | "follow" | "mention" | "story_reaction" | "live" | "dm" | "system";
  title?: string;
  body: string;
  actor_id?: string;
  target_type?: "post" | "reel" | "story" | "comment" | "profile";
  target_id?: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  actor?: {
    display_name: string;
    avatar_url: string | null;
    username?: string;
  };
}

export interface NotificationSettings {
  user_id?: string;
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  story_reactions: boolean;
  live_notifications: boolean;
  dm_notifications: boolean;
  pause_all: boolean;
  pause_until?: string | null;
}
```

---

## 5. notification-router — Сервис доставки

### 5.1 Архитектура Worker

```
┌─────────────────────────────────────────────────────────────┐
│            notification-router (Node.js)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   [Claim Loop] ──────► [Queue (BullMQ + Redis)]             │
│        │                    │                               │
│        │                    ├── notif:high (priority=7-9)   │
│        │                    │   • incoming_call             │
│        │                    │   • security                  │
│        │                    │                               │
│        │                    ├── notif:normal (priority=4-6) │
│        │                    │   • message                   │
│        │                    │                               │
│        │                    └── notif:low (priority=0-3)    │
│        │                        • digests                   │
│        │                        • batched                   │
│        ▼                                                ▼   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  processEvent()                      │   │
│   │  1. isExpired() → finalize(failed, expired)          │   │
│   │  2. getDeviceTokens() → selectAudience()             │   │
│   │  3. dedupHit() → skip if duplicate                   │   │
│   │  4. deliverToDevice() → FCM/APNs                     │   │
│   │  5. insertDeliveries() → log                         │   │
│   │  6. finalizeEvent() → delivered/failed/retry         │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Priority Mapping

| Priority | Queue      | Event Types           | TTL    | Max Attempts |
|----------|------------|----------------------|--------|--------------|
| 7-9      | notif:high | incoming_call, security | 30s    | 10           |
| 4-6      | notif:normal | message            | 60s    | 5            |
| 0-3      | notif:low  | digest, batch       | 3600s  | 3            |

### 5.3 Retry Policy (exponential backoff)

```typescript
// routing/policy.ts
export function computeRetryDelayMs(attempts: number): number {
  // attempts: 1 → 1s, 2 → 2s, 3 → 4s, 4 → 8s, 5 → 16s
  return Math.min(1000 * Math.pow(2, attempts - 1), 30000);
}
```

---

## 6. Push Payload Contracts

### 6.1 Message Push

```typescript
interface MessagePushPayload {
  v: 1;
  kind: "message";
  messageId: string;
  chatId: string;
  senderId: string;
  preview: {
    title: string;       // "Alice"
    body: string;        // "Check out this link"
    hasMedia?: boolean;
  };
  deeplink: {
    path: "/chat";
    params: { chatId: string; messageId?: string };
  };
}
```

### 6.2 Incoming Call Push

```typescript
interface IncomingCallPushPayload {
  v: 1;
  kind: "incoming_call";
  callId: string;
  roomId: string;
  callerId: string;
  calleeId: string;
  media: "audio" | "video";
  createdAtMs: number;
  expiresAtMs: number;
  security: {
    tokenHint: "supabase_jwt" | "opaque";
    joinToken?: string;
  };
  deeplink: {
    path: "/call";
    params: { callId: string };
  };
}
```

### 6.3 Security Push

```typescript
interface SecurityPushPayload {
  v: 1;
  kind: "security";
  event: "new_login" | "session_revoked" | "device_removed";
  deviceId?: string;
  ip?: string;
  city?: string;
  createdAtMs: number;
  deeplink: {
    path: "/settings/security";
    params?: Record<string, string>;
  };
}
```

---

## 7. Безопасность (RLS)

### 7.1 Принципы

1. **service_role только для системных операций** — создание событий, claim, upsert токенов
2. **authenticated для пользовательских операций** — чтение уведомлений, регистрация устройств
3. **Анонимные НЕ имеют доступа** — все операции требуют авторизации

### 7.2 Политики

```sql
-- notifications: только своё
CREATE POLICY "Users read own notifications" ON notifications 
  FOR SELECT USING (auth.uid() = user_id);

-- device_tokens: только своё + service_role полный доступ
CREATE POLICY "device_tokens_service_role_all" ON device_tokens 
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- notification_events: ТОЛЬКО service_role
-- (пользователи не должны видеть внутренние события)

-- notification_deliveries: ТОЛЬКО service_role
-- (детали доставки — внутренняя информация)
```

---

## 8. Event Flow

### 8.1 Инициирование (Edge Function)

```typescript
// supabase/functions/taxi-notifications/index.ts
await db.from("notifications").insert({
  user_id: passengerId,
  type: "system",
  body: `Водитель в пути. Прибудет через ${eta} мин`,
  target_type: "trip",
  target_id: tripId,
});

// Push event для notification-router
await supabase.rpc("enqueue_notification_event", {
  p_type: "message",
  p_user_id: passengerId,
  p_payload: {
    kind: "message",
    tripId,
    preview: { title: "Такси", body: "Водитель в пути" },
    deeplink: { path: "/taxi/trip", params: { tripId } }
  },
  p_priority: 5,
  p_ttl_seconds: 300
});
```

### 8.2 Доставка (notification-router)

```typescript
// services/notification-router/src/index.ts
// 1. Claim events from DB
const events = await db.claimEvents(100);

// 2. Enqueue to BullMQ
for (const event of events) {
  await enqueueEvent(queues, event);
}

// 3. Process (worker)
async function processEvent(event) {
  const devices = await db.getDeviceTokens(event.userId);
  
  for (const device of devices) {
    const result = device.provider === "apns" 
      ? await sendApns(config, { token: device.token, ... })
      : await sendFcm(config, { token: device.token, ... });
    
    await db.insertDeliveries([result]);
  }
  
  await db.finalizeEvent(event.eventId, "delivered");
}
```

---

## 9. Группировка и фильтрация (Frontend)

### 9.1 Фильтры

```typescript
// notificationFiltersModel.ts
type NotificationFilterType = "all" | "you" | "following";

// "you" — уведомления направленные пользователю
const YOU_TYPES = new Set(["like", "comment", "follow", "mention", "story_reaction", "dm", "system"]);

// "following" — активность от подписок
function isFromFollowing(n): boolean {
  return n.data?.from_following === true || n.type === "live";
}
```

### 9.2 Группировка Instagram-style

```typescript
// notificationFiltersModel.ts
const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

// "Alice and 47 others liked your post"
function buildGroupSummary(group): string {
  const { actorCount, actorNames, representative } = group;
  
  if (actorCount === 1) return `${actorNames[0]} лайкнул ваш пост`;
  if (actorCount === 2) return `${actorNames[0]} и ${actorNames[1]} лайкнули`;
  return `${actorNames[0]} и ещё ${actorCount - 1} лайкнули`;
}
```

---

## 10. Сводка по компонентам

| Компонент | Ответственность | Файлы |
|-----------|----------------|-------|
| **Frontend UI** | Рендеринг, фильтрация, группировка | `NotificationsPage.tsx`, `NotificationItem.tsx`, `NotificationFilters.tsx` |
| **Frontend State** | Управление состоянием, API | `useNotifications.ts`, `useUnifiedCounterStore.ts` |
| **Frontend Push** | Регистрация Service Worker, подписка | `lib/push/serviceWorker.ts` |
| **Supabase DB** | Хранение, RLS, RPC | `notifications`, `device_tokens`, `notification_events`, `notification_deliveries` |
| **Edge Functions** | Бизнес-логика создания уведомлений | `login-notify/`, `taxi-notifications/`, `live-reminder-notify/` |
| **notification-router** | Доставка push (FCM/APNS), retry, dedup | `services/notification-router/` |

---

## 11. TODO — что нужно доработать

1. **notification_events policy** — добавить возможность фильтрации для аналитики
2. **email-router** — интеграция с email-уведомлениями (уже есть в `services/email-router/`)
3. **notification_deliveries cleanup** — периодическая очистка старых записей
4. **analytics** — метрики доставки, открытий, click-through rate
5. **quiet hours** — реальное применение `notification_schedules` при отправке