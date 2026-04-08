/**
 * E2E тест видеозвонков: два browser context, два пользователя,
 * реальное SFU соединение через wss://sfu-ru.mansoni.ru/ws.
 *
 * Каждый запуск создаёт уникальную пару аккаунтов через signup.
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lfkbgnbjxskspsownvjm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NDI0NTYsImV4cCI6MjA4NzAxODQ1Nn0.WNubMc1s9TA91aT_txY850x2rWJ1ayxiTs7Rq6Do21k";
const STORAGE_KEY = "sb-lfkbgnbjxskspsownvjm-auth-token";
const E2E_PASSWORD = "E2eCall!2026";

const CALL_SETUP_TIMEOUT = 30_000;
const IN_CALL_TIMEOUT = 40_000;

function makeSb(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Создаёт юзера через signUp, возвращает сессию */
async function signupUser(sb: SupabaseClient, email: string, meta: Record<string, string>) {
  const { data, error } = await sb.auth.signUp({
    email,
    password: E2E_PASSWORD,
    options: { data: meta },
  });
  if (error || !data.session) {
    throw new Error(`Signup failed for ${email}: ${error?.message ?? "no session"}`);
  }
  return data.session;
}

/** Авторизация через signup → инъекция сессии в localStorage */
async function signupAndInject(
  page: Page,
  email: string,
  meta: Record<string, string>,
): Promise<{ userId: string; accessToken: string; sb: SupabaseClient }> {
  const sb = makeSb();
  const session = await signupUser(sb, email, meta);

  const serialized = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: session.user,
  });

  await page.goto("/", { waitUntil: "commit" });
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: serialized },
  );

  return { userId: session.user.id, accessToken: session.access_token, sb };
}

/** Создание DM через SDK (Node.js), возвращает id разговора */
async function getOrCreateDm(sb: SupabaseClient, targetUserId: string): Promise<string> {
  const { data, error } = await sb.rpc("get_or_create_dm", { target_user_id: targetUserId });
  if (error) throw new Error(`get_or_create_dm: ${error.message}`);
  return typeof data === "string" ? data : (Array.isArray(data) ? data[0] : data);
}

async function waitForInCall(page: Page, timeout = IN_CALL_TIMEOUT) {
  await page.locator("text=Соединение").first().waitFor({ state: "visible", timeout });
}

async function waitForIncomingCall(page: Page, timeout = CALL_SETUP_TIMEOUT) {
  await page.locator("text=Входящий звонок").first().waitFor({ state: "visible", timeout });
}

async function acceptIncomingCall(page: Page) {
  await page.locator("text=Ответить").first().click();
}

async function endCall(page: Page) {
  const endBtn = page.locator("button.bg-destructive, button.bg-red-500, button:has(.lucide-x)").first();
  if (await endBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await endBtn.click();
    return;
  }
  const phoneOff = page.locator("button:has(.lucide-phone-off)").first();
  if (await phoneOff.isVisible({ timeout: 2000 }).catch(() => false)) {
    await phoneOff.click();
  }
}

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--allow-file-access",
    ],
  },
});

