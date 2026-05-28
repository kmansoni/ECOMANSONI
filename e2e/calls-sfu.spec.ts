/**
 * SFU calls E2E — без E2EE, с постоянным браузером.
 *
 * Предварительно запустить браузер:
 *   pwsh scripts/start-test-browser.ps1
 *
 * Запуск:
 *   $env:E2E_SUPABASE_URL='...'; $env:E2E_SUPABASE_KEY='...'; $env:E2E_PASSWORD='...'
 *   npx playwright test -c playwright.sfu.config.ts
 */
import { test, expect, type Page } from "./sfu-fixture";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY ?? "";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:8093";

const CALL_SETUP_TIMEOUT = 35_000;
const IN_CALL_TIMEOUT   = 50_000;

const RELEVANT_LOG = /CallFSM|room-bootstrap|media-bootstrap|transport-created|transport-connect|BOOTSTRAP_OK|MEDIA_ACQUIRED|TRANSPORT_CONNECTED|PROMOTE_IN_CALL|REMOTE_MEDIA_READY|\[VideoCallContext\] State:|video_call_sfu/;

function makeSb() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getOrCreateDm(sb: ReturnType<typeof makeSb>, targetUserId: string): Promise<string> {
  const { data, error } = await sb.rpc("get_or_create_dm", { target_user_id: targetUserId });
  if (error) throw new Error(`get_or_create_dm: ${error.message}`);
  return typeof data === "string" ? data : (Array.isArray(data) ? data[0] : data);
}

async function waitForIncomingCall(page: Page, timeout = CALL_SETUP_TIMEOUT) {
  await page.locator("text=Входящий звонок").first().waitFor({ state: "visible", timeout });
}

async function waitForInCall(page: Page, timeout = IN_CALL_TIMEOUT) {
  await page.locator('[data-call-connected="true"]').first().waitFor({ state: "visible", timeout });
}

async function acceptIncomingCall(page: Page) {
  await page.locator('button[aria-label="Ответить"]').first().click();
}

async function endCall(page: Page) {
  for (const sel of [
    'button[aria-label="Завершить"]',
    "button.bg-destructive",
    "button:has(.lucide-phone-off)",
    "button:has(.lucide-x)",
  ]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click().catch(() => undefined);
      return;
    }
  }
}

async function captureSnapshot(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-call-connected]");
    const videos = Array.from(document.querySelectorAll("video")).map((v) => ({
      readyState: v.readyState,
      paused: v.paused,
      width: v.videoWidth,
      height: v.videoHeight,
      tracks: v.srcObject instanceof MediaStream
        ? v.srcObject.getTracks().map((t) => `${t.kind}:${t.readyState}`)
        : [],
    }));
    return {
      url: window.location.href,
      callState: root?.getAttribute("data-call-state") ?? null,
      callConnected: root?.getAttribute("data-call-connected") ?? null,
      videos,
    };
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe("SFU calls — без E2EE", () => {
  test("звонок A→B: соединение и медиа через SFU", async ({ pageA, pageB, authA, authB }) => {
    const consoleA: string[] = [];
    const consoleB: string[] = [];
    pageA.on("console", (m) => consoleA.push(`[A] ${m.type()}: ${m.text()}`));
    pageB.on("console", (m) => consoleB.push(`[B] ${m.type()}: ${m.text()}`));

    // 1. Создать DM
    const sb = makeSb();
    const convId = await getOrCreateDm(authA.sb, authB.userId);
    console.log(`[SFU] DM: ${convId}`);

    // 2. Навигация
    await pageA.goto(`${BASE_URL}/chats?openDmId=${convId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pageB.goto(`${BASE_URL}/chats`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pageA.waitForTimeout(4000);
    await pageB.waitForTimeout(4000);

    // 3. Начать звонок (deeplink)
    await pageA.goto(`${BASE_URL}/chats?startCall=${authB.userId}&callType=video`, {
      waitUntil: "domcontentloaded", timeout: 30_000,
    });
    await pageA.waitForTimeout(3000);
    console.log("[SFU] Звонок начат, ждём входящего у B...");

    // 4. B принимает
    try {
      await waitForIncomingCall(pageB, CALL_SETUP_TIMEOUT);
    } catch (err) {
      const snapA = await captureSnapshot(pageA).catch(() => null);
      const snapB = await captureSnapshot(pageB).catch(() => null);
      const logs = consoleA.filter((l) => RELEVANT_LOG.test(l)).concat(
        consoleB.filter((l) => RELEVANT_LOG.test(l))
      );
      console.log("[SFU] FAIL: B не увидел входящий. snapA:", JSON.stringify(snapA));
      console.log("[SFU] FAIL: snapB:", JSON.stringify(snapB));
      console.log("[SFU] Logs:", logs.slice(-30).join("\n"));
      throw err;
    }

    console.log("[SFU] B видит входящий, принимает...");
    await acceptIncomingCall(pageB);

    // 5. Оба в звонке
    try {
      await Promise.all([
        waitForInCall(pageA, IN_CALL_TIMEOUT),
        waitForInCall(pageB, IN_CALL_TIMEOUT),
      ]);
    } catch (err) {
      const [snapA, snapB] = await Promise.all([
        captureSnapshot(pageA).catch(() => null),
        captureSnapshot(pageB).catch(() => null),
      ]);
      const { data: diag } = await makeSb()
        .from("video_calls")
        .select("id,status,created_at")
        .or(`and(caller_id.eq.${authA.userId},callee_id.eq.${authB.userId})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const logs = [
        ...consoleA.filter((l) => RELEVANT_LOG.test(l)),
        ...consoleB.filter((l) => RELEVANT_LOG.test(l)),
      ];
      console.log("[SFU] FAIL in_call. snapA:", JSON.stringify(snapA));
      console.log("[SFU] FAIL in_call. snapB:", JSON.stringify(snapB));
      console.log("[SFU] call record:", JSON.stringify(diag));
      console.log("[SFU] Logs (последние 40):\n" + logs.slice(-40).join("\n"));
      throw err;
    }

    console.log("[SFU] Оба в звонке!");

    // 6. Проверить наличие video-элементов
    const videoCountA = await pageA.locator("video").count();
    const videoCountB = await pageB.locator("video").count();
    console.log(`[SFU] Video: A=${videoCountA}, B=${videoCountB}`);
    expect(videoCountA).toBeGreaterThanOrEqual(1);
    expect(videoCountB).toBeGreaterThanOrEqual(1);

    await pageA.waitForTimeout(3000);

    // 7. Завершить
    await endCall(pageA);
    await pageA.waitForTimeout(1500);
    console.log("[SFU] Тест пройден!");
  });
});
