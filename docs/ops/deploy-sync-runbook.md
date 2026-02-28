# Deploy Sync Runbook (GitHub -> Supabase + AdminVPS)

## 1) Цель

Полная автоматизация деплоя: GitHub Actions запускает сборку, деплой Supabase, резервное копирование Supabase в AdminVPS и деплой кода на AdminVPS.

## 2) Требования

- Репозиторий клонирован на AdminVPS в каталог, заданный в `ADMINVPS_APP_DIR`.
- На AdminVPS установлен Node.js и npm.
- В GitHub Secrets заданы все переменные.
- Доступ по SSH к AdminVPS по ключу.

## 3) Secrets (GitHub)

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_URL`
- `ADMINVPS_HOST`
- `ADMINVPS_USER`
- `ADMINVPS_SSH_KEY`
- `ADMINVPS_BACKUP_DIR`
- `ADMINVPS_APP_DIR`
- `ADMINVPS_SYSTEMD_SERVICES` (например `mansoni-api nginx`)
- `ADMINVPS_HEALTH_URL` (опционально, например `https://example.com/healthz`)
- `SUPABASE_CHECK_TABLES` (опционально, список таблиц через запятую)

## 4) Как работает пайплайн

1. Сборка фронтенда.
2. Деплой Supabase (миграции + функции + секреты).
3. Бэкап Supabase (`pg_dump`) с SHA256.
4. Контроль целостности Supabase (row-counts + checksums).
4. Загрузка бэкапа на AdminVPS.
5. Деплой кода на AdminVPS и перезапуск сервисов.
6. Ротация бэкапов на AdminVPS (удаление старше 30 дней).
7. (Опционально) Health-check по `ADMINVPS_HEALTH_URL`.

## 5) Ручной запуск

- Перейти в GitHub Actions и запустить `Deploy Sync (GitHub -> Supabase + AdminVPS)` через `workflow_dispatch`.
- Для dry-run указать `dry_run=true`.

## 6) Отказоустойчивость

- Любой сбой останавливает пайплайн.
- Бэкапы сохраняются на AdminVPS и не удаляются до истечения срока хранения.

## 6.1 Dry-run

- Dry-run не выполняет деплой Supabase, не загружает бэкапы и не деплоит на AdminVPS.
- Dry-run выполняет сборку и контроль целостности.

## 7) Проверки после деплоя

- Проверить ключевые маршруты приложения.
- Проверить логи сервисов на AdminVPS.
- Убедиться, что бэкап создан и доступен.
