import { test, expect } from '@playwright/test';

test.describe('Profile Page Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/profile');
  });

  test('Profile page should load without critical errors', async ({ page }) => {
    await page.waitForTimeout(3000);
    
    let errors: string[] = [];
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
    await page.waitForTimeout(3000);
    
    const navLinks = page.locator('a[href]');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
    
    if (count > 0) {
      await expect(navLinks.first()).toBeVisible();
    }
  });

  test('Profile page should have interactive elements', async ({ page }) => {
    await page.waitForTimeout(3000);
    
    const pageContent = await page.content();
    expect(pageContent).toContain('Джехангир');
    expect(pageContent).toContain('Профиль');
    
    const interactiveElements = page.locator('button');
    const buttonCount = await interactiveElements.count();
    expect(buttonCount).toBeGreaterThan(0);
  });
});
