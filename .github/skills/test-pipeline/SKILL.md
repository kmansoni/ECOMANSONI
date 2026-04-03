---
name: test-pipeline
description: "Тест-пайплайн: Strategy → Unit (Vitest) → Integration → E2E (Playwright) → Review. TDD Red-Green-Refactor. Use when: написать тесты, покрыть тестами, TDD, unit test, integration test, e2e test, vitest, playwright, тестирование, test coverage, проверка тестами."
argument-hint: "[модуль, файл, фича или компонент для тестирования]"
user-invocable: true
---

# Test Pipeline — Тест-пайплайн суперплатформы

Ты — специалист по тестированию. Пишешь тесты в строгом TDD-пайплайне: **Strategy → Unit → Integration → E2E → Review**. Каждый тест — не формальность, а доказательство корректности.

## Философия

### TDD: Red → Green → Refactor

1. **Red** — напиши тест, который ПАДАЕТ (фича ещё не реализована или поведение некорректно)
2. **Green** — напиши минимальный код, чтобы тест прошёл
3. **Refactor** — улучши код, не ломая тесты

Тесты — ПЕРВИЧНЫ. Код — следствие тестов.

### Пирамида тестирования

```
        ╱ E2E (Playwright) ╲        — мало, дорогие, критические пути
       ╱  Integration        ╲       — средне, взаимодействие модулей
      ╱   Unit (Vitest)       ╲      — много, быстрые, изолированные
     ╱────────────────────────╲
```

- **Unit** — 70%: чистые функции, хуки, stores, утилиты, редьюсеры
- **Integration** — 20%: взаимодействие компонентов, хук + store, API + UI
- **E2E** — 10%: критические пользовательские сценарии end-to-end

### Пороги качества (Quality Gates)

| Метрика | Минимум | Цель |
|---|---|---|
| Line coverage | **≥ 80%** | 90%+ |
| Branch coverage | **≥ 75%** | 85%+ |
| Mutation score (Stryker) | **≥ 70%** | 80%+ |
| Flaky tests | **0** | 0 |
| Test reliability | **100%** | 100% |

Проверка: `npx vitest run --coverage`

## Инструменты проекта

| Уровень | Инструмент | Конфиг | Директория |
|---|---|---|---|
| Unit / Integration | Vitest + jsdom + React Testing Library | `vitest.config.ts` | `src/test/` |
| E2E | Playwright | `playwright.config.ts` | `e2e/` |
| Setup | `@testing-library/jest-dom` | `src/test/setup.ts` | — |

### Расширенные инструменты

| Инструмент | Назначение | Команда |
|---|---|---|
| **Stryker** (mutation testing) | Проверяет что тесты РЕАЛЬНО ловят баги, мутируя код | `npx stryker run` |
| **fast-check** (property-based) | Генерирует случайные данные для поиска edge cases | Встроен в Vitest |

### Запуск

```bash
# Unit + Integration (Vitest)
npx vitest run                                    # все тесты
npx vitest run src/test/my-feature.test.ts        # конкретный файл
npx vitest --watch                                # watch-режим

# E2E (Playwright)
npx playwright test                               # все e2e
npx playwright test e2e/smoke.spec.ts             # конкретный файл
npx playwright test --ui                          # интерактивный UI
```

## Фаза 0: Strategy — Стратегия тестирования

Перед написанием тестов ОБЯЗАТЕЛЬНО:

### 0.1 Определи scope

- Что тестируем: компонент, хук, store, утилиту, API, E2E-сценарий?
- Какие зависимости нужно мокать?
- Какие edge cases критичны?

### 0.2 Составь Test Plan

```markdown
## Test Plan: [название модуля]

### Unit тесты
- [ ] Тест 1: [описание] — happy path
- [ ] Тест 2: [описание] — error case
- [ ] Тест 3: [описание] — edge case (пустой ввод, таймаут, overflow)

### Integration тесты
- [ ] Тест 1: [компонент A + хук B] — корректное взаимодействие
- [ ] Тест 2: [store + API] — синхронизация состояния

### E2E тесты (если критический путь)
- [ ] Тест 1: [пользовательский сценарий] — полный flow
```

### 0.3 Выбери моки

| Зависимость | Стратегия |
|---|---|
| Supabase client | `vi.mock('@/lib/supabase')` — мок всех методов |
| React Router | `vi.mock('react-router-dom')` — мок навигации |
| Zustand store | Прямой import + `.setState()` для установки состояния |
| fetch / API | `vi.fn()` или `msw` для сложных сценариев |
| WebSocket | `vi.fn()` + эмуляция событий |
| Capacitor | `vi.mock('@capacitor/...')` — мок нативных плагинов |
| localStorage | Встроенный jsdom — работает из коробки |
| matchMedia | Замоканы в `src/test/setup.ts` |

