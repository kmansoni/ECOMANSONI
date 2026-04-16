---
name: mcp-builder
description: >-
  Создание MCP (Model Context Protocol) серверов для интеграции LLM с внешними API.
  Use when: MCP server, создание MCP, интеграция внешних сервисов, Deno MCP, TypeScript MCP.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/mcp-builder
---

# MCP Server — Руководство по созданию

Создание quality MCP (Model Context Protocol) серверов для взаимодействия LLM с внешними сервисами.

## Принципы Agent-Centric дизайна

### Build for Workflows, Not Just API Endpoints
- НЕ просто оборачивать API endpoints — создавать thoughtful workflow tools
- Консолидировать related operations (например, `schedule_event` проверяет доступность И создаёт событие)
- Фокус на завершении полных задач, не отдельных API вызовов

### Optimize for Limited Context
- Агенты имеют ограниченный контекст — каждый токен на счету
- Возвращать high-signal информацию, не exhaustive data dumps
- Поддерживать "concise" vs "detailed" форматы ответов
- Human-readable идентификаторы вместо технических кодов

### Actionable Error Messages
- Ошибки должны направлять агента к правильным паттернам
- Конкретные следующие шаги: "Try using filter='active_only'"
- Образовательные, не просто диагностические ошибки

### Natural Task Subdivisions
- Имена tools отражают как люди думают о задачах
- Группировка связанных tools с consistent prefixes
- Дизайн вокруг natural workflows

## Фазы разработки

### Фаза 1: Исследование и планирование

1. **Изучить MCP Protocol**: `https://modelcontextprotocol.io/llms-full.txt`
2. **SDK документация**:
   - TypeScript: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
   - Python: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
3. **Exhaustively изучить API** целевого сервиса: auth, rate limits, pagination, ошибки, endpoints, модели данных
4. **План реализации**:
   - Список самых ценных endpoints/operations
   - Shared utilities и helpers
   - Input validation (Zod для TypeScript, Pydantic для Python)
   - Consistent response formats
   - Error handling strategy

### Фаза 2: Реализация

**Структура TypeScript проекта:**
```
mcp-server/
├── src/
│   ├── index.ts         # server entry
│   ├── tools/           # tool implementations
│   ├── utils/           # shared helpers
│   └── types.ts         # types & schemas
├── package.json
└── tsconfig.json
```

**Core infrastructure сначала:**
- API request helpers
- Error handling utilities
- Response formatting (JSON + Markdown)
- Pagination helpers
- Auth/token management

**Для каждого tool:**
- Zod schema с constraints + descriptive field descriptions
- Comprehensive docstring (summary, purpose, params, return, examples, errors)
- Async/await для I/O
- Tool annotations: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`

### Фаза 3: Review и рефайн

- **DRY**: без дублирования кода между tools
- **Composability**: shared logic в функциях
- **Consistency**: одинаковый формат ответов
- **Error Handling**: все internal calls обработаны
- **Type Safety**: полное покрытие TypeScript типами, no `any`
- **Build**: `npm run build` без ошибок

### Фаза 4: Evaluations

Создать 10 evaluation вопросов:
- Independent, read-only, complex, realistic, verifiable, stable
- XML формат: `<evaluation><qa_pair><question>...</question><answer>...</answer></qa_pair></evaluation>`

## Наш стек

Для проекта Mansoni MCP серверы:
- **Runtime**: Deno (Edge Functions) или Node.js
- **Validation**: Zod
- **Transport**: stdio или HTTP/SSE
- **Auth**: Bearer token verification
- **CORS**: обязателен для Edge Functions
