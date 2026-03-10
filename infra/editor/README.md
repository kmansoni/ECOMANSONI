# Video Editor — Docker Infrastructure

Стек инфраструктуры для video editor API и render worker'ов.

## Архитектура

```
┌─────────────┐     ┌─────────────┐     ┌──────────┐
│ editor-api  │────►│   Redis     │◄────│  worker   │
│  :3002      │     │  :6379      │     │ (ffmpeg)  │
└──────┬──────┘     └─────────────┘     └─────┬─────┘
       │                                      │
       ▼                                      ▼
┌──────────────┐                    ┌─────────────────┐
│  PostgreSQL  │                    │  MinIO / S3      │
│  (Supabase)  │                    │  Object Storage  │
└──────────────┘                    └─────────────────┘
```

- **editor-api** — REST API для управления проектами, таймлайном, ассетами
- **editor-worker** — Render pipeline на FFmpeg (композитинг, кодирование)
- **Redis** — Очередь рендеринга (BullMQ), кэш, pub/sub

## Предварительные требования

- [Docker](https://docs.docker.com/engine/install/) ≥ 24.0
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2.20
- FFmpeg устанавливается внутри Docker-образа автоматически

### Внешние зависимости (НЕ запускаются этим compose)

- **PostgreSQL** — основная БД (Supabase). `DATABASE_URL` должен указывать на существующий инстанс.
- **MinIO / S3** — объектное хранилище для медиафайлов. Поднимается отдельно или используется внешний S3.

## Быстрый старт

```bash
# 1. Создать .env из шаблона
cp .env.example .env

# 2. Заполнить переменные (DATABASE_URL, JWT_SECRET, MinIO credentials)
#    JWT_SECRET ДОЛЖЕН совпадать с основным приложением!
nano .env

# 3. Запустить
docker compose up -d

# 4. Проверить статус
docker compose ps
```

## Команды

### Запуск / Остановка

```bash
# Запуск всех сервисов
docker compose up -d

# Остановка
docker compose down

# Остановка с удалением volumes (⚠️ данные Redis будут потеряны)
docker compose down -v
```

### Просмотр логов

```bash
# Все сервисы
docker compose logs -f

# Только API
docker compose logs -f editor-api

# Только worker
docker compose logs -f editor-worker

# Только Redis
docker compose logs -f redis
```

### Масштабирование воркеров

Для увеличения пропускной способности рендеринга:

```bash
# Запуск 4 воркеров параллельно
docker compose up -d --scale editor-worker=4

# Проверить количество инстансов
docker compose ps editor-worker
```

### Пересборка после изменений кода

```bash
# Пересобрать образ и перезапустить
docker compose up -d --build

# Только пересобрать без запуска
docker compose build
```

## Health Check

```bash
# Проверка здоровья API
curl http://localhost:3002/health

# Ожидаемый ответ:
# {"status":"ok","version":"...","uptime":...}
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `EDITOR_API_PORT` | Порт API на хосте | `3002` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | Секрет JWT (совпадает с основным приложением) | — |
| `MINIO_ENDPOINT` | Хост MinIO / S3 | `minio` |
| `MINIO_PORT` | Порт MinIO | `9000` |
| `MINIO_ACCESS_KEY` | Access key MinIO | `minioadmin` |
| `MINIO_SECRET_KEY` | Secret key MinIO | `minioadmin` |
| `MINIO_USE_SSL` | Использовать SSL для MinIO | `false` |
| `MINIO_BUCKET_PREFIX` | Префикс бакетов | `""` |
| `MEDIA_DOMAIN` | Публичный URL медиа-сервера | `http://localhost:9000` |
| `REDIS_PORT` | Порт Redis на хосте | `6380` |
| `RENDER_CONCURRENCY` | Количество параллельных рендеров на 1 worker | `2` |
| `RENDER_TIMEOUT_MS` | Таймаут рендера (мс) | `1800000` (30 мин) |
| `LOG_LEVEL` | Уровень логирования | `info` |

## Подключение к существующей инфраструктуре

### PostgreSQL (Supabase)

Для локальной разработки с `supabase start`:

```env
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres
```

Для production (Supabase Cloud):

```env
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

### MinIO (если используется общий MinIO)

```env
MINIO_ENDPOINT=host.docker.internal
MINIO_PORT=9000
MEDIA_DOMAIN=http://localhost:9000
```

### GPU ускорение (опционально)

Для аппаратного кодирования раскомментируйте секцию `deploy` в `editor-worker`:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - capabilities: [gpu]
```

Требуется [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/).

## Мониторинг

```bash
# Статистика контейнеров
docker compose stats

# Количество задач в очереди Redis
docker compose exec redis redis-cli LLEN bull:render:wait
```

## Troubleshooting

### API не стартует

1. Проверить логи: `docker compose logs editor-api`
2. Убедиться, что `DATABASE_URL` доступен из Docker-сети
3. Проверить миграции: таблицы `editor_*` должны существовать

### Worker падает

1. Проверить логи: `docker compose logs editor-worker`
2. Убедиться, что MinIO доступен и бакеты созданы
3. Проверить свободное место в `/tmp/editor-render`

### Redis connection refused

Redis запускается с healthcheck — API ждёт его готовности.
Если Redis не стартует, проверьте порт `6380` на занятость.
