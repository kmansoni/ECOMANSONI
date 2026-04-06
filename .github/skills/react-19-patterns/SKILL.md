---
name: react-19-patterns
description: "React 19 паттерны: use() хук, Server Components, Actions, useFormStatus, useOptimistic, ref как prop. Use when: React 19, use() hook, Server Actions, useOptimistic, useFormStatus, новые паттерны React."
argument-hint: "[фича: use-hook | actions | server-components | optimistic | all]"
---

# React 19 Patterns — Новые возможности React 19

Проект использует React 18. Этот скилл описывает плавную миграцию и новые паттерны React 19.

---

## use() хук

```typescript
// React 19: use() разворачивает Promise или Context
import { use, Suspense } from 'react';

// Загрузка данных с use()
function MessageList({ messagesPromise }: { messagesPromise: Promise<Message[]> }) {
  const messages = use(messagesPromise); // Suspends пока Promise не resolved
  return <>{messages.map(m => <MessageItem key={m.id} message={m} />)}</>;
}

// Обёртка с Suspense
function ChannelPage({ channelId }: { channelId: string }) {
  const messagesPromise = fetchMessages(channelId); // Создаём Promise
  return (
    <Suspense fallback={<MessagesSkeleton />}>
      <MessageList messagesPromise={messagesPromise} />
    </Suspense>
  );
}

// use() с Context (можно вызывать условно)
function ThemeButton() {
  if (someCondition) {
    const theme = use(ThemeContext); // ✅ В React 19 можно условно
    return <button className={theme.buttonClass}>Click</button>;
  }
  return null;
}
```

---

## Actions и useFormStatus

```typescript
// React 19: Actions — async функции переданные в form action
import { useFormStatus, useActionState } from 'react';

// Form status внутри формы
function SubmitButton() {
  const { pending } = useFormStatus(); // Автоматически знает статус родительской формы
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Отправка...' : 'Отправить'}
    </button>
  );
}

// useActionState
async function sendMessageAction(prevState: any, formData: FormData) {
  const text = formData.get('text') as string;
  try {
    await api.sendMessage(text);
    return { success: true };
  } catch (err) {
    return { error: 'Ошибка отправки' };
  }
}

function MessageForm() {
  const [state, action, isPending] = useActionState(sendMessageAction, null);
  return (
    <form action={action}>
      <input name="text" />
      <SubmitButton />
      {state?.error && <p className="text-red-500">{state.error}</p>}
    </form>
  );
}
```

---

## useOptimistic

```typescript
// React 19: встроенный optimistic update
import { useOptimistic } from 'react';

function MessageList({ messages }: { messages: Message[] }) {
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage: Message) => [...state, newMessage]
  );

  async function sendMessage(text: string) {
    // Добавить оптимистично
    addOptimisticMessage({
      id: `opt-${Date.now()}`,
      content: text,
      created_at: new Date().toISOString(),
      _pending: true,
    });
    // Отправить на сервер (откатится автоматически при ошибке)
    await api.sendMessage(text);
  }

  return (
    <ul>
      {optimisticMessages.map(m => (
        <li key={m.id} style={{ opacity: m._pending ? 0.5 : 1 }}>
          {m.content}
        </li>
      ))}
    </ul>
  );
}
```

---

## ref как prop (React 19)

```typescript
// React 19: ref можно передавать как обычный prop (без forwardRef)
function Input({ ref, ...props }: React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
}) {
  return <input ref={ref} {...props} />;
}

// Использование
function Form() {
  const inputRef = useRef<HTMLInputElement>(null);
  return <Input ref={inputRef} placeholder="Введите текст" />;
}
```

---

## Совместимость React 18

```typescript
// Vite + React 18 — проверить версию
// package.json должен иметь: "react": "^19.0.0"

// До миграции на React 19: аналоги паттернов на React 18
// use() → AsyncBoundary pattern + React Query
// useOptimistic → useMutation с onMutate callback (TanStack Query)
// useActionState → useState + useTransition + handleSubmit
// forwardRef всё ещё нужен в React 18
```

---

## Чеклист

- [ ] Проект на React 18 — не использовать React 19 API без проверки версии
- [ ] Для React 18: использовать TanStack Query вместо use() для данных
- [ ] Optimistic updates через TanStack Query `onMutate` (не useOptimistic)  
- [ ] При миграции на React 19: заменить forwardRef → ref как prop
- [ ] При миграции: useActionState вместо ручного формы + useState
