import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
const STORAGE_KEY = `sb-${SUPABASE_URL.match(/\/\/([a-z0-9]+)\./)?.[1] ?? "unknown"}-auth-token`;

function makeSb(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signupAndInject(page: Page, email: string, username: string) {
  const sb = makeSb();
  const { data, error } = await sb.auth.signUp({
    email,
    password: E2E_PASSWORD,
    options: { data: { username, display_name: username } },
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

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: serialized },
  );

  return { sb, userId: session.user.id };
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
      signals: [] as Array<{ signal_type: string; sender_id: string }> ,
      hasSfuHints: false,
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
  const endBtn = page.locator('button:has(.lucide-phone-off), button.bg-destructive').first();
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
    await acceptBtn.click();

    // Calls smoke success criteria (legacy + calls-v2 compatible):
    // 1) Invite is created by caller
    // 2) Callee accepts
    // 3) Either signaling evidence exists (legacy SDP or calls-v2 hints)
    //    OR both peers are in active in-call UI state.
    let signalsOk = false;
    for (let i = 0; i < 16; i++) {
      const { signals, hasSfuHints } = await fetchSignals(authA.sb, authA.userId, authB.userId);
      const hasInvite = signals.some((s) => s.signal_type === "call.invite");
      const hasAccept = signals.some((s) => s.signal_type === "call.accept");
      const hasSdpLeg = signals.some((s) => s.signal_type === "offer" || s.signal_type === "answer");
      const inCallUiA = await hasActiveCallUi(pageA);
      const inCallUiB = await hasActiveCallUi(pageB);
      const signalingOk = hasInvite && hasAccept && (hasSdpLeg || hasSfuHints);
      const uiOk = inCallUiA && inCallUiB;

      if (signalingOk || uiOk) {
        signalsOk = true;
        break;
      }
      await pageA.waitForTimeout(1250);
    }

    expect(signalsOk).toBe(true);

    await pageA.waitForTimeout(3000);

    const endBtnA = pageA.locator("button:has(.lucide-phone-off), button.bg-destructive").first();
    if (await endBtnA.isVisible({ timeout: 2000 }).catch(() => false)) {
      await endBtnA.click().catch(() => undefined);
    }
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
