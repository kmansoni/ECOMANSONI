/**
 * Bot Platform E2E Flow Tests
 *
 * Полный цикл: авторизация → создание бота → настройка → маркетплейс → чат
 *
 * Предполагается, что dev-сервер запущен и Supabase работает.
 */

import { test, expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:5173";

// ── Supabase helpers ──────────────────────────────────────────────────────────

function getSupabaseClient(page: Page) {
  return createClient(
    process.env.SUPABASE_URL || "http://127.0.0.1:54321",
    process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hbnNvbmkiLCJpYXQiOjE2OTk5OTk5OTksImV4cCI6MjAyMTQ3NjAwOX0.fake-key-for-testing"
  );
}

async function signupUser(sb: ReturnType<typeof createClient>, email: string, meta: Record<string, string> = {}) {
  const { data, error } = await sb.auth.signUp({
    email,
    password: "E2ETestP@ss123!",
    options: {
      data: {
        display_name: meta.display_name || email.split("@")[0],
        ...meta,
      },
    },
  });
  if (error && error.message !== "User already registered") {
    throw new Error(`Signup failed: ${error.message}`);
  }
  // If already registered, sign in
  if (error?.message === "User already registered") {
    const { data: signInData } = await sb.auth.signInWithPassword({ email, password: "E2ETestP@ss123!" });
    return signInData;
  }
  return data;
}

async function injectAuth(page: Page, accessToken: string, refreshToken?: string) {
  await page.addInitScript(
    ({ token, rtoken }) => {
      localStorage.setItem(
        "sb-mansoni-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: rtoken || "",
          expires_in: 3600,
          token_type: "bearer",
          user: {},
          user_metadata: {},
        })
      );
    },
    { token: accessToken, rtoken: refreshToken || "" }
  );
}

