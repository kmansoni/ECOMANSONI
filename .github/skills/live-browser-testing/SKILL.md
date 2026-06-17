---
name: "Live Browser Testing"
description: "Playwright-based browser testing with real user flows. Use when: running E2E tests, testing authenticated flows, or verifying UI in real browser. Triggers: browser testing, E2E, Playwright, real user simulation."
---

# Live Browser Testing

Playwright-based browser testing for real-world validation.

## Integration with Sharingan (Recommended)

This skill uses [sharingan-autotest](https://github.com/shruthikj/sharingan-autotest) methodology:
- `/sharingan` — full QA cycle
- `/sharingan-scan` — discovery only
- `/sharingan-fix` — fix failures

## Core Principles

1. **Test real user flows** — not just API responses
2. **Handle authentication** — browser-based login capture
3. **Wait for styled content** — CSS must load before assertions
4. **Visual regression** — screenshot comparison
5. **Self-healing** — fix locators automatically

## Playwright Setup

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

## Authenticated Testing

```typescript
// Use storage state for authenticated tests
const { use } = defineConfig({
  projects: [{
    name: 'authenticated',
    use: {
      ...devices['Desktop Chrome'],
      storageState: '.auth/storage-state.json',
    },
  }],
});
```

## Best Practices

### Wait for Styled Page
```typescript
async function waitForStyledPage(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const body = document.body;
    if (!body) return false;
    const font = getComputedStyle(body).fontFamily.toLowerCase();
    return !font.includes('times') && font !== '';
  }, { timeout: 15000 });
  await page.waitForTimeout(800);
}
```

### Handle Dynamic Content
```typescript
// Use data-testid attributes
await page.click('[data-testid="submit-button"]');

// Or resilient selectors
await page.click('button:has-text("Continue"):not([disabled])');
```

### Visual Testing
```typescript
test('landing page visual', async ({ page }) => {
  await page.goto('/');
  await waitForStyledPage(page);
  await expect(page).toHaveScreenshot('landing.png', {
    animations: 'disabled',
    maxDiffPixels: 1000,
  });
});
```

## For Mansoni

Test priority:
1. Auth flows (login, register, logout)
2. Chat messaging (send, receive, reactions)
3. Navigation (routing, deep links)
4. Media uploads (images, voice)
5. Payment flows (if implemented)