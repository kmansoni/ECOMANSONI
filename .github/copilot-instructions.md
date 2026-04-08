# Проект: Your AI Companion

## Стек

- **Frontend**: React 18 + TypeScript 5.8 + Vite 5.4 + TailwindCSS 3 + shadcn/ui + Zustand 5 + TanStack Query 5
- **Backend**: Supabase (PostgreSQL 15, Edge Functions на Deno, Realtime, Storage, RLS)
- **Mobile**: Capacitor 7 (Android, запланирован iOS)
- **Звонки**: mediasoup SFU + WebRTC + WebSocket сигнализация
- **Сервисы**: notification-router, email-router, reels-arbiter (Node.js)

## Язык общения

Все ответы, комментарии в коде, сообщения коммитов — **только на русском языке**.

## Стандарты кода

- TypeScript strict mode (`tsconfig.strict.json` — zero errors)
- Проверка: `npx tsc -p tsconfig.app.json --noEmit` после КАЖДОГО изменения
- ESLint: `npm run lint` — zero warnings
- Импорты: `@/` = `src/`, относительные для файлов в той же директории
- Компоненты: функциональные (FC не использовать, `export function ComponentName`)
- Состояние: Zustand stores в `src/stores/`, React Query для серверного состояния
- Файлы: kebab-case для утилит, PascalCase для компонентов

## Архитектурные ограничения

- Supabase RLS обязателен на ВСЕХ таблицах — НИКОГДА не отключать
- Edge Functions: `Deno.serve()`, CORS headers обязательны, `Authorization: Bearer` проверка
- Миграции: только additive (никогда DROP COLUMN в одном релизе с удалением кода)
- E2EE: MessageKeyBundle паттерн для шифрованных чатов, legacy `e2ee.ts` удалён
- Размер компонента: max 400 строк, декомпозиция обязательна при превышении

## Структура проекта

```
src/
  components/   — React компоненты (chat/, ui/, settings/, calls/)
  hooks/        — React хуки (useAuth, useChannels, useMessageReactions...)
  stores/       — Zustand stores
  lib/          — Утилиты, supabase клиент, логгер
  contexts/     — React контексты
  pages/        — Маршрутизируемые страницы
supabase/
  migrations/   — SQL миграции (sequential timestamps)
  functions/    — Deno Edge Functions
server/         — Node.js сервисы (SFU, calls-ws)
services/       — Standalone сервисы (notification-router, email-router)
scripts/        — CI/CD, деплой, утилиты
```

## Рой агентов (Swarm Architecture)

33 агента работают как единый рой с общим мозгом (`/memories/session/swarm/`).
Протокол: `.github/skills/swarm-protocol/SKILL.md`

### Ядро

| Агент | Роль |
|---|---|
| **mansoni** | Основной агент проекта. Каноническая точка входа в режим `mansoni-core`: Ruflo-first orchestration + skills Mansoni + quality gates |
| **mansoni-core** | Явный алиас усиленного core-режима для ручного выбора в picker |

### Специалисты (10)

| Агент | Роль |
|---|---|
| **mansoni-architect** | Проектирование архитектуры, спецификации, ADR |
| **mansoni-coder** | Production-ready реализация по спецификации |
| **mansoni-debugger** | REPRODUCE → ISOLATE → ROOT CAUSE → FIX → VERIFY |
| **mansoni-devops** | CI/CD, деплой, мониторинг, Supabase CLI |
| **mansoni-researcher** | Read-only исследование кодовой базы и доменов |
| **mansoni-reviewer** | Аудит по 8 направлениям, scoring 0-100 (PASS/RISKY/FAIL) |
| **mansoni-tester** | Браузерное тестирование через Playwright MCP |
| **mansoni-security-engineer** | OWASP Top 10, пентест, STRIDE-A, RLS, E2EE |
| **mansoni-performance-engineer** | Core Web Vitals, bundle, profiling, SQL |

### Доменные координаторы (10)

