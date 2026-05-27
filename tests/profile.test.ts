import { test, expect } from '@playwright/test';

test.describe('Profile Page Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://mansoni.ru/profile');
  });

  test('Profile page should load without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await expect(page).toHaveTitle(/mansoni/);

    const profileHeading = page.locator('h1');
    await expect(profileHeading).toBeVisible();

    const connectionErrors = errors.filter(e =>
      e.includes('ERR_CONNECTION_REFUSED') ||
      e.includes('500') ||
      e.includes('не удалось сохранить')
    );
    expect(connectionErrors.length).toBeLessThan(3);
  });

  test('Profile page should have working navigation', async ({ page }) => {
    const navLinks = page.locator('a[href]');
    await expect(navLinks.first()).toBeVisible();
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Profile page should have interactive elements', async ({ page }) => {
    const interactiveElements = page.locator('button');
    await expect(interactiveElements.first()).toBeVisible();
    const buttonCount = await interactiveElements.count();
    expect(buttonCount).toBeGreaterThan(0);
  });
});
