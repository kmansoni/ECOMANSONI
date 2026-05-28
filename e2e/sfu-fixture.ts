/**
 * SFU fixture — persistent browser via Chrome DevTools Protocol.
 *
 * Запускает браузер один раз (через start-test-browser.ps1) и переиспользует
 * его во всех тестах не закрывая между запусками `npx playwright test`.
 *
 * Использование:
 *   import { test } from '@/e2e/sfu-fixture';
 */
import { test as base, chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:8093";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const STORAGE_KEY = `sb-${SUPABASE_URL.match(/\/\/([a-z0-9]+)\./)?.[1] ?? "unknown"}-auth-token`;
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";

// Singleton browser shared across ALL tests in this Node.js process.
let _browser: Browser | null = null;

async function getOrConnectBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  try {
    _browser = await chromium.connectOverCDP(CDP_URL);
    console.log("[SFU fixture] Connected to existing browser via CDP");
  } catch {
    // If no existing browser, launch a new one (happens on first run without start-test-browser.ps1)
    _browser = await chromium.launch({
      headless: false,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--allow-file-access",
        "--no-sandbox",
      ],
    });
    console.log("[SFU fixture] Launched new browser (no CDP server found)");
  }
  // Keep process alive — do NOT close browser on process exit (by design).
  return _browser;
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

function makeSb(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signupUser(sb: SupabaseClient, email: string, meta: Record<string, string>) {
  const { data, error } = await sb.auth.signUp({
    email,
    password: E2E_PASSWORD,
    options: { data: meta },
  });
  if (error || !data.session) throw new Error(`Signup failed for ${email}: ${error?.message ?? "no session"}`);
  return data.session;
}

async function signupAndInjectSession(page: Page, email: string, meta: Record<string, string>) {
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
  await page.goto(BASE_URL, { waitUntil: "commit" });
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: serialized },
  );
  return { userId: session.user.id, accessToken: session.access_token, sb };
}

// ── Custom fixture types ─────────────────────────────────────────────────────

type SfuWorkers = {
  sfuBrowser: Browser;
  pageA: Page;
  pageB: Page;
  authA: { userId: string; accessToken: string; sb: SupabaseClient };
  authB: { userId: string; accessToken: string; sb: SupabaseClient };
};

export const test = base.extend<SfuWorkers>({
  // Override the browser fixture to use persistent CDP browser
  sfuBrowser: async ({}, use) => {
    const browser = await getOrConnectBrowser();
    await use(browser);
    // Intentionally do NOT close — browser stays open for next test run
  },

  pageA: async ({ sfuBrowser }, use) => {
    const ctx = await sfuBrowser.newContext({
      permissions: ["microphone", "camera"],
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  pageB: async ({ sfuBrowser }, use) => {
    const ctx = await sfuBrowser.newContext({
      permissions: ["microphone", "camera"],
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  authA: async ({ pageA }, use) => {
    const ts = Date.now();
    const auth = await signupAndInjectSession(pageA, `sfu-a-${ts}@test.local`, {
      username: `sfu_a_${ts}`,
      display_name: "SFU Caller A",
    });
    await use(auth);
  },

  authB: async ({ pageB }, use) => {
    const ts = Date.now();
    const auth = await signupAndInjectSession(pageB, `sfu-b-${ts}@test.local`, {
      username: `sfu_b_${ts}`,
      display_name: "SFU Callee B",
    });
    await use(auth);
  },
});

export { expect } from "@playwright/test";
export type { Page, Browser };