messenger, social, commerce, crm, dating, insurance, taxi, streaming, realestate, ai

### Имплементаторы CodeSmith (10)

api, auth, e2ee, mobile, react, realtime, supabase, testing, typescript + базовый codesmith

### Узкие аудиторы (3)

reviewer-architecture, reviewer-database, reviewer-security

### Автономность оркестратора

Оркестратор работает полностью автономно:
- Все подтверждения (allow, continue, approve) — делает **сам**
- tsc/lint ошибки — чинит и продолжает
- Агент вернул FAIL — анализирует, чинит, повторяет (макс 3)
- Эскалирует только: git push production, DROP TABLE, credentials

### Пайплайн для фич

```
mansoni-researcher → mansoni-architect → mansoni-coder → codesmith-{...}
  → mansoni-reviewer → reviewer-{security|database} → mansoni-tester → tsc verify
```

## Каталог скиллов

Скиллы загружаются агентами по необходимости:

| Скилл | Назначение |
|---|---|
| **messenger-platform** | Чат, каналы, звонки, E2EE, уведомления |
| **react-production** | Компоненты, хуки, Zustand, TanStack Query, production-паттерны |
| **supabase-production** | RLS, миграции, Edge Functions, Realtime, PostgreSQL |
| **feature-dev** | 7-фазный workflow разработки фичи |
| **code-review** | Multi-agent review с 5 параллельными направлениями |
| **security-audit** | 7-категорийный аудит безопасности мессенджера |
| **silent-failure-hunter** | Поиск скрытых ошибок и молчаливых сбоев |
| **code-simplifier** | Упрощение кода с сохранением функциональности |
| **review-toolkit** | Оркестратор review-скиллов |
| **stub-hunter** | Поиск заглушек, fake success, пустых кнопок, декоративной полноты |
| **integration-checker** | Проверка межсервисных цепочек (UI → API → DB → side effects) |
| **invariant-guardian** | Защита доменных инвариантов (правила, которые нельзя нарушить) |
| **completion-checker** | Проверка полноты функции: все UI-состояния, recovery paths |
| **platform-auditor** | CTO-уровень аудит зрелости: scoring, risk map, вердикт |
| **recovery-engineer** | Recovery paths: reconnect, retry, timeout, rollback, stale state |
| **deep-audit** | Тотальный последовательный аудит: строчка за строчкой, 8 категорий, запись отчётов |
| **coherence-checker** | Согласованность backend↔frontend↔миграции: поиск разрывов в цепочке данных |
| **functional-tester** | Функциональное тестирование: tsc, lint, vitest, data flow verification |
| **doc-writer** | Документация в проекте: архитектура, API, schema, модули в docs/ |
| **agent-mastery** | Мастерство агента: глубинная реализация, самообучение, антидубли, humanizer |
| **orchestrator-laws** | Законы оркестратора: анти-дубли, zero-мусор, мультиагентный пайплайн |
| **code-humanizer** | Код неотличим от человеческого: убирает AI-паттерны |
| **rug-quality-gate** | Итерационный Quality Gate: generate → review → fix → review до PASS |
| **test-pipeline** | Тест-пайплайн: unit (Vitest) → integration → E2E (Playwright) |
| **ux-reviewer** | UX-ревью: эвристики Нильсена, touch/mobile, accessibility |

## Автоматические инструкции

Файлы в `.github/instructions/` автоматически подгружаются по `applyTo` паттернам:

- `react-components.instructions.md` → `src/components/**/*.tsx`
- `react-hooks.instructions.md` → `src/hooks/**/*.ts`
- `edge-functions.instructions.md` → `supabase/functions/**/*.ts`
- `supabase-migrations.instructions.md` → `supabase/migrations/**/*.sql`

## Память проекта

Перед началом работы ОБЯЗАТЕЛЬНО читай `/memories/repo/` — там накоплены проверенные факты о проекте, известные ловушки и паттерны.
