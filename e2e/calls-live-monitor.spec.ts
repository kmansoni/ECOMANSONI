/**
 * Живой мониторинг звонков: 2 пользователя, production SFU,
 * все console.log/error/warn + WebSocket фреймы + сетевые ошибки.
 *
 * Результат: полный лог всего что происходит в обоих браузерах.
 */
import { test, expect, type Page, type ConsoleMessage, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lfkbgnbjxskspsownvjm.supabase.co";
const SUPABASE_KEY = "sb_publishable_8I_R_P73-7XZ5Rgopqd7yQ_frSWuB5e";
const STORAGE_KEY = "sb-lfkbgnbjxskspsownvjm-auth-token";
const E2E_PASSWORD = "E2eCall!2026";
const BASE_URL = "http://localhost:8080";

function makeSb(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ts() {
  return new Date().toISOString().slice(11, 23);
}

interface MonitorLog {
  time: string;
  who: string;
  type: "console" | "ws-send" | "ws-recv" | "network-error" | "page-error" | "request-fail";
  level?: string;
  text: string;
}

const ALL_LOGS: MonitorLog[] = [];

function log(who: string, type: MonitorLog["type"], text: string, level?: string) {
  const entry: MonitorLog = { time: ts(), who, type, level, text };
  ALL_LOGS.push(entry);
  const prefix = `[${entry.time}][${who}][${type}${level ? ":" + level : ""}]`;
  console.log(`${prefix} ${text}`);
}

async function signupAndInject(
  page: Page,
  email: string,
  meta: Record<string, string>,
): Promise<{ userId: string; accessToken: string; sb: SupabaseClient }> {
  const sb = makeSb();
  const { data, error } = await sb.auth.signUp({
    email,
    password: E2E_PASSWORD,
    options: { data: meta },
  });
  if (error || !data.session) {
    throw new Error(`Signup failed for ${email}: ${error?.message ?? "no session"}`);
  }
  const session = data.session;
  const serialized = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: session.user,
  });

  await page.goto(BASE_URL, { waitUntil: "commit" });
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: serialized },
  );

  return { userId: session.user.id, accessToken: session.access_token, sb };
}

function attachMonitor(page: Page, who: string) {
  // Console
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    // Фильтруем спам — только важное
    if (text.includes("[HMR]") || text.includes("vite") && !text.includes("error")) return;
    log(who, "console", text, msg.type());
  });

  // Page errors (uncaught exceptions)
  page.on("pageerror", (err) => {
    log(who, "page-error", `${err.name}: ${err.message}`);
  });

  // Network errors
  page.on("requestfailed", (req) => {
    log(who, "request-fail", `${req.method()} ${req.url()} → ${req.failure()?.errorText ?? "unknown"}`);
  });

  // WebSocket monitoring через CDP
  const cdp = (page as any)._delegate?._mainFrame?._page?._delegate;
  // Playwright не даёт прямой доступ к WS через CDP,
  // но мы ловим все WS через console — callsWsClient логирует в logger
}

test.use({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--allow-file-access",
      "--disable-web-security",
    ],
  },
});

