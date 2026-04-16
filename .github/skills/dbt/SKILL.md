---
name: dbt
description: >-
  Analytics engineering с dbt: модели, тесты, семантический слой,
  источники, документация, troubleshooting. 8 под-скиллов.
  Use when: dbt, analytics, data modeling, ELT, warehouse, metrics, BigQuery, Snowflake.
metadata:
  category: data-engineering
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/dbt
---

# dbt (Data Build Tool)

Analytics engineering: модели данных, тесты, семантический слой, документация.

## Когда использовать

- Моделирование данных для аналитики
- ELT pipelines (Extract, Load, Transform)
- Data quality тесты
- Семантический слой (metrics, dimensions)
- Документация data warehouse
- Troubleshooting dbt jobs

## Архитектура dbt

```
Sources (raw) → Staging (clean) → Intermediate (business logic) → Marts (analytics)
```

### Layers
```
models/
  staging/         — 1:1 с source таблицами, очистка, переименование
  intermediate/    — joins, business logic, денормализация
  marts/           — final analytics tables для BI
```

## Модели

### Staging Model
```sql
-- models/staging/stg_messages.sql
with source as (
    select * from {{ source('app', 'messages') }}
),
renamed as (
    select
        id as message_id,
        channel_id,
        sender_id as user_id,
        content,
        created_at as sent_at,
        coalesce(is_deleted, false) as is_deleted
    from source
    where not is_deleted
)
select * from renamed
```

### Intermediate Model
```sql
-- models/intermediate/int_daily_messages.sql
select
    date_trunc('day', sent_at) as message_date,
    channel_id,
    count(*) as message_count,
    count(distinct user_id) as unique_senders
from {{ ref('stg_messages') }}
group by 1, 2
```

### Mart Model
```sql
-- models/marts/fct_channel_activity.sql
select
    dm.message_date,
    dm.channel_id,
    c.channel_name,
    dm.message_count,
    dm.unique_senders,
    dm.message_count::float / nullif(dm.unique_senders, 0) as msgs_per_user
from {{ ref('int_daily_messages') }} dm
left join {{ ref('stg_channels') }} c using (channel_id)
```

## Тесты

### Schema Tests (YAML)
```yaml
# models/staging/_stg_models.yml
models:
  - name: stg_messages
    columns:
      - name: message_id
        tests:
          - unique
          - not_null
      - name: user_id
        tests:
          - not_null
          - relationships:
              to: ref('stg_users')
              field: user_id
```

### Unit Tests (dbt 1.8+)
```yaml
unit_tests:
  - name: test_msgs_per_user_calculation
    model: fct_channel_activity
    given:
      - input: ref('int_daily_messages')
        rows:
          - {message_date: '2024-01-01', channel_id: 1, message_count: 10, unique_senders: 2}
    expect:
      rows:
        - {msgs_per_user: 5.0}
```

### Custom Tests
```sql
-- tests/assert_no_orphan_messages.sql
select message_id
from {{ ref('stg_messages') }}
where channel_id not in (select channel_id from {{ ref('stg_channels') }})
```

## Семантический слой

### Metrics (dbt Semantic Layer)
```yaml
# models/semantic/sem_metrics.yml
semantic_models:
  - name: messages
    model: ref('fct_channel_activity')
    entities:
      - name: channel
        type: primary
        expr: channel_id
    dimensions:
      - name: message_date
        type: time
    measures:
      - name: total_messages
        agg: sum
        expr: message_count

metrics:
  - name: daily_active_channels
    type: simple
    type_params:
      measure: total_messages
    filter:
      - "{{ Dimension('message_date') }} >= dateadd(day, -30, current_date)"
```

## Sources

```yaml
# models/sources/_sources.yml
sources:
  - name: app
    database: production_db
    schema: public
    freshness:
      warn_after: {count: 12, period: hour}
      error_after: {count: 24, period: hour}
    tables:
      - name: messages
        loaded_at_field: created_at
      - name: channels
      - name: users
```

## Документация

```yaml
# models/staging/_stg_models.yml
models:
  - name: stg_messages
    description: >
      Очищенные сообщения из app.messages. 
      Удалённые сообщения исключены.
    columns:
      - name: message_id
        description: Уникальный ID сообщения (UUID)
```

```bash
# Генерация документации
dbt docs generate
dbt docs serve
```

## CLI Commands

```bash
# Запуск всех моделей
dbt run

# Конкретная модель + зависимости
dbt run --select +fct_channel_activity

# Тесты
dbt test

# Freshness check
dbt source freshness

# Компиляция без выполнения
dbt compile --select my_model

# Debug
dbt debug
```

## Troubleshooting

### Job Failures
```
1. dbt debug → проверка подключения
2. dbt compile → синтаксис SQL
3. dbt run --select failed_model → изоляция
4. Проверка source freshness
5. Логи: target/run_results.json
```

### Performance
```
1. dbt run --select model --full-refresh
2. Проверить materialization (table vs view vs incremental)
3. Incremental для больших таблиц
4. Cluster/partition keys
```

## Best Practices

✓ Staging: 1 модель = 1 source таблица
✓ Naming: stg_, int_, fct_, dim_
✓ Тесты на каждую модель
✓ Incremental для таблиц >1M строк
✓ Source freshness мониторинг
✓ Документация на каждую модель
✗ Не писать DML (INSERT/UPDATE) в моделях
✗ Не ссылаться на raw tables напрямую из marts
✗ Не хардкодить дата-фильтры
