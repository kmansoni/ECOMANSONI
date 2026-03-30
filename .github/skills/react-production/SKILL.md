---
name: react-production
description: "Production-ready React паттерны. Use when: компоненты, хуки, стейт менеджмент, Zustand, TanStack Query, производительность, ре-рендеры, виртуализация, формы, валидация, анимации, accessibility, responsive, Vite конфигурация, TailwindCSS, shadcn/ui."
---

# React Production — Полная экспертиза

Все паттерны для production React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui.

## Архитектура компонентов

### Структура файла
```typescript
// 1. Imports (grouped: react → third-party → project → relative)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";

// 2. Types (если не экспортируются — в том же файле)
interface MessageListProps {
  channelId: string;
  onMessageSelect?: (id: string) => void;
}

// 3. Constants (вне компонента)
const PAGE_SIZE = 50;
const SCROLL_THRESHOLD = 100;

// 4. Component
export function MessageList({ channelId, onMessageSelect }: MessageListProps) {
  // 4a. Hooks (все в начале, без условий)
  // 4b. State
  // 4c. Derived state (useMemo)
  // 4d. Effects
  // 4e. Handlers (useCallback)
  // 4f. Early returns (loading, error, empty)
  // 4g. JSX return
}
```

### Max 400 строк — правило декомпозиции

Когда компонент приближается к 400 строкам:
1. Выдели JSX-блоки в отдельные компоненты (Header, Footer, ListItem)
2. Вынеси бизнес-логику в custom hook (useMessageList)
3. Утилиты → `lib/` или дублируй в компонент (для чистых функций <10 строк)
4. Оркестратор хранит state + effects + handlers, подкомпоненты — только рендер

### Все состояния UI

КАЖДЫЙ компонент с данными ОБЯЗАН рендерить:
```typescript
// Loading
if (loading) return <Skeleton className="h-32" />;

// Error
if (error) return (
  <div className="flex flex-col items-center gap-2 p-8 text-center">
    <p className="text-destructive">Не удалось загрузить данные</p>
    <Button variant="outline" size="sm" onClick={refetch}>Повторить</Button>
  </div>
);

// Empty
if (!data?.length) return (
  <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
    <MessageSquare className="w-12 h-12 opacity-50" />
    <p>Нет сообщений</p>
  </div>
);

// Success — основной рендер
return <div>...</div>;
```

## Hooks

### useCallback — когда использовать
```typescript
// ДА: передаётся в дочерний компонент
const handleClick = useCallback((id: string) => {
  setSelected(id);
}, []);

// ДА: в deps useEffect / useMemo
const fetchData = useCallback(async () => { ... }, [channelId]);

// НЕТ: только в текущем компоненте, не в deps
const handleLocalClick = () => setOpen(true); // OK без useCallback
```

### useMemo — когда использовать
```typescript
// ДА: тяжёлые вычисления
const sortedMessages = useMemo(
  () => messages.sort((a, b) => a.sort_key - b.sort_key),
  [messages]
);

// ДА: объект/массив, передаваемый в дочерний компонент
const contextValue = useMemo(() => ({ user, logout }), [user, logout]);

// НЕТ: примитивы
const isAdmin = role === 'admin'; // OK без useMemo
```

### useEffect — cleanup ОБЯЗАТЕЛЕН
```typescript
useEffect(() => {
  const controller = new AbortController();
  
  async function load() {
    try {
      const response = await fetch(url, { signal: controller.signal });
      const data = await response.json();
      setData(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      logger.error('[Component] Load failed', { error: e });
    }
  }
  
  load();
  return () => controller.abort(); // CLEANUP
}, [url]);
```

### Custom Hook паттерн
```typescript
export function useChannelMessages(channelId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // ... fetch + realtime subscription + cleanup ...

  return { messages, loading, error, sendMessage, editMessage } as const;
}
```

## State Management

### Zustand
```typescript
// store определение
interface AppStore {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useAppStore = create<AppStore>((set) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
}));

// Использование — ВСЕГДА selector
const theme = useAppStore((s) => s.theme); // ОК — ре-рендер только при изменении theme
const store = useAppStore();               // ПЛОХО — ре-рендер при ЛЮБОМ изменении
```

