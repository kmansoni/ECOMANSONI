---
name: push-notification-architect
description: "Архитектура push уведомлений: FCM, Supabase edge functions, delivery tracking, тихие уведомления, deep links, notification grouping. Use when: push notifications, FCM, уведомления, Capacitor push, deep link из уведомления, badge count."
argument-hint: "[платформа: android | web | all]"
---

# Push Notification Architect — Архитектура уведомлений

---

## Стек: FCM + Supabase Edge Function

```
Поток уведомлений:
  Событие в БД (новое сообщение)
  → PostgreSQL trigger / Realtime
  → Edge Function: notification-router
  → FCM API (Firebase Cloud Messaging)
  → Устройство пользователя (Android/Web)
```

---

## Схема данных

```sql
-- Токены устройств пользователей
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token)  -- Один токен = одно устройство
);

-- Индекс для быстрого поиска токенов пользователя
CREATE INDEX idx_push_tokens_user ON user_push_tokens(user_id) WHERE is_active = TRUE;

-- История отправленных уведомлений
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  token TEXT NOT NULL,
  title TEXT,
  body TEXT,
  data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'invalid_token')),
  fcm_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Edge Function — отправка уведомления

```typescript
// supabase/functions/send-push/index.ts
const FCM_URL = 'https://fcm.googleapis.com/v1/projects/{PROJECT_ID}/messages:send';

Deno.serve(async (req) => {
  const { user_id, title, body, data = {} } = await req.json();

  // Получить активные токены пользователя
  const { data: tokens } = await supabase
    .from('user_push_tokens')
    .select('token, platform')
    .eq('user_id', user_id)
    .eq('is_active', true)
    .limit(5); // Максимум 5 устройств

  if (!tokens?.length) return Response.json({ sent: 0 });

  // FCM Access Token (OAuth 2.0)
  const accessToken = await getFCMAccessToken();

  const results = await Promise.allSettled(
    tokens.map(({ token, platform }) =>
      sendFCMMessage(accessToken, token, { title, body, data, platform })
    )
  );

  // Деактивировать невалидные токены
  const invalidTokens = results
    .filter((r, i) => r.status === 'rejected' && isInvalidTokenError(r.reason))
    .map((_, i) => tokens[i].token);

  if (invalidTokens.length) {
    await supabase.from('user_push_tokens')
      .update({ is_active: false })
      .in('token', invalidTokens);
  }

  return Response.json({ sent: results.filter(r => r.status === 'fulfilled').length });
});
```

---

## Capacitor — регистрация токена

```typescript
// src/hooks/usePushNotifications.ts
import { PushNotifications } from '@capacitor/push-notifications';

export function usePushNotifications() {
  async function register() {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async ({ value: token }) => {
      // Сохранить токен на сервере
      await supabase.from('user_push_tokens').upsert({
        user_id: currentUserId,
        token,
        platform: Capacitor.getPlatform() as 'android' | 'ios',
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'token' });
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // Уведомление получено пока приложение открыто
      toast({ title: notification.title, description: notification.body });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      // Пользователь нажал на уведомление — deep link
      const channelId = notification.data?.channel_id;
      if (channelId) navigate(`/chat/${channelId}`);
    });
  }

  return { register };
}
```

---

## Умное группирование и throttling

```typescript
// Не спамить уведомлениями — батчинг за 5 секунд
// Если 3+ сообщений в одном канале → одно уведомление
async function smartNotify(userId: string, channelId: string) {
  const BATCH_WINDOW = 5000; // 5 секунд
  const key = `notify:${userId}:${channelId}`;

  // Используем Redis-like: Supabase table как lock
  const { data: pending } = await supabase
    .from('notification_batch')
    .select('count')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .single();

  if (pending) {
    // Обновить счётчик, не отправлять ещё
    await supabase.from('notification_batch')
      .update({ count: pending.count + 1 })
      .eq('user_id', userId).eq('channel_id', channelId);
  } else {
    // Создать batch запись, отправить через 5 секунд
    await supabase.from('notification_batch').insert({
      user_id: userId, channel_id: channelId, count: 1,
      send_at: new Date(Date.now() + BATCH_WINDOW).toISOString(),
    });
  }
}
```

---

## Чеклист

- [ ] FCM токены сохраняются в `user_push_tokens` при старте приложения
- [ ] Невалидные токены деактивируются после FCM ошибки
- [ ] Deep link из уведомления навигирует в нужный экран
- [ ] Батчинг уведомлений (не спамить при множестве сообщений)
- [ ] Удалять токены при logout пользователя
- [ ] Логирование отправок для диагностики
