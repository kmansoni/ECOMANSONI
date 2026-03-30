/**
 * UI Audit — authenticated tests using DEV guest mode bypass
 * Sets localStorage("dev_guest_mode", "1") before navigating to bypass ProtectedRoute
 */
import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:5173";

// Enable dev guest mode to bypass auth
async function enableGuestMode(page: Page) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("dev_guest_mode", "1");
  });
}

interface ErrorCollector {
  console: string[];
  network: string[];
}

function attachCollectors(page: Page): ErrorCollector {
  const errors: ErrorCollector = { console: [], network: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.console.push(msg.text());
  });
  page.on("pageerror", (err) => {
    errors.console.push(`PAGE ERROR: ${err.message}`);
  });
  page.on("response", (resp) => {
    if (resp.status() >= 400) errors.network.push(`${resp.status()} ${resp.url()}`);
  });
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH PAGE TESTS (no guest mode needed)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Auth Page /auth", () => {
  test("Auth page renders correctly with both Register and Login buttons", async ({ page }) => {
    const errors = attachCollectors(page);
    await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/00-auth-page.png", fullPage: true });

    const bodyText = await page.innerText("body");
    const hasRegister = bodyText.includes("Регистрация");
    const hasLogin = bodyText.includes("Вход");
    console.log(`Auth page - Register button: ${hasRegister}, Login button: ${hasLogin}`);

    // Click Register button
    const registerBtn = page.locator('button:has-text("Регистрация")').first();
    if (await registerBtn.isVisible()) {
      await registerBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: "screenshots/00-auth-register-form.png", fullPage: true });
      const registerText = await page.innerText("body");
      console.log(`Register form text: ${registerText.substring(0, 200)}`);
    }

    // Go back and test Login
    await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    const loginBtn = page.locator('button:has-text("Вход")').first();
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: "screenshots/00-auth-login-form.png", fullPage: true });
      const loginText = await page.innerText("body");
      console.log(`Login form text: ${loginText.substring(0, 200)}`);
    }

    console.log("=== AUTH CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== AUTH NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET ERROR:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Part 1: Settings /settings", () => {
  test("Settings page sections and navigation", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/01-settings-authed.png", fullPage: true });

    const url = page.url();
    console.log(`Current URL after navigation: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`Settings body text (500 chars): ${bodyText.substring(0, 500)}`);

    // Count all visible buttons/links/items
    const buttons = await page.locator("button:visible, a:visible").count();
    console.log(`Visible clickable elements: ${buttons}`);

    // Look for Privacy section
    const privacySel = [
      'text=Приватность', 'text=Privacy', 'text=Конфиденциальность',
      'a[href*="privacy"]', '[data-testid*="privacy"]'
    ];
    let privacyEl = null;
    for (const sel of privacySel) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        privacyEl = el;
        console.log(`Found privacy element: ${sel}`);
        await el.click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: "screenshots/01-settings-privacy-clicked.png", fullPage: true });
        console.log(`After privacy click URL: ${page.url()}`);
        console.log(`After privacy click text: ${(await page.innerText("body")).substring(0, 300)}`);
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }
    console.log(`Privacy element found: ${privacyEl !== null}`);

    // Look for Notifications
    const notifSel = [
      'text=Уведомления', 'text=Notifications', 'a[href*="notif"]'
    ];
    for (const sel of notifSel) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found notifications element: ${sel}`);
        await el.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "screenshots/01-settings-notifications-clicked.png", fullPage: true });
        console.log(`After notifications click URL: ${page.url()}`);
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }

    // Look for Appearance
    const appearanceSel = [
      'text=Внешний вид', 'text=Appearance', 'text=Оформление', 'a[href*="appear"]'
    ];
    for (const sel of appearanceSel) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found appearance element: ${sel}`);
        await el.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "screenshots/01-settings-appearance-clicked.png", fullPage: true });
        console.log(`After appearance click URL: ${page.url()}`);
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }

    // Collect all visible text content for settings structure
    const allText = await page.innerText("body");
    console.log(`FULL SETTINGS TEXT:\n${allText}`);

    console.log("=== SETTINGS CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== SETTINGS NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Part 2: Profile /profile", () => {
  test("Profile page renders - avatar, tabs, edit button", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);
    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/02-profile-authed.png", fullPage: true });

    const url = page.url();
    console.log(`Profile URL: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`Profile body text: ${bodyText.substring(0, 500)}`);

    // Check images
    const imgCount = await page.locator("img:visible").count();
    console.log(`Visible images: ${imgCount}`);

    const brokenImgs = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs
        .filter(img => !img.complete || img.naturalWidth === 0)
        .map(img => img.src || img.getAttribute("src") || "no-src");
    });
    console.log(`Broken images: ${JSON.stringify(brokenImgs)}`);

    // Check tabs
    const tabTexts = ["Посты", "Posts", "Reels", "Tagged", "Отмечено", "Сохранённые", "Saved"];
    for (const tabText of tabTexts) {
      const el = page.locator(`text=${tabText}`).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found tab: ${tabText}`);
        await el.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `screenshots/02-profile-tab-${tabText}.png`, fullPage: true });
      }
    }

    // Edit Profile button
    const editSel = [
      'text=Edit Profile', 'text=Редактировать', 'text=Редактировать профиль',
      'button[aria-label*="edit" i]', 'a[href*="edit"]'
    ];
    for (const sel of editSel) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found edit button: ${sel}`);
        await el.click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: "screenshots/02-profile-edit-clicked.png", fullPage: true });
        console.log(`After edit click URL: ${page.url()}`);
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }

    console.log("=== PROFILE CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== PROFILE NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Part 3: Search /search", () => {
  test("Search - input, results, debounce, XSS protection", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);
    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/03-search-authed.png", fullPage: true });

    const url = page.url();
    console.log(`Search URL: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`Search body text: ${bodyText.substring(0, 500)}`);

    // Find search input - more exhaustive selectors
    const inputSelectors = [
      'input[type="search"]',
      'input[placeholder*="поиск" i]',
      'input[placeholder*="search" i]',
      'input[type="text"]',
      '[role="searchbox"]',
      'input',
      'textarea',
    ];

    let searchInput = null;
    let foundSelector = "";
    for (const sel of inputSelectors) {
      const els = page.locator(sel);
      const count = await els.count();
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const el = els.nth(i);
          if (await el.isVisible().catch(() => false)) {
            searchInput = el;
            foundSelector = sel;
            console.log(`Found input with selector: ${sel} (index ${i})`);
            break;
          }
        }
        if (searchInput) break;
      }
    }

    if (!searchInput) {
      console.log("NO INPUT FOUND ON SEARCH PAGE");
      const allInputs = await page.locator("input, textarea").count();
      console.log(`Total inputs (including hidden): ${allInputs}`);
    } else {
      // Type "test" and wait for debounce
      await searchInput.click();
      await searchInput.fill("test");
      await page.waitForTimeout(2000); // wait for debounce
      await page.screenshot({ path: "screenshots/03-search-results-test.png", fullPage: true });

      const resultsText = await page.innerText("body");
      console.log(`Search results text: ${resultsText.substring(0, 800)}`);

      const resultItems = await page.locator('[role="listitem"], li, [class*="result"], [class*="item"]').count();
      console.log(`Result-like elements count: ${resultItems}`);

      // XSS test 1: script tag
      await searchInput.clear();
      await searchInput.fill("<script>alert('xss')</script>");
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "screenshots/03-search-xss1.png", fullPage: true });

      const xss1 = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll("script"));
        return scripts.some(s => !s.src && s.textContent?.includes("alert"));
      });
      const inputAfterXSS1 = await searchInput.inputValue();
      console.log(`XSS1 (<script>alert) - script in DOM: ${xss1}, input value: ${inputAfterXSS1}`);

      // XSS test 2: img onerror
      await searchInput.clear();
      await searchInput.fill("<img src=x onerror=alert(1)>");
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "screenshots/03-search-xss2.png", fullPage: true });

      const xss2 = await page.evaluate(() => {
        return document.querySelectorAll("img[onerror]").length;
      });
      const inputAfterXSS2 = await searchInput.inputValue();
      console.log(`XSS2 (<img onerror>) - img[onerror] in DOM: ${xss2}, input value: ${inputAfterXSS2}`);
    }

    console.log("=== SEARCH CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== SEARCH NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AI ASSISTANT
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Part 4: AI Assistant /ai-assistant", () => {
  test("AI Assistant - send message and check response", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);
    await page.goto(`${BASE}/ai-assistant`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/04-ai-assistant-authed.png", fullPage: true });

    const url = page.url();
    console.log(`AI Assistant URL: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`AI Assistant body text: ${bodyText.substring(0, 500)}`);

    // Look for textarea or input
    const inputSel = [
      "textarea",
      'input[type="text"]',
      'input[placeholder*="сообщ" i]',
      'input[placeholder*="message" i]',
      'input[placeholder*="спроси" i]',
      '[contenteditable="true"]',
      "input",
    ];

    let msgInput = null;
    for (const sel of inputSel) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        msgInput = el;
        console.log(`Found AI input: ${sel}`);
        break;
      }
    }

    if (msgInput) {
      await msgInput.click();
      await msgInput.fill("Привет, как дела?");
      await page.screenshot({ path: "screenshots/04-ai-typed.png", fullPage: true });

      const sendBtn = page.locator(
        'button[type="submit"], button[aria-label*="send" i], button:has-text("Отправить"), button:has-text("Send")'
      ).first();

      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click();
        console.log("Clicked send button");
      } else {
        await msgInput.press("Enter");
        console.log("Pressed Enter to send");
      }

      // Wait up to 8s for a response
      await page.waitForTimeout(5000);
      await page.screenshot({ path: "screenshots/04-ai-response.png", fullPage: true });

      const responseText = await page.innerText("body");
      console.log(`AI response text (after send): ${responseText.substring(0, 600)}`);

      // Check for error toasts or error messages
      const hasError = responseText.toLowerCase().includes("ошибка") ||
                       responseText.toLowerCase().includes("error");
      console.log(`Has error visible: ${hasError}`);
    } else {
      console.log("NO INPUT FOUND ON AI ASSISTANT PAGE");
    }

    console.log("=== AI ASSISTANT CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== AI ASSISTANT NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PEOPLE NEARBY
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Part 5: People Nearby /people-nearby", () => {
  test("People Nearby - geolocation prompt and privacy check", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);

    // Watch for geolocation permission request
    let geoRequested = false;
    await page.context().route("**/people-nearby*", route => route.continue());
    page.on("dialog", async dialog => {
      console.log(`Dialog appeared: ${dialog.type()} - ${dialog.message()}`);
      await dialog.dismiss();
    });

    await page.goto(`${BASE}/people-nearby`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/05-people-nearby-authed.png", fullPage: true });

    const url = page.url();
    console.log(`People Nearby URL: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`People Nearby body text: ${bodyText.substring(0, 800)}`);

    // Look for enable location button or privacy notice
    const geoElements = [
      'text=Включить геолокацию', 'text=Enable Location', 'text=Share Location',
      'text=геолокац', 'text=Location', 'text=Разрешить', 'text=Allow',
      'button[aria-label*="location" i]', '[data-testid*="location"]',
      'text=Поделиться местоположением', 'text=Найти людей рядом'
    ];

    for (const sel of geoElements) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found geo element: ${sel}`);
        await el.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `screenshots/05-people-nearby-geo-click.png`, fullPage: true });
        break;
      }
    }

    const privacyText = bodyText.toLowerCase();
    const hasPrivacyNotice = privacyText.includes("геолокац") || privacyText.includes("location") ||
                             privacyText.includes("приватн") || privacyText.includes("privacy") ||
                             privacyText.includes("местоположен") || privacyText.includes("рядом");
    console.log(`Has geolocation/privacy text: ${hasPrivacyNotice}`);

    console.log("=== PEOPLE NEARBY CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== PEOPLE NEARBY NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Part 6: Notifications /notifications", () => {
  test("Notifications - filters, tabs, empty state", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);
    await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/06-notifications-authed.png", fullPage: true });

    const url = page.url();
    console.log(`Notifications URL: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`Notifications body text: ${bodyText.substring(0, 800)}`);

    // Count tabs/filters
    const tabs = await page.locator('[role="tab"]').count();
    const buttons = await page.locator("button:visible").count();
    console.log(`Tab elements: ${tabs}, Visible buttons: ${buttons}`);

    // Try clicking tabs
    const tabEls = page.locator('[role="tab"]');
    const tabCount = await tabEls.count();
    for (let i = 0; i < Math.min(tabCount, 5); i++) {
      const tab = tabEls.nth(i);
      const tabText = await tab.innerText().catch(() => "");
      console.log(`Tab ${i}: ${tabText}`);
      await tab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `screenshots/06-notifications-tab-${i}.png`, fullPage: true });
    }

    // Check filter buttons
    const filterSel = [
      'text=Все', 'text=All', 'text=Упоминания', 'text=Mentions',
      'text=Лайки', 'text=Likes', 'text=Комментарии', 'text=Comments', 'text=Подписки', 'text=Follow'
    ];
    for (const sel of filterSel) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Found filter: ${sel}`);
        await el.click();
        await page.waitForTimeout(500);
      }
    }

    await page.screenshot({ path: "screenshots/06-notifications-final.png", fullPage: true });

    console.log("=== NOTIFICATIONS CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== NOTIFICATIONS NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHOP
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Part 7: Shop /shop", () => {
  test("Shop - products display, prices, errors", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);
    await page.goto(`${BASE}/shop`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "screenshots/07-shop-authed.png", fullPage: true });

    const url = page.url();
    console.log(`Shop URL: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`Shop body text: ${bodyText.substring(0, 800)}`);

    // Count product-like elements
    const productCount = await page.locator('[class*="product"], [class*="card"], article, [role="article"]').count();
    console.log(`Product-like elements: ${productCount}`);

    const imgCount = await page.locator("img:visible").count();
    console.log(`Visible images: ${imgCount}`);

    const hasPrices = bodyText.includes("₽") || bodyText.includes("$") || bodyText.includes("€");
    const hasError = bodyText.toLowerCase().includes("ошибка") || bodyText.toLowerCase().includes("error");
    const hasEmpty = bodyText.toLowerCase().includes("пусто") || bodyText.toLowerCase().includes("нет товар") ||
                     bodyText.toLowerCase().includes("empty");
    console.log(`Has prices: ${hasPrices}, Has error: ${hasError}, Has empty state: ${hasEmpty}`);

    // Try clicking a product if any
    const firstProduct = page.locator('[class*="product"], [class*="card"]').first();
    if (await firstProduct.isVisible().catch(() => false)) {
      await firstProduct.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: "screenshots/07-shop-product-detail.png", fullPage: true });
      console.log(`After product click URL: ${page.url()}`);
    }

    console.log("=== SHOP CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== SHOP NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHATS
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Chats /chats", () => {
  test("Chats page renders and XSS check on input", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);
    await page.goto(`${BASE}/chats`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/chats-authed.png", fullPage: true });

    const url = page.url();
    console.log(`Chats URL: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`Chats body text: ${bodyText.substring(0, 500)}`);

    // XSS on search/compose input
    const input = page.locator('input:visible').first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill('<img src=x onerror=alert(1)>');
      await page.waitForTimeout(800);
      const xssCheck = await page.evaluate(() => document.querySelectorAll("img[onerror]").length);
      console.log(`XSS img[onerror] in DOM: ${xssCheck}`);
      await page.screenshot({ path: "screenshots/chats-xss.png", fullPage: true });
    }

    console.log("=== CHATS CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== CHATS NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Home Page /", () => {
  test("Home page renders with feed/content", async ({ page }) => {
    const errors = attachCollectors(page);
    await enableGuestMode(page);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/home-authed.png", fullPage: true });

    const url = page.url();
    console.log(`Home URL: ${url}`);
    const bodyText = await page.innerText("body");
    console.log(`Home body text: ${bodyText.substring(0, 600)}`);

    const navItems = await page.locator("nav a, [role='navigation'] a, [role='tablist'] button").count();
    console.log(`Navigation items: ${navItems}`);

    console.log("=== HOME CONSOLE ERRORS ===");
    errors.console.forEach(e => console.log("ERROR:", e));
    console.log("=== HOME NETWORK ERRORS ===");
    errors.network.forEach(e => console.log("NET:", e));
  });
});
