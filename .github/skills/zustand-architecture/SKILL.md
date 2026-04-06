# Zustand Architecture

## Описание

Скилл для управления глобальным состоянием через Zustand: slices, selectors, middleware, devtools, persist, immer integration. Лёгкая альтернатива Redux без бойлерплейта.

## Когда использовать

- Глобальное состояние: auth user, theme, sidebar state, notifications
- UI state, разделяемый между несвязанными компонентами
- Client-side фильтры, сортировка, view mode
- Не использовать для серверных данных (для них TanStack Query)

## Стек проекта

- `zustand` v4+ с TypeScript
- `immer` middleware для иммутабельных обновлений
- `devtools` middleware для отладки
- `persist` для сохранения в localStorage

## Чеклист

- [ ] Один store на домен: `useAuthStore`, `useUIStore`, `useNotificationStore`
- [ ] Селекторы для минимизации ререндеров: `useUIStore(s => s.sidebarOpen)`
- [ ] `immer` middleware для сложных вложенных обновлений
- [ ] `devtools` в development (name для идентификации)
- [ ] `persist` с `partialize` — не сохранять всё, только нужное
- [ ] Actions внутри store, не снаружи
- [ ] Без derived state в store — вычислять в селекторе или `useMemo`
- [ ] Reset function для logout/cleanup

## Пример: store с slices

```ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark' | 'system'
  toggleSidebar: () => void
  setTheme: (theme: UIState['theme']) => void
}

const useUIStore = create<UIState>()(
  devtools(
    persist(
      immer((set) => ({
        sidebarOpen: false,
        theme: 'system',

        toggleSidebar: () => set(s => { s.sidebarOpen = !s.sidebarOpen }),
        setTheme: (theme) => set(s => { s.theme = theme }),
      })),
      {
        name: 'ui-store',
        partialize: (s) => ({ theme: s.theme }), // sidebar state не персистим
      },
    ),
    { name: 'UIStore' },
  ),
)
```

## Пример: auth store с reset

```ts
interface AuthState {
  user: User | null
  accessToken: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
}

const initialState = { user: null, accessToken: null }

const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      ...initialState,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      logout: () => set(initialState),
    }),
    { name: 'AuthStore' },
  ),
)
```

## Паттерн: селекторы для перфоманса

```tsx
// Плохо — ререндер при ЛЮБОМ изменении store
const { sidebarOpen, theme } = useUIStore()

// Хорошо — ререндер только при изменении sidebarOpen
const sidebarOpen = useUIStore(s => s.sidebarOpen)

// Для нескольких полей — shallow compare
import { useShallow } from 'zustand/react/shallow'
const { sidebarOpen, theme } = useUIStore(useShallow(s => ({
  sidebarOpen: s.sidebarOpen,
  theme: s.theme,
})))
```

## Паттерн: computed values

```tsx
// Не хранить derived state в store
// Вычислять в компоненте или custom hook

function useUnreadCount() {
  const notifications = useNotificationStore(s => s.items)
  return useMemo(() => notifications.filter(n => !n.read).length, [notifications])
}
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| Серверные данные в Zustand | Дублирование с TanStack Query, рассинхрон | TanStack Query для server state |
| `useStore()` без селектора | Ререндер при любом изменении | `useStore(s => s.field)` |
| Один mega-store на всё | Тяжело отлаживать, всё связано | Store per domain |
| Derived state в store | Manual sync, легко забыть обновить | Вычислять в селекторе/useMemo |
| `persist` без `partialize` | Сохраняет функции, transient state | Явно указать что сохранять |
| Actions вне store | Теряется encapsulation, сложно трейсить | Actions внутри create() |
