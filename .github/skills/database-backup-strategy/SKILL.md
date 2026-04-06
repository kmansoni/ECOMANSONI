---
name: database-backup-strategy
description: "Стратегия резервного копирования Supabase: Point-in-Time Recovery, ежедневные бэкапы, восстановление, тестирование backup. Use when: backup, резервная копия, восстановление данных, PITR, disaster recovery."
argument-hint: "[сценарий: setup | restore | test | all]"
---

# Database Backup Strategy — Резервное копирование Supabase

---

## Supabase встроенные бэкапы

```
Supabase Pro план:
  - Ежедневные бэкапы (хранятся 7 дней)
  - Point-in-Time Recovery (PITR) — восстановление до любой секунды
  - Регион: eu-central-1 (рядом с lfkbgnbjxskspsownvjm)

Как проверить:
  1. Dashboard → Project Settings → Database
  2. "Backups" вкладка — список доступных бэкапов
  3. "Enable Point in Time Recovery" если не включён
```

---

## PITR восстановление

```bash
# Через Supabase CLI (требует Pro)
supabase db restore --project-ref lfkbgnbjxskspsownvjm \
  --target-time "2024-03-15T12:00:00Z"

# Через Dashboard:
# Settings → Database → Backups → Point in Time Recovery
# Выбрать временную метку → "Restore"
# ВНИМАНИЕ: восстановление прерывает сервис!
```

---

## Ручной дамп (дополнительная защита)

```bash
# pg_dump через Supabase connection string
pg_dump \
  --host=db.lfkbgnbjxskspsownvjm.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --no-acl \
  --no-owner \
  --format=custom \
  --file=backup-$(date +%Y%m%d-%H%M%S).dump

# Восстановление из дампа
pg_restore \
  --host=db.new-project.supabase.co \
  --username=postgres \
  --dbname=postgres \
  --no-acl \
  --no-owner \
  backup-20240315-120000.dump
```

---

## Автоматический GitHub Actions бэкап

```yaml
# .github/workflows/database-backup.yml
name: Daily Database Backup

on:
  schedule:
    - cron: '0 2 * * *'  # 02:00 UTC ежедневно

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Export schema
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          pg_dump $SUPABASE_DB_URL \
            --schema-only \
            --no-acl \
            --no-owner \
            > schema-$(date +%Y%m%d).sql

      - name: Upload to storage
        uses: actions/upload-artifact@v4
        with:
          name: schema-backup-${{ github.run_number }}
          path: schema-*.sql
          retention-days: 90
```

---

## RTO / RPO цели

| Сценарий | RPO (потеря данных) | RTO (время восстановления) |
|---|---|---|
| Случайное DROP TABLE | ~1 минута (PITR) | ~30 минут |
| Corrupted data | Зависит от PITR | ~1-2 часа |
| Регион недоступен | ~0 (Supabase Multi-AZ) | ~15 минут (automatic failover) |
| Полная потеря проекта | Последний дамп | ~4-8 часов |

---

## Тестирование восстановления

```bash
# Раз в квартал: проверить что бэкап реально работает
# 1. Создать testing-проект в Supabase
# 2. Восстановить последний бэкап
# 3. Запустить smoke тесты
# 4. Удалить testing-проект

# Автоматическая проверка схемы:
pg_restore --list backup.dump | grep "TABLE DATA" | wc -l
# Должно быть > 0 таблиц с данными
```

---

## Чеклист

- [ ] PITR включён в Supabase Dashboard (Pro план)
- [ ] Ежедневный автоматический дамп схемы в GitHub Actions
- [ ] `SUPABASE_DB_URL` добавлен в GitHub Secrets
- [ ] Восстановление протестировано хотя бы раз
- [ ] Документация по процедуре восстановления в DEPLOY.md
- [ ] RTO/RPO цели определены и задокументированы
