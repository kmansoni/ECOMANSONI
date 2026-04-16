---
name: dbt-migration
description: >-
  Миграции dbt: обновление версий, breaking changes, deprecations,
  переход на новые API. Use when: dbt upgrade, миграция dbt, breaking change dbt,
  обновление dbt версии.
metadata:
  category: data-engineering
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/dbt-migration
---

# dbt Migration

Миграции между версиями dbt: breaking changes, deprecations, новые API.

## Когда использовать

- Обновление dbt на новую major/minor версию
- Миграция с dbt-core на dbt Cloud
- Breaking changes в новой версии
- Замена deprecated функций
- Переход на новые materializations

## Версионные миграции

### dbt 1.5 → 1.6
```yaml
# BREAKING: model access control
models:
  - name: my_model
    access: public  # NEW: public/protected/private
    group: analytics
```

### dbt 1.6 → 1.7
```yaml
# NEW: unit tests
unit_tests:
  - name: test_calculation
    model: my_model
    given:
      - input: ref('source_model')
        rows: [...]
    expect:
      rows: [...]
```

### dbt 1.7 → 1.8
```
- Unit tests GA (из preview)
- Semantic layer improvements
- Microbatch incremental strategy
- Python models improvements
```

## Common Migration Patterns

### Materialization Changes
```sql
-- До: table
{{ config(materialized='table') }}

-- После: incremental (для больших таблиц)
{{ config(
    materialized='incremental',
    unique_key='id',
    incremental_strategy='merge',
    on_schema_change='sync_all_columns'
) }}

{% if is_incremental() %}
where updated_at > (select max(updated_at) from {{ this }})
{% endif %}
```

### Deprecated Macros
```sql
-- До (deprecated)
{{ adapter.dispatch('my_macro') }}

-- После
{{ adapter.dispatch('my_macro', 'my_package') }}
```

### Source → Ref Migration
```sql
-- До: hardcoded
select * from raw.public.messages

-- После: source()
select * from {{ source('app', 'messages') }}
```

### Packages Update
```yaml
# packages.yml
packages:
  - package: dbt-labs/dbt_utils
    version: [">=1.0.0", "<2.0.0"]  # pin major version
  - package: dbt-labs/codegen
    version: [">=0.12.0", "<1.0.0"]
```

## Migration Checklist

### Перед обновлением
```
□ Прочитать changelog новой версии
□ Backup profiles.yml и packages.yml
□ Проверить совместимость пакетов
□ Запустить dbt compile на текущей версии (baseline)
□ Проверить deprecated warnings в логах
```

### Обновление
```bash
# Обновить dbt
pip install --upgrade dbt-core dbt-postgres  # или dbt-bigquery/dbt-snowflake

# Обновить пакеты
dbt deps --upgrade

# Проверить
dbt debug
dbt compile
dbt run --select tag:critical
dbt test
```

### После обновления
```
□ dbt compile — нет ошибок
□ dbt run — все модели успешны
□ dbt test — все тесты проходят
□ Проверить deprecated warnings (новые)
□ Адаптировать под новые API
□ Обновить CI/CD пайплайн
```

## Cloud Migration

### dbt-core → dbt Cloud
```
1. Перенести profiles.yml → Cloud connections
2. Настроить environments (dev, staging, prod)
3. Jobs вместо cron + dbt run
4. IDE → Cloud IDE
5. CI jobs для PR
```

### dbt Cloud → dbt-core
```
1. Экспортировать connections
2. Создать profiles.yml
3. Настроить CI/CD (GitHub Actions)
4. Cron для scheduled runs
```

## Troubleshooting Migration

### Типичные ошибки
```
"Model has a model group but its access is not set"
→ Добавить access: public/protected/private

"The 'metrics' config has been renamed"  
→ Перейти на semantic layer API

"dispatch requires package argument"
→ Добавить package name в dispatch()
```

## Best Practices

✓ Обновляй по одной major версии за раз
✓ Читай changelog ПОЛНОСТЬЮ
✓ Тестируй в dev environment перед prod
✓ Pin dependency versions в packages.yml
✓ Используй deprecation warnings как roadmap
✗ Не пропускай major версии (1.5 → 1.8 без 1.6, 1.7)
✗ Не обновляй prod без тестирования
✗ Не игнорируй deprecated warnings
