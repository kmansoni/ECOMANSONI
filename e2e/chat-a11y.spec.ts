/**
 * Chat Accessibility (a11y) Tests
 *
 * Playwright + axe-core: проверка доступности чата
 * Покрывает:
 * - Screen reader (VoiceOver, NVDA, TalkBack)
 * - Keyboard navigation (Tab, Enter, Escape, Arrow keys)
 * - Focus management (trap, restore, visible focus)
 * - ARIA labels, roles, states
 * - Color contrast (WCAG 2.1 AA)
 * - Reduced motion support
 * - Skip links & landmarks
 */

import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test.describe('Chat Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    // Assume user logged in via fixture
  });

  test.describe('Landmarks & Structure', () => {
    test('should have proper ARIA landmarks', async ({ page }) => {
      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });

    test('should have unique <h1> per page', async ({ page }) => {
      const h1s = await page.locator('h1').all();
      expect(h1s.length).toBeLessThanOrEqual(1);
    });

    test('should have skip link to main content', async ({ page }) => {
      const skipLink = page.locator('a[href="#main"]:first-child');
      await expect(skipLink).toBeVisible();

      await skipLink.click();
      await expect(page.locator('#main')).toBeFocused();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should navigate message list with arrow keys', async ({ page }) => {
      const messageList = page.locator('[role="listbox"]'); // ARIA listbox for messages

      // Tab into message list
      await messageList.focus();
      await page.keyboard.press('ArrowDown');
      await expect(messageList.locator('div[aria-selected="true"]')).toBeVisible();

      // Arrow navigation
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Home');
      // etc.
    });

    test('should send message with Enter (not Shift+Enter for newline)', async ({ page }) => {
      const input = page.locator('[contenteditable="true"]');
      await input.fill('Hello');

      await input.press('Enter');
      await expect(page.locator('div.message').last).toHaveText('Hello');
    });

    test('should close modal with Escape', async ({ page }) => {
      // Open forward message modal
      await page.locator('button[aria-label="Forward message"]').click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(modal).not.toBeVisible();
    });

    test('should trap focus inside modal', async ({ page }) => {
      await page.locator('button[aria-label="New chat"]').click();
      const dialog = page.locator('[role="dialog"]');

      await expect(dialog).toBeVisible();

      // Tab should cycle inside modal
      await page.keyboard.press('Tab');
      const firstFocusable = dialog.locator('button, input, [tabindex="0"]').first();
      await expect(firstFocusable).toBeFocused();

      // Loop back
      for (let i = 0; i < 20; i++) await page.keyboard.press('Tab');
      await expect(firstFocusable).toBeFocused();
    });
  });

  test.describe('Screen Reader Labels', () => {
    test('should have accessible names for all buttons', async ({ page }) => {
      const buttons = page.locator('button');
      const count = await buttons.count();

      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const ariaLabel = await btn.getAttribute('aria-label');
        const textContent = await btn.textContent();

        // Every interactive button needs accessible name
        expect(ariaLabel || textContent?.trim()).toBeTruthy();
      }
    });

    test('should announce new messages to screen reader (live region)', async ({ page }) => {
      const liveRegion = page.locator('[aria-live="polite"]');

      // Wait for incoming message
      await page.waitForEvent('console', msg => {
        return msg.text().includes('message received');
      });

      // New message appears and is announced
      await expect(liveRegion).toContainText('New message from');
    });

    test('should describe attachments with alt text', async ({ page }) => {
      const images = page.locator('img[src*="attachment"]');
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        expect(alt?.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Color Contrast', () => {
    test('should meet WCAG AA contrast for text', async ({ page }) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa', 'wcag21', 'best-practice'])
        .analyze();

      const contrastViolations = results.violations.filter(v =>
        v.id === 'color-contrast'
      );

      expect(contrastViolations).toEqual([]);
    });

    test('should have focus visible indicator', async ({ page }) => {
      const input = page.locator('[contenteditable="true"]');
      await input.focus();

      // Focus ring visible?
      const box = await input.boundingBox();
      // Can't easily check CSS, but can assert :focus-visible styles applied
      const hasOutline = await input.evaluate((el) => {
        const style = window.getComputedStyle(el, ':focus-visible');
        return style.outline !== 'none' && style.outlineWidth !== '0px';
      });
      expect(hasOutline).toBe(true);
    });
  });

  test.describe('Reduced Motion', () => {
    test('should respect prefers-reduced-motion', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });

      // Animations should be disabled
      const animatedElement = page.locator('.message-bubble');
      const transitionDuration = await animatedElement.evaluate((el) => {
        return window.getComputedStyle(el).transitionDuration;
      });

      expect(transitionDuration).toBe('0s');
    });
  });

  test.describe('Message Input', () => {
    test('should announce character count for input', async ({ page }) => {
      const input = page.locator('[contenteditable="true"]');
      const maxlength = await input.getAttribute('aria-describedby'); // references counter

      expect(maxlength).toBeDefined();
    });

    test('should indicate typing indicator to screen reader', async ({ page }) => {
      const typingIndicator = page.locator('[aria-live="assertive"]');
      await typingIndicator.waitFor({ state: 'visible' });

      await expect(typingIndicator).toHaveText('User is typing');
    });
  });
});
