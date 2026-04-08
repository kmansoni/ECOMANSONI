# Интеграция с MCP (Model Context Protocol)

> Подключение внешних инструментов к AI агенту через стандартный протокол MCP: браузер, файловая система, базы данных, API и кастомные серверы.

---

## Содержание

- [Обзор](#обзор)
- [Что такое MCP](#что-такое-mcp)
- [Архитектура MCP в системе](#архитектура-mcp-в-системе)
- [Встроенные MCP серверы](#встроенные-mcp-серверы)
- [Конфигурация серверов](#конфигурация-серверов)
- [Использование инструментов агентами](#использование-инструментов-агентами)
- [Создание кастомного MCP сервера](#создание-кастомного-mcp-сервера)
- [Безопасность](#безопасность)

---

## Обзор

MCP (Model Context Protocol) — открытый стандарт Anthropic для подключения AI моделей к внешним инструментам и источникам данных. В нашей системе MCP-серверы расширяют возможности агентов за пределы работы с кодом.

В контексте гибрида `Ruflo Inside Mansoni` MCP является частью execution/runtime слоя Ruflo. Схема полного распределения ответственности между runtime и project policy описана в [RUFLO_INSIDE_MANSONI.md](../architecture/RUFLO_INSIDE_MANSONI.md).

```
AI Агент
    │
    ▼
MCP Client (встроен в Backend)
    │
    ├── mcp/filesystem  → Файловая система (вне workspace)
    ├── mcp/browser     → Браузер (веб-поиск, скрапинг)
    ├── mcp/database    → PostgreSQL / SQLite
    ├── mcp/github      → GitHub API
    ├── mcp/slack       → Slack (уведомления)
    └── mcp/custom      → Кастомные серверы
```

---

## Что такое MCP

**Model Context Protocol** определяет три типа примитивов:

| Примитив | Описание | Пример |
|---------|---------|-------|
| **Tools** | Функции, которые модель может вызвать | `search_web(query)`, `read_file(path)` |
| **Resources** | Данные, к которым модель может обращаться | Файлы, БД записи, API ответы |
| **Prompts** | Шаблоны промптов от сервера | Заготовленные инструкции |

**Транспорт:** `stdio` (подпроцесс) или `HTTP/SSE`.

---

## Архитектура MCP в системе

```mermaid
graph LR
    subgraph AGENT["AI Agent (Backend)"]
        ORCH[Orchestrator]
        MCPC[MCP Client\nMultiplexer]
    end

    subgraph MCP_SERVERS["MCP Серверы"]
        FS[filesystem\nстандартный]
        BR[puppeteer\nбраузер]
        DB[postgres\nБД]
        GH[github\nAPI]
        CU[custom\nсервер]
    end

    ORCH -->|tool_call| MCPC
    MCPC -->|stdio/HTTP| FS
    MCPC -->|stdio/HTTP| BR
    MCPC -->|stdio/HTTP| DB
    MCPC -->|stdio/HTTP| GH
    MCPC -->|stdio/HTTP| CU
```

### MCP Client Multiplexer

Единый клиент управляет всеми подключёнными серверами:

```python
# ai_engine/mcp/client.py
class MCPClientMultiplexer:
    """
    Управляет пулом MCP серверов.
    Маршрутизирует вызовы инструментов к нужному серверу.
    """

    def __init__(self, config: MCPConfig):
        self.servers: dict[str, MCPServerConnection] = {}
        self._load_servers(config)

    async def call_tool(
        self,
        tool_name: str,
        arguments: dict
    ) -> ToolResult:
        """Вызвать инструмент по имени (формат: server/tool_name)."""
        server_name, actual_tool = tool_name.split("/", 1)
        server = self.servers[server_name]
        return await server.call_tool(actual_tool, arguments)

    async def list_all_tools(self) -> list[ToolDefinition]:
        """Получить список всех доступных инструментов."""
        tools = []
        for name, server in self.servers.items():
            server_tools = await server.list_tools()
            for tool in server_tools:
                tool.name = f"{name}/{tool.name}"
            tools.extend(server_tools)
        return tools
```

---

## Встроенные MCP серверы

### 1. `@modelcontextprotocol/server-filesystem`

Безопасный доступ к файловой системе за пределами workspace.

**Инструменты:**
| Tool | Описание |
|------|---------|
| `read_file` | Прочитать файл |
| `write_file` | Записать файл |
| `list_directory` | Список содержимого директории |
| `create_directory` | Создать директорию |
| `delete_file` | Удалить файл |
| `move_file` | Переместить/переименовать |
| `search_files` | Поиск файлов по паттерну |

**Пример вызова агента:**
```python
result = await mcp.call_tool(
    "filesystem/read_file",
    {"path": "/home/user/notes.txt"}
)
```

---

### 2. `@modelcontextprotocol/server-puppeteer`

Управление браузером Chromium: скрапинг, скриншоты, автоматизация.

**Инструменты:**
| Tool | Описание |
|------|---------|
| `puppeteer_navigate` | Открыть URL |
| `puppeteer_screenshot` | Сделать скриншот |
| `puppeteer_click` | Клик по элементу |
| `puppeteer_fill` | Заполнить поле |
| `puppeteer_evaluate` | Выполнить JavaScript |
| `puppeteer_get_content` | Получить HTML/текст страницы |

**Пример — поиск документации:**
```python
# Агент ищет документацию в браузере
await mcp.call_tool("puppeteer/puppeteer_navigate", {
    "url": "https://docs.python.org/3/library/asyncio.html"
})
content = await mcp.call_tool("puppeteer/puppeteer_get_content", {
    "selector": "article"
})
```

---

### 3. `@modelcontextprotocol/server-postgres`

Прямые SQL запросы к PostgreSQL.

**Инструменты:**
| Tool | Описание |
|------|---------|
| `query` | Выполнить SELECT запрос |
| `execute` | Выполнить INSERT/UPDATE/DELETE |
| `list_tables` | Список таблиц |
| `describe_table` | Схема таблицы |

**Пример:**
```python
result = await mcp.call_tool("postgres/query", {
    "sql": "SELECT * FROM agent_sessions WHERE user_id = $1 LIMIT 10",
    "params": ["user-uuid-123"]
})
```

---

### 4. `@modelcontextprotocol/server-github`

GitHub API через MCP.

**Инструменты:**
| Tool | Описание |
|------|---------|
| `get_file_contents` | Содержимое файла из репозитория |
| `search_repositories` | Поиск репозиториев |
| `create_issue` | Создать issue |
| `create_pull_request` | Создать PR |
| `list_commits` | История коммитов |
| `push_files` | Отправить файлы |

---

### 5. `@modelcontextprotocol/server-brave-search`

Веб-поиск через Brave Search API.

**Инструменты:**
| Tool | Описание |
|------|---------|
| `brave_web_search` | Поиск в интернете |
| `brave_local_search` | Поиск по местным результатам |

---

## Конфигурация серверов

### Файл конфигурации

```json
// .mcp/config.json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/allowed/path/1",
        "/allowed/path/2"
      ],
      "enabled": true
    },
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
      "env": {
        "PUPPETEER_HEADLESS": "true"
      },
      "enabled": true
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_URL": "${DATABASE_URL}"
      },
      "enabled": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      },
      "enabled": true
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${BRAVE_API_KEY}"
      },
      "enabled": false
    }
  },
  "defaults": {
    "timeout_ms": 30000,
    "max_retries": 3
  }
}
```

### Переменные окружения

```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/ai_engine
GITHUB_TOKEN=ghp_...
BRAVE_API_KEY=BSA...
```

---

## Использование инструментов агентами

### Как агент выбирает инструмент

```python
# Список инструментов передаётся в системный промпт LLM
tools = await mcp_client.list_all_tools()

# LLM возвращает tool_call в ответе:
{
    "tool_calls": [
        {
            "name": "brave-search/brave_web_search",
            "arguments": {
                "query": "Python asyncio best practices 2024"
            }
        }
    ]
}

# Агент выполняет вызов
result = await mcp_client.call_tool(
    tool_calls[0]["name"],
    tool_calls[0]["arguments"]
)
```

### Цепочка инструментов

```python
# Research Agent: найти документацию и прочитать
async def research_external_library(library: str):
    # 1. Поиск документации
    search_result = await mcp.call_tool(
        "brave-search/brave_web_search",
        {"query": f"{library} python documentation official"}
    )
    docs_url = extract_first_url(search_result)

    # 2. Открыть документацию
    await mcp.call_tool("puppeteer/puppeteer_navigate", {"url": docs_url})

    # 3. Извлечь содержимое
    content = await mcp.call_tool(
        "puppeteer/puppeteer_get_content",
        {"selector": "main, article, .content"}
    )

    # 4. Сохранить в память
    await memory.add_knowledge(
        topic=library,
        content=f"Документация {library}: {content[:2000]}",
        confidence=0.8
    )
    return content
```

---

## Создание кастомного MCP сервера

### Минимальный Python MCP сервер

```python
# custom_mcp_server.py
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.types import Tool, TextContent
import mcp.server.stdio

server = Server("my-custom-server")

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="my_tool",
            description="Описание инструмента",
            inputSchema={
                "type": "object",
                "properties": {
                    "param1": {"type": "string", "description": "Параметр 1"}
                },
                "required": ["param1"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "my_tool":
        result = f"Результат для: {arguments['param1']}"
        return [TextContent(type="text", text=result)]
    raise ValueError(f"Unknown tool: {name}")

async def main():
    async with mcp.server.stdio.stdio_server() as (read, write):
        await server.run(
            read, write,
            InitializationOptions(
                server_name="my-custom-server",
                server_version="0.1.0",
                capabilities=server.get_capabilities()
            )
        )

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

### Регистрация кастомного сервера

```json
// .mcp/config.json
{
  "servers": {
    "my-custom": {
      "command": "python",
      "args": ["/path/to/custom_mcp_server.py"],
      "enabled": true
    }
  }
}
```

---

## Безопасность

### Принципы безопасного использования MCP

1. **Минимальные права**: каждый сервер получает только необходимый доступ
2. **Явный allowlist**: `filesystem` сервер явно указывает разрешённые директории
3. **Подтверждение деструктивных операций**: `delete_file`, `execute` требуют approve
4. **Логирование**: все вызовы MCP-инструментов логируются с параметрами
5. **Timeout**: все вызовы имеют максимальный timeout 30 сек
6. **Sandbox для браузера**: puppeteer работает в headless режиме без доступа к local storage пользователя

### Матрица прав

| Сервер | Права | Требует approve |
|--------|-------|----------------|
| `filesystem` | Чтение/запись в явно указанных путях | Запись |
| `puppeteer` | Интернет, без доступа к cookies пользователя | Нет |
| `postgres` | Доступ только к `agent_*` таблицам | DML |
| `github` | Только указанные репозитории | Push, PR |

---

## Связанные разделы

- [Рой агентов](../agents/README.md) — как агенты используют MCP инструменты
- [Технические спецификации](../technical-specs/README.md) — API контракты
- [Терминальные навыки](../terminal-skills/README.md) — запуск MCP серверов

---

*Версия: 1.0.0 | Протокол: MCP 0.6.x*
