/**
 * Живой мониторинг звонков: 2 пользователя, production SFU,
 * все console.log/error/warn + WebSocket фреймы + сетевые ошибки.
 *
 * Результат: полный лог всего что происходит в обоих браузерах.
 */
import { test, expect, type Page, type ConsoleMessage, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const STORAGE_KEY = `sb-${SUPABASE_URL.match(/\/\/([a-z0-9]+)\./)?.[1] ?? "unknown"}-auth-token`;
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
const BASE_URL = process.env.E2E_BASE_URL ?? "https://mansoni.ru";

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
  let lastError: unknown = null;
  let session: NonNullable<Awaited<ReturnType<typeof sb.auth.signUp>>["data"]["session"]> | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await sb.auth.signUp({
      email,
      password: E2E_PASSWORD,
      options: { data: meta },
    });

    if (!error && data.session) {
      session = data.session;
      break;
    }

    lastError = error?.message ?? "no session";
    if (attempt < 3) {
      await page.waitForTimeout(1200 * attempt);
    }
  }

  if (!session) {
    throw new Error(`Signup failed for ${email}: ${String(lastError ?? "no session")}`);
  }

  const serialized = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: session.user,
  });

  let bootstrapNavOk = false;
  for (let attempt = 1; attempt <= 3 && !bootstrapNavOk; attempt++) {
    try {
      await page.goto(BASE_URL, { waitUntil: "commit", timeout: 30_000 });
      bootstrapNavOk = true;
    } catch {
      await page.waitForTimeout(1200 * attempt);
    }
  }
  if (!bootstrapNavOk) {
    throw new Error(`Bootstrap navigation failed for ${email}`);
  }
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

async function openDmConversation(page: Page, convId: string, peerHints: string[]): Promise<boolean> {
  const openUrls = [
    `${BASE_URL}/chats?openDmId=${convId}`,
    `${BASE_URL}/chats?open=${convId}`,
  ];

  for (const openUrl of openUrls) {
    await page.goto(openUrl, { waitUntil: "commit", timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(2500);

    const callBtn = page.locator('[data-testid="video-call-btn"], button[aria-label="Видеозвонок"], button[aria-label="Video call"]').first();
    if (await callBtn.isVisible({ timeout: 2000 }).catch(() => false)) return true;

    const itemSelectors = [
      `[data-conversation-id="${convId}"]`,
      `a[href*="${convId}"]`,
      ...peerHints.flatMap((hint) => [
        `button:has-text("${hint}")`,
        `text=${hint}`,
      ]),
    ];

    for (const sel of itemSelectors) {
      const candidate = page.locator(sel).first();
      if (await candidate.isVisible({ timeout: 1500 }).catch(() => false)) {
        await candidate.click({ force: true }).catch(() => undefined);
        await page.waitForTimeout(1200);
        if (await callBtn.isVisible({ timeout: 1000 }).catch(() => false)) return true;
      }
    }
  }

  return false;
}

async function startCallFromA(pageA: Page) {
  const callSelectors = [
    '[data-testid="video-call-btn"]',
    'button[aria-label="Видеозвонок"]',
    'button[aria-label="Video call"]',
    'button[aria-label="Групповой видеозвонок"]',
    'button:has(svg.lucide-video)',
  ];

  for (const sel of callSelectors) {
    const btn = pageA.locator(sel).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      return sel;
    }
  }

  throw new Error("Call button not found on caller side");
}

async function hasOutgoingCallUi(page: Page): Promise<boolean> {
  const selectors = [
    "text=Вызов",
    "text=Соединение",
    "text=Звонок",
    "text=Настраиваем аудио и видео",
    "button:has(.lucide-phone-off)",
    "button.bg-destructive",
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) return true;
  }
  return false;
}

