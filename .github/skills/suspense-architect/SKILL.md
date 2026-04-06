# Suspense Architect

## Описание

Скилл для использования React Suspense: code splitting через lazy, data fetching boundaries, вложенные Suspense, streaming, SuspenseList для координации загрузки.

## Когда использовать

- Code splitting: lazy load страниц и тяжёлых компонентов
- Data fetching с Suspense-совместимыми библиотеками (TanStack Query)
- Координация загрузки нескольких секций (SuspenseList)
- Streaming SSR с selective hydration
- Progressive rendering: показывать контент по мере готовности

## Стек проекта

- `React.lazy` + `Suspense` для code splitting
- TanStack Query `suspense: true` для data fetching
- Error Boundary рядом с Suspense (пара)

## Чеклист

- [ ] Каждый `Suspense` сопровождается `ErrorBoundary`
- [ ] Fallback скелетон повторяет layout загружаемого контента
- [ ] Route-level splitting: каждая страница — `lazy(() => import(...))`
- [ ] Heavy components: модальные окна, графики, редакторы — lazy
- [ ] Не оборачивать мелкие компоненты (<5KB) в Suspense — overhead
- [ ] `startTransition` для не-срочных обновлений (не блокировать UI)
- [ ] Preload критичных routes: `import()` по hover/focus на ссылку

## Пример: route splitting

```tsx
import { lazy, Suspense } from 'react'

const ChatPage = lazy(() => import('@/pages/ChatPage'))
const CrmPage = lazy(() => import('@/pages/CrmPage'))
const MapPage = lazy(() => import('@/pages/MapPage'))

function AppRoutes() {
  return (
    <Routes>
      <Route path="/chat/*" element={
        <ErrorBoundary fallback={<PageError />}>
          <Suspense fallback={<PageSkeleton variant="chat" />}>
            <ChatPage />
          </Suspense>
        </ErrorBoundary>
      } />
      <Route path="/crm/*" element={
        <ErrorBoundary fallback={<PageError />}>
          <Suspense fallback={<PageSkeleton variant="table" />}>
            <CrmPage />
          </Suspense>
        </ErrorBoundary>
      } />
    </Routes>
  )
}
```

## Пример: preload по hover

```tsx
function NavLink({ to, label, loader }: { to: string; label: string; loader: () => Promise<unknown> }) {
  return (
    <Link
      to={to}
      onMouseEnter={loader}
      onFocus={loader}
      className="h-11 flex items-center px-4"
    >
      {label}
    </Link>
  )
}

// Использование
const chatLoader = () => import('@/pages/ChatPage')
<NavLink to="/chat" label="Чат" loader={chatLoader} />
```

## Паттерн: вложенные Suspense

```tsx
function DashboardPage() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Шапка загружается мгновенно */}
      <DashboardHeader />

      {/* Каждая секция загружается независимо */}
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={5} />}>
        <RecentOrders />
      </Suspense>

      <Suspense fallback={<ListSkeleton count={3} />}>
        <ActivityFeed />
      </Suspense>
    </div>
  )
}
```

## Паттерн: Suspense + TanStack Query

```tsx
function UserProfile({ userId }: { userId: string }) {
  // suspense: true — компонент "подвисает" до получения данных
  const { data } = useSuspenseQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  })

  // data гарантированно не undefined
  return <ProfileCard user={data} />
}
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| `Suspense` без `ErrorBoundary` | Import fail = белый экран, uncaught error | Всегда в паре: EB + Suspense |
| Spinner как fallback | CLS при появлении контента | Skeleton matching layout |
| Lazy для 2KB компонента | Overhead lazy > размер компонента | Lazy для >20KB или route-level |
| Suspense на root level | Любой suspend показывает один fallback | Granular: секция, виджет |
| Без preload | Пользователь ждёт после каждого клика | Preload по hover/focus |
| `suspense: true` без обёртки | Компонент suspend — parent не готов | Suspense boundary выше по дереву |