test.describe("Живой мониторинг звонков (production SFU)", () => {
  test("Полный цикл: signup → DM → call → accept → connected → hangup", async ({ browser }) => {
    test.setTimeout(180_000);

    console.log("\n" + "=".repeat(80));
    console.log("ЖИВОЙ МОНИТОРИНГ ЗВОНКОВ — PRODUCTION SFU");
    console.log("=".repeat(80) + "\n");

    // ─── 1. Создаём 2 контекста (мобильный viewport) ──────────────────────
    const ctxA = await browser.newContext({
      permissions: ["microphone", "camera"],
      ignoreHTTPSErrors: true,
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const ctxB = await browser.newContext({
      permissions: ["microphone", "camera"],
      ignoreHTTPSErrors: true,
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    attachMonitor(pageA, "UserA");
    attachMonitor(pageB, "UserB");

    try {
      // ─── 2. Авторизация ──────────────────────────────────────────────────
      const run = Date.now();
      const emailA = `e2e-live-${run}-a@test.local`;
      const emailB = `e2e-live-${run}-b@test.local`;

      console.log(`\n>>> [${ts()}] Создаю пользователей: ${emailA}, ${emailB}`);
      const authA = await signupAndInject(pageA, emailA, {
        username: `live_a_${run}`,
        display_name: "Live Caller A",
      });
      const authB = await signupAndInject(pageB, emailB, {
        username: `live_b_${run}`,
        display_name: "Live Caller B",
      });
      console.log(`>>> [${ts()}] Auth OK: A=${authA.userId.slice(0, 8)}, B=${authB.userId.slice(0, 8)}`);

      // ─── 3. Создаём DM ───────────────────────────────────────────────────
      const { data: convId, error: dmErr } = await authA.sb.rpc("get_or_create_dm", {
        target_user_id: authB.userId,
      });
      if (dmErr) throw new Error(`DM failed: ${dmErr.message}`);
      console.log(`>>> [${ts()}] DM создан: ${convId}`);

      // ─── 4. Навигация — оба открывают конкретный чат ─────────────────────
      console.log(`>>> [${ts()}] Навигация: оба → /chats?open=${convId} (мобильный viewport 375×812)`);
      await Promise.all([
        pageA.goto(`${BASE_URL}/chats?open=${convId}`, { waitUntil: "domcontentloaded", timeout: 30_000 }),
        pageB.goto(`${BASE_URL}/chats?open=${convId}`, { waitUntil: "domcontentloaded", timeout: 30_000 }),
      ]);

      // Даём SPA загрузиться, auth, WS, Realtime подключиться
      console.log(`>>> [${ts()}] Жду инициализацию SPA обоих (12 сек)...`);
      await pageA.waitForTimeout(12_000);
      console.log(`>>> [${ts()}] A URL: ${pageA.url()}`);
      console.log(`>>> [${ts()}] B URL: ${pageB.url()}`);

      // Отладка: что видит каждый пользователь
      const bodyA_init = await pageA.locator("body").innerText().catch(() => "");
      const bodyB_init = await pageB.locator("body").innerText().catch(() => "");
      console.log(`>>> [${ts()}] A body (300):`, bodyA_init.slice(0, 300));
      console.log(`>>> [${ts()}] B body (300):`, bodyB_init.slice(0, 300));

      // ─── 5. Ищем кнопку звонка в header чата у A ─────────────────────────
      console.log(`>>> [${ts()}] Ищу кнопку звонка у A...`);
      const btnsA = await pageA.locator("button").allInnerTexts().catch(() => [] as string[]);
      console.log(`>>> [${ts()}] A buttons:`, btnsA.slice(0, 20));

      // Кнопка может быть: иконка Phone/Video в header, aria-label, или data-testid
      const callSelectors = [
        'button[aria-label="Видеозвонок"]',
        'button[aria-label="Video call"]',
        'button[aria-label="Аудиозвонок"]',
        'button[aria-label="Audio call"]',
        'button:has(svg.lucide-video)',
        'button:has(svg.lucide-phone)',
        '[data-testid="video-call-btn"]',
        '[data-testid="call-btn"]',
      ];

      let callBtnClicked = false;
      for (const sel of callSelectors) {
        const btn = pageA.locator(sel).first();
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`>>> [${ts()}] НАШЁЛ кнопку звонка: ${sel}`);
          await btn.click();
          callBtnClicked = true;
          break;
        }
      }

      if (!callBtnClicked) {
        // Попробуем fallback — все SVG кнопки в header-area
        console.log(`>>> [${ts()}] Стандартные селекторы не сработали, ищу SVG кнопки в верхней части...`);
        const headerHtml = await pageA.locator("header, [class*=header], [class*=Header], [class*=ChatHeader]").first().innerHTML().catch(() => "no header found");
        console.log(`>>> [${ts()}] HEADER HTML (500):`, headerHtml.slice(0, 500));
        
        // Попробуем любую кнопку с SVG в header
        const svgBtns = pageA.locator("header button, [class*=header] button, [class*=Header] button");
        const svgCount = await svgBtns.count();
        console.log(`>>> [${ts()}] Кнопок в header: ${svgCount}`);
        for (let i = 0; i < svgCount; i++) {
          const b = svgBtns.nth(i);
          const html = await b.innerHTML().catch(() => "");
          console.log(`>>> [${ts()}]   btn[${i}]:`, html.slice(0, 100));
        }
      }

      // Ждём после клика
      console.log(`>>> [${ts()}] Жду после клика / попытки звонка (5 сек)...`);
      await pageA.waitForTimeout(5000);

      // ─── 6. User B: ждём входящий ────────────────────────────────────────
      console.log(`>>> [${ts()}] Проверяю входящий звонок у B...`);

      const incomingIndicators = [
        "text=Входящий звонок",
        "text=Входящий",
        "text=Incoming",
        "text=Ответить",
        "text=Accept",
        "[data-testid='incoming-call']",
        `text=Live Caller A`,
      ];

      let incomingFound = false;
      for (const sel of incomingIndicators) {
        const el = pageB.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`>>> [${ts()}] B ВИДИТ ВХОДЯЩИЙ: selector="${sel}"`);
          incomingFound = true;
          break;
        }
      }

      if (!incomingFound) {
        // Может быть Auto-accept или overlay
        console.log(`>>> [${ts()}] Входящий НЕ обнаружен за 15с. Проверяю что видит B...`);
        const bodyB = await pageB.locator("body").innerText().catch(() => "");
        const allBtnsB = await pageB.locator("button").allInnerTexts();
        console.log(`>>> [${ts()}] Текст B (первые 500):`, bodyB.slice(0, 500));
        console.log(`>>> [${ts()}] КНОПКИ B:`, allBtnsB.slice(0, 15));

        // Подождём ещё
        for (const sel of incomingIndicators) {
          const el = pageB.locator(sel).first();
          if (await el.isVisible({ timeout: 15_000 }).catch(() => false)) {
            console.log(`>>> [${ts()}] B УВИДЕЛ (с задержкой): selector="${sel}"`);
            incomingFound = true;
            break;
          }
        }
      }

      if (incomingFound) {
        // ─── 7. Принимаем ──────────────────────────────────────────────────
        const acceptBtns = [
          "text=Ответить",
          "text=Accept",
          "button:has(.lucide-phone)",
          "button.bg-green-500",
          "[data-testid='accept-call']",
        ];
        for (const sel of acceptBtns) {
          const btn = pageB.locator(sel).first();
          if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log(`>>> [${ts()}] Принимаю звонок: ${sel}`);
            await btn.click();
            break;
          }
        }

        // ─── 8. Ждём соединение ────────────────────────────────────────────
        console.log(`>>> [${ts()}] Жду установку соединения...`);
        await pageA.waitForTimeout(8000);

        // Проверяем видео элементы
        const videosA = await pageA.locator("video").count();
        const videosB = await pageB.locator("video").count();
        console.log(`>>> [${ts()}] VIDEO ЭЛЕМЕНТЫ: A=${videosA}, B=${videosB}`);

        // Держим звонок 5 секунд
        console.log(`>>> [${ts()}] Звонок активен, держу 5 секунд...`);
        await pageA.waitForTimeout(5000);

        // ─── 9. Завершаю ──────────────────────────────────────────────────
        console.log(`>>> [${ts()}] Завершаю звонок (A)...`);
        const endBtns = [
          "button:has(.lucide-phone-off)",
          "button.bg-destructive",
          "button.bg-red-500",
          "text=Завершить",
          "text=End",
        ];
        for (const sel of endBtns) {
          const btn = pageA.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click();
            console.log(`>>> [${ts()}] Звонок завершён через: ${sel}`);
            break;
          }
        }
      } else {
        console.log(`>>> [${ts()}] ⚠️ Звонок НЕ дошёл до B — проверяем ошибки ниже`);
      }

      await pageA.waitForTimeout(3000);

      // ─── ИТОГОВЫЙ ОТЧЁТ ──────────────────────────────────────────────────
      console.log("\n" + "=".repeat(80));
      console.log("ИТОГОВЫЙ ОТЧЁТ");
      console.log("=".repeat(80));

      const errors = ALL_LOGS.filter(
        (l) => l.type === "page-error" || l.type === "request-fail" || l.level === "error",
      );
      const warnings = ALL_LOGS.filter((l) => l.level === "warning" || l.level === "warn");
      const wsLogs = ALL_LOGS.filter((l) => l.text.includes("[calls") || l.text.includes("calls-v2") || l.text.includes("VideoCall") || l.text.includes("E2EE") || l.text.includes("SFU") || l.text.includes("rekey") || l.text.includes("epoch"));

      console.log(`\nВсего логов: ${ALL_LOGS.length}`);
      console.log(`Ошибок: ${errors.length}`);
      console.log(`Предупреждений: ${warnings.length}`);
      console.log(`Логов звонков/WS/E2EE: ${wsLogs.length}`);

      if (errors.length) {
        console.log("\n─── ОШИБКИ ───");
        errors.forEach((e) => console.log(`  [${e.time}][${e.who}] ${e.text}`));
      }

      if (warnings.length) {
        console.log("\n─── ПРЕДУПРЕЖДЕНИЯ ───");
        warnings.forEach((w) => console.log(`  [${w.time}][${w.who}] ${w.text}`));
      }

      if (wsLogs.length) {
        console.log("\n─── ЛОГИ ЗВОНКОВ / WS / E2EE ───");
        wsLogs.forEach((w) => console.log(`  [${w.time}][${w.who}] ${w.text}`));
      }

      console.log("\n" + "=".repeat(80));

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