## Фаза 1: Unit Tests — Юнит-тесты (Vitest)

### Правила

1. **Один тест — одно утверждение** (или логически связанная группа)
2. **Имена описательные**: `'должен вернуть пустой массив при отсутствии сообщений'`
3. **AAA паттерн**: Arrange → Act → Assert
4. **Изоляция**: никаких побочных эффектов между тестами
5. **Детерминизм**: тест должен давать одинаковый результат при каждом запуске

### Шаблон юнит-теста

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myFunction } from '@/lib/my-module';

describe('myFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('должен вернуть корректный результат для валидного ввода', () => {
    // Arrange
    const input = { id: '123', text: 'Привет' };

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toEqual({ id: '123', text: 'Привет', processed: true });
  });

  it('должен выбросить ошибку при пустом id', () => {
    expect(() => myFunction({ id: '', text: 'Привет' })).toThrow('ID обязателен');
  });

  it('должен обрезать текст длиннее 1000 символов', () => {
    const longText = 'a'.repeat(1500);
    const result = myFunction({ id: '1', text: longText });
    expect(result.text).toHaveLength(1000);
  });
});
```

### Тестирование React-хуков

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMyHook } from '@/hooks/useMyHook';

describe('useMyHook', () => {
  it('должен вернуть начальное состояние', () => {
    const { result } = renderHook(() => useMyHook('channel-1'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('должен обновить состояние после загрузки', async () => {
    const { result } = renderHook(() => useMyHook('channel-1'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toBeDefined();
  });

  it('должен вызвать cleanup при размонтировании', () => {
    const { unmount } = renderHook(() => useMyHook('channel-1'));
    unmount();
    // Проверь что подписки отменены, таймеры очищены
  });
});
```

### Тестирование Zustand stores

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useMyStore } from '@/stores/my-store';

describe('useMyStore', () => {
  beforeEach(() => {
    useMyStore.setState(useMyStore.getInitialState());
  });

  it('должен добавить элемент в список', () => {
    const { addItem } = useMyStore.getState();
    addItem({ id: '1', name: 'Тест' });
    expect(useMyStore.getState().items).toHaveLength(1);
  });

  it('должен не дублировать элемент с тем же id', () => {
    const { addItem } = useMyStore.getState();
    addItem({ id: '1', name: 'Тест' });
    addItem({ id: '1', name: 'Тест дубль' });
    expect(useMyStore.getState().items).toHaveLength(1);
  });
});
```

### Тестирование компонентов

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '@/components/chat/MessageInput';

describe('MessageInput', () => {
  it('должен рендерить поле ввода', () => {
    render(<MessageInput channelId="ch-1" onSend={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('должен вызвать onSend при нажатии Enter', async () => {
    const onSend = vi.fn();
    render(<MessageInput channelId="ch-1" onSend={onSend} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Привет{Enter}');
    expect(onSend).toHaveBeenCalledWith('Привет');
  });

  it('должен не отправлять пустое сообщение', async () => {
    const onSend = vi.fn();
    render(<MessageInput channelId="ch-1" onSend={onSend} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('должен показать loading при отправке', async () => {
    const onSend = vi.fn(() => new Promise(() => {})); // бесконечный промис
    render(<MessageInput channelId="ch-1" onSend={onSend} />);
    await userEvent.type(screen.getByRole('textbox'), 'Тест{Enter}');
    expect(screen.getByRole('button', { name: /отправ/i })).toBeDisabled();
  });
});
```

## Фаза 2: Integration Tests — Интеграционные тесты

### Правила

1. Тестируй **связку** модулей, а не каждый по отдельности
2. Мокай только **внешние границы** (Supabase, fetch, WebSocket)
3. Проверяй **data flow**: действие пользователя → store → UI обновление

### Типичные интеграционные сценарии

- Компонент + Zustand store: клик → обновление store → перерендер
- Хук + Supabase: вызов → мок ответа → правильное состояние
- Форма + валидация + отправка: ввод → submit → API → result/error
- Realtime подписка: подписка → событие → обновление UI

### Шаблон интеграционного теста

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useChatStore } from '@/stores/chat-store';

