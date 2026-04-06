# Error Boundary Patterns

## Описание

Скилл для реализации Error Boundaries: перехват ошибок рендера, fallback UI, recovery стратегии, гранулярность boundaries, логирование.

## Когда использовать

- Каждый роут/страница — свой Error Boundary
- Виджеты, которые могут упасть независимо (чат, карта, график)
- Интеграция с third-party компонентами (видео, карты, editors)
- Lazy-loaded модули (import failure)
- Real-time компоненты с нестабильными данными

## Стек проекта

- Class component для Error Boundary (хуков нет)
- `react-error-boundary` — готовая обёртка с reset
- Toast для уведомлений об ошибках
- Sentry/logging для трекинга

## Чеклист

- [ ] Page-level boundary: ловит все ошибки страницы
- [ ] Widget-level boundary: изолирует падение виджета от страницы
- [ ] `resetKeys` — авто-сброс при изменении props (навигация, данные)
- [ ] Retry кнопка в fallback UI
- [ ] Логирование ошибки (componentStack + error message)
- [ ] Fallback не должен сам падать (минимум зависимостей)
- [ ] Не ловит: event handlers, async код, SSR — для них try/catch

## Пример: универсальный Error Boundary

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
  onError?: (error: Error, info: ErrorInfo) => void
  resetKeys?: unknown[]
}

interface State {
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prev: Props) {
    if (!this.state.error) return
    const changed = this.props.resetKeys?.some(
      (key, i) => key !== prev.resetKeys?.[i],
    )
    if (changed) this.setState({ error: null })
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (typeof this.props.fallback === 'function') {
      return this.props.fallback(error, this.reset)
    }
    return this.props.fallback ?? <DefaultFallback error={error} onRetry={this.reset} />
  }
}
```

## Пример: fallback UI

```tsx
function DefaultFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <p className="font-medium">Что-то пошло не так</p>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      </div>
      <button
        onClick={onRetry}
        className="h-11 px-6 rounded-md bg-primary text-primary-foreground font-medium"
      >
        Попробовать снова
      </button>
    </div>
  )
}
```

## Паттерн: гранулярность

```tsx
// Плохо: один boundary на всё приложение
<ErrorBoundary>
  <App />
</ErrorBoundary>

// Хорошо: page + widget level
<ErrorBoundary fallback={<PageError />}>
  <Header />
  <ErrorBoundary fallback={<WidgetError name="Чат" />} resetKeys={[chatId]}>
    <ChatWidget chatId={chatId} />
  </ErrorBoundary>
  <ErrorBoundary fallback={<WidgetError name="Карта" />}>
    <MapWidget />
  </ErrorBoundary>
</ErrorBoundary>
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| Один boundary на всё приложение | Падает один виджет — падает вся страница | Granular boundaries: page + widget |
| Fallback = пустой `<div />` | Пользователь не понимает что произошло | Сообщение + retry кнопка |
| Без логирования | Ошибка потеряна, не узнаешь о проблеме | `onError` -> logger/Sentry |
| Без `resetKeys` | Boundary застревает в error state навсегда | Reset при смене route/props |
| try/catch для render ошибок | Не работает в React render phase | Error Boundary — единственный способ |
| Fallback с тяжёлыми зависимостями | Если зависимость — причина ошибки, fallback тоже упадёт | Минимальный fallback: текст + кнопка |
