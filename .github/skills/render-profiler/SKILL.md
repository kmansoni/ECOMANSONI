---
name: render-profiler
description: "Профилирование React рендеров: React DevTools Profiler, предотвращение лишних ре-рендеров, memo, useCallback, useMemo. Use when: лишние перерисовки, медленный UI, профилирование рендеров, memo, useCallback, useMemo, re-renders."
argument-hint: "[компонент или страница для профилирования]"
---

# Render Profiler — Профилирование React рендеров

---

## Диагностика лишних ре-рендеров

```typescript
// Добавить в компонент для отладки (удалить после)
import { useEffect, useRef } from 'react';

function useRenderCount(componentName: string) {
  const count = useRef(0);
  count.current++;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${componentName}] render #${count.current}`);
  }
}

// Использование
function MessageItem({ message }: { message: Message }) {
  useRenderCount('MessageItem');
  // ...
}
```

---

## Инструменты выявления

```bash
# Установить React DevTools в браузере
# Вкладка Profiler → Record → взаимодействие → Stop
# Отображает: какой компонент рендерился, сколько раз, причина

# Highlight re-renders — настройка в React DevTools
# "Highlight updates when components render" — мигает при рендере
```

---

## memo — когда применять

```typescript
// ✅ Memo нужен когда:
// 1. Компонент тяжёлый (много DOM элементов, сложная логика)
// 2. Рендерится часто из родителя который меняется
// 3. Props стабильны (не объекты/массивы создаваемые в render)

const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  return (
    <div className="flex gap-2 py-1">
      <span className="font-medium">{message.sender_id}</span>
      <span>{message.content}</span>
    </div>
  );
});

// ❌ Memo НЕ нужен для:
// - Простых компонентов (< 10 DOM элементов)
// - Компонентов которые всегда рендерятся вместе с родителем
// - Компонентов с children prop
```

---

## useCallback — правила

```typescript
// ✅ useCallback нужен когда функция передаётся как prop в memo компонент
const handleDeleteMessage = useCallback((messageId: string) => {
  deleteMessage.mutate(messageId);
}, [deleteMessage]); // Стабильная зависимость из TanStack Query

// ❌ useCallback лишний для inline обработчиков которые не передаются вниз
// НЕ нужно:
const handleClick = useCallback(() => setOpen(true), []); // Избыточно если не в memo
```

---

## useMemo — дорогие вычисления

```typescript
// ✅ useMemo для тяжёлых вычислений
const sortedMessages = useMemo(
  () => [...messages].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  ),
  [messages] // Пересчитывать только когда messages изменились
);

// ✅ useMemo для стабилизации объектов передаваемых в memo компоненты
const messageStyleProps = useMemo(() => ({
  bg: isOwnMessage ? 'bg-blue-500' : 'bg-gray-100',
  align: isOwnMessage ? 'items-end' : 'items-start',
}), [isOwnMessage]);

// ❌ useMemo лишний для простых преобразований
const text = useMemo(() => message.content.trim(), [message.content]); // Избыточно
```

---

## Частые причины лишних рендеров

```typescript
// ❌ Новый объект в каждом рендере
<MessageList style={{ padding: 8 }} /> // Новый объект style каждый рендер!

// ✅ Вынести за компонент или useMemo
const listStyle = { padding: 8 };
<MessageList style={listStyle} />

// ❌ Новая функция в каждом рендере
<Button onClick={() => handleDelete(id)} />

// ✅ useCallback
const onDelete = useCallback(() => handleDelete(id), [id, handleDelete]);
<Button onClick={onDelete} />

// ❌ Context меняется при каждом рендере провайдера
<AppContext.Provider value={{ user, theme, channels }}>

// ✅ Разделить контекст по частоте изменений
<UserContext.Provider value={user}>
  <ThemeContext.Provider value={theme}>
    {children}
  </ThemeContext.Provider>
</UserContext.Provider>
```

---

## Чеклист

- [ ] React DevTools Profiler запускался на ключевых страницах
- [ ] Компоненты в списках (MessageItem, ChannelItem) обёрнуты в memo
- [ ] Обработчики передаваемые в memo обёрнуты в useCallback
- [ ] Дорогие вычисления (sort, filter, map) в useMemo
- [ ] Context разделён по частоте обновлений
- [ ] Нет создания новых объектов/массивов в JSX пропах