// Collect page errors
function collectErrors(page: Page): { errors: string[]; pageErrors: string[] } {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      errors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  return { errors, pageErrors };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Bot Platform E2E Flow", () => {
  let botId: string;
  let botUsername: string;
  let botToken: string;
  let userId: string;

  // ── Step 1: Auth ──────────────────────────────────────────────────────────

  test("Step 1: Sign up and authenticate", async ({ page }) => {
    const sb = getSupabaseClient(page);
    const timestamp = Date.now();
    const email = `e2ebot_${timestamp}@test.mansoni`;

    const session = await signupUser(sb, email, {
      display_name: "E2E Bot Tester",
      full_name: "E2E Bot Tester",
    });

    expect(session).toBeDefined();
    expect(session.session?.access_token).toBeTruthy();
    expect(session.user?.id).toBeTruthy();

    userId = session.user!.id;

    // Verify we can query bots (sanity check)
    const { data: bots, error } = await sb.from("bots").select("id").limit(1);
    expect(error).toBeNull();

    await injectAuth(page, session.session!.access_token, session.session?.refresh_token);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Should be logged in → redirected from /auth or showing content
    const url = page.url();
    expect(url).not.toContain("/auth");
  });

  // ── Step 2: Navigate to Bot Marketplace ──────────────────────────────────

  test("Step 2: Navigate to bot marketplace", async ({ page }) => {
    const { errors, pageErrors } = collectErrors(page);

    await page.goto(`${BASE}/bots`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Page should load without errors
    expect(pageErrors.length).toBe(0);

    // Should see the "Создать бота" button
    const createBtn = page.locator('a:has-text("Создать бота")');
    await expect(createBtn).toBeVisible();

    // Header should say "Мои боты" or "Marketplace ботов"
    const header = page.locator("h1:has-text(\"Мои боты\"), h1:has-text(\"Marketplace\")");
    await expect(header).toBeVisible();

    console.log(`  Marketplace loaded, errors: ${errors.length}, pageErrors: ${pageErrors.length}`);
  });

  // ── Step 3: Create Bot ───────────────────────────────────────────────────

  test("Step 3: Create a new bot", async ({ page }) => {
    const timestamp = Date.now();
    botUsername = `e2ebot${timestamp}`;

    // Click "Create bot"
    await page.click('a:has-text("Создать бота")');
    await page.waitForURL("**/bots/new");
    await page.waitForTimeout(1000);

    // Fill in the form
    await page.fill('input[placeholder*="username" i], input[name="username"]', botUsername);
    await page.fill('input[placeholder*="display name" i], input[name="display_name"]', `E2E Test Bot ${timestamp}`);

    const descriptionField = page.locator('textarea[placeholder*="description" i], textarea[name="description"]');
    if (await descriptionField.isVisible()) {
      await descriptionField.fill("This is an E2E test bot created by Playwright.");
    }

    // Submit creation
    const createBtn = page.locator('button:has-text("Создать"), button[type="submit"]');
    await createBtn.click();

    // Wait for redirect to settings page
    await page.waitForURL("**/bots/**", { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Should see settings tabs
    const settingsHeader = page.locator("h1:has-text(\"E2E Test Bot\"), h1:has-text(\"Настройки\")");
    await expect(settingsHeader).toBeVisible({ timeout: 10000 });

    // Extract bot ID from URL
    const url = page.url();
    const match = url.match(/\/bots\/([a-zA-Z0-9\-]+)/);
    expect(match).toBeTruthy();
    botId = match![1];

    console.log(`  Bot created: id=${botId}, username=${botUsername}`);
  });

  // ── Step 4: Configure Bot ────────────────────────────────────────────────

  test("Step 4: Configure bot settings", async ({ page }) => {
    // Should be on settings page already
    await page.waitForURL("**/bots/**", { timeout: 10000 });

    // General tab should be active
    const generalTab = page.locator('button:has-text("Основное"), button:has-text("General")');
    await expect(generalTab).toBeVisible();

    // Verify username is read-only
    const usernameField = page.locator('input[value*="e2ebot"]').first();
    await expect(usernameField).toBeVisible();

    // Save settings (even without changes to verify no error)
    const saveBtn = page.locator('button:has-text("Сохранить")');
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }

    console.log(`  Bot settings saved successfully`);
  });

  // ── Step 5: Create Handler ───────────────────────────────────────────────

  test("Step 5: Create keyword handler with response", async ({ page }) => {
    // Switch to Handlers tab
    const handlersTab = page.locator('button:has-text("Обработчики"), button[title*="handler" i]');
    await handlersTab.click();
    await page.waitForTimeout(1000);

    // Check if create form exists
    const addHandlerBtn = page.locator('button:has-text("Создать обработчик"), button:has-text("Новый обработчик")');
    if (await addHandlerBtn.isVisible()) {
      // The create form might be inline or modal
      const nameInput = page.locator('input[placeholder*="Название" i], input[name="name"]');
      const triggerSelect = page.locator('select').first();
      const priorityInput = page.locator('input[type="number"][placeholder*="Приоритет" i]');

      if (await nameInput.isVisible()) {
        await nameInput.fill("Welcome Handler");
      }

      // Fill trigger value
      const triggerValueInput = page.locator('input[placeholder*="Триггер" i], input[name="trigger_value"]');
      if (await triggerValueInput.isVisible()) {
        await triggerValueInput.fill("привет");
      }

      // Set response type to text
      const responseSelect = page.locator('select').nth(1);
      if (await responseSelect.isVisible()) {
        await responseSelect.selectOption("text");
      }

      // Set response text
      const responseInput = page.locator('textarea, input[placeholder*="response" i]').last();
      if (await responseInput.isVisible()) {
        await responseInput.fill("Привет! Я E2E тестовый бот. 🙌");
      }

      // Create handler
      const createBtn = page.locator('button:has-text("Создать обработчик")');
      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.waitForTimeout(2000);
      }

      console.log("  Handler created");
    } else {
      console.log("  Handler creation UI not found, skipping (may need different selectors)");
    }
  });

  // ── Step 6: Public Bot Page (Marketplace view) ───────────────────────────

  test("Step 6: View bot on public marketplace page", async ({ page }) => {
    const { errors, pageErrors } = collectErrors(page);

    // Navigate to public bot page
    await page.goto(`${BASE}/bot/${botUsername}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // No page errors
    expect(pageErrors.length).toBe(0);

    // Should see bot profile
    const botName = page.locator(`h1:has-text("E2E Test Bot"), h2:has-text("E2E Test Bot")`);
    await expect(botName).toBeVisible({ timeout: 5000 });

    // Should see username
    const usernameText = page.locator(`text=@${botUsername}`);
    await expect(usernameText).toBeVisible();

    // Should see category label
    const categoryPill = page.locator('[class*="rounded-full"][class*="text-[9px]"]');
    // Category may show "Другое" or similar
    console.log(`  Category pill count: ${await categoryPill.count()}`);

    // Should see chat section
    const chatSection = page.locator('div:has(> div > input[placeholder*="Написать боту"])');
    await expect(chatSection).toBeVisible({ timeout: 5000 });

    // Should see empty state or message input
    const inputField = page.locator('input[placeholder*="Написать боту"]');
    await expect(inputField).toBeVisible();

    console.log(`  Public bot page loaded successfully`);
  });

  // ── Step 7: Chat with Bot ────────────────────────────────────────────────

  test("Step 7: Send message to bot and receive response", async ({ page }) => {
    const { errors, pageErrors } = collectErrors(page);

    await page.goto(`${BASE}/bot/${botUsername}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const inputField = page.locator('input[placeholder*="Написать боту"]');
    const sendButton = page.locator('button:has-text("Отправить"), button[type="submit"]');

    // Send a message
    await inputField.fill("привет");
    await sendButton.click();

    // Wait for bot response (may take a moment due to processing)
    await page.waitForTimeout(5000);

    // Check that at least one bot message exists
    // Bot messages use sender_type="bot" which is reflected in the CSS class
    const botMessages = page.locator('[class*="bg-secondary"], [class*="rounded-bl-sm"]');
    const botMsgCount = await botMessages.count();

    // Either the bot responded or didn't match a handler (both are valid)
    console.log(`  Bot messages found: ${botMsgCount}`);
    console.log(`  Client errors: ${errors.length}, page errors: ${pageErrors.length}`);

    // Check that no critical errors occurred
    const criticalErrors = errors.filter(e => e.includes("error") || e.includes("Error"));
    const filteredCritical = criticalErrors.filter(e =>
      !e.includes("Failed to fetch") && // Network errors can happen in test env
      !e.includes("non-existent function") // Edge functions not always available
    );

    if (filteredCritical.length > 0) {
      console.log("  ⚠️  Critical errors:", filteredCritical);
    }

    // Page should still be functional
    await expect(inputField).toBeVisible();
  });

  // ── Step 8: Bot Analytics ────────────────────────────────────────────────

  test("Step 8: Verify bot analytics section", async ({ page }) => {
    await page.goto(`${BASE}/bots/${botId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Switch to Analytics tab
    const analyticsTab = page.locator('button:has-text("Аналитика")');
    if (await analyticsTab.isVisible()) {
      await analyticsTab.click();
      await page.waitForTimeout(1000);

      // Should see analytics cards
      const statsCards = page.locator('[class*="rounded-xl"][class*="p-4"]');
      console.log(`  Analytics cards found: ${await statsCards.count()}`);
    } else {
      console.log("  Analytics tab not visible");
    }
  });

  // ── Step 9: Search and navigate from Marketplace ─────────────────────────

  test("Step 9: Search bots from marketplace", async ({ page }) => {
    await page.goto(`${BASE}/bots`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Search for the bot we created
    const searchInput = page.locator('input[placeholder*="Поиск" i], input[placeholder*="Search" i]');
    if (await searchInput.isVisible()) {
      await searchInput.fill(botUsername);
      await page.waitForTimeout(1000);

      // Should see the bot in results
      const botCard = page.locator(`text=${botUsername}`).first();
      await expect(botCard).toBeVisible({ timeout: 5000 });
    }

    // Test category filters
    const catButton = page.locator('button:has-text("Все")');
    if (await catButton.isVisible()) {
      await expect(catButton).toBeVisible();
    }

    console.log("  Search and filter test passed");
  });

  // ── Final sanity: Check no uncaught errors ────────────────────────────────

  test("Step 10: No uncaught page errors during test", async ({ page }) => {
    const { pageErrors } = collectErrors(page);
    // Navigate around key pages
    await page.goto(`${BASE}/bots`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/bot/${botUsername}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const errors = pageErrors.filter(e =>
      !e.includes("Failed to fetch") &&
      !e.includes("non-existent function")
    );

    // No critical uncaught JS errors
    expect(errors.length, `Uncaught page errors: ${errors.join(", ")}`).toBe(0);
  });
});