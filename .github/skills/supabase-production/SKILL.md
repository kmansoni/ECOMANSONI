---
name: supabase-production
description: "Глубокие знания Supabase для продакшена. Use when: RLS политики, миграции, Edge Functions, Realtime, Storage, Auth, PostgreSQL оптимизация, connection pooling, индексы, statement timeout, security, backup, monitoring."
---

# Supabase Production — Полная экспертиза

Все конфигурации и паттерны для продакшн-уровня Supabase.

## RLS (Row Level Security)

### Золотые правила
1. **КАЖДАЯ таблица ДОЛЖНА иметь RLS** — исключений нет
2. RLS политики проверяются ПЕРЕД индексами — плохая политика = full table scan
3. Отдельные политики для SELECT / INSERT / UPDATE / DELETE
4. `auth.uid()` — текущий пользователь, `auth.jwt()` — полный JWT

### Паттерны RLS

#### Владелец
```sql
CREATE POLICY "users_own_data" ON users
  FOR ALL USING (id = auth.uid());
```

#### Участник канала
```sql
CREATE POLICY "channel_members_read" ON channel_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = channel_messages.channel_id
        AND user_id = auth.uid()
    )
  );
```

#### Service-only (Edge Functions)
```sql
-- Доступ только через service_role key
CREATE POLICY "service_only" ON internal_jobs
  FOR ALL USING (false);
-- Edge Function использует supabaseAdmin (service_role), RLS обходится
```

### Оптимизация RLS
- Используй `EXISTS` вместо `IN` для подзапросов
- Создавай индекс на FK, который проверяется в RLS: `CREATE INDEX ON channel_members(channel_id, user_id)`
- Для частых проверок — создай `SECURITY DEFINER` функцию:
```sql
CREATE OR REPLACE FUNCTION is_channel_member(p_channel_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Использование в RLS:
CREATE POLICY "members_read" ON channel_messages
  FOR SELECT USING (is_channel_member(channel_id));
```

## Миграции

### Правила безопасности
1. **Только additive**: никогда DROP COLUMN в одном релизе с удалением кода
2. **Обратная совместимость**: новый код должен работать с обеими версиями схемы
3. **CONCURRENTLY для индексов**: `CREATE INDEX CONCURRENTLY` — не блокирует записи
4. **Разделяй DDL и DML**: не мешай ALTER TABLE с INSERT/UPDATE
5. **Timeout**: `SET statement_timeout = '5s'` для миграций на живой БД

### Шаблон безопасной миграции
```sql
-- Шаг 1: Добавить column (nullable, без default)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS auto_delete_seconds integer;

-- Шаг 2: Индекс (concurrently)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_channels_auto_delete
  ON channels(auto_delete_seconds) WHERE auto_delete_seconds > 0;

-- Шаг 3: RLS (ALWAYS after table change)
-- Проверить что существующие политики покрывают новый column 

-- Шаг 4: Backfill (в отдельной миграции)
-- UPDATE channels SET auto_delete_seconds = 0 WHERE auto_delete_seconds IS NULL;
```

### Именование
```
YYYYMMDDHHMMSS_описание_на_английском.sql
20260328120000_add_auto_delete_to_channels.sql
```

## Edge Functions

### Deno Runtime
- Runtime: Deno 1.x (НЕ Node.js)
- Ограничения: max execution time 60s (Free), 150s (Pro)
- Memory: 256MB (Free), 512MB (Pro)
- Cold start: 200-500ms первый вызов
- Env vars: через Dashboard или `supabase secrets set`

### Шаблон
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

Deno.serve(async (req) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 2. Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Создать клиент с токеном пользователя (RLS работает)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 4. Валидация input
    const body = await req.json();
    // ... validate ...

    // 5. Бизнес-логика
    // ...

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Частые ошибки
- Забытые CORS headers → 403 на клиенте
- `Deno.env.get()` без `!` → TypeScript error
- Import из npm без `https://esm.sh/` → fails
- Большой payload без streaming → timeout

## Realtime

### Limits
| Plan | Concurrent connections | Messages/sec | Channels | Payload |
|------|----------------------|-------------|----------|---------|
| Free | 200 | 100 | 100 | 1MB |
| Pro | 500 | 500 | 500 | 5MB |

### Типы подписок
```typescript
// 1. Postgres Changes (привязан к таблице)
supabase.channel('messages')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
    (payload) => handleNewMessage(payload.new)
  )
  .subscribe();

// 2. Broadcast (без БД, P2P через сервер)
channel.send({ type: 'broadcast', event: 'typing', payload: { user_id } });

// 3. Presence (отслеживание онлайна)
channel.track({ user_id, online_at: new Date().toISOString() });
```

### Обязательный cleanup
```typescript
useEffect(() => {
  const channel = supabase.channel(`room:${id}`);
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}, [id]);
```

## Storage

### Bucket-политики
```sql
-- Чтение: только участники канала
CREATE POLICY "channel_media_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chat-media'
    AND is_channel_member(
      (storage.foldername(name))[1]::uuid  -- first folder = channel_id
    )
  );

-- Загрузка: только участники с правом записи
CREATE POLICY "channel_media_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-media'
    AND is_channel_member((storage.foldername(name))[1]::uuid)
    AND (octet_length(content) <= 52428800)  -- 50MB max
  );
```

### Оптимизация
- Transformations: `supabase.storage.from('avatars').getPublicUrl('path', { transform: { width: 200, height: 200 } })`
- CDN: публичные файлы кэшируются на CDN автоматически
- Signed URLs: для приватных файлов, TTL 1 час

## Auth

### Custom Claims
```sql
-- Добавить роль в JWT
CREATE OR REPLACE FUNCTION custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
  SELECT jsonb_set(
    event,
    '{claims,app_metadata,role}',
    to_jsonb((SELECT role FROM profiles WHERE id = (event->>'user_id')::uuid))
  );
$$ LANGUAGE sql STABLE;
```

### Token Refresh
- Access token: 1 час (default)
- Refresh token: 1 неделя
- Клиент: `supabase.auth.onAuthStateChange` автоматически рефрешит
- Edge case: если рефреш истёк → redirect на логин

## PostgreSQL оптимизация

### Индексы
```sql
-- B-tree для equality + ordering
CREATE INDEX idx_messages_channel_sort ON messages(channel_id, sort_key DESC);

-- GIN для full-text search
CREATE INDEX idx_messages_fts ON messages USING GIN(to_tsvector('russian', content));

-- Partial index (только активные)
CREATE INDEX idx_users_online ON users(last_seen) WHERE last_seen > NOW() - INTERVAL '5 minutes';
```

### Connection Pooling (PgBouncer)
- Supabase использует PgBouncer в transaction mode
- НЕЛЬЗЯ: `SET`, `PREPARE`, `LISTEN/NOTIFY` (через pooler)
- Для long-running: использовать direct connection (порт 5432, не 6543)

### Statement Timeout
- Default: 8s для API-запросов
- Настроить: `ALTER ROLE authenticated SET statement_timeout = '10s'`
- Edge Functions: используют service_role, timeout отдельный

### Vacuum & Analyze
- Autovacuum включён по default
- Для горячих таблиц (messages): `ALTER TABLE messages SET (autovacuum_vacuum_scale_factor = 0.01)`
