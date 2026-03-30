import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:5173";

// Helper: collect console errors during page interactions
async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });
  return errors;
}

// Helper: collect network errors
async function collectNetworkErrors(page: Page): Promise<string[]> {
  const networkErrors: string[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      networkErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });
  return networkErrors;
}

test.describe("Part 1: Settings /settings", () => {
  test("Settings page renders and sections are clickable", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));
    page.on("response", (resp) => { if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`); });

    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/01-settings-initial.png", fullPage: true });

    // Check for settings sections list
    const pageContent = await page.content();
    console.log("=== SETTINGS PAGE CONTENT (first 2000 chars) ===");
    console.log(pageContent.substring(0, 2000));

    // Look for common settings navigation items
    const privacySelectors = [
      'text=Приватность', 'text=Privacy', 'text=privacy',
      '[href*="privacy"]', '[data-testid*="privacy"]'
    ];
    let privacyFound = false;
    for (const sel of privacySelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        privacyFound = true;
        console.log(`Found privacy with selector: ${sel}`);
        await el.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "screenshots/01-settings-privacy.png", fullPage: true });
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }
    console.log(`Privacy section found: ${privacyFound}`);

    // Check for notifications
    const notifSelectors = [
      'text=Уведомления', 'text=Notifications', 'text=notifications',
      '[href*="notification"]', '[data-testid*="notification"]'
    ];
    let notifFound = false;
    for (const sel of notifSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        notifFound = true;
        console.log(`Found notifications with selector: ${sel}`);
        await el.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "screenshots/01-settings-notifications.png", fullPage: true });
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }
    console.log(`Notifications section found: ${notifFound}`);

    // Check for appearance
    const appearanceSelectors = [
      'text=Внешний вид', 'text=Appearance', 'text=appearance',
      '[href*="appearance"]', '[data-testid*="appearance"]'
    ];
    let appearanceFound = false;
    for (const sel of appearanceSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        appearanceFound = true;
        console.log(`Found appearance with selector: ${sel}`);
        await el.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "screenshots/01-settings-appearance.png", fullPage: true });
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }
    console.log(`Appearance section found: ${appearanceFound}`);

    // Count all clickable list items in settings
    const listItems = await page.locator('li, [role="listitem"], a, button').count();
    console.log(`Total clickable/list elements on settings page: ${listItems}`);

    console.log("=== SETTINGS CONSOLE ERRORS ===");
    consoleErrors.forEach(e => console.log("ERROR:", e));
    console.log("=== SETTINGS NETWORK ERRORS ===");
    networkErrors.forEach(e => console.log("NET ERROR:", e));
  });
});

test.describe("Part 2: Profile /profile", () => {
  test("Profile page renders correctly", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));
    page.on("response", (resp) => { if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`); });

    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/02-profile-initial.png", fullPage: true });

    const pageContent = await page.content();
    console.log("=== PROFILE PAGE CONTENT (first 2000 chars) ===");
    console.log(pageContent.substring(0, 2000));

    // Check for avatar/image
    const avatarEl = page.locator('img[alt*="avatar"], img[alt*="profile"], img[alt*="Avatar"], .avatar img, [data-testid*="avatar"] img').first();
    const avatarVisible = await avatarEl.isVisible().catch(() => false);
    console.log(`Avatar visible: ${avatarVisible}`);

    // Check for broken images
    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src);
    });
    console.log(`Broken images: ${JSON.stringify(brokenImages)}`);

    // Check for tabs (Posts, Reels, Tagged)
    const tabSelectors = [
      'text=Посты', 'text=Posts', 'text=Reels', 'text=Tagged', 'text=Отмечено',
      '[role="tab"]', '.tab', '[data-tab]'
    ];
    for (const sel of tabSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found tab: ${sel}`);
        await el.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `screenshots/02-profile-tab-${sel.replace(/[^a-z]/gi, '_')}.png`, fullPage: true });
      }
    }

    // Check Edit Profile button
    const editSelectors = [
      'text=Edit Profile', 'text=Редактировать профиль', 'text=Edit',
      'button[data-testid*="edit"]', 'a[href*="edit"]'
    ];
    for (const sel of editSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found edit profile button: ${sel}`);
        await el.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "screenshots/02-profile-edit.png", fullPage: true });
        // Close/go back
        const closeBtn = page.locator('[aria-label="Close"], [aria-label="close"], button:has-text("×"), button:has-text("Cancel")').first();
        if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }

    console.log("=== PROFILE CONSOLE ERRORS ===");
    consoleErrors.forEach(e => console.log("ERROR:", e));
    console.log("=== PROFILE NETWORK ERRORS ===");
    networkErrors.forEach(e => console.log("NET ERROR:", e));
  });
});

