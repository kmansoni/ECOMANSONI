---
name: data-archival
description: "Архивирование данных: старые сообщения, мягкое удаление, партиционирование, cold storage, retention policies. Use when: data archival, архивирование сообщений, retention policy, старые данные, soft delete, партиционирование."
argument-hint: "[таблица или модуль для архивирования]"
---

# Data Archival — Архивирование данных

---

## Soft Delete паттерн

```sql
-- Мягкое удаление: данные не удаляются физически
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- Функция удаления (вместо DELETE)
CREATE OR REPLACE FUNCTION soft_delete_message(p_message_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE messages
  SET is_deleted = TRUE,
      deleted_at = now(),
      deleted_by = auth.uid(),
      content = '' -- Очистить контент (GDPR)
  WHERE id = p_message_id
    AND sender_id = auth.uid(); -- Только своё сообщение
END;
$$;

-- Индекс для фильтрации активных сообщений
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_not_deleted
  ON messages(channel_id, created_at DESC)
  WHERE is_deleted = FALSE;
```

---

## Retention Policy — автоудаление старых данных

```sql
-- Периодическая очистка старых удалённых сообщений (через pg_cron или Edge Function)
CREATE OR REPLACE FUNCTION archive_old_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Физически удалить сообщения которые:
  -- 1. Помечены как удалённые > 30 дней назад
  -- 2. Старше 2 лет (retention policy)
  DELETE FROM messages
  WHERE (is_deleted = TRUE AND deleted_at < now() - INTERVAL '30 days')
     OR (created_at < now() - INTERVAL '2 years' AND is_deleted = TRUE);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
```

---

## Archive таблица для холодного хранения

```sql
-- Архивная таблица (только чтение, сжатая)
CREATE TABLE messages_archive (
  LIKE messages INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Партиция по кварталам
CREATE TABLE messages_archive_2024_q1
  PARTITION OF messages_archive
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

-- Функция архивирования (переместить старые записи)
CREATE OR REPLACE FUNCTION move_to_archive(cutoff_date TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE moved INTEGER;
BEGIN
  WITH archived AS (
    DELETE FROM messages
    WHERE created_at < cutoff_date AND is_deleted = FALSE
    RETURNING *
  )
  INSERT INTO messages_archive SELECT * FROM archived;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

---

## Edge Function для архивирования (cron)

```typescript
// supabase/functions/archive-messages/index.ts
// Запускать через pg_cron или внешний cron сервис

Deno.serve(async (req) => {
  // Проверить что запрос от scheduler (не от пользователя)
  const cronKey = req.headers.get('X-Cron-Key');
  if (cronKey !== Deno.env.get('CRON_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: count } = await serviceClient
    .rpc('archive_old_messages');

  return Response.json({ archived: count });
});
```

---

## GDPR — право на удаление

```sql
-- При удалении аккаунта: полная очистка персональных данных
CREATE OR REPLACE FUNCTION delete_user_data(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Анонимизировать сообщения (не удалять — сохраняем целостность чата)
  UPDATE messages
  SET content = '[Сообщение удалено]', sender_id = NULL
  WHERE sender_id = p_user_id;

  -- Удалить профиль и связанные данные
  DELETE FROM profiles WHERE id = p_user_id;
  -- CASCADE удалит: channel_members, reactions, etc.
END;
$$;
```

---

## Чеклист

- [ ] Soft delete вместо физического DELETE для сообщений
- [ ] Retention policy: физическое удаление через 30 дней после soft delete
- [ ] GDPR: право на удаление реализовано (анонимизация)
- [ ] Архивная таблица для данных старше 1 года
- [ ] Индекс с WHERE is_deleted = FALSE для активных запросов
- [ ] Периодическая очистка через Edge Function + cron
