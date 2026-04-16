---
name: vercel-composition-patterns
description: >-
  React composition паттерны от Vercel. Рефакторинг компонентов с boolean prop proliferation,
  compound components, render props, context providers, architecture. Включает React 19 API.
  Use when: compound components, избавление от boolean props, component architecture, context providers.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/vercel-composition-patterns
---

# React Composition Patterns

Композиционные паттерны для гибких, поддерживаемых React компонентов. Избегать boolean prop proliferation через compound components, lifting state и композицию.

## Когда применять

- Рефакторинг компонентов с множеством boolean props
- Создание переиспользуемых компонентных библиотек
- Дизайн гибких component API
- Ревью архитектуры компонентов
- Работа с compound components или context providers

## Категории правил по приоритету

| # | Категория | Приоритет |
|---|-----------|-----------|
| 1 | Component Architecture | HIGH |
| 2 | State Management | MEDIUM |
| 3 | Implementation Patterns | MEDIUM |
| 4 | React 19 APIs | MEDIUM |

## 1. Component Architecture (HIGH)

### architecture-avoid-boolean-props — CRITICAL

**НЕ добавляй boolean props** вроде `isThread`, `isEditing`, `isDMThread`. Каждый boolean удваивает возможные состояния и создаёт неподдерживаемую условную логику.

**Неправильно** (boolean props = экспоненциальная сложность):
```tsx
function Composer({ onSubmit, isThread, channelId, isDMThread, dmId, isEditing, isForwarding }: Props) {
  return (
    <form>
      <Header />
      <Input />
      {isDMThread ? <AlsoSendToDMField id={dmId} /> 
        : isThread ? <AlsoSendToChannelField id={channelId} /> : null}
      {isEditing ? <EditActions /> 
        : isForwarding ? <ForwardActions /> : <DefaultActions />}
      <Footer onSubmit={onSubmit} />
    </form>
  )
}
```

**Правильно** (композиция устраняет условия):
```tsx
function ChannelComposer() {
  return (
    <Composer.Frame>
      <Composer.Header />
      <Composer.Input />
      <Composer.Footer>
        <Composer.Attachments />
        <Composer.Formatting />
        <Composer.Submit />
      </Composer.Footer>
    </Composer.Frame>
  )
}

function ThreadComposer({ channelId }: { channelId: string }) {
  return (
    <Composer.Frame>
      <Composer.Header />
      <Composer.Input />
      <AlsoSendToChannelField id={channelId} />
      <Composer.Footer>
        <Composer.Formatting />
        <Composer.Submit />
      </Composer.Footer>
    </Composer.Frame>
  )
}

function EditComposer() {
  return (
    <Composer.Frame>
      <Composer.Input />
      <Composer.Footer>
        <Composer.CancelEdit />
        <Composer.SaveEdit />
      </Composer.Footer>
    </Composer.Frame>
  )
}
```

### architecture-compound-components — HIGH

Структурировать сложные компоненты как compound components с shared context. Подкомпоненты читают состояние через context, не через props.

```tsx
const ComposerContext = createContext<ComposerContextValue | null>(null)

function ComposerProvider({ children, state, actions, meta }: ProviderProps) {
  return (
    <ComposerContext value={{ state, actions, meta }}>
      {children}
    </ComposerContext>
  )
}

function ComposerInput() {
  const { state, actions: { update }, meta: { inputRef } } = use(ComposerContext)
  return (
    <TextInput ref={inputRef} value={state.input}
      onChangeText={(text) => update((s) => ({ ...s, input: text }))} />
  )
}

const Composer = {
  Provider: ComposerProvider,
  Frame: ComposerFrame,
  Input: ComposerInput,
  Submit: ComposerSubmit,
  Header: ComposerHeader,
  Footer: ComposerFooter,
}
```

## 2. State Management (MEDIUM)

### state-context-interface — Dependency Injection

Определить **generic interface** для контекста с тремя частями: `state`, `actions`, `meta`. Любой provider может реализовать интерфейс — один и тот же UI работает с разными state implementations.

```tsx
interface ComposerState {
  input: string
  attachments: Attachment[]
  isSubmitting: boolean
}

interface ComposerActions {
  update: (updater: (state: ComposerState) => ComposerState) => void
  submit: () => void
}

interface ComposerMeta {
  inputRef: React.RefObject<TextInput>
}
```

UI компоненты потребляют интерфейс, а не реализацию. Swap provider — keep UI.

### state-decouple-implementation

Provider — единственное место, которое знает как устроен state. UI от это не зависит.

### state-lift-state

Поднимать state в provider компоненты для доступа от sibling-ов.

## 3. Implementation Patterns (MEDIUM)

### patterns-explicit-variants

Создавать **явные** variant компоненты вместо boolean mode flags.

### patterns-children-over-render-props

Использовать `children` для композиции вместо `renderX` props.

## 4. React 19 APIs (MEDIUM)

> ⚠️ Только React 19+. Пропустить если React 18.

### react19-no-forwardref

Не использовать `forwardRef`. Использовать `use()` вместо `useContext()`.
