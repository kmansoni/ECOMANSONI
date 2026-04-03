---
name: code-humanizer
description: "Humanizer: код неотличим от написанного профессиональным программистом-человеком. Убирает AI-паттерны: шаблонность, избыточные комментарии, одинаковая структура, чрезмерная абстракция. Use when: написание кода, code review, рефакторинг — ПРИМЕНЯТЬ ВСЕГДА."
---

# Code Humanizer — Код неотличим от человеческого

## 1. Цель

Каждая строка кода, написанная агентом, должна быть НЕОТЛИЧИМА от кода, написанного опытным разработчиком-человеком. AI-детекторы не должны определять автора.

## 2. Признаки AI-кода (ЧТО НЕЛЬЗЯ ДЕЛАТЬ)

### Структурные маркеры AI

- Одинаковая длина функций (все по 15-20 строк)
- Одинаковый порядок: imports → types → helpers → main → export
- Шаблонные имена: `handleXxx`, `useXxx`, `XxxProvider` без вариации
- Каждая функция с JSDoc/TSDoc
- Каждый `if` с `else`
- Каждый `try/catch` с одинаковой обработкой
- Одинаковые отступы и группировки
- Все ответы на edge cases заранее предусмотрены в одном стиле

### Стилистические маркеры AI

- Комментарии на КАЖДУЮ секцию (`// Handle loading state`, `// Render error`, `// Main content`)
- Комментарии, которые повторяют код (`// Set user name` перед `setUserName(name)`)
- Избыточно подробные имена переменных (`userProfilePictureUrlString`)
- Все функции одного размера
- Постоянные ранние return в начале (guard clauses) — один и тот же паттерн
- Чрезмерное использование `optional chaining` (?.?.?.)
- Каждый компонент обёрнут в `React.memo` или `useCallback`
- Одинаковые error boundaries на каждом уровне

### Организационные маркеры AI

- Файлы ВСЕХ одного размера (~100 строк)
- КАЖДЫЙ хук в ОТДЕЛЬНОМ файле (даже 5-строчный)
- Избыточная декомпозиция (utils.ts → stringUtils.ts → dateUtils.ts → arrayUtils.ts)
- Каждый тип в отдельном файле

## 3. Правила человеческого кода

### Вариативность структуры

- Функции РАЗНОЙ длины: от 3 до 80 строк (как у реального человека)
- Не все функции с типами возврата — TypeScript inference где достаточно
- Иногда inline-стиль, иногда расширенная реализация
- Не всё вынесено в переменные — иногда inline выражения в JSX
- Разный порядок в разных файлах — в зависимости от того, что важнее

### Натуральное именование

- Короткие имена для локальных переменных: `idx`, `el`, `cb`, `ref`, `err`
- Длинные имена только для экспортируемых/публичных сущностей
- Не ВСЕГДА `handle` + Event: иногда `on`, `do`, `process`, `submit`, `trigger`, `fire`
- Сокращения где понятно: `msg` вместо `message`, `btn` вместо `button`, `params` вместо `parameters` (в локальном контексте)
- Акронимы: `ws`, `db`, `ui`, `api`, `jwt`, `rtc`

### Комментарии как у человека

- Только на СЛОЖНУЮ логику (не на очевидный код)
- Иногда юмор или личный стиль: `// HACK: Supabase не возвращает count отдельно`, `// TODO(vlad): вернуться когда будет Edge Function v2`
- Ссылки на issue/PR: `// fix #234`, `// see: https://github.com/supabase/...`
- Иногда WARNING: `// ⚠️ НЕ менять порядок — зависимость от API`
- НЕ комментировать очевидное. Лучше 0 комментариев чем 5 бесполезных

### Error handling как у человека

- Не КАЖДЫЙ вызов в try/catch — только на boundaries
- Иногда `?.` без fallback (если undefined is ok)
- Одна функция может использовать try/catch, другая — .catch(), третья — if/else
- Не одинаковый формат toast/error для всех ошибок

### Реальные паттерны опытных разработчиков

- Группировка связанных вещей, а не механическая сортировка
- Inline конфигурация где она используется один раз
- Barrel exports НЕ для каждой папки — только для `components/ui/`
- Типы рядом с использованием, а не в отдельных файлах (кроме shared types)
- Иногда `any` в внутренних хелперах (с `// eslint-disable-next-line` если lint)
- `as const` вместо enum для небольших наборов
- Деструктуризация не всегда, объект через dot иногда

## 4. Чеклист перед коммитом

Перед сохранением каждого файла проверить:

- [ ] Длина функций ВАРЬИРУЕТСЯ (не все одного размера)?
- [ ] Комментарии ТОЛЬКО на сложную логику?
- [ ] Нет шаблонных JSDoc на каждую функцию?
- [ ] Имена переменных натуральные (не verbose-AI-style)?
- [ ] Структура файла НЕ повторяет шаблон один-в-один?
- [ ] Error handling РАЗНЫЙ в разных контекстах?
- [ ] Нет "декоративной" типизации (не типизировать очевидное)?
- [ ] Файл НЕ выглядит как сгенерированный по шаблону?
- [ ] Есть "следы жизни" (TODO, HACK, ссылка на issue)?
- [ ] Нет избыточной абстракции (не вынесено то что используется 1 раз)?

## 5. Примеры: AI vs Human

### Загрузка данных

**AI-стиль (ПЛОХО):**
```typescript
/**
 * Fetches user profile data from the database
 * @param userId - The ID of the user to fetch
 * @returns The user profile or null if not found
 */
async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Unexpected error:', error);
    return null;
  }
}
```

**Человеческий стиль (ХОРОШО):**
```typescript
async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error; // caller handles
  return data;
}
```

### Условный рендеринг

**AI-стиль (ПЛОХО):**
```typescript
// Loading state
if (isLoading) {
  return <LoadingSpinner />;
}

// Error state
if (error) {
  return <ErrorMessage message={error.message} />;
}

// Empty state
if (!data || data.length === 0) {
  return <EmptyState message="No items found" />;
}

// Main content
return (
  <div className="container mx-auto p-4">
    {data.map((item) => (
      <ItemCard key={item.id} item={item} />
    ))}
  </div>
);
```

**Человеческий стиль (ХОРОШО):**
```typescript
if (isLoading) return <Skeleton className="h-64" />;
if (error) return <p className="text-destructive p-4">{error.message}</p>;
if (!data?.length) return <EmptyState />;

return (
  <div className="grid gap-4 p-4">
    {data.map(item => <ItemCard key={item.id} {...item} />)}
  </div>
);
```

## 6. Метрика качества

Код считается «человеческим» если:

- AI-детектор (GPTZero, ZeroGPT) не определяет как AI с confidence >60%
- Code reviewer не может определить автора (AI vs human) без внешних подсказок
- Код выглядит как написанный конкретным разработчиком (есть "личность")
- Нет повторяющихся паттернов в файлах одного проекта

## 7. Триггеры

- ПРИМЕНЯТЬ ВСЕГДА при написании любого кода
- ПРИМЕНЯТЬ при code review (проверять что код выглядит человеческим)
- Явные триггеры: humanize, сделай код человечным, убрать AI-паттерны

## 8. Интеграция с другими скиллами

- **orchestrator-laws** Закон 8 — расширение этого закона
- **code-review** — добавляет проверку "человечности" в пайплайн
- **code-simplifier** — упрощение часто делает код более человечным
