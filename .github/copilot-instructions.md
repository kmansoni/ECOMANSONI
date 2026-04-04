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

## Система агентов

Проект использует специализированных агентов с многопроходным пайплайном:

| Агент | Роль |
|---|---|
| **orchestrator** | Маршрутизатор задач, координатор пайплайна |
| **architect** | Проектирование архитектуры, исследование аналогов, спецификации |
| **codesmith** | Production-ready реализация по спецификации |
| **review** | Аудит кода: 8 направлений, confidence scoring 0-100 |
| **debug** | Систематическая диагностика: REPRODUCE → ISOLATE → ROOT CAUSE → FIX → VERIFY |
| **ask** | Ответы на вопросы с полным контекстом из реального кода |
| **Explore** | Быстрое исследование кодовой базы (read-only) |

### Пайплайн для фич

```
Explore (исследование) → Architect (спецификация) → CodeSmith (реализация)
  → Review (аудит, цикл до PASS, макс. 3 итерации) → tsc verify
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
