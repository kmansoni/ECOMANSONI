# Task Management API — Эталонный Vibe Coding пример

> **Vibe Coding** — это подход к генерации кода, при котором ИИ создаёт **идеальный production-ready код с первой попытки**, без итераций и правок. Этот проект — демонстрация того, как должен выглядеть такой код.

---

## О проекте

Микро-SaaS бэкенд для управления задачами (мини-Jira). Построен на **FastAPI + SQLAlchemy** с применением принципов **Hexagonal Architecture** (Ports & Adapters).

### Ключевые характеристики

| Характеристика | Реализация |
|---|---|
| Архитектура | Hexagonal (Domain → Application → Infrastructure → Presentation) |
| Фреймворк | FastAPI 0.110+ с asyncio |
| ORM | SQLAlchemy 2.0 Async |
| База данных | PostgreSQL (через asyncpg) |
| Аутентификация | JWT (RS256) + bcrypt |
| Авторизация | RBAC (Role-Based Access Control) |
| Валидация | Pydantic v2 |
| Тесты | pytest-asyncio + httpx |
| Контейнеризация | Docker multi-stage |

---

## Структура файлов

```
ai_engine/vibe_coding/
├── README.md                        # Этот файл
├── architecture.md                  # Архитектурные решения (ADR-style)
├── Dockerfile                       # Multi-stage production build
├── requirements.txt                 # Зависимости с версиями
│
├── app/
│   ├── __init__.py
│   ├── main.py                      # FastAPI app factory + lifespan
│   ├── config.py                    # Pydantic Settings + .env
│   │
│   ├── domain/                      # Чистые доменные объекты (нет ORM, нет HTTP)
│   │   ├── models.py                # Task, User, Project + Enums + Value Objects
│   │   ├── events.py                # Domain Events (TaskCreated, etc.)
│   │   └── exceptions.py           # Domain Exceptions
│   │
│   ├── application/                 # Use Cases / Application Services
│   │   ├── services.py              # TaskService, UserService
│   │   └── dto.py                   # Request/Response DTOs (Pydantic)
│   │
│   ├── infrastructure/              # Технические детали (DB, Security)
│   │   ├── database.py              # SQLAlchemy models + AsyncSession
│   │   ├── repositories.py          # Repository implementations
│   │   └── security.py             # JWT + bcrypt + RBAC
│   │
│   └── presentation/                # HTTP layer
│       ├── api.py                   # FastAPI routers
│       └── middleware.py            # Error handling, logging, rate limiting
│
└── tests/
    └── test_tasks.py                # Unit + Integration tests
```

---

## API Endpoints

### Tasks `/api/v1/tasks`

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| `POST` | `/api/v1/tasks` | Создать задачу | Bearer |
| `GET` | `/api/v1/tasks` | Список задач (pagination, filter) | Bearer |
| `GET` | `/api/v1/tasks/{id}` | Получить задачу | Bearer |
| `PATCH` | `/api/v1/tasks/{id}` | Обновить задачу | Bearer |
| `DELETE` | `/api/v1/tasks/{id}` | Удалить задачу | Bearer + ADMIN/OWNER |
| `POST` | `/api/v1/tasks/{id}/assign` | Назначить задачу | Bearer |
| `POST` | `/api/v1/tasks/{id}/complete` | Завершить задачу | Bearer |

### Users `/api/v1/users`

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| `POST` | `/api/v1/users/register` | Регистрация | Public |
| `POST` | `/api/v1/users/login` | Вход (получить JWT) | Public |
| `GET` | `/api/v1/users/me` | Текущий профиль | Bearer |

### Projects `/api/v1/projects`

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| `POST` | `/api/v1/projects` | Создать проект | Bearer |
| `GET` | `/api/v1/projects` | Список проектов | Bearer |
| `GET` | `/api/v1/projects/{id}` | Детали проекта | Bearer |
| `DELETE` | `/api/v1/projects/{id}` | Удалить проект | Bearer + OWNER |

---

## Запуск

### Локально

```bash
# 1. Установить зависимости
pip install -r requirements.txt

# 2. Создать .env файл
cp .env.example .env
# Отредактировать DATABASE_URL, JWT_SECRET_KEY

# 3. Запустить PostgreSQL
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:16-alpine

# 4. Запустить приложение
cd ai_engine/vibe_coding
uvicorn app.main:app --reload --port 8000
```

### Docker

```bash
docker build -t task-api .
docker run -p 8000:8000 --env-file .env task-api
```

### Тесты

```bash
pytest tests/ -v --asyncio-mode=auto
```

---

## Принципы Vibe Coding в этом проекте

### 1. Нулевые итерации
Каждый файл написан так, как будто это финальная версия. Нет TODO, нет заглушек, нет "доделаем потом".

### 2. Архитектурная чистота
Доменный слой **не знает** ни о FastAPI, ни о SQLAlchemy, ни о JWT. Это позволяет менять инфраструктуру без изменения бизнес-логики.

### 3. Явные контракты
Каждый публичный метод имеет:
- Полные type hints
- Docstring с описанием параметров и возвращаемого значения
- Явную обработку всех ошибок

### 4. Defense-in-depth
- Валидация на уровне Pydantic DTO
- Проверка бизнес-правил в доменном слое
- Авторизация в presentation слое
- Rate limiting в middleware

### 5. Observability by design
- Структурированные логи в каждом middleware
- Request ID сквозной через все слои
- Метрики готовы к интеграции с Prometheus
