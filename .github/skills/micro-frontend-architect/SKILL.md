# Micro Frontend Architect

## Описание

Скилл для проектирования микрофронтенд-архитектуры: Module Federation, shared state между приложениями, unified routing, независимый деплой.

## Когда использовать

- Платформа из нескольких независимых продуктов (shell + modules)
- Разные команды работают над разными модулями
- Независимый деплой модулей без передеплоя всей платформы
- Постепенная миграция legacy на новый стек
- Разные версии React/фреймворков в одном приложении

## Стек

- Vite + `@originjs/vite-plugin-federation` (Module Federation)
- Shared: React, React-DOM, Zustand, TanStack Query
- Routing: host управляет top-level, модули — nested routes

## Чеклист

- [ ] Shell (host) загружает модули lazy через `React.lazy` + federation
- [ ] Shared dependencies: React, router — singleton, не дублировать
- [ ] Каждый модуль — автономный: свой store slice, свои routes
- [ ] Fallback при недоступности remote: error boundary + retry
- [ ] CSS isolation: Tailwind prefix или CSS Modules per module
- [ ] Shared state через event bus или Zustand shared store
- [ ] Версионирование API между shell и modules
- [ ] Health check remote перед lazy load

## Пример: Vite Federation config (host)

```ts
// vite.config.ts (shell)
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        crm: 'https://crm.example.com/assets/remoteEntry.js',
        messenger: 'https://msg.example.com/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom', 'react-router-dom', 'zustand'],
    }),
  ],
})
```

## Пример: lazy загрузка remote модуля

```tsx
import { Suspense, lazy } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const CrmModule = lazy(() => import('crm/App'))

function CrmRoute() {
  return (
    <ErrorBoundary fallback={<ModuleUnavailable name="CRM" onRetry={() => window.location.reload()} />}>
      <Suspense fallback={<ModuleSkeleton />}>
        <CrmModule />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## Паттерн: shared event bus

```ts
// shared/eventBus.ts
type Events = {
  'user:logout': undefined
  'notification:new': { id: string; text: string }
  'theme:change': 'light' | 'dark'
}

const bus = new EventTarget()

function emit<K extends keyof Events>(event: K, detail: Events[K]) {
  bus.dispatchEvent(new CustomEvent(event, { detail }))
}

function on<K extends keyof Events>(event: K, cb: (detail: Events[K]) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail)
  bus.addEventListener(event, handler)
  return () => bus.removeEventListener(event, handler)
}

export const eventBus = { emit, on }
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| Shared mutable state через window | Race conditions, нет типизации | Zustand shared store или event bus |
| Все модули в одном репо без boundaries | Теряется смысл микрофронтендов | Monorepo с чёткими package boundaries |
| Дублирование React в каждом remote | 2MB+ overhead, конфликты хуков | `shared: ['react']` в federation config |
| Без fallback при недоступности remote | Белый экран | Error boundary + graceful degradation |
| CSS конфликты между модулями | Стили одного ломают другой | CSS Modules, Tailwind prefix, Shadow DOM |
| Tight coupling между модулями | Один модуль ломает другой при обновлении | Контракты через typed events |