### TanStack Query
```typescript
// Query
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['messages', channelId],
  queryFn: () => fetchMessages(channelId),
  staleTime: 30_000,     // Данные свежие 30 сек
  gcTime: 5 * 60_000,    // Кэш хранится 5 мин
  retry: 2,              // 2 повторные попытки
  enabled: !!channelId,  // Не запускать без channelId
});

// Mutation
const mutation = useMutation({
  mutationFn: sendMessage,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    toast.success('Сообщение отправлено');
  },
  onError: (error) => {
    logger.error('[Chat] Send failed', { error });
    toast.error('Не удалось отправить сообщение');
  },
});
```

## Производительность

### Виртуализация списков (>50 элементов)
```typescript
// Используй react-window или @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 80,
  overscan: 5,
});
```

### React.memo — когда применять
```typescript
// ДА: элемент списка, рендерится >20 раз
const MessageItem = memo(function MessageItem({ message, onReact }: Props) {
  return <div>...</div>;
});

// НЕТ: корневой компонент, рендерится 1 раз
export function App() { ... } // memo бесполезен
```

### Lazy Loading
```typescript
const Settings = lazy(() => import('@/pages/Settings'));

// В роутере
<Suspense fallback={<PageSkeleton />}>
  <Settings />
</Suspense>
```

## Формы и валидация

### Паттерн валидации
```typescript
const [errors, setErrors] = useState<Record<string, string>>({});

function validate(values: FormValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!values.name.trim()) e.name = 'Имя обязательно';
  else if (values.name.length < 2) e.name = 'Минимум 2 символа';
  else if (values.name.length > 32) e.name = 'Максимум 32 символа';
  if (!values.email.includes('@')) e.email = 'Некорректный email';
  return e;
}

// На submit
const errs = validate(formValues);
if (Object.keys(errs).length > 0) {
  setErrors(errs);
  return;
}
```

### Input компонент с ошибкой
```tsx
<div className="space-y-1">
  <label htmlFor="name" className="text-sm font-medium">Имя</label>
  <Input
    id="name"
    value={name}
    onChange={(e) => setName(e.target.value)}
    aria-invalid={!!errors.name}
    aria-describedby={errors.name ? 'name-error' : undefined}
  />
  {errors.name && (
    <p id="name-error" className="text-sm text-destructive" role="alert">{errors.name}</p>
  )}
</div>
```

## Accessibility

### Обязательные атрибуты
```tsx
// Кнопки-иконки: ВСЕГДА aria-label
<button aria-label="Отправить сообщение" onClick={send}>
  <Send className="w-5 h-5" />
</button>

// Модальные окна: role + aria-labelledby
<div role="dialog" aria-labelledby="dialog-title" aria-modal="true">
  <h2 id="dialog-title">Настройки</h2>
</div>

// Списки: role="list" + role="listitem"
<ul role="list">
  {items.map(item => <li role="listitem" key={item.id}>{item.name}</li>)}
</ul>

// Live regions: объявления для screen reader
<div role="status" aria-live="polite" className="sr-only">
  {unreadCount} новых сообщений
</div>
```

### Keyboard Navigation
```typescript
// Обработка клавиш
const handleKeyDown = (e: React.KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); setActiveIndex(i => Math.min(i + 1, items.length - 1)); break;
    case 'ArrowUp': e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); break;
    case 'Enter': e.preventDefault(); selectItem(activeIndex); break;
    case 'Escape': e.preventDefault(); close(); break;
  }
};
```

## TailwindCSS

### Mobile-first responsive
```tsx
// Базовые стили = mobile (360px), md: = tablet (768px), lg: = desktop (1280px)
<div className="flex flex-col gap-2 p-4 md:flex-row md:gap-4 md:p-6 lg:p-8">

// Touch targets: минимум 44px
<button className="min-h-[44px] min-w-[44px] flex items-center justify-center">

// Safe area для мобильных
<div className="pb-safe">
```

### Dark mode
```tsx
// Все цвета через CSS variables (shadcn/ui уже настроен)
<div className="bg-background text-foreground"> // автоматически переключается
<div className="bg-card dark:bg-card">          // явно для кастомных цветов
```

## Vite конфигурация

### Ключевые настройки
```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          ui: ['sonner', 'lucide-react'],
        },
      },
    },
    sourcemap: true,
    target: 'es2020',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@supabase/supabase-js'],
  },
});
```

## Error Boundaries
```typescript
// Для изоляции крэшей в секциях UI
<ErrorBoundary fallback={<ErrorFallback />}>
  <MessageList channelId={id} />
</ErrorBoundary>
```
