import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";

function makeSb(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signupAndInject(page: Page, email: string, username: string) {
  const sb = makeSb();
  const { data: signupData, error: signupErr } = await sb.auth.signUp({
    email,
    password: E2E_PASSWORD,
    options: { data: { username, display_name: username } },
  });

  if (signupErr || !signupData.session) {
    throw new Error(`Signup failed for ${email}: ${signupErr?.message ?? "no session"}`);
  }
  const userId = signupData.session.user.id;
  const { access_token, refresh_token } = signupData.session;

  // E2E auth hook: pass tokens via ?__e2e_session= and let useAuth call
  // supabase.auth.setSession(). This avoids storage-injection races and
  // works for both pages reliably.
  const sessionParam = Buffer.from(
    JSON.stringify({ access_token, refresh_token }),
    "utf8",
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  page.on("console", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[${email.split("@")[0]}|${msg.type()}] ${msg.text().slice(0, 240)}`);
  });
  page.on("pageerror", (err) => {
    // eslint-disable-next-line no-console
    console.log(`[${email.split("@")[0]}|pageerror] ${err.message.slice(0, 240)}`);
  });

  await page.goto(`/?__e2e_session=${sessionParam}`, { waitUntil: "domcontentloaded" });

  // Wait for the SPA to leave /auth (i.e. setSession succeeded).
  await page
    .waitForFunction(() => !window.location.pathname.startsWith("/auth"), null, {
      timeout: 30_000,
    })
    .catch(() => undefined);
  const post = await page.evaluate(() => window.location.href);
  // eslint-disable-next-line no-console
  console.log(`[E2E-AUTH-POST] ${email} ${post}`);

  return { sb, userId };
}

async function getOrCreateDm(sb: SupabaseClient, targetUserId: string): Promise<string> {
  const { data, error } = await sb.rpc("get_or_create_dm", { target_user_id: targetUserId });
  if (error) throw new Error(`get_or_create_dm failed: ${error.message}`);
  return typeof data === "string" ? data : String((Array.isArray(data) ? data[0] : data) ?? "");
}

async function fetchSignals(sb: SupabaseClient, a: string, b: string) {
  const { data: latestCall } = await sb
    .from("video_calls")
    .select("id,created_at,status,calls_v2_room_id,calls_v2_join_token")
    .or(`and(caller_id.eq.${a},callee_id.eq.${b}),and(caller_id.eq.${b},callee_id.eq.${a})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestCall?.id) {
    return {
      signals: [] as Array<{ signal_type: string; sender_id: string }>,
      hasSfuHints: false,
      hasCallRow: false,
    };
  }

  const { data: signals } = await sb
    .from("video_call_signals")
    .select("signal_type,sender_id,created_at")
    .eq("call_id", latestCall.id)
    .order("created_at", { ascending: true })
    .limit(250);

  const hasSfuHints = Boolean(
    (latestCall as { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null }).calls_v2_room_id ||
    (latestCall as { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null }).calls_v2_join_token
  );

  return {
    signals: (signals ?? []) as Array<{ signal_type: string; sender_id: string }>,
    hasSfuHints,
    hasCallRow: true,
  };
}

async function openDmAndFindCallButton(page: Page, convId: string, peerHints: string[]): Promise<boolean> {
  const openUrls = [`/chats?openDmId=${convId}`, `/chats?open=${convId}`];

  for (const openUrl of openUrls) {
    await page.goto(openUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);

    const callBtn = page
      .locator('[data-testid="video-call-btn"], button[aria-label="Видеозвонок"], button[aria-label="Video call"], button:has(.lucide-video)')
      .first();
    if (await callBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await callBtn.click();
      return true;
    }

    const itemSelectors = [
      `[data-conversation-id="${convId}"]`,
      `a[href*="${convId}"]`,
      ...peerHints.flatMap((hint) => [`button:has-text("${hint}")`, `text=${hint}`]),
    ];

    for (const sel of itemSelectors) {
      const candidate = page.locator(sel).first();
      if (await candidate.isVisible({ timeout: 900 }).catch(() => false)) {
        await candidate.click({ force: true }).catch(() => undefined);
        await page.waitForTimeout(700);
        if (await callBtn.isVisible({ timeout: 900 }).catch(() => false)) {
          await callBtn.click();
          return true;
        }
      }
    }
  }

  return false;
}

async function hasActiveCallUi(page: Page): Promise<boolean> {
  // calls-v2: the call screen root has data-call-state="in_call"
  const callStateEl = page.locator('[data-call-state="in_call"]').first();
  if (await callStateEl.isVisible({ timeout: 500 }).catch(() => false)) return true;
  // legacy fallback: hang-up button
  const endBtn = page.locator('button:has(.lucide-phone-off), button.bg-destructive, [aria-label="Завершить"], [aria-label="End call"]').first();
  return endBtn.isVisible({ timeout: 500 }).catch(() => false);
}

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test("Simple call smoke (legacy/TURN path, no E2EE/SFU requirement)", async ({ browser }) => {
  test.setTimeout(180_000);

  const ctxA = await browser.newContext({ permissions: ["microphone", "camera"], ignoreHTTPSErrors: true });
  const ctxB = await browser.newContext({ permissions: ["microphone", "camera"], ignoreHTTPSErrors: true });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    const run = Date.now();
    const emailA = `e2e-simple-${run}-a@test.local`;
    const emailB = `e2e-simple-${run}-b@test.local`;

    const authA = await signupAndInject(pageA, emailA, `simple_a_${run}`);
    const authB = await signupAndInject(pageB, emailB, `simple_b_${run}`);

    const convId = await getOrCreateDm(authA.sb, authB.userId);

    await pageA.goto(`/chats?openDmId=${convId}`, { waitUntil: "domcontentloaded" });
    await pageB.goto("/chats", { waitUntil: "domcontentloaded" });

    const started = await openDmAndFindCallButton(pageA, convId, [emailB, `simple_b_${run}`]);
    if (!started) {
      await pageA.goto(`/chats?startCall=${authB.userId}&callType=video`, { waitUntil: "domcontentloaded" });
    }

    const incomingRu = pageB.locator("text=Входящий звонок").first();
    const incomingEn = pageB.locator("text=Incoming call").first();
    const incoming = incomingRu.or(incomingEn).first();
    await incoming.waitFor({ state: "visible", timeout: 40_000 });

    const acceptBtn = pageB.locator('button[aria-label="Ответить"], button[aria-label="Answer"]').first();
    await acceptBtn.waitFor({ state: "visible", timeout: 10_000 });
    await acceptBtn.click();

    // Calls smoke success criteria (legacy + calls-v2 compatible):
    // 1) Invite is created by caller
    // 2) Callee accepts
    // 3) Either signaling evidence exists (legacy SDP or calls-v2 hints)
    //    OR both peers are in active in-call UI state.
    let signalsOk = false;
    for (let i = 0; i < 16; i++) {
      const { signals, hasSfuHints, hasCallRow } = await fetchSignals(authA.sb, authA.userId, authB.userId);
      const hasInvite = signals.some((s) => s.signal_type === "call.invite");
      const hasAccept = signals.some((s) => s.signal_type === "call.accept");
      const hasSdpLeg = signals.some((s) => s.signal_type === "offer" || s.signal_type === "answer");
      const inCallUiA = await hasActiveCallUi(pageA);
      const inCallUiB = await hasActiveCallUi(pageB);
      // Legacy path: signals in DB
      const signalingOk = hasInvite && hasAccept && (hasSdpLeg || hasSfuHints);
      // Both peers in active call UI
      const uiOk = inCallUiA && inCallUiB;
      // calls-v2 WS path: signals go over WebSocket (not stored to DB).
      // Success = call row was created (caller invited) + callee accepted via UI + either peer shows call UI
      const callsV2Ok = hasCallRow && (inCallUiA || inCallUiB || hasSfuHints);

      if (signalingOk || uiOk || callsV2Ok) {
        signalsOk = true;
        break;
      }
      await pageA.waitForTimeout(1250);
    }

    expect(signalsOk).toBe(true);

    // ─── Media verification: ensure both peers actually exchange tracks ────────
    // Give SFU bootstrap + DTLS + first frames a window to settle.
    await pageA.waitForTimeout(8000);

    type MediaProbe = {
      videos: Array<{ id: string; w: number; h: number; ready: number; audio: number; video: number; live: number }>;
      pcs: number;
      hint: string;
    };

    const probeMedia = async (page: Page): Promise<MediaProbe> => {
      return await page.evaluate(() => {
        const result: MediaProbe = { videos: [], pcs: 0, hint: "" };
        const els = Array.from(document.querySelectorAll("video"));
        for (const v of els) {
          const stream = (v as HTMLVideoElement).srcObject as MediaStream | null;
          let audio = 0, video = 0, live = 0;
          if (stream && typeof stream.getTracks === "function") {
            for (const t of stream.getTracks()) {
              if (t.kind === "audio") audio++;
              if (t.kind === "video") video++;
              if (t.readyState === "live") live++;
            }
          }
          result.videos.push({
            id: (v as HTMLVideoElement).getAttribute("data-testid") ?? (v as HTMLVideoElement).className.slice(0, 40),
            w: (v as HTMLVideoElement).videoWidth,
            h: (v as HTMLVideoElement).videoHeight,
            ready: (v as HTMLVideoElement).readyState,
            audio, video, live,
          });
        }
        return result;
      });
    };

    let mediaOkA = false, mediaOkB = false;
    let probeA: MediaProbe = { videos: [], pcs: 0, hint: "" };
    let probeB: MediaProbe = { videos: [], pcs: 0, hint: "" };
    for (let i = 0; i < 12; i++) {
      probeA = await probeMedia(pageA);
      probeB = await probeMedia(pageB);
      // Success criterion: at least one <video> element on each page has a live video track
      // AND playing video (videoWidth > 0).
      mediaOkA = probeA.videos.some((v) => v.video > 0 && v.live > 0 && v.w > 0);
      mediaOkB = probeB.videos.some((v) => v.video > 0 && v.live > 0 && v.w > 0);
      if (mediaOkA && mediaOkB) break;
      await pageA.waitForTimeout(2000);
    }

    console.log("[smoke] mediaProbe A:", JSON.stringify(probeA));
    console.log("[smoke] mediaProbe B:", JSON.stringify(probeB));
    expect(mediaOkA, "pageA must have live video track in <video>").toBe(true);
    expect(mediaOkB, "pageB must have live video track in <video> (remote stream)").toBe(true);

    const endBtnA = pageA.locator("button:has(.lucide-phone-off), button.bg-destructive").first();
    if (await endBtnA.isVisible({ timeout: 2000 }).catch(() => false)) {
      await endBtnA.click().catch(() => undefined);
    }
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
