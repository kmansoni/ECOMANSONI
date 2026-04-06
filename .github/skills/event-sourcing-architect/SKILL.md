# Event Sourcing Architect

## Описание

Проектирование event-sourced систем: event store, проекции, снапшоты, воспроизведение истории.

## Когда использовать

- Финансовые операции (баланс, транзакции)
- Аудит-лог с полной историей изменений
- Коллаборативное редактирование (CRDT + events)
- Undo/redo функциональность
- Системы где "почему так случилось" важнее "что сейчас"

## Event Store — схема

```sql
CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  aggregate_type text NOT NULL,      -- 'order', 'wallet', 'document'
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,          -- 'OrderCreated', 'PaymentReceived'
  version int NOT NULL,
  payload jsonb NOT NULL,
  metadata jsonb DEFAULT '{}',       -- user_id, ip, correlation_id
  created_at timestamptz DEFAULT now()
);

-- Оптимистичная блокировка: уникальность версии
ALTER TABLE events ADD CONSTRAINT uq_aggregate_version
  UNIQUE (aggregate_id, version);

CREATE INDEX idx_events_aggregate ON events (aggregate_id, version);
CREATE INDEX idx_events_type ON events (event_type, created_at);
```

## Запись события

```sql
CREATE OR REPLACE FUNCTION append_event(
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_event_type text,
  p_expected_version int,
  p_payload jsonb,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  event_id uuid;
BEGIN
  INSERT INTO events (aggregate_type, aggregate_id, event_type, version, payload, metadata)
  VALUES (p_aggregate_type, p_aggregate_id, p_event_type, p_expected_version + 1, p_payload, p_metadata)
  RETURNING id INTO event_id;

  -- Уведомление для проекций
  PERFORM pg_notify('new_event', json_build_object(
    'id', event_id,
    'aggregate_id', p_aggregate_id,
    'event_type', p_event_type
  )::text);

  RETURN event_id;
END;
$$;
```

## Проекции (Read Models)

```sql
-- Материализованная проекция баланса кошелька
CREATE TABLE wallet_balances (
  wallet_id uuid PRIMARY KEY,
  balance numeric NOT NULL DEFAULT 0,
  last_event_id uuid,
  updated_at timestamptz DEFAULT now()
);

-- Обновление проекции
CREATE OR REPLACE FUNCTION project_wallet_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.aggregate_type = 'wallet' THEN
    CASE NEW.event_type
      WHEN 'FundsDeposited' THEN
        INSERT INTO wallet_balances (wallet_id, balance, last_event_id)
        VALUES (NEW.aggregate_id, (NEW.payload->>'amount')::numeric, NEW.id)
        ON CONFLICT (wallet_id)
        DO UPDATE SET
          balance = wallet_balances.balance + (NEW.payload->>'amount')::numeric,
          last_event_id = NEW.id,
          updated_at = now();
      WHEN 'FundsWithdrawn' THEN
        UPDATE wallet_balances
        SET balance = balance - (NEW.payload->>'amount')::numeric,
            last_event_id = NEW.id, updated_at = now()
        WHERE wallet_id = NEW.aggregate_id;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_wallet
  AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION project_wallet_balance();
```

## Снапшоты

```sql
CREATE TABLE snapshots (
  aggregate_id uuid NOT NULL,
  version int NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (aggregate_id, version)
);

-- Восстановление: snapshot + события после него
SELECT state FROM snapshots
WHERE aggregate_id = $1
ORDER BY version DESC LIMIT 1;

SELECT * FROM events
WHERE aggregate_id = $1 AND version > $snapshot_version
ORDER BY version;
```

## Чеклист

1. **Immutable** — события НИКОГДА не изменяются и не удаляются
2. **Версионирование** — optimistic concurrency через version
3. **Идемпотентность** — повторная обработка события = тот же результат
4. **Снапшоты** — каждые N событий (50-100) для быстрого восстановления
5. **Проекции** — отдельные таблицы, пересоздаваемые из событий
6. **Уведомления** — pg_notify для real-time обновления проекций

## Anti-patterns

- Мутация событий — удаление или UPDATE в таблице events
- Бизнес-логика в проекции — проекция только читает, не решает
- Отсутствие version constraint — потеря событий при конкурентной записи
- Снапшот как единственный источник — теряется история
- Проекция в той же транзакции — замедляет запись
- Event payload без schema versioning — невозможно мигрировать