/** Полный цикл одного звонка: auth → DM → call → accept → in_call → end */
async function runSingleCall(browser: any, label: string) {
  const ctxA = await browser.newContext({
    permissions: ["microphone", "camera"],
    ignoreHTTPSErrors: true,
  });
  const ctxB = await browser.newContext({
    permissions: ["microphone", "camera"],
    ignoreHTTPSErrors: true,
  });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const consoleA: string[] = [];
  const consoleB: string[] = [];
  pageA.on("console", (m: ConsoleMessage) => consoleA.push(`[A] ${m.type()}: ${m.text()}`));
  pageB.on("console", (m: ConsoleMessage) => consoleB.push(`[B] ${m.type()}: ${m.text()}`));

  try {
    // 1. Auth — уникальные email для каждого запуска
    const ts = Date.now();
    const emailA = `e2e-call-${ts}-a@test.local`;
    const emailB = `e2e-call-${ts}-b@test.local`;
    const authA = await signupAndInject(pageA, emailA, { username: `caller_a_${ts}`, display_name: "E2E Caller A" });
    const authB = await signupAndInject(pageB, emailB, { username: `caller_b_${ts}`, display_name: "E2E Caller B" });
    console.log(`[${label}] Auth OK: A=${authA.userId.slice(0, 8)}, B=${authB.userId.slice(0, 8)}`);

    // 2. Создать DM через SDK
    const convId = await getOrCreateDm(authA.sb, authB.userId);
    console.log(`[${label}] DM: ${convId}`);

    // 3. Навигация: User A открывает чат, User B на /chats (слушает входящие)
    await pageA.goto(`/chats?openDmId=${convId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pageB.goto("/chats", { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Дать SPA время инициализировать auth + подписки
    await pageA.waitForTimeout(5000);
    await pageB.waitForTimeout(5000);

    // 3.1 Кликнуть на DM в списке если чат не раскрылся автоматически
    const chatItem = pageA.locator(`[data-conversation-id="${convId}"]`).first();
    const chatItemAlt = pageA.locator("text=E2E Caller B").first();
    if (await chatItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatItem.click();
    } else if (await chatItemAlt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatItemAlt.click();
    } else {
      // fallback: кликнуть на email контакта
      const emailItem = pageA.locator(`text=${emailB}`).first();
      await emailItem.waitFor({ state: "visible", timeout: 5000 });
      await emailItem.click();
    }
    await pageA.waitForTimeout(2000);

    // debug: скриншот после открытия чата
    await pageA.screenshot({ path: "pw-screenshots/call-pageA-chat-opened.png" });
    console.log(`[${label}] URL A: ${pageA.url()}`);

    // 4. Дождаться кнопки видеозвонка в ChatHeader
    const videoCallBtn = pageA.locator('button[aria-label="Видеозвонок"]');
    await videoCallBtn.waitFor({ state: "visible", timeout: 15_000 });

    // 5. Начать звонок
    console.log(`[${label}] Начинаю звонок...`);
    await videoCallBtn.click();

    // 5.1 Скриншоты обоих после начала звонка (через 5с)
    await pageA.waitForTimeout(5000);
    await pageA.screenshot({ path: "pw-screenshots/call-pageA-after-call.png" });
    await pageB.screenshot({ path: "pw-screenshots/call-pageB-after-call.png" });

    // 6. User B: дождаться входящего, принять
    console.log(`[${label}] Ожидание входящего у B...`);
    await waitForIncomingCall(pageB, CALL_SETUP_TIMEOUT);
    console.log(`[${label}] B видит звонок, принимает...`);
    await acceptIncomingCall(pageB);

    // 7. Оба в in_call
    console.log(`[${label}] Ожидание in_call...`);
    await Promise.all([
      waitForInCall(pageA, IN_CALL_TIMEOUT),
      waitForInCall(pageB, IN_CALL_TIMEOUT),
    ]);
    console.log(`[${label}] Оба в звонке!`);

    // 8. Проверка video элементов
    const videoCountA = await pageA.locator("video").count();
    const videoCountB = await pageB.locator("video").count();
    console.log(`[${label}] Video: A=${videoCountA}, B=${videoCountB}`);
    expect(videoCountA).toBeGreaterThanOrEqual(1);
    expect(videoCountB).toBeGreaterThanOrEqual(1);

    // 9. Держим 3 секунды
    await pageA.waitForTimeout(3000);

    // 10. Завершить
    console.log(`[${label}] Завершаю...`);
    await endCall(pageA);
    await pageA.waitForTimeout(2000);
    console.log(`[${label}] Тест пройден!`);
  } catch (err) {
    await pageA.screenshot({ path: "pw-screenshots/call-FAIL-pageA.png" }).catch(() => {});
    await pageB.screenshot({ path: "pw-screenshots/call-FAIL-pageB.png" }).catch(() => {});
    console.log(`[${label}] FAIL console A:`, consoleA.slice(-20).join("\n"));
    console.log(`[${label}] FAIL console B:`, consoleB.slice(-20).join("\n"));
    throw err;
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
}

test.describe("Видеозвонки E2E", () => {
  test("Установка соединения между двумя пользователями", async ({ browser }) => {
    test.setTimeout(120_000);
    await runSingleCall(browser, "Call");
  });
});

test.describe("Стабильность звонков (10 повторений)", () => {
  for (let i = 1; i <= 10; i++) {
    test(`Звонок #${i}/10`, async ({ browser }) => {
      test.setTimeout(120_000);
      await runSingleCall(browser, `#${i}`);
    });
  }
});
