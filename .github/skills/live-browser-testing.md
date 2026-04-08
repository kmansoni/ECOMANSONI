# Live Browser Testing — Тестирование в реальном времени

> Источники: anthropics/skills (integration-testing), github/awesome-copilot (webapp-testing,
> playwright-explore-website, playwright-generate-test), tsilverberg/webapp-uat (WCAG + responsive),
> levnikolaevich (webapp-uat), obra/superpowers (TDD workflow)
> Лучшее решение: Playwright MCP + Vite HMR + auto-screenshot pipeline

---

## КОНЦЕПЦИЯ: Live Test Loop

```
Vite Dev Server (HMR) → Браузер (Playwright) → Скриншот/Assertion → Агент анализирует → Фикс → Repeat
        ↑                                                                                    |
        └────────────────────────────────────────────────────────────────────────────────────┘
```

Агент видит РЕАЛЬНЫЙ UI в реальном времени и тестирует как пользователь.

---

## SETUP

### 1. Vite Dev Server
```bash
npm run dev -- --port 8080 --host
```
Уже настроен в проекте. HMR обновляет UI мгновенно после изменения кода.

### 2. Playwright (уже в проекте)
```bash
npx playwright install chromium
```

### 3. MCP Browser Tools (если доступен)
Playwright MCP сервер позволяет агенту:
- Открывать URL
- Кликать элементы
- Вводить текст
- Делать скриншоты
- Проверять console errors
- Измерять Core Web Vitals

---

## ПРОТОКОЛ LIVE TESTING

### Фаза 1: Smoke Test (после каждого изменения)
```
1. Открыть http://localhost:8080/{target-page}
2. Скриншот → проверить визуально
3. Console → 0 ошибок
4. Network → все запросы 200/304
5. Если ошибка → остановиться, починить
```

### Фаза 2: Functional Test (после фичи)
```
1. Навигация: все маршруты доступны
2. Формы: заполнение, валидация, submit
3. CRUD: создать, прочитать, обновить, удалить
4. Состояния: loading → data → empty → error
5. Auth: login → protected route → logout
```

### Фаза 3: Visual Regression (перед коммитом)
```
1. Скриншоты критичных страниц → pw-screenshots/
2. Сравнение с baseline (pixel diff)
3. Mobile viewport (375px) + Desktop (1440px)
4. Dark mode (если есть)
```

### Фаза 4: Accessibility Audit
```
1. axe-core scan → 0 critical/serious violations
2. Keyboard navigation: Tab order, focus visible
3. Screen reader: ARIA labels, headings hierarchy
4. Contrast: ≥ 4.5:1 (AA)
5. Touch targets: ≥ 44x44px
```

### Фаза 5: Performance Snapshot
```
1. Lighthouse score: Performance ≥ 90
2. LCP < 2.5s, CLS < 0.1, INP < 200ms
3. Bundle size check: no regression
4. Network waterfall: no blocking resources
```

---

## PLAYWRIGHT СКРИПТ ДЛЯ БЫСТРОГО ТЕСТА

```typescript
// e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';

test('smoke: главная загружается', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await expect(page).toHaveTitle(/companion/i);
  // Нет ошибок в консоли
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(2000);
  expect(errors).toHaveLength(0);
});

test('smoke: чат доступен после авторизации', async ({ page }) => {
  await page.goto('http://localhost:8080/chat');
  // Должен быть редирект на login или показан чат
  await expect(page.locator('body')).not.toBeEmpty();
});
```

---

## ИНТЕГРАЦИЯ С АГЕНТОМ

Mansoni использует live testing на этапе верификации:

```
1. Написал код → HMR обновил UI
2. Запустил `npx playwright test e2e/smoke.spec.ts`
3. Если FAIL → читает скриншот + лог → чинит → повтор
4. Если PASS → продолжает пайплайн
5. Перед коммитом: full test suite
```

### Команды в терминале

```bash
# Быстрый smoke
npx playwright test e2e/smoke.spec.ts --reporter=line

# Полный E2E
npx playwright test --reporter=html

# Скриншоты
npx playwright test --update-snapshots

# С видео при падении
npx playwright test --video=retain-on-failure
```

---

## ПРАВИЛА

- Dev server ДОЛЖЕН быть запущен перед тестированием
- Скриншоты падений сохранять в `pw-screenshots/` (уже в .gitignore)
- Console errors = blocker (кроме known warnings)
- Тесты не должны зависеть от внешних API (mock Supabase для E2E)
- Mobile-first: всегда проверять на 375px viewport