test.describe("Part 3: Search /search", () => {
  test("Search page - functional test and XSS check", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));
    page.on("response", (resp) => { if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`); });

    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/03-search-initial.png", fullPage: true });

    // Find search input
    const searchSelectors = [
      'input[type="search"]', 'input[placeholder*="поиск" i]', 'input[placeholder*="search" i]',
      'input[type="text"]', '[role="searchbox"]', 'input'
    ];
    let searchInput = null;
    for (const sel of searchSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        searchInput = el;
        console.log(`Found search input: ${sel}`);
        break;
      }
    }

    if (searchInput) {
      // Type "test"
      await searchInput.click();
      await searchInput.fill("test");
      await page.waitForTimeout(1500); // debounce
      await page.screenshot({ path: "screenshots/03-search-test-query.png", fullPage: true });

      const resultsCount = await page.locator('[data-testid*="result"], .search-result, [role="listitem"]').count();
      console.log(`Search results for "test": ${resultsCount}`);

      // Check if results section is visible
      const pageText = await page.innerText('body');
      const hasResults = pageText.toLowerCase().includes('test') || resultsCount > 0;
      console.log(`Has results: ${hasResults}`);
      console.log(`Page text contains "test": ${pageText.toLowerCase().includes('test')}`);

      // XSS test
      await searchInput.clear();
      await searchInput.fill("<script>alert('xss')</script>");
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "screenshots/03-search-xss-script.png", fullPage: true });

      // Check if script tag appeared in DOM
      const xssScriptInDOM = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script:not([src]):not([type="application/json"])');
        for (const s of scripts) {
          if (s.textContent?.includes('alert')) return true;
        }
        return false;
      });
      console.log(`XSS script executed in DOM: ${xssScriptInDOM}`);

      // Check what's in the input value
      const inputValue = await searchInput.inputValue();
      console.log(`Input value after XSS attempt: ${inputValue}`);

      // Second XSS test with img onerror
      await searchInput.clear();
      await searchInput.fill("<img src=x onerror=alert(1)>");
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "screenshots/03-search-xss-img.png", fullPage: true });

      const xssImgInDOM = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img[onerror]');
        return imgs.length > 0;
      });
      console.log(`XSS img onerror in DOM: ${xssImgInDOM}`);
    } else {
      console.log("NO SEARCH INPUT FOUND");
    }

    console.log("=== SEARCH CONSOLE ERRORS ===");
    consoleErrors.forEach(e => console.log("ERROR:", e));
    console.log("=== SEARCH NETWORK ERRORS ===");
    networkErrors.forEach(e => console.log("NET ERROR:", e));
  });
});

test.describe("Part 4: AI Assistant /ai-assistant", () => {
  test("AI Assistant - send message and check response", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));
    page.on("response", (resp) => { if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`); });

    await page.goto(`${BASE}/ai-assistant`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/04-ai-assistant-initial.png", fullPage: true });

    const pageContent = await page.content();
    console.log("=== AI ASSISTANT PAGE CONTENT (first 2000 chars) ===");
    console.log(pageContent.substring(0, 2000));

    // Find message input
    const inputSelectors = [
      'textarea', 'input[type="text"]', 'input[placeholder*="сообщ" i]',
      'input[placeholder*="message" i]', '[contenteditable="true"]',
      'input[placeholder*="спроси" i]', 'input[placeholder*="ask" i]'
    ];
    let messageInput = null;
    for (const sel of inputSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        messageInput = el;
        console.log(`Found AI input: ${sel}`);
        break;
      }
    }

    if (messageInput) {
      await messageInput.click();
      await messageInput.fill("Привет, как дела?");
      await page.screenshot({ path: "screenshots/04-ai-assistant-typed.png", fullPage: true });

      // Press Enter or click send
      const sendBtn = page.locator('button[type="submit"], button[aria-label*="send" i], button:has-text("Отправить"), button:has-text("Send")').first();
      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click();
      } else {
        await messageInput.press("Enter");
      }

      // Wait for response (up to 10 seconds)
      await page.waitForTimeout(5000);
      await page.screenshot({ path: "screenshots/04-ai-assistant-response.png", fullPage: true });

      const pageTextAfter = await page.innerText('body');
      console.log(`Response received (page has more than initial): ${pageTextAfter.length > 100}`);

      // Check for loading/streaming indicators
      const loadingVisible = await page.locator('[data-testid*="loading"], .loading, .spinner, [aria-label*="loading"]').isVisible().catch(() => false);
      console.log(`Loading indicator: ${loadingVisible}`);
    } else {
      console.log("NO AI ASSISTANT INPUT FOUND");
    }

    console.log("=== AI ASSISTANT CONSOLE ERRORS ===");
    consoleErrors.forEach(e => console.log("ERROR:", e));
    console.log("=== AI ASSISTANT NETWORK ERRORS ===");
    networkErrors.forEach(e => console.log("NET ERROR:", e));
  });
});

