# PostgreSQL Partitioning

## Описание

Партиционирование больших таблиц для производительности запросов, удобного архивирования и параллельного vacuum.

## Когда применять

- Таблица > 10M строк и растёт
- Запросы ВСЕГДА фильтруют по дате / региону / tenant
- Нужно быстрое удаление старых данных (`DROP PARTITION` vs `DELETE`)
- Хотите параллельный vacuum на разных партициях
- Холодные данные можно вынести на медленное хранилище

## Типы партиционирования

### Range (по диапазону) — самый частый

```sql
CREATE TABLE messages (
  id uuid DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Партиция на месяц
CREATE TABLE messages_2026_01 PARTITION OF messages
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE messages_2026_02 PARTITION OF messages
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### List (по значению)

```sql
CREATE TABLE orders (
  id uuid DEFAULT gen_random_uuid(),
  status text NOT NULL,
  total numeric NOT NULL
) PARTITION BY LIST (status);

CREATE TABLE orders_active PARTITION OF orders
  FOR VALUES IN ('pending', 'processing', 'shipped');

CREATE TABLE orders_archive PARTITION OF orders
  FOR VALUES IN ('delivered', 'cancelled', 'refunded');
```

### Hash (равномерное распределение)

```sql
CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payload jsonb
) PARTITION BY HASH (tenant_id);

CREATE TABLE events_p0 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE events_p1 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE events_p2 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE events_p3 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

## Чеклист

1. **Partition key в WHERE** — если запросы не фильтруют по ключу, партиции бесполезны
2. **Индексы** — создавать на родительской таблице, наследуются автоматически
3. **UNIQUE** — partition key ОБЯЗАН входить в любой UNIQUE/PK constraint
4. **DEFAULT partition** — ловит строки не попавшие ни в одну партицию
5. **Автосоздание** — cron-job или pg_partman для новых партиций
6. **Foreign keys** — FK НА партиционированную таблицу не поддерживается (PG < 17)

## Автоматизация через pg_partman

```sql
CREATE EXTENSION IF NOT EXISTS pg_partman;

SELECT partman.create_parent(
  p_parent_table := 'public.messages',
  p_control := 'created_at',
  p_type := 'range',
  p_interval := '1 month',
  p_premake := 3  -- создать 3 партиции вперёд
);
```

## Удаление старых данных

```sql
-- Мгновенно, без vacuum
DROP TABLE messages_2024_01;
-- Или detach для безопасного удаления
ALTER TABLE messages DETACH PARTITION messages_2024_01;
DROP TABLE messages_2024_01;
```

## Anti-patterns

- Партиционирование таблицы < 1M строк — overhead без пользы
- Partition key не в WHERE запросов — сканирует ВСЕ партиции
- Забыть создать партиции заранее — INSERT в DEFAULT или ошибка
- `UNIQUE(id)` без partition key — невозможно в PostgreSQL
- Слишком мелкие партиции (по дню при 100 записях/день) — overhead
- `CREATE INDEX CONCURRENTLY` на партиционированной таблице — не работает