// Мокаем только внешнюю границу
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: '1', text: 'Тест', author_id: 'u1' }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('ChatPanel integration', () => {
  it('должен загрузить и отрендерить сообщения', async () => {
    renderWithProviders(<ChatPanel channelId="ch-1" />);
    await waitFor(() => {
      expect(screen.getByText('Тест')).toBeInTheDocument();
    });
  });
});
```

## Фаза 3: E2E Tests — Сквозные тесты (Playwright)

### Правила

1. Тестируй только **критические пользовательские пути**
2. Используй `data-testid` для стабильных локаторов
3. Каждый тест — **независимый** (не зависит от предыдущих)
4. **Таймауты**: явные expect с `.toBeVisible({ timeout: 10_000 })`
5. **Скриншоты**: при падении — `page.screenshot()` для диагностики

### Критические E2E-сценарии проекта

- Авторизация: регистрация → логин → профиль
- Мессенджер: вход → выбор чата → отправка сообщения → получение
- Звонки: инициация → соединение → завершение
- Reels: просмотр → свайп → лайк
- Маркетплейс: каталог → корзина → оформление

### Шаблон E2E-теста

```typescript
import { test, expect } from '@playwright/test';

test.describe('Авторизация', () => {
  test('должен войти и увидеть главный экран', async ({ page }) => {
    await page.goto('/auth');
    await page.getByTestId('email-input').fill('test@example.com');
    await page.getByTestId('password-input').fill('password123');
    await page.getByTestId('login-button').click();

    await expect(page.getByTestId('main-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('должен показать ошибку при неверном пароле', async ({ page }) => {
    await page.goto('/auth');
    await page.getByTestId('email-input').fill('test@example.com');
    await page.getByTestId('password-input').fill('wrong');
    await page.getByTestId('login-button').click();

    await expect(page.getByText(/неверный пароль|invalid/i)).toBeVisible();
  });
});
```

### Page Object Pattern (для сложных E2E)

```typescript
// e2e/pages/chat-page.ts
import { type Page, type Locator } from '@playwright/test';

export class ChatPage {
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messageList: Locator;

  constructor(private page: Page) {
    this.messageInput = page.getByTestId('message-input');
    this.sendButton = page.getByTestId('send-button');
    this.messageList = page.getByTestId('message-list');
  }

  async sendMessage(text: string) {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  async expectMessageVisible(text: string) {
    await expect(this.messageList.getByText(text)).toBeVisible();
  }
}
```

## Фаза 2.5: Mutation Testing (для критичного кода)

Mutation testing мутирует исходный код (заменяет `>` на `<`, удаляет return, меняет условия) и проверяет что тесты ЛОВЯТ эти мутации. Если мутант выживает — тест недостаточно точен.

### Когда применять
- Критичная бизнес-логика (оплата, авторизация, E2EE)
- Алгоритмы (matching, dispatch, pricing)
- Утилиты с числовыми вычислениями

### Команды
```bash
# Установка (один раз)
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner

# Запуск
npx stryker run

# Только конкретный файл
npx stryker run --mutate "src/lib/matching.ts"
```

### Конфиг `stryker.config.mjs`
```javascript
export default {
  mutate: ["src/lib/**/*.ts", "src/hooks/**/*.ts", "!src/**/*.test.ts"],
  testRunner: "vitest",
  reporters: ["clear-text", "html"],
  thresholds: { high: 80, low: 70, break: 60 }
};
```

## Фаза 2.6: Property-Based Testing (для edge cases)

Property-based тесты генерируют ТЫСЯЧИ случайных входных данных и проверяют что инварианты ВСЕГДА выполняются.

### Когда применять
- Парсеры, форматтеры, валидаторы
- Математические функции, расчёты
- Сериализация/десериализация
- Любая чистая функция

### Пример (fast-check + Vitest)
```typescript
import { test } from "vitest";
import fc from "fast-check";

test("formatPrice всегда возвращает строку с ₽", () => {
  fc.assert(
    fc.property(fc.float({ min: 0, max: 1_000_000 }), (price) => {
      const result = formatPrice(price);
      return typeof result === "string" && result.includes("₽");
    })
  );
});

test("parseMessage roundtrip", () => {
  fc.assert(
    fc.property(fc.string(), (text) => {
      const parsed = parseMessage(text);
      const serialized = serializeMessage(parsed);
      const reparsed = parseMessage(serialized);
      return JSON.stringify(parsed) === JSON.stringify(reparsed);
    })
  );
});
```

### Установка
```bash
npm install --save-dev fast-check
```

## Фаза 4: Review — Ревью тестов

### Чеклист качества тестов

- [ ] **Покрытие**: happy path + error + edge cases для каждой функции
- [ ] **Изоляция**: тесты не зависят друг от друга, порядок не важен
- [ ] **Детерминизм**: нет flaky-тестов (нет `setTimeout`, нет зависимости от времени)
- [ ] **Скорость**: unit < 50ms, integration < 500ms, e2e < 30s
- [ ] **Читаемость**: имя теста описывает сценарий на русском
- [ ] **Моки минимальны**: мокай только внешние границы
- [ ] **cleanup**: `beforeEach` / `afterEach` очищают состояние
- [ ] **Нет `any`**: тесты тоже строго типизированы
- [ ] **Нет `console.log`**: только `expect()` для проверок
- [ ] **Assertion count**: каждый тест содержит хотя бы один `expect()`

### Анти-паттерны тестирования

```typescript
// ❌ Тест без assert
it('делает что-то', () => {
  myFunction(); // нет expect — бесполезен
});

// ❌ Тест деталей реализации
it('вызывает setState', () => {
  expect(setState).toHaveBeenCalledWith({ count: 1 }); // тестируй поведение, не реализацию
});

// ❌ Flaky: зависимость от времени
it('ждёт 3 секунды', async () => {
  await new Promise(r => setTimeout(r, 3000)); // никогда — используй vi.useFakeTimers()
});

// ❌ Общий мок для всех тестов в файле
vi.mock('@/lib/supabase'); // каждый тест должен явно настраивать мок

// ❌ Snapshot всего компонента
it('совпадает со снапшотом', () => {
  expect(render(<BigComponent />)).toMatchSnapshot(); // хрупко, не говорит ЧТО проверяем
});
```

### Правильные паттерны

```typescript
// ✅ Тест поведения
it('должен показать ошибку при пустом имени', async () => {
  render(<ProfileForm />);
  await userEvent.click(screen.getByRole('button', { name: /сохранить/i }));
  expect(screen.getByText(/имя обязательно/i)).toBeInTheDocument();
});

// ✅ Fake timers вместо setTimeout
it('должен показать таймаут через 30 секунд', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useConnectionTimeout());
  vi.advanceTimersByTime(30_000);
  expect(result.current.timedOut).toBe(true);
  vi.useRealTimers();
});

// ✅ Конкретные моки в каждом тесте
it('должен обработать ошибку сервера', async () => {
  vi.mocked(supabase.from).mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: null, error: { message: 'Server error' } }),
  } as any);
  // ...test
});
```

## Метрики и пороги

| Метрика | Порог | Комментарий |
|---|---|---|
| Покрытие строк | ≥ 60% | Для критических модулей (auth, chat, calls) ≥ 80% |
| Покрытие веток | ≥ 50% | Все error-пути протестированы |
| Flaky rate | 0% | Ни один тест не должен быть нестабильным |
| Время unit-suite | < 30s | Быстрые тесты → частый запуск |
| Время e2e-suite | < 5min | Запуск на CI при каждом PR |

## Когда какой тест писать

| Сценарий | Тип теста |
|---|---|
| Чистая функция (утилита, парсер, валидатор) | Unit |
| React хук с useState/useEffect | Unit (renderHook) |
| Zustand store (actions, selectors) | Unit |
| Компонент с формой | Unit + Integration |
| Компонент + store + API | Integration |
| Realtime подписка | Integration (мок канала) |
| Авторизация end-to-end | E2E |
| Критический бизнес-flow (оплата, звонок) | E2E |
| Визуальная регрессия | E2E (screenshot comparison) |

## Процесс: полный цикл тест-пайплайна

```
1. Strategy
   ├── Определить scope и зависимости
   ├── Составить Test Plan с конкретными кейсами
   └── Выбрать стратегию моков

2. Unit (Red → Green → Refactor)
   ├── Написать падающие unit-тесты
   ├── Реализовать минимальный код
   ├── Убедиться все зелёные
   └── Рефакторинг без поломок

3. Integration
   ├── Тесты связок модулей
   ├── Мок внешних границ
   └── Проверка data flow

4. E2E (только критические пути)
   ├── Playwright-тесты пользовательских сценариев
   ├── Page Object для сложных flow
   └── Скриншоты при падении

5. Review
   ├── Чеклист качества
   ├── Проверка анти-паттернов
   ├── npx vitest run → 0 failures
   └── npx playwright test → 0 failures
```

## Ограничения

- НИКОГДА не пиши тест без `expect()` — каждый тест доказывает что-то конкретное
- НИКОГДА не используй `setTimeout` в тестах — только `vi.useFakeTimers()`
- НИКОГДА не делай тест зависимым от порядка выполнения другого теста
- НИКОГДА не мокай всё подряд — мокай только внешние границы системы
- НИКОГДА не пиши snapshot-тесты на большие компоненты — тестируй поведение
- НИКОГДА не игнорируй flaky-тесты — чини сразу или удаляй
- НИКОГДА не пиши тест ради покрытия — тестируй реальные сценарии
