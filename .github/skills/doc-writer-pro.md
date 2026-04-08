# Doc Writer Pro — Автодокументация проекта

> Источники: anthropics/skills (technical-writing, code-documentation),
> github/awesome-copilot (app-workflow-docs, architecture-blueprint, adr-creator),
> levnikolaevich (api-docs-generator), alirezarezvani (codebase-onboarding),
> obra/superpowers (subagent-driven-dev)
> Лучшее решение: github/awesome-copilot → app-workflow-docs (5000+ ⭐)

---

## ПРИНЦИП: Docs-as-Code

Документация живёт РЯДОМ с кодом, генерируется полуавтоматически, верифицируется.

---

## 7 ТИПОВ ДОКУМЕНТАЦИИ

### 1. Architecture Overview (`docs/ARCHITECTURE.md`)
```markdown
# Архитектура {Project}
## Диаграмма модулей (Mermaid)
## Стек технологий
## Ключевые решения (ссылки на ADR)
## Data Flow: пользователь → UI → API → DB → side effects
## Деплой: где, как, CI/CD
```

### 2. Module Docs (`docs/modules/{module}.md`)
```markdown
# Модуль: {Мессенджер|Такси|Маркетплейс|...}
## Назначение
## Ключевые компоненты (файл:строка)
## API endpoints / Edge Functions
## Таблицы и RLS
## Состояния (loading, empty, error, success, offline)
## Известные ограничения
```

### 3. ADR — Architecture Decision Records (`docs/adr/NNN-title.md`)
```markdown
# ADR-{NNN}: {Название решения}
Статус: accepted | deprecated | superseded
Дата: {ISO}
## Контекст: почему встал вопрос
## Варианты: A, B, C с плюсами/минусами
## Решение: выбранный вариант + обоснование
## Последствия: что изменилось, trade-offs
```

### 4. API Reference (`docs/api/{function-name}.md`)
```markdown
# Edge Function: {имя}
Endpoint: POST /functions/v1/{имя}
Auth: Bearer token required
## Request Body (Zod schema)
## Response (success + error)
## RLS: какие policies затронуты
## Примеры curl
```

### 5. Database Schema (`docs/DATABASE.md`)
```markdown
# Схема базы данных
## Таблицы (от public schema)
## RLS Policies (таблица → policies)
## Миграции (список, статус, зависимости)
## Индексы (ключевые)
## Триггеры и функции
```

### 6. Onboarding (`docs/ONBOARDING.md`)
```markdown
# Быстрый старт для нового разработчика
## Установка (5 мин)
## Запуск dev (3 мин)
## Структура проекта (обзор)
## Первая задача (tutorial)
## FAQ: частые проблемы
```

### 7. Changelog (`CHANGELOG.md`)
```markdown
## [Unreleased]
### Добавлено
### Изменено
### Исправлено
### Удалено
```

---

## ГЕНЕРАЦИЯ ДОКУМЕНТАЦИИ — ПАЙПЛАЙН

```
1. SCAN: Обход src/, supabase/, server/ — построить карту модулей
2. EXTRACT: Из каждого модуля вытащить: exports, types, hooks, components
3. ANALYZE: Определить связи между модулями (imports graph)
4. GENERATE: Сгенерировать markdown по шаблонам выше
5. VERIFY: Все ссылки на файлы:строки существуют
6. COMMIT: docs/ обновлён
```

---

## ПРАВИЛА

- Документация ВСЕГДА на русском
- Каждая ссылка на код = файл:строка (проверяемая)
- Диаграммы: Mermaid (рендерится в GitHub)
- ADR создаётся для КАЖДОГО архитектурного решения
- docs/ обновляется при изменении кода (не откладывается)
- Без воды: факт → пример → код. Никаких "в данном разделе мы рассмотрим..."