test.describe("Part 5: People Nearby /people-nearby", () => {
  test("People Nearby - geolocation and privacy check", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));
    page.on("response", (resp) => { if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`); });

    // Deny geolocation by default
    await page.goto(`${BASE}/people-nearby`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/05-people-nearby-initial.png", fullPage: true });

    const pageContent = await page.content();
    console.log("=== PEOPLE NEARBY PAGE CONTENT (first 2000 chars) ===");
    console.log(pageContent.substring(0, 2000));

    // Check for geolocation request dialog or privacy warning
    const privacyWarningSelectors = [
      'text=геолокац', 'text=location', 'text=Location', 'text=Геолокация',
      'text=приватн', 'text=privacy', 'text=Privacy',
      '[data-testid*="location"]', '[data-testid*="privacy"]'
    ];

    for (const sel of privacyWarningSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found privacy/location element: ${sel}`);
      }
    }

    const bodyText = await page.innerText('body');
    const hasPrivacyText = bodyText.toLowerCase().includes('геолокац') ||
                           bodyText.toLowerCase().includes('location') ||
                           bodyText.toLowerCase().includes('приватн') ||
                           bodyText.toLowerCase().includes('privacy');
    console.log(`Has privacy/location text: ${hasPrivacyText}`);
    console.log(`Body text excerpt: ${bodyText.substring(0, 500)}`);

    console.log("=== PEOPLE NEARBY CONSOLE ERRORS ===");
    consoleErrors.forEach(e => console.log("ERROR:", e));
    console.log("=== PEOPLE NEARBY NETWORK ERRORS ===");
    networkErrors.forEach(e => console.log("NET ERROR:", e));
  });
});

