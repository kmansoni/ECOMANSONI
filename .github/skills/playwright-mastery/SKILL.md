---
name: playwright-mastery
description: |
  Playwright E2E testing mastery: selectors, auto-wait, fixtures, web-first assertions, 
  mobile viewport, video on failure. Use when: e2e testing, playwright, browser automation.
license: Apache 2.0
---

# Playwright Mastery — E2E тестирование

Playwright для end-to-end тестирования веб-приложений. Авто-ожидание, web-first assertions.

## Когда использовать

- E2E тесты для критичных пользовательских flows
- Smoke тесты после деплоя
- Mobile viewport тестирование
- Accessibility проверки
- Видеозапись на падениях

## Project Setup

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  
  reporter: [['html', { open: 'never' }]],
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 375, height: 667 } // Mobile first
  },
  
  projects: [
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Desktop Firefox', use: { ...devices['Desktop Firefox'] } }
  ],
  
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI
  }
});
```

## Writing Tests

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login successfully', async ({ page }) => {
    // Navigate
    await page.goto('/login');
    
    // Fill form - auto wait for selectors
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    
    // Click - auto wait for element to be clickable
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Assertion - auto wait for condition
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
  });
  
  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  });
});
```

## Best Practices

### 1. Use web-first assertions
```typescript
// ✅ Good - auto wait
await expect(page.getByRole('button')).toBeEnabled();
await expect(page.locator('.spinner')).not.toBeVisible();

// ❌ Bad - no wait
expect(await page.isEnabled('.button')).toBeTruthy();
```

### 2. Prioritize user-facing attributes
```typescript
// Locators by priority:
// 1. Role + name (most accessible)
page.getByRole('button', { name: 'Submit' });

// 2. Label text
page.getByLabel('Email address');

// 3. Placeholder text
page.getByPlaceholder('Enter your email');

// 4. Text content
page.getByText('Welcome back');

// 5. CSS selectors (avoid)
page.locator('.btn-submit');
```

### 3. Handle loading states
```typescript
test('should handle async operations', async ({ page }) => {
  await page.getByRole('button', { name: 'Load Data' }).click();
  
  // Wait for network to be idle
  await page.waitForLoadState('networkidle');
  
  // Or wait for specific request/response
  await page.waitForResponse(response => 
    response.url().includes('/api/data') && response.status() === 200
  );
  
  await expect(page.getByRole('list')).toContainText('Item 1');
});
```

## Mobile Testing

```typescript
// e2e/mobile.spec.ts
import { test, devices } from '@playwright/test';

test.use(devices['iPhone 12']);

test('mobile navigation', async ({ page }) => {
  await page.goto('/');
  
  // Open menu
  await page.getByLabel('Open navigation').click();
  
  // Test touch targets are 44px+
  const buttons = await page.locator('[role="button"]').all();
  for (const button of buttons) {
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});
```

## Test Fixtures

```typescript
// e2e/fixtures/auth.fixture.ts
import { test as base } from '@playwright/test';

type AuthFixtures = {
  authenticatedPage: Awaited<ReturnType<typeof createAuthenticatedPage>>;
};

const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.TEST_EMAIL!);
    await page.getByLabel('Password').fill(process.env.TEST_PASSWORD!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/dashboard');
    await use(page);
  }
});

export { test };
```

## Accessibility Testing

```typescript
import { AxeBuilder } from '@axe-core/playwright';

test('should pass accessibility checks', async ({ page }) => {
  await page.goto('/dashboard');
  
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

## CLI

```bash
# Run all tests
npx playwright test

# Run specific test
npx playwright test auth.spec.ts

# Run with UI
npx playwright test --ui

# Debug mode
npx playwright test --debug

# Show report
npx playwright show-report

# Codegen - generate selectors
npx playwright codegen localhost:8080
```

## Troubleshooting

```typescript
// Wait for specific conditions
await page.waitForFunction(() => window.initialized === true);
await page.waitForSelector('.loaded', { state: 'visible' });
await page.waitForTimeout(1000); // Last resort

// Handle dialogs/alerts
page.on('dialog', dialog => dialog.accept());

// Set viewport
await page.setViewportSize({ width: 375, height: 667 });
```

## Checklist

- [ ] playwright.config.ts с mobile viewport по умолчанию
- [ ] webServer для автозапуска dev сервера
- [ ] getByRole/getByLabel - не CSS селекторы
- [ ] toBeVisible/toHaveURL - web-first assertions
- [ ] trace/screenshot/video на failures
- [ ] Parallel execution в CI
- [ ] Mobile touch target size проверка (44px+)