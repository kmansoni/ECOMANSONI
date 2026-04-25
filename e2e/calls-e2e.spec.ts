/**
 * E2E тест видеозвонков: два browser context, два пользователя,
 * реальное SFU соединение через wss://sfu-ru.mansoni.ru/ws.
 *
 * Каждый запуск создаёт уникальную пару аккаунтов через signup.
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const STORAGE_KEY = `sb-${SUPABASE_URL.match(/\/\/([a-z0-9]+)\./)?.[1] ?? "unknown"}-auth-token`;
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";

const CALL_SETUP_TIMEOUT = 30_000;
const IN_CALL_TIMEOUT = 40_000;
const RELEVANT_CALL_LOG = /CallFSM|fallback_|transport-created|transport-connect|room-bootstrap|remote_stream_updated|connection_promoted_by_remote_tracks|media-bootstrap|media_bootstrap_progress|\[VideoCallContext\] State:/;

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
  await page.locator('[data-call-connected="true"]').first().waitFor({ state: "visible", timeout });
}

async function waitForIncomingCall(page: Page, timeout = CALL_SETUP_TIMEOUT) {
  await page.locator("text=Входящий звонок").first().waitFor({ state: "visible", timeout });
}

async function acceptIncomingCall(page: Page) {
  await page.locator('button[aria-label="Ответить"]').first().click();
}

async function captureCallUiSnapshot(page: Page) {
  return page.evaluate(() => {
    const connectedRoot = document.querySelector('[data-call-connected]');
    const incomingText = Array.from(document.querySelectorAll('span, p, h1, h2, h3, div'))
      .map((node) => node.textContent?.trim() ?? "")
      .find((text) => text.includes("Входящий звонок"));
    const connectingText = Array.from(document.querySelectorAll('span, p, h1, h2, h3, div'))
      .map((node) => node.textContent?.trim() ?? "")
      .find((text) => text.includes("Подключение"));
    const durationText = Array.from(document.querySelectorAll('span'))
      .map((node) => node.textContent?.trim() ?? "")
      .find((text) => /^\d{2}:\d{2}$/.test(text));
    const videos = Array.from(document.querySelectorAll('video')).map((video, index) => {
      const stream = video.srcObject;
      const mediaStream = stream instanceof MediaStream ? stream : null;
      return {
        index,
        readyState: video.readyState,
        paused: video.paused,
        muted: video.muted,
        autoplay: video.autoplay,
        playsInline: video.playsInline,
        width: video.videoWidth,
        height: video.videoHeight,
        trackKinds: mediaStream?.getTracks().map((track) => track.kind) ?? [],
        trackStates: mediaStream?.getTracks().map((track) => `${track.kind}:${track.readyState}:${track.enabled}`) ?? [],
      };
    });
    const audios = Array.from(document.querySelectorAll('audio')).map((audio, index) => ({
      index,
      readyState: audio.readyState,
      paused: audio.paused,
      muted: audio.muted,
      autoplay: audio.autoplay,
      hasSrcObject: audio.srcObject instanceof MediaStream,
      trackStates: audio.srcObject instanceof MediaStream
        ? audio.srcObject.getTracks().map((track) => `${track.kind}:${track.readyState}:${track.enabled}`)
        : [],
    }));

    return {
      url: window.location.href,
      callState: connectedRoot?.getAttribute('data-call-state') ?? null,
      callConnected: connectedRoot?.getAttribute('data-call-connected') ?? null,
      connectionState: connectedRoot?.getAttribute('data-connection-state') ?? null,
      hasIncomingOverlay: Boolean(incomingText),
      hasConnectingLabel: Boolean(connectingText),
      durationText: durationText ?? null,
      videoCount: videos.length,
      audioCount: audios.length,
      videos,
      audios,
      documentVisibility: document.visibilityState,
    };
  });
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

    // 3. Навигация: User A открывает чат через deeplink, User B на /chats слушает входящие.
    await pageA.goto(`/chats?openDmId=${convId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pageB.goto("/chats", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pageA.waitForTimeout(5000);
    await pageB.waitForTimeout(5000);

    const videoCallBtn = pageA.locator('button[aria-label="Видеозвонок"]');
    await videoCallBtn.waitFor({ state: "visible", timeout: 15000 });
    await pageA.waitForTimeout(2000);

    // debug: скриншот после открытия чата
    await pageA.screenshot({ path: "pw-screenshots/call-pageA-chat-opened.png" });
    console.log(`[${label}] URL A: ${pageA.url()}`);

    // 4. Дождаться кнопки видеозвонка в ChatHeader
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
    const pageASnapshot = await captureCallUiSnapshot(pageA).catch(() => null);
    const pageBSnapshot = await captureCallUiSnapshot(pageB).catch(() => null);
    const relevantConsoleA = consoleA.filter((line) => RELEVANT_CALL_LOG.test(line));
    const relevantConsoleB = consoleB.filter((line) => RELEVANT_CALL_LOG.test(line));
    console.log(`[${label}] FAIL snapshot A:`, JSON.stringify(pageASnapshot));
    console.log(`[${label}] FAIL snapshot B:`, JSON.stringify(pageBSnapshot));
    console.log(`[${label}] FAIL console A:`, (relevantConsoleA.length > 0 ? relevantConsoleA : consoleA.slice(-20)).join("\n"));
    console.log(`[${label}] FAIL console B:`, (relevantConsoleB.length > 0 ? relevantConsoleB : consoleB.slice(-20)).join("\n"));
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
