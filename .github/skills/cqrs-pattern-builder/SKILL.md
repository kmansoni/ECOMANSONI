# CQRS Pattern Builder

## Описание

Разделение команд (запись) и запросов (чтение) для оптимизации производительности и масштабирования.

## Когда использовать

- Чтение >> запись (каталог товаров, лента новостей)
- Разные модели данных для чтения и записи
- Необходима денормализация для быстрых запросов
- Высокая нагрузка на чтение — read replicas
- Сложные агрегации на чтение, простые операции на запись

## Архитектура в Supabase

```
Command (запись)          Query (чтение)
     │                        │
     ▼                        ▼
Edge Function ──► Table ──► Materialized View
     │              │              │
     │          Trigger ───► Read Model
     │                        (denormalized)
     ▼                        │
  Validation                  ▼
  + Business Logic      Supabase REST API
```

## Command — Edge Function

```typescript
// supabase/functions/create-order/index.ts
serve(async (req) => {
  const { items, shipping_address } = await req.json();
  const user = getUser(req);

  // Валидация
  if (!items?.length) return errorResponse('Корзина пуста', 400);

  // Бизнес-логика
  const total = await calculateTotal(items);
  const stock = await checkStock(items);
  if (!stock.available) return errorResponse('Товар закончился', 409);

  // Запись в нормализованные таблицы
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .insert({ user_id: user.id, total, status: 'pending', shipping_address })
    .select('id')
    .single();

  if (error) throw error;

  await supabaseAdmin.from('order_items').insert(
    items.map((item: OrderItem) => ({ order_id: order.id, ...item }))
  );

  return jsonResponse({ order_id: order.id });
});
```

## Query — Materialized View

```sql
-- Денормализованная read-модель для списка заказов
CREATE MATERIALIZED VIEW orders_list AS
SELECT
  o.id,
  o.status,
  o.total,
  o.created_at,
  p.display_name AS user_name,
  jsonb_agg(jsonb_build_object(
    'product', pr.title,
    'quantity', oi.quantity,
    'price', oi.price
  )) AS items
FROM orders o
JOIN profiles p ON p.id = o.user_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products pr ON pr.id = oi.product_id
GROUP BY o.id, o.status, o.total, o.created_at, p.display_name;

CREATE UNIQUE INDEX idx_orders_list_id ON orders_list (id);

-- Обновление по триггеру или cron
CREATE OR REPLACE FUNCTION refresh_orders_list()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY orders_list;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_refresh_orders
  AFTER INSERT OR UPDATE ON orders
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_orders_list();
```

## Read Model — денормализованная таблица

```sql
-- Для real-time (materialized view не поддерживает Realtime)
CREATE TABLE order_read_model (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL,
  total numeric NOT NULL,
  user_name text,
  items_summary text,
  items_count int,
  created_at timestamptz
);

-- Синхронизация через триггер на orders
CREATE OR REPLACE FUNCTION sync_order_read_model()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO order_read_model (id, user_id, status, total, created_at)
  VALUES (NEW.id, NEW.user_id, NEW.status, NEW.total, NEW.created_at)
  ON CONFLICT (id)
  DO UPDATE SET status = NEW.status, total = NEW.total;
  RETURN NEW;
END;
$$;
```

## Чеклист

1. **Command** — через Edge Function или RPC, с валидацией
2. **Query** — прямой SELECT из read model, без JOIN
3. **Sync** — триггер или cron для обновления read model
4. **Eventual consistency** — клиент понимает задержку (optimistic UI)
5. **Idempotency** — команды идемпотентны (дубль = тот же результат)
6. **Materialized View** — `CONCURRENTLY` для обновления без блокировки

## Anti-patterns

- CQRS для простого CRUD — оверинжиниринг
- Бизнес-логика в query (read) пути — только в command
- `REFRESH MATERIALIZED VIEW` без `CONCURRENTLY` — блокирует чтение
- Read model без индексов — медленнее чем JOIN
- Синхронная запись + чтение из read model — может быть stale
- Нет fallback на source of truth при несогласованности