async function ensureChatsReady(page: Page, url: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const body = await page.locator("body").innerText().catch(() => "");
    const loading = body.includes("Загрузка…") || body.includes("Загрузка...") || body.includes("Если страница не открывается");
    const hasChats = await page.locator("text=Чаты").first().isVisible({ timeout: 800 }).catch(() => false);
    if (!loading && hasChats) return;

    await page.goto(url, { waitUntil: "commit", timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(1800 * attempt);
  }
}

async function waitForLatestCallRoomHints(
  sb: SupabaseClient,
  callerId: string,
  calleeId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const { data, error } = await sb
      .from("video_calls")
      .select("id,calls_v2_room_id,calls_v2_join_token")
      .eq("caller_id", callerId)
      .eq("callee_id", calleeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.calls_v2_room_id) {
      return true;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 700 * attempt));
  }

  return false;
}

type MediaStats = {
  liveVideoTracksBound: number;
  liveAudioTracksBound: number;
  playingVideos: number;
  callState: string | null;
  connectionState: string | null;
};

async function collectMediaStats(page: Page): Promise<MediaStats> {
  return page.evaluate(() => {
    const mediaEls = Array.from(document.querySelectorAll("video, audio")) as Array<HTMLVideoElement | HTMLAudioElement>;
    let liveVideoTracksBound = 0;
    let liveAudioTracksBound = 0;
    let playingVideos = 0;

    for (const el of mediaEls) {
      const stream = el.srcObject instanceof MediaStream ? el.srcObject : null;
      if (stream) {
        liveVideoTracksBound += stream.getVideoTracks().filter((t) => t.readyState === "live").length;
        liveAudioTracksBound += stream.getAudioTracks().filter((t) => t.readyState === "live").length;
      }
      if (el.tagName.toLowerCase() === "video") {
        const video = el as HTMLVideoElement;
        if (!video.paused && video.readyState >= 2 && video.currentTime > 0) playingVideos += 1;
      }
    }

    const root = document.querySelector("[data-call-state]");
    return {
      liveVideoTracksBound,
      liveAudioTracksBound,
      playingVideos,
      callState: root?.getAttribute("data-call-state") ?? null,
      connectionState: root?.getAttribute("data-connection-state") ?? null,
    };
  });
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

      // ─── 4. Навигация — открываем DM и проверяем доступность call UI ─────
      console.log(`>>> [${ts()}] Навигация: оба → /chats?openDmId=${convId} (мобильный viewport 375×812)`);
      const [dmOpenedA] = await Promise.all([
        openDmConversation(pageA, String(convId), ["Live Caller B", emailB]),
        pageB.goto(`${BASE_URL}/chats?openDmId=${convId}`, { waitUntil: "commit", timeout: 30_000 }).catch(() => undefined),
      ]);
      console.log(`>>> [${ts()}] DM opened on A: ${dmOpenedA}`);

      // Даём SPA загрузиться, auth, WS, Realtime подключиться
      console.log(`>>> [${ts()}] Жду инициализацию SPA обоих (12 сек)...`);
      await pageA.waitForTimeout(12_000);
      await Promise.all([
        ensureChatsReady(pageA, `${BASE_URL}/chats?openDmId=${convId}`),
        ensureChatsReady(pageB, `${BASE_URL}/chats?openDmId=${convId}`),
      ]);
      console.log(`>>> [${ts()}] A URL: ${pageA.url()}`);
      console.log(`>>> [${ts()}] B URL: ${pageB.url()}`);

      // Отладка: что видит каждый пользователь
      const bodyA_init = await pageA.locator("body").innerText().catch(() => "");
      const bodyB_init = await pageB.locator("body").innerText().catch(() => "");
      console.log(`>>> [${ts()}] A body (300):`, bodyA_init.slice(0, 300));
      console.log(`>>> [${ts()}] B body (300):`, bodyB_init.slice(0, 300));

      // ─── 5. Инициируем звонок ────────────────────────────────────────────
      console.log(`>>> [${ts()}] Инициирую звонок у A...`);
      let clickedBy = "";
      try {
        clickedBy = await startCallFromA(pageA);
        console.log(`>>> [${ts()}] Клик по кнопке звонка: ${clickedBy}`);
      } catch {
        console.log(`>>> [${ts()}] Кнопка звонка не найдена, fallback через deeplink startCall`);
        await pageA.goto(`${BASE_URL}/chats?startCall=${authB.userId}&callType=video`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
      }

      // Если UI исходящего не появился, повторяем deeplink-инициацию несколько раз.
      let outgoingOk = await hasOutgoingCallUi(pageA);
      for (let attempt = 1; !outgoingOk && attempt <= 2; attempt++) {
        console.log(`>>> [${ts()}] Исходящий не виден, retry startCall #${attempt}`);
        await pageA.goto(`${BASE_URL}/chats?startCall=${authB.userId}&callType=video`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await pageA.waitForTimeout(2500);
        outgoingOk = await hasOutgoingCallUi(pageA);
      }
      if (!outgoingOk) {
        console.log(`>>> [${ts()}] ⚠ Исходящий UI не виден, продолжаю по входящему сигналу на B`);
      }

      // Ждём после клика
      console.log(`>>> [${ts()}] Жду после клика / попытки звонка (5 сек)...`);
      await pageA.waitForTimeout(5000);

      // ─── 6. User B: ждём входящий (с retry старта) ───────────────────────
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
      for (let inviteAttempt = 1; inviteAttempt <= 3 && !incomingFound; inviteAttempt++) {
        const incomingDeadline = Date.now() + 16_000;
        while (!incomingFound && Date.now() < incomingDeadline) {
          for (const sel of incomingIndicators) {
            const el = pageB.locator(sel).first();
            if (await el.isVisible({ timeout: 1200 }).catch(() => false)) {
              console.log(`>>> [${ts()}] B ВИДИТ ВХОДЯЩИЙ: selector="${sel}"`);
              incomingFound = true;
              break;
            }
          }
          if (!incomingFound) await pageB.waitForTimeout(800);
        }

        if (!incomingFound && inviteAttempt < 3) {
          console.log(`>>> [${ts()}] Входящий не пришёл, перезапускаю invite (attempt ${inviteAttempt + 1})`);
          const callerHangup = pageA.locator("button:has(.lucide-phone-off), button.bg-destructive, button.bg-red-500").first();
          if (await callerHangup.isVisible({ timeout: 1000 }).catch(() => false)) {
            await callerHangup.click().catch(() => undefined);
            await pageA.waitForTimeout(1200);
          }
          await pageA.goto(`${BASE_URL}/chats?startCall=${authB.userId}&callType=video`, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
          await pageA.waitForTimeout(2500);
        }
      }

      if (!incomingFound) {
        console.log(`>>> [${ts()}] Входящий не появился в окне ожидания`);
        throw new Error("Incoming call UI not visible on callee side");
      }

      if (incomingFound) {
        let hintsReady = await waitForLatestCallRoomHints(authA.sb, authA.userId, authB.userId);
        console.log(`>>> [${ts()}] Room hints before accept: ${hintsReady}`);

        if (!hintsReady) {
          console.log(`>>> [${ts()}] Room hints пустые, делаю recovery startCall и повторную проверку`);
          await pageA
            .goto(`${BASE_URL}/chats?startCall=${authB.userId}&callType=video`, {
              waitUntil: "domcontentloaded",
              timeout: 30_000,
            })
            .catch(() => undefined);
          await pageA.waitForTimeout(2800);

          const incomingRetrySel = ["text=Входящий звонок", "text=Incoming call", "[data-testid='incoming-call-modal']"];
          for (const sel of incomingRetrySel) {
            const incomingRetry = pageB.locator(sel).last();
            if (await incomingRetry.isVisible({ timeout: 4000 }).catch(() => false)) {
              break;
            }
          }

          hintsReady = await waitForLatestCallRoomHints(authA.sb, authA.userId, authB.userId);
          console.log(`>>> [${ts()}] Room hints after recovery: ${hintsReady}`);
        }

        // ─── 7. Принимаем ──────────────────────────────────────────────────
        const acceptBtns = [
          "button[aria-label='Ответить']",
          "button[aria-label='Accept']",
          "button:has(.lucide-phone)",
          "button.bg-green-500",
          "[data-testid='accept-call']",
        ];
        let accepted = false;
        for (const sel of acceptBtns) {
          const btn = pageB.locator(sel).last();
          if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log(`>>> [${ts()}] Принимаю звонок: ${sel}`);
            await btn.click();
            accepted = true;
            break;
          }
        }
        if (!accepted) {
          // На мобильном UI кнопка может отрисоваться позже.
          const delayed = pageB.locator("button[aria-label='Ответить'], button[aria-label='Accept']").last();
          await delayed.waitFor({ state: "visible", timeout: 10_000 });
          await delayed.click();
        }

        // ─── 8. Ждём двустороннюю передачу аудио/видео ─────────────────────
        console.log(`>>> [${ts()}] Жду установку двустороннего медиа...`);
        const mediaDeadline = Date.now() + 25_000;
        let statsA: MediaStats | null = null;
        let statsB: MediaStats | null = null;
        while (Date.now() < mediaDeadline) {
          [statsA, statsB] = await Promise.all([collectMediaStats(pageA), collectMediaStats(pageB)]);
          const okA = statsA.liveVideoTracksBound >= 1 && statsA.liveAudioTracksBound >= 1;
          const okB = statsB.liveVideoTracksBound >= 1 && statsB.liveAudioTracksBound >= 1;
          if (okA && okB) break;
          await pageA.waitForTimeout(1000);
        }

        // Production network is flaky: if media didn't bind in first window,
        // retry accept once and give SFU bootstrap extra time.
        const firstOkA = !!statsA && statsA.liveVideoTracksBound >= 1 && statsA.liveAudioTracksBound >= 1;
        const firstOkB = !!statsB && statsB.liveVideoTracksBound >= 1 && statsB.liveAudioTracksBound >= 1;
        if (!firstOkA || !firstOkB) {
          const acceptAgain = pageB.locator("button[aria-label='Ответить'], button[aria-label='Accept']").first();
          if (await acceptAgain.isVisible({ timeout: 1200 }).catch(() => false)) {
            console.log(`>>> [${ts()}] Медиа не поднялось, повторяю accept на B`);
            await acceptAgain.click().catch(() => undefined);
          }

          const extraDeadline = Date.now() + 12_000;
          while (Date.now() < extraDeadline) {
            [statsA, statsB] = await Promise.all([collectMediaStats(pageA), collectMediaStats(pageB)]);
            const okA = statsA.liveVideoTracksBound >= 1 && statsA.liveAudioTracksBound >= 1;
            const okB = statsB.liveVideoTracksBound >= 1 && statsB.liveAudioTracksBound >= 1;
            if (okA && okB) break;
            await pageA.waitForTimeout(1000);
          }
        }

        statsA = statsA ?? await collectMediaStats(pageA);
        statsB = statsB ?? await collectMediaStats(pageB);
        console.log(`>>> [${ts()}] MEDIA A:`, JSON.stringify(statsA));
        console.log(`>>> [${ts()}] MEDIA B:`, JSON.stringify(statsB));

        expect(statsA.liveVideoTracksBound).toBeGreaterThanOrEqual(1);
        expect(statsA.liveAudioTracksBound).toBeGreaterThanOrEqual(1);
        expect(statsB.liveVideoTracksBound).toBeGreaterThanOrEqual(1);
        expect(statsB.liveAudioTracksBound).toBeGreaterThanOrEqual(1);

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