test.describe("Part 6: Notifications /notifications", () => {
  test("Notifications page - filters and empty state", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));
    page.on("response", (resp) => { if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`); });

    await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/06-notifications-initial.png", fullPage: true });

    const pageContent = await page.content();
    console.log("=== NOTIFICATIONS PAGE CONTENT (first 2000 chars) ===");
    console.log(pageContent.substring(0, 2000));

    // Check for filter tabs/buttons
    const filterSelectors = [
      '[role="tab"]', '.filter-tab', '[data-testid*="filter"]',
      'text=All', 'text=Все', 'text=Mentions', 'text=Упоминания',
      'text=Likes', 'text=Лайки', 'text=Comments', 'text=Комментарии'
    ];

    let filtersFound = 0;
    for (const sel of filterSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`Found filter element: ${sel} (count: ${count})`);
        filtersFound += count;
      }
    }
    console.log(`Total filter elements found: ${filtersFound}`);

    // Click on first tab if found
    const firstTab = page.locator('[role="tab"]').first();
    if (await firstTab.isVisible().catch(() => false)) {
      await firstTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: "screenshots/06-notifications-tab-clicked.png", fullPage: true });
    }

    // Check for empty state
    const bodyText = await page.innerText('body');
    const hasEmptyState = bodyText.toLowerCase().includes('нет уведомлений') ||
                          bodyText.toLowerCase().includes('no notifications') ||
                          bodyText.toLowerCase().includes('empty') ||
                          bodyText.toLowerCase().includes('пусто');
    console.log(`Empty state visible: ${hasEmptyState}`);

    console.log("=== NOTIFICATIONS CONSOLE ERRORS ===");
    consoleErrors.forEach(e => console.log("ERROR:", e));
    console.log("=== NOTIFICATIONS NETWORK ERRORS ===");
    networkErrors.forEach(e => console.log("NET ERROR:", e));
  });
});

test.describe("Part 7: Shop /shop", () => {
  test("Shop page - products display check", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));
    page.on("response", (resp) => { if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`); });

    await page.goto(`${BASE}/shop`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "screenshots/07-shop-initial.png", fullPage: true });

    const pageContent = await page.content();
    console.log("=== SHOP PAGE CONTENT (first 2000 chars) ===");
    console.log(pageContent.substring(0, 2000));

    // Check for product cards
    const productSelectors = [
      '[data-testid*="product"]', '.product-card', '[class*="product"]',
      '[class*="item"]', 'article', '[role="article"]'
    ];

    for (const sel of productSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`Found product elements: ${sel} (count: ${count})`);
      }
    }

    const bodyText = await page.innerText('body');
    console.log(`Shop body text excerpt: ${bodyText.substring(0, 500)}`);

    // Check for price indicators
    const hasPrices = bodyText.includes('₽') || bodyText.includes('$') || bodyText.includes('€') ||
                      bodyText.toLowerCase().includes('price') || bodyText.toLowerCase().includes('цена');
    console.log(`Has price indicators: ${hasPrices}`);

    // Check for error/empty state
    const hasError = bodyText.toLowerCase().includes('error') || bodyText.toLowerCase().includes('ошибка');
    const isEmpty = bodyText.toLowerCase().includes('empty') || bodyText.toLowerCase().includes('no products') ||
                    bodyText.toLowerCase().includes('нет товаров');
    console.log(`Has error: ${hasError}, Is empty: ${isEmpty}`);

    console.log("=== SHOP CONSOLE ERRORS ===");
    consoleErrors.forEach(e => console.log("ERROR:", e));
    console.log("=== SHOP NETWORK ERRORS ===");
    networkErrors.forEach(e => console.log("NET ERROR:", e));
  });
});

test.describe("Part 8: XSS Tests on all forms", () => {
  test("XSS on chat/message input", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));

    // Test on chats page
    await page.goto(`${BASE}/chats`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/08-xss-chats.png", fullPage: true });

    const xssPayload = '<img src=x onerror=alert(1)>';

    // Find any text input
    const input = page.locator('input[type="text"], textarea, input[placeholder]').first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill(xssPayload);
      await page.waitForTimeout(500);

      const imgWithOnerror = await page.evaluate(() => {
        return document.querySelectorAll('img[onerror]').length;
      });
      console.log(`XSS img[onerror] elements in chats DOM: ${imgWithOnerror}`);
      await page.screenshot({ path: "screenshots/08-xss-chats-input.png", fullPage: true });
    }

    // Test on profile edit if accessible
    await page.goto(`${BASE}/edit-profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "screenshots/08-xss-edit-profile.png", fullPage: true });

    const profileInput = page.locator('input[type="text"], textarea').first();
    if (await profileInput.isVisible().catch(() => false)) {
      await profileInput.fill(xssPayload);
      await page.waitForTimeout(500);

      const imgWithOnerrorProfile = await page.evaluate(() => {
        return document.querySelectorAll('img[onerror]').length;
      });
      console.log(`XSS img[onerror] elements in edit-profile DOM: ${imgWithOnerrorProfile}`);
    }

    console.log("=== XSS TEST CONSOLE ERRORS ===");
    consoleErrors.forEach(e => console.log("ERROR:", e));
  });
});
