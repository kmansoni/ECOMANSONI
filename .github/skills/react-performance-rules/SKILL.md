---
name: react-performance-rules
description: >-
  69 правил оптимизации производительности React от Vercel Engineering.
  8 категорий по приоритету: waterfalls, bundle, server, client, re-renders, rendering, JS, advanced.
  Use when: React performance, оптимизация рендеров, bundle size, waterfalls, Promise.all.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/vercel-react-best-practices
---

# React Performance Rules (по Vercel Engineering)

69 правил оптимизации для React/Vite приложений, приоритезированных по impact.

## Категории по приоритету

| # | Категория | Impact | Правил |
|---|---|---|---|
| 1 | Eliminating Waterfalls | CRITICAL | 6 |
| 2 | Bundle Size | CRITICAL | 5 |
| 3 | Server-Side Performance | HIGH | 10 |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | 4 |
| 5 | Re-render Optimization | MEDIUM | 15 |
| 6 | Rendering Performance | MEDIUM | 11 |
| 7 | JavaScript Performance | LOW-MEDIUM | 10 |
| 8 | Advanced Patterns | LOW | 4 |

## 1. Eliminating Waterfalls (CRITICAL)

- **Дешёвые условия перед await**: проверять sync условия ДО вызова асинхронных операций
- **Defer await**: перемещать `await` в ветки где реально используется
- **Promise.all()**: для независимых операций — ВСЕГДА параллельно
- **Partial dependencies**: использовать better-all для частичных зависимостей
- **Start promises early**: начинать промисы рано, await поздно
- **Suspense boundaries**: для стриминга контента

```typescript
// ❌ Waterfall
const user = await getUser(id)
const posts = await getPosts(id)

// ✅ Параллельно
const [user, posts] = await Promise.all([getUser(id), getPosts(id)])
```

## 2. Bundle Size (CRITICAL)

- **Barrel imports**: импортировать напрямую, НЕ из barrel files
- **Dynamic imports**: `React.lazy()` для тяжёлых компонентов
- **Defer third-party**: analytics/logging ПОСЛЕ hydration
- **Conditional loading**: модули только когда фича активирована
- **Preload on hover**: предзагрузка при hover/focus

```typescript
// ❌ Barrel import
import { Button, Dialog, Sheet } from '@/components/ui'

// ✅ Прямой импорт
import { Button } from '@/components/ui/button'
```

## 3. Client-Side Data Fetching (MEDIUM-HIGH)

- **SWR/TanStack Query**: дедупликация запросов, кэш
- **Event listeners**: дедупликация глобальных listeners
- **Passive listeners**: для scroll events
- **localStorage schema**: версионирование и минимизация

## 4. Re-render Optimization (MEDIUM)

- **Defer reads**: не подписываться на state используемый только в callbacks
- **memo**: выносить expensive work в мемоизированные компоненты
- **Hoist default non-primitive props**: вне компонента
- **Primitive dependencies**: в effects
- **Derived state**: подписываться на derived booleans, не raw values
- **Derived state without effect**: вычислять при рендере, не в effects
- **Functional setState**: для stable callbacks
- **Lazy state init**: функция в useState для expensive начальных значений
- **No memo for primitives**: не мемоизировать простые выражения
- **Split hooks**: с independent dependencies
- **Move effect to event**: interaction логика в event handlers
- **Transitions**: startTransition для non-urgent updates
- **useDeferredValue**: отложить expensive renders
- **useRef**: для transient frequent values
- **No inline components**: НЕ определять компоненты внутри компонентов

```typescript
// ❌ Inline component
function Parent() {
  function Child() { return <div /> }
  return <Child />
}

// ✅ Отдельно
function Child() { return <div /> }
function Parent() { return <Child /> }
```

## 5. Rendering Performance (MEDIUM)

- **content-visibility**: для длинных списков
- **Hoist static JSX**: статический JSX вне компонентов
- **SVG precision**: уменьшить точность координат SVG
- **Conditional render**: тернарный оператор, НЕ `&&`
- **Resource hints**: preload/prefetch

## 6. JavaScript Performance (LOW-MEDIUM)

- **Batch DOM/CSS**: группировать CSS изменения через классы
- **Index maps**: Map для repeated lookups
- **Cache property access**: в loops
- **Combine iterations**: один loop вместо filter+map
- **Length check first**: проверять length перед expensive сравнением
- **Early exit**: ранний return из функций
- **Set/Map lookups**: O(1) вместо array.includes O(n)
- **flatMap**: map + filter в одном проходе

```typescript
// ❌ Два прохода
items.filter(x => x.active).map(x => x.name)

// ✅ Один проход
items.flatMap(x => x.active ? [x.name] : [])
```
