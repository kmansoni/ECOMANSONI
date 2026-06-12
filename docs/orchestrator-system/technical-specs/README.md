# Технические спецификации (Technical Specifications)

> API контракты, форматы сообщений, SLO, схемы данных и протоколы взаимодействия компонентов системы.

---

## Содержание

- [Обзор](#обзор)
- [REST API](#rest-api)
- [WebSocket протокол](#websocket-протокол)
- [Форматы сообщений](#форматы-сообщений)
- [Схемы данных](#схемы-данных)
- [SLO / SLA](#slo--sla)
- [Лимиты и ограничения](#лимиты-и-ограничения)
- [Коды ошибок](#коды-ошибок)
- [Версионирование API](#версионирование-api)

---

## Обзор

Все компоненты системы взаимодействуют через чётко определённые контракты. Backend сервер (`ai_engine/server/main.py`) предоставляет REST API и WebSocket для потоковых ответов.

```
VS Code Extension  ──REST──►  Backend Server (FastAPI)
                   ◄─WS──────  /ws/agent/stream

Backend Server  ──gRPC──►  NVIDIA Riva (TTS/STT)
Backend Server  ──REST──►  OpenAI / Anthropic API
Backend Server  ──SQL───►  PostgreSQL
Backend Server  ──Redis─►  Cache / Message Queue
```

**Base URL**: `http://localhost:8000/api/v1`

---

## REST API

### Агентные операции

#### `POST /api/v1/agent/message`

Отправить сообщение агенту и получить ответ.

**Request:**
```json
{
  "session_id": "uuid-...",
  "message": "Напиши функцию для парсинга JSON",
  "context": {
    "active_file": "/workspace/src/parser.py",
    "selected_text": null,
    "cursor_line": 42
  },
  "stream": false
}
```

**Response (200):**
```json
{
  "session_id": "uuid-...",
  "message_id": "msg-uuid-...",
  "response": "Вот реализация...",
  "actions": [
    {
      "type": "write_file",
      "path": "/workspace/src/parser.py",
      "content": "...",
      "requires_approval": true
    }
  ],
  "thinking_steps": ["Research Phase...", "Planning..."],
  "tokens_used": 1247,
  "latency_ms": 3450
}
```

#### `POST /api/v1/agent/stream`

Потоковый ответ агента (Server-Sent Events или WebSocket).

**Request:** аналогичен `/api/v1/agent/message`, `"stream": true`

**Response:** `text/event-stream`
```
data: {"type": "thinking", "content": "Изучаю файловую структуру..."}
data: {"type": "thinking", "content": "Нашёл паттерн в src/auth/"}
data: {"type": "response_chunk", "content": "Вот реализация "}
data: {"type": "response_chunk", "content": "функции parse_json:"}
data: {"type": "action", "action": {"type": "write_file", ...}}
data: {"type": "done", "tokens_used": 1247}
```

#### `POST /api/v1/session/start`

Начать новую сессию.

**Request:**
```json
{
  "user_id": "user-uuid",
  "workspace_path": "/workspace",
  "interface": "vscode"
}
```

**Response:**
```json
{
  "session_id": "uuid-...",
  "memory_loaded": true,
  "previous_sessions": 42,
  "user_profile": {
    "expertise_level": "expert",
    "preferred_language": "python"
  }
}
```

#### `POST /api/v1/session/end`

Завершить сессию и сохранить в эпизодическую память.

**Request:**
```json
{
  "session_id": "uuid-...",
  "summary": "Реализовали модуль аутентификации JWT",
  "outcomes": ["auth.py создан", "12 тестов написано"],
  "key_topics": ["jwt", "authentication", "python"]
}
```

#### `GET /api/v1/session/{session_id}/history`

Получить историю сессии.

**Response:**
```json
{
  "session_id": "uuid-...",
  "messages": [
    {
      "role": "user",
      "content": "...",
      "timestamp": 1711875600.0
    }
  ],
  "token_count": 3241
}
```

---

### Операции с памятью

#### `GET /api/v1/memory/context`

Получить агрегированный контекст из всех уровней памяти.

**Query params:** `?query=JWT+authentication&max_tokens=2000`

**Response:**
```json
{
  "working_history": [...],
  "relevant_episodes": [
    {
      "session_id": "...",
      "summary": "Реализовывали JWT в прошлый раз",
      "relevance_score": 0.87,
      "timestamp": 1711700000.0
    }
  ],
  "relevant_facts": [
    {
      "content": "Проект использует PyJWT 2.8.0",
      "confidence": 0.95,
      "topic": "dependencies"
    }
  ],
  "user_profile": {...}
}
```

#### `POST /api/v1/memory/knowledge`

Добавить факт в семантическую память.

**Request:**
```json
{
  "topic": "architecture",
  "content": "Проект использует Clean Architecture с DI через dependency_injector",
  "confidence": 0.9,
  "source": "user"
}
```

---

### Операции с VS Code

#### `POST /api/v1/vscode/execute`

Выполнить действие в VS Code (требуется активное расширение).

**Request:**
```json
{
  "action": "read_file",
  "params": {
    "path": "/workspace/src/auth.py"
  }
}
```

**Actions:**
| action | params |
|--------|--------|
| `read_file` | `path` |
| `write_file` | `path`, `content`, `requires_approval` |
| `run_command` | `command`, `cwd`, `requires_approval` |
| `get_symbols` | `path` |
| `get_diagnostics` | `path` |
| `find_files` | `pattern`, `exclude` |
| `open_file` | `path`, `line` |

---

## WebSocket протокол

### Endpoint: `ws://localhost:8000/ws/agent/{session_id}`

**Сообщения клиента → сервер:**

```json
// Отправить сообщение
{
  "type": "message",
  "content": "Запусти тесты",
  "context": {}
}

// Подтвердить действие агента
{
  "type": "action_approval",
  "action_id": "act-uuid",
  "approved": true
}

// Отменить текущую задачу
{
  "type": "cancel",
  "reason": "user_cancelled"
}
```

**Сообщения сервер → клиент:**

```json
// Этап мышления
{"type": "thinking", "step": "research", "content": "Анализирую файлы..."}

// Чанк текстового ответа
{"type": "response_chunk", "content": "Вот решение..."}

// Запрос подтверждения действия
{
  "type": "action_request",
  "action_id": "act-uuid",
  "action": {
    "type": "write_file",
    "path": "/src/auth.py",
    "diff": "--- a/src/auth.py\n+++ b/src/auth.py\n..."
  }
}

// Прогресс выполнения
{"type": "progress", "step": "writing_tests", "percent": 60}

// Завершение
{"type": "done", "tokens_used": 1247, "latency_ms": 5200}

// Ошибка
{"type": "error", "code": "CONTEXT_OVERFLOW", "message": "..."}
```

---

## Форматы сообщений

### AgentMessage

```typescript
interface AgentMessage {
  session_id: string;          // UUID сессии
  message_id: string;          // UUID сообщения
  role: "user" | "assistant" | "system";
  content: string;             // Текст сообщения (Markdown)
  timestamp: number;           // Unix timestamp
  token_count: number;         // Приблизительное число токенов
  metadata?: {
    file_path?: string;        // Связанный файл
    line_number?: number;      // Строка в файле
    action_ids?: string[];     // ID связанных действий
  };
}
```

### AgentAction

```typescript
interface AgentAction {
  action_id: string;
  type: ActionType;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  requires_approval: boolean;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

type ActionType =
  | "read_file"
  | "write_file"
  | "delete_file"
  | "run_command"
  | "open_browser"
  | "search_web"
  | "query_database";
```

### Task

```typescript
interface Task {
  task_id: string;
  session_id: string;
  intent: string;              // Классифицированное намерение
  description: string;
  status: TaskStatus;
  priority: "critical" | "high" | "normal" | "low";
  created_at: number;
  completed_at?: number;
  subtasks: SubTask[];
  dependencies: string[];      // task_id[] которые должны завершиться первыми
  assigned_agent: string;
  result?: TaskResult;
}

type TaskStatus =
  | "queued"
  | "researching"
  | "planning"
  | "executing"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";
```

---

## Схемы данных

### Таблица sessions (PostgreSQL)

```sql
CREATE TABLE agent_sessions (
    session_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    workspace_path  TEXT,
    interface       TEXT CHECK (interface IN ('vscode', 'cli', 'voice', 'web')),
    summary         TEXT,
    token_count     INTEGER DEFAULT 0,
    message_count   INTEGER DEFAULT 0
);
```

### Таблица tasks

```sql
CREATE TABLE agent_tasks (
    task_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES agent_sessions(session_id),
    intent          TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'queued',
    assigned_agent  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    result_json     JSONB,
    error_message   TEXT,
    tokens_used     INTEGER DEFAULT 0
);

CREATE INDEX idx_tasks_session ON agent_tasks(session_id);
CREATE INDEX idx_tasks_status ON agent_tasks(status) WHERE status != 'completed';
```

---

## SLO / SLA

| Метрика | Target | Critical |
|---------|--------|----------|
| **Первый токен ответа** | < 1 сек | < 3 сек |
| **Полный ответ (простой запрос)** | < 5 сек | < 15 сек |
| **Полный ответ (с research)** | < 30 сек | < 60 сек |
| **STT latency (ARIA)** | < 300 мс | < 1 сек |
| **TTS latency (ARIA)** | < 500 мс | < 2 сек |
| **Memory retrieval** | < 100 мс | < 300 мс |
| **Uptime** | 99.9% | 99.5% |
| **Доступность API** | 99.95% | 99.9% |

### Метрики мониторинга

```python
# ai_engine/monitoring/metrics.py
METRICS = {
    "first_token_latency_ms": Histogram(buckets=[100, 300, 500, 1000, 3000]),
    "total_response_latency_ms": Histogram(buckets=[1000, 5000, 15000, 30000, 60000]),
    "tokens_per_request": Histogram(buckets=[100, 500, 1000, 2000, 4000, 8000]),
    "tasks_completed_total": Counter(labels=["intent", "status"]),
    "memory_retrieval_latency_ms": Histogram(buckets=[10, 50, 100, 300]),
    "active_sessions": Gauge(),
}
```

---

## Лимиты и ограничения

| Параметр | Лимит |
|---------|-------|
| Максимальный размер сообщения | 32 KB |
| Максимальный размер файла для чтения | 512 KB |
| Максимальное число файлов в research | 50 файлов |
| Максимум токенов в контекстном окне | 128 000 (GPT-4o) |
| Рабочая память по умолчанию | 4 096 токенов |
| Максимум параллельных задач | 8 |
| Timeout одной задачи | 120 сек |
| Rate limit (запросы/минуту) | 60 |
| WebSocket соединений на пользователя | 3 |

---

## Коды ошибок

| Код | HTTP | Описание | Действие |
|-----|------|---------|---------|
| `AUTH_REQUIRED` | 401 | Сессия не найдена или истекла | Начать новую сессию |
| `CONTEXT_OVERFLOW` | 422 | Превышен лимит токенов | Сжать контекст или начать новую сессию |
| `FILE_NOT_FOUND` | 404 | Файл не существует | Проверить путь |
| `APPROVAL_REQUIRED` | 202 | Действие ожидает подтверждения | Отправить `action_approval` |
| `RATE_LIMIT_EXCEEDED` | 429 | Превышен rate limit | Подождать, retry через `Retry-After` сек |
| `AGENT_TIMEOUT` | 504 | Агент не ответил за 120 секунд | Повторить с более конкретной задачей |
| `LLM_UNAVAILABLE` | 503 | LLM провайдер недоступен | Retry через 30 сек |
| `WORKSPACE_ACCESS_DENIED` | 403 | Попытка выйти за пределы workspace | Проверить путь |
| `TASK_CANCELLED` | 200 | Задача отменена пользователем | Normal |
| `INVALID_ACTION` | 400 | Неизвестный тип action | Проверить тип |

**Формат ошибки:**
```json
{
  "error": {
    "code": "CONTEXT_OVERFLOW",
    "message": "Контекстное окно переполнено: 8450 > 8192 токенов",
    "details": {
      "current_tokens": 8450,
      "max_tokens": 8192
    },
    "request_id": "req-uuid-..."
  }
}
```

---

## Версионирование API

- Текущая версия: **v1**
- URL prefix: `/api/v1/`
- Заголовок версии: `X-API-Version: 1`

**Политика изменений:**
- Minor changes (новые поля в response): без изменения версии
- Breaking changes: новая версия (`v2`), старая работает 6 месяцев
- Deprecation: заголовок `Deprecation: true` + `Sunset: <date>`

---

## Связанные разделы

- [Ядро оркестратора](../orchestrator-core/README.md) — внутренние форматы задач
- [MCP интеграция](../mcp-integration/README.md) — протокол внешних инструментов
- [Архитектура](../architecture/README.md) — общая диаграмма компонентов

---

*Версия: 1.0.0 | Источник: [`ai_engine/server/main.py`](../../../ai_engine/server/main.py)*
