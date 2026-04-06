---
name: stored-procedure-patterns
description: "PostgreSQL stored procedures и functions: SECURITY DEFINER, RPC через Supabase, атомарные операции, триггеры, очистка данных. Use when: stored procedure, RPC, SECURITY DEFINER, PostgreSQL function, триггер, атомарная операция."
argument-hint: "[функция или операция для реализации]"
---

# Stored Procedure Patterns — PostgreSQL функции

---

## SECURITY DEFINER — когда и как

```sql
-- SECURITY DEFINER: функция выполняется с правами создателя, не вызывающего
-- Используй когда нужно обойти RLS для конкретной операции с явными guards

CREATE OR REPLACE FUNCTION get_channel_members_as_admin(p_channel_id UUID)
RETURNS TABLE (user_id UUID, role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER  -- Выполняется как владелец функции
SET search_path = public  -- КРИТИЧНО: всегда фиксировать search_path!
AS $$
BEGIN
  -- Проверить что вызывающий — админ канала (вместо RLS)
  IF NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id
      AND user_id = auth.uid()
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: not an admin';
  END IF;

  RETURN QUERY
  SELECT cm.user_id, cm.role
  FROM channel_members cm
  WHERE cm.channel_id = p_channel_id;
END;
$$;

-- ВАЖНО: SET search_path = public обязателен для SECURITY DEFINER
-- Без него возможна атака через подмену search_path
```

---

## Атомарные бизнес-операции

```sql
-- Создать сообщение + обновить unread counts атомарно
CREATE OR REPLACE FUNCTION send_message(
  p_channel_id UUID,
  p_content TEXT,
  p_message_type TEXT DEFAULT 'text',
  p_client_id TEXT DEFAULT NULL
) RETURNS messages
LANGUAGE plpgsql
SECURITY INVOKER  -- Работает с правами вызывающего + проверяется RLS
AS $$
DECLARE
  v_message messages;
BEGIN
  -- Вставить сообщение (RLS проверяет rights)
  INSERT INTO messages (channel_id, sender_id, content, type, client_message_id)
  VALUES (p_channel_id, auth.uid(), p_content, p_message_type, p_client_id)
  ON CONFLICT (client_message_id) DO NOTHING
  RETURNING * INTO v_message;

  IF NOT FOUND THEN
    -- Дубликат — вернуть существующее
    SELECT * INTO v_message FROM messages WHERE client_message_id = p_client_id;
    RETURN v_message;
  END IF;

  -- Обновить last_message и unread счётчик для всех участников кроме отправителя
  UPDATE channel_members
  SET unread_count = unread_count + 1
  WHERE channel_id = p_channel_id
    AND user_id != auth.uid();

  UPDATE channels
  SET last_message_at = now(), last_message_preview = LEFT(p_content, 200)
  WHERE id = p_channel_id;

  RETURN v_message;
END;
$$;
```

---

## Supabase RPC вызов

```typescript
// Клиентский вызов через RPC
const { data: message, error } = await supabase.rpc('send_message', {
  p_channel_id: channelId,
  p_content: text,
  p_message_type: 'text',
  p_client_id: clientMessageId,
});

if (error) throw error;
return message;
```

---

## Типы функций PostgreSQL

```sql
-- LANGUAGE sql: для простых запросов (быстрее plpgsql)
CREATE OR REPLACE FUNCTION get_unread_count(p_channel_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE  -- Не изменяет данные, результат стабилен в транзакции
AS $$
  SELECT COALESCE(unread_count, 0)
  FROM channel_members
  WHERE channel_id = p_channel_id
    AND user_id = auth.uid();
$$;

-- LANGUAGE plpgsql: для условной логики, циклов, exceptions
-- LANGUAGE sql: для простых SELECT/INSERT без условий
-- RETURNS void: для процедур без возвращаемого значения
-- RETURNS TABLE: для возврата множества строк
-- RETURNS SETOF type: для возврата набора записей
```

---

## Триггеры

```sql
-- Автоматическое обновление updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Применить к таблице
CREATE TRIGGER messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Чеклист

- [ ] `SECURITY DEFINER` функции всегда имеют `SET search_path = public`
- [ ] `SECURITY DEFINER` функции явно проверяют права вызывающего
- [ ] Атомарные операции в одной функции (не несколько клиентских запросов)
- [ ] RPC функции возвращают типизированный результат
- [ ] `ON CONFLICT DO NOTHING` для идемпотентных вставок
- [ ] LANGUAGE sql для простых запросов, plpgsql для сложной логики
