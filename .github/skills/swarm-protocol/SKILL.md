# Swarm Protocol — Единый Мозг Роя

## Архитектура

Все агенты — это **один рой с единым мозгом**, а не изолированные экземпляры.
Мозг живёт в `/memories/session/swarm/`. Каждый агент при старте ЧИТАЕТ состояние, при завершении ПИШЕТ результат.

```
┌──────────────────────────────────────────────────────────┐
│                    ЕДИНЫЙ МОЗГ (shared memory)            │
│                                                           │
│  /memories/session/swarm/                                 │
│    ├── state.md          ← текущая задача + прогресс      │
│    ├── findings.md       ← все находки всех агентов       │
│    ├── decisions.md      ← принятые решения               │
│    └── blockers.md       ← блокеры, нужна помощь          │
│                                                           │
│  /memories/repo/                                          │
│    └── swarm-knowledge.md ← долгосрочная память роя       │
└────────────────────────┬─────────────────────────────────┘
                         │ читает/пишет
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐    ┌──────▼──────┐   ┌────▼────┐
   │ Architect│    │   Coder     │   │ Reviewer│
   │ (план)   │    │ (реализация)│   │ (аудит) │
   └────┬────┘    └──────┬──────┘   └────┬────┘
        │ пишет план      │ пишет код     │ пишет вердикт
        └────────────────►│◄──────────────┘
                    findings.md
```

## Протокол обмена

### 1. Начало работы — ЧИТАЙ МОЗГ

```
ОБЯЗАТЕЛЬНО перед любым действием:
1. memory view /memories/session/swarm/state.md → что сейчас делается
2. memory view /memories/session/swarm/findings.md → что уже найдено
3. memory view /memories/session/swarm/blockers.md → есть ли блокеры
```

### 2. Во время работы — ПИШИ В МОЗГ

```
Каждая значимая находка → дописать в findings.md:
- [агент] файл:строка — описание — severity

Принятое решение → decisions.md:
- [агент] решение — обоснование

Блокер → blockers.md:
- [агент] описание блокера — нужна помощь от [кого]
```

### 3. Завершение — ОБНОВИ СОСТОЯНИЕ

```
state.md: обновить прогресс (какие шаги выполнены)
findings.md: финальные находки
Если есть урок → /memories/repo/swarm-knowledge.md
```

## Роли в рое (33 агента, 0 дублей)

### Ядро (1 координатор)
- **mansoni** — мозг роя. Маршрутизирует задачи, координирует агентов, агрегирует результаты. Единственный кто видит полную картину.

### Специалисты (10 экспертов)
- **mansoni-architect** — проектирует, НЕ кодит
- **mansoni-coder** — кодит по спецификации
- **mansoni-debugger** — находит root cause
- **mansoni-devops** — CI/CD, деплой
- **mansoni-researcher** — read-only исследование
- **mansoni-reviewer** — аудит по 8 направлениям (поглотил review.agent)
- **mansoni-tester** — браузерные тесты Playwright
- **mansoni-security-engineer** — OWASP + пентест (поглотил security.agent)
- **mansoni-performance-engineer** — CWV + профилирование (поглотил reviewer-performance + codesmith-performance)

### Доменные координаторы (10 модулей)
Каждый знает свой домен изнутри. Вызываются mansoni при задаче в конкретном модуле:
- **mansoni-orchestrator-messenger** — чаты, каналы, E2EE
- **mansoni-orchestrator-social** — feed, reels, stories
- **mansoni-orchestrator-commerce** — товары, корзина, заказы
- **mansoni-orchestrator-crm** — лиды, сделки, воронка
- **mansoni-orchestrator-dating** — матчинг, свайпы
- **mansoni-orchestrator-insurance** — полисы, котировки
- **mansoni-orchestrator-taxi** — заказы, маршруты
- **mansoni-orchestrator-streaming** — live, VOD
- **mansoni-orchestrator-realestate** — объекты, карта
- **mansoni-orchestrator-ai** — LLM, RAG, embeds

### Имплементаторы (10 узких спецов)
Вызываются mansoni-coder или доменными координаторами для конкретной технологии:
- **codesmith** — базовый production-ready кодер
- **codesmith-api** — Edge Functions, Deno, CORS
- **codesmith-auth** — Supabase Auth, JWT, сессии
- **codesmith-e2ee** — Web Crypto, MessageKeyBundle
- **codesmith-mobile** — Capacitor, нативные API
- **codesmith-react** — компоненты, хуки, Zustand
- **codesmith-realtime** — Supabase Realtime, WS
- **codesmith-supabase** — RLS, миграции, Storage
- **codesmith-testing** — Vitest, Playwright тесты
- **codesmith-typescript** — типизация, generics, Zod

### Аудиторы (3 узких ревьюера)
Вызываются mansoni-reviewer для deep audit конкретного аспекта:
- **reviewer-architecture** — SOLID, coupling
- **reviewer-database** — миграции, RLS, индексы
- **reviewer-security** — OWASP, injection, IDOR

## Пайплайны роя

### Новая фича (полный цикл)
```
mansoni
  → mansoni-researcher (исследование)
  → mansoni-architect (спецификация)
  → mansoni-coder → codesmith-{react|supabase|...} (реализация)
  → mansoni-reviewer → reviewer-{security|database} (аудит)
  → mansoni-tester (проверка в браузере)
  → mansoni-devops (деплой)
```

### Безопасность
```
mansoni
  → mansoni-security-engineer (OWASP scan)
  → reviewer-security (deep audit XSS/IDOR)
  → mansoni-coder → codesmith-auth (фиксы)
```

### Баг
```
mansoni
  → mansoni-debugger (root cause)
  → mansoni-coder (фикс)
  → mansoni-reviewer (верификация)
```

## Контракт каждого агента

Каждый агент роя ОБЯЗАН:
1. **Читать мозг** перед началом → не дублировать уже найденное другими
2. **Писать в мозг** свои находки → другие агенты увидят
3. **Знать свои границы** → не лезть в чужую зону ответственности
4. **Передавать эстафету** → после завершения сообщить кто следующий

Каждый агент роя НЕ ДОЛЖЕН:
1. Дублировать работу другого агента
2. Принимать решения за пределами своей зоны
3. Игнорировать findings других агентов
4. Работать без обновления shared state
