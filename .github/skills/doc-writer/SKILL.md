---
name: doc-writer
description: "Пишет документацию прямо в проект: архитектура, API, schema, deployment. Создаёт папки и файлы без ограничений на длину. Use when: документация, описать архитектуру, написать README, API docs, schema docs, deployment guide."
argument-hint: "[что документировать: архитектура, модуль, API, deployment]"
user-invocable: true
---

# Doc Writer — Документация в проекте

Пишет документацию прямо в файловую систему проекта. Создаёт папки, файлы, структуру. Без ограничений на длину — пишет столько, сколько нужно.

## Принцип

> Документация пишется В проекте, а не В чате. Каждый документ — markdown-файл в `docs/`. Пишем столько, сколько нужно — хоть 10000 строк.

## Структура документации

```
docs/
  architecture/
    overview.md           — Общая архитектура платформы
    frontend.md           — React + TypeScript + Vite
    backend.md            — Supabase + Edge Functions
    calls.md              — mediasoup SFU + WebRTC + WebSocket
    realtime.md           — Supabase Realtime подписки
    security.md           — RLS, Auth, E2EE, CORS
    mobile.md             — Capacitor, Android, iOS
  api/
    edge-functions.md     — Все Edge Functions: endpoint, params, response
    rpc-functions.md      — Все PostgreSQL RPC: params, returns
    realtime-channels.md  — Все Realtime каналы и events
    websocket-protocol.md — WS протокол звонков
  schema/
    tables.md             — Все таблицы с полями и типами
    rls-policies.md       — Все RLS политики
    migrations.md         — Гид по миграциям
    indexes.md            — Все индексы
  modules/
    chat.md               — Модуль чата: архитектура, файлы, data flow
    calls.md              — Модуль звонков
    reels.md              — Модуль ленты
    stories.md            — Модуль историй
    notifications.md      — Модуль уведомлений
    settings.md           — Модуль настроек
  guides/
    setup.md              — Как развернуть проект
    deployment.md         — Как деплоить
    contributing.md       — Гид для контрибьюторов
    troubleshooting.md    — Частые проблемы и решения
  audit/
    YYYY-MM-DD-*.md       — Отчёты аудитов
```

## Процесс написания

### 1. Исследование
- Прочитай ВСЕ файлы модуля/темы
- Изучи imports, exports, data flow
- Прочитай существующую документацию (если есть)
- Прочитай миграции для schema

### 2. Создание структуры
- Создай папку если не существует
- Определи оглавление документа
- Спланируй секции

### 3. Написание
- Пиши ВЕСЬ документ за один проход
- Ссылайся на КОНКРЕТНЫЕ файлы и строки
- Добавляй примеры кода из РЕАЛЬНОГО проекта (не выдуманные)
- Mermaid-диаграммы для архитектуры и data flow
- Таблицы для API endpoints, таблиц, типов

### 4. Cross-references
- Ссылки между документами
- Ссылки на исходный код
- Актуальные даты и версии

### 5. Финальный QA-проход
- Проверь битые ссылки и якоря
- Проверь единообразие терминов по всему документу
- Упрости перегруженные абзацы: сложное должно объясняться инженерно, но без лишней тяжести
- Убедись, что документ можно читать изолированно без доступа к чату

## Шаблоны

### Модуль
```markdown
# {Название модуля}

## Обзор
{Одно предложение: что это и зачем}

## Архитектура
{Mermaid-диаграмма}

## Файлы
| Файл | Назначение | Строк |
|------|-----------|-------|
| ... | ... | ... |

## Data Flow
{Описание пути данных от DB до UI}

## API
{Все endpoints/queries модуля}

## Состояния UI
{Loading, Error, Empty, Success}

## Известные проблемы
{Текущие баги и техдолг}
```

### API Endpoint
```markdown
## {METHOD} {path}

**Назначение**: {описание}
**Auth**: {требуется / нет / service_role}
**Rate limit**: {N req/min}

### Request
{JSON schema}

### Response
{JSON schema}

### Errors
| Code | Описание |
|------|----------|
| 401 | Не авторизован |
| 429 | Rate limit |
```

## Правила
- Документация на **русском языке**
- Все примеры кода — из **реального проекта** (не выдуманные)
- Каждый файл — самодостаточный (можно читать отдельно)
- Нет ограничений на длину — пиши столько, сколько нужно
- Mermaid-диаграммы для архитектуры
- Таблицы для структурированных данных
- Ссылки на исходный код: `[файл](../../src/path/file.ts)`
- Перед завершением делай отдельный doc QA pass: links, terminology, consistency, explainability
