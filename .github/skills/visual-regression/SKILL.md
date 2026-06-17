---
name: "Visual Regression"
description: "Screenshot comparison testing for UI changes. Use when: detecting unintended UI changes, validating design consistency, or automating visual QA."
---

# Visual Regression

Automated screenshot comparison testing.

## Setup

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 1000,
      threshold: 0.25,
    },
  },
});
```

## Basic Test

```typescript
test('login page visual', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Disable animations for stable screenshots
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await expect(page).toHaveScreenshot('login-page.png');
});
```

## Component Testing

```typescript
test('button component states', async ({ mount }) => {
  const button = await mount(<Button>Click me</Button>);

  // Default state
  await expect(button).toHaveScreenshot('button-default.png');

  // Hover state
  await button.hover();
  await expect(button).toHaveScreenshot('button-hover.png');

  // Disabled state
  await button.click({ force: true }); // bypass disabled
  await button.isDisabled();
  await expect(button).toHaveScreenshot('button-disabled.png');
});
```

## CI Integration

```yaml
# GitHub Actions
- name: Visual Tests
  run: npx playwright test --project=visual

- name: Upload baseline
  if: failure()
  run: |
    git checkout main -- tests/snapshots/
    npx playwright test --project=visual
    # Review and commit new baselines
```

## Update Baselines

```bash
# Update all screenshots
npx playwright test --update-snapshots

# Update specific test
npx playwright test --update-snapshots login.spec.ts
```

## Best Practices

1. **Isolate** — test one component per screenshot
2. **Stable content** — mock dynamic content (dates, usernames)
3. **Disable animations** — use `reducedMotion`
4. **Consistent viewport** — same browser size always
5. **Review false positives** — acceptable differences (fonts, antialiasing)

## For Mansoni

Critical pages for visual regression:
1. Landing page
2. Chat interface
3. Settings panels
4. Modals and dialogs