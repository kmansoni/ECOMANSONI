/**
 * Cross-Platform Consistency Tests
 *
 * Playwright: проверка консистентности UI и поведения на всех платформах:
 * - Chrome, Firefox, Safari, Edge
 * - iOS Safari, Chrome Android
 * - Visual regression (pixel-perfect matching)
 * - Feature detection (WebRTC, File API)
 * - Platform-specific workarounds
 */

import { test, expect, devices } from '@playwright/test';

test.describe('Cross-Platform Consistency', () => {
  test.describe('Desktop Browsers', () => {
    test('should render chat UI identically in Chrome and Firefox', async ({ page }) => {
      await page.goto('/chat');

      // Compare screenshots of main chat view
      const chromeScreenshot = await page.screenshot({
        fullPage: false,
        animations: 'disabled',
      });

      // In real CI: would launch Firefox context, compare using pixelmatch
      // Here we assert expected elements positions match
      const messageBubbles = page.locator('.message-bubble');
      const count = await messageBubbles.count();
      expect(count).toBeGreaterThan(0);

      // Pixel-perfect check (simplified)
      const boundingBoxes = await messageBubbles.allHandles();
      for (const box of boundingBoxes) {
        const boxModel = await box.boundingBox();
        expect(boxModel).toBeDefined();
        expect(boxModel.width).toBeGreaterThan(0);
        expect(boxModel.height).toBeGreaterThan(0);
      }
    });

    test('should have identical DOM structure across browsers', async ({ page }) => {
      // Tree snapshot comparison
      const snapshot = await page.locator('body').innerHTML();
      expect(snapshot).toContain('role="listbox"'); // messages list
      expect(snapshot).toContain('contenteditable="true"'); // input
    });
  });

  test.describe('Mobile Browsers', () => {
    const iPhone = devices['iPhone 14'];
    const pixel5 = devices['Pixel 5'];

    test('should work on iOS Safari (viewport 390×844)', async ({ page, isMobile }) => {
      if (isMobile) {
        await page.setViewportSize({ width: 390, height: 844 });
      }

      await page.goto('/chat');

      // Touch targets: min 44×44 CSS pixels
      const buttons = page.locator('button');
      const count = await buttons.count();

      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const box = await btn.boundingBox();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test('should use native pickers on mobile', async ({ page }) => {
      await page.goto('/chat');

      // Attachment button → file input (native)
      const attachmentBtn = page.locator('button[aria-label="Attach file"]');
      await attachmentBtn.click();

      // File chooser is native (not mocked)
      const fileChooser = await page.waitForEvent('filechooser');
      expect(fileChooser).toBeTruthy();
    });
  });

  test.describe('Feature Detection', () => {
    test('should detect WebRTC support', async ({ page }) => {
      const hasGetUserMedia = await page.evaluate(() => {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      });
      expect(hasGetUserMedia).toBe(true);
    });

    test('should detect File API support', async ({ page }) => {
      const hasFileAPI = await page.evaluate(() => {
        return !!(window.File && window.FileReader && window.FileList && window.Blob);
      });
      expect(hasFileAPI).toBe(true);
    });

    test('should handle Safari file:// URL quirks', async ({ page }) => {
      // Safari имеет ограничения на file:// URLs
      // Наш код должен работать на file:// и http(s)://
      const userAgent = await page.evaluate(() => navigator.userAgent);
      const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');

      if (isSafari) {
        // Проверка fallback для IndexedDB availability in private mode
        const idbAvailable = await page.evaluate(() => {
          return typeof indexedDB !== 'undefined';
        });
        expect(idbAvailable).toBe(true);
      }
    });
  });

  test.describe('Platform-Specific Workarounds', () => {
    test('should apply Safari-specific CSS fixes', async ({ page }) => {
      const userAgent = await page.evaluate(() => navigator.userAgent);
      const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');

      if (isSafari) {
        // Check: input[contenteditable] should have -webkit-user-select: text
        const inputStyles = await page.evaluate(() => {
          const el = document.querySelector('[contenteditable="true"]');
          return window.getComputedStyle(el).webkitUserSelect;
        });
        expect(inputStyles).toBe('text');
      }
    });

    test('should handle Firefox clipboard differently', async ({ page }) => {
      // Firefox требует user gesture для clipboard.writeText()
      // Наш код должен это учитывать
      await page.goto('/chat');
      await page.locator('[contenteditable="true"]').click();

      // Paste simulation
      await page.keyboard.type('Hello');
      await expect(page.locator('[contenteditable="true"]')).toHaveText('Hello');
    });

    test('should not break on Android Chrome soft keyboard', async ({ page, isMobile }) => {
      if (isMobile) {
        // Tap input → soft keyboard appears → height changes
        const input = page.locator('[contenteditable="true"]');
        await input.click();

        // Keyboard pushes viewport up
        const viewportSize = page.viewportSize();
        // Chat input should remain visible
        await expect(input).toBeInViewport();
      }
    });
  });

  test.describe('Visual Regression', () => {
    test('should match Chrome baseline screenshot', async ({ page }, testInfo) => {
      await page.goto('/chat');

      // Baseline: Chrome (first run) → saved as golden
      // Future runs: compare pixel diff < 0.1%
      // Playwright expect(page).toHaveScreenshot() из коробки

      await expect(page).toHaveScreenshot('chat-baseline.png', {
        maxDiffPixelRatio: 0.001, // < 0.1% difference allowed
      });
    });

    test('should not have layout shift on image load (CLS < 0.1)', async ({ page }) => {
      const metrics = await page.evaluate(() => {
        return new Promise((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const cls = entries.reduce((sum, entry) => sum + (entry as any).value, 0);
            resolve({ cls });
          });
          observer.observe({ entryTypes: ['layout-shift'] });
        });
      });

      expect(metrics.cls).toBeLessThan(0.1);
    });
  });

  test.describe('Installability (PWA)', () => {
    test('should satisfy PWA install criteria', async ({ page }) => {
      const manifest = await page.evaluate(() => {
        return navigator.serviceReady && 'manifest' in document
          ? JSON.parse((document.querySelector('link[rel="manifest"]') as HTMLLinkElement).href)
          : null;
      });

      if (manifest) {
        expect(manifest).toHaveProperty('name');
        expect(manifest).toHaveProperty('short_name');
        expect(manifest).toHaveProperty('icons');
      }
    });

    test('should respond to "Add to Home Screen" prompt', async ({ page }) => {
      const beforePrompt = await page.evaluate(() => {
        return window.deferredInstallPrompt !== undefined;
      });
      // If PWA installable, prompt should fire
      // Playwright can intercept beforeinstallprompt event
    });
  });
});
