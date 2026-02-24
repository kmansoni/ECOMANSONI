/**
 * Phase 1 EPIC L: Rate Limit Smoke Test (Edge Functions)
 *
 * Flow:
 * 1) Sign in test user
 * 2) Issue delegation token (scope: media:upload)
 * 3) Call media-upload-authorize repeatedly until we see 429
 *
 * Env:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY
 * - TEST_USER_EMAIL (optional)
 * - TEST_USER_PASSWORD (optional)
 */

import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

loadDotEnvIfPresent();

const SUPABASE_URL = mustEnv("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = mustEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

const TEST_EMAIL = process.env.TEST_USER_EMAIL || "test-delegations@example.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || "test-password-123";

const TEST_SERVICE_ID = "test-rate-limit-smoke";

function getOptionalServiceRoleKey() {
  return process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function ensureTestUserExists() {
  const serviceKey = getOptionalServiceRoleKey();
  if (!serviceKey) return false;

  const adminClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Rate Limit Smoke" },
  });

  if (error) {
    // Often: user already exists
    return false;
  }

  if (data?.user?.id) {
    console.log("Created test user via Admin API:", data.user.id);
  }
  return true;
}

async function tryCreateEphemeralUserViaSignup(supabase) {
  // Only do this when the caller did NOT provide explicit credentials.
  if (process.env.TEST_USER_EMAIL) return null;

  const email = `rl-smoke+${Date.now()}@example.com`;
  const password = `RL-smoke-${Date.now()}-Passw0rd!`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: "Rate Limit Smoke" } },
  });

  if (error) {
    console.log("signUp failed:", error.message);
    return null;
  }

  // Some projects return a session immediately; some require email confirm.
  if (data?.session?.access_token) {
    return { email, password, accessToken: data.session.access_token };
  }

  // Try to sign in right away (if email confirm is disabled).
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data?.session?.access_token) {
    console.log("signIn after signUp failed:", signIn.error?.message || "no session");
    return null;
  }

  return { email, password, accessToken: signIn.data.session.access_token };
}

async function issueDelegationToken({ supabase, accessToken }) {
  const url = `${SUPABASE_URL}/functions/v1/issue-delegation-token`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      service_id: TEST_SERVICE_ID,
      scopes: ["media:upload"],
      expires_minutes: 30,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`issue-delegation-token failed (${res.status}): ${text}`);

  const json = JSON.parse(text);
  if (json?.ok !== true || !json?.token) throw new Error(`Unexpected issue-delegation-token response: ${text}`);
  return json.token;
}

async function callMediaUploadAuthorize(delegationJwt) {
  const url = `${SUPABASE_URL}/functions/v1/media-upload-authorize`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${delegationJwt}`,
    },
    body: JSON.stringify({}),
  });

  const bodyText = await res.text();
  return {
    status: res.status,
    retryAfter: res.headers.get("retry-after"),
    bodyText,
  };
}

async function main() {
  console.log("\n=== Phase 1: Rate Limit Smoke Test ===\n");
  console.log("Supabase:", SUPABASE_URL);
  console.log("Test user:", TEST_EMAIL);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error || !data?.session?.access_token) {
    console.log("Sign-in failed:", error?.message || "no session");
    const created = await ensureTestUserExists();
    if (created) {
      ({ data, error } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }));
    }

    if (error || !data?.session?.access_token) {
      const ephemeral = await tryCreateEphemeralUserViaSignup(supabase);
      if (ephemeral?.accessToken) {
        console.log("Using ephemeral user:", ephemeral.email);
        data = { session: { access_token: ephemeral.accessToken } };
      }
    }

    if (!data?.session?.access_token) {
      const hint = "Set TEST_USER_EMAIL/TEST_USER_PASSWORD to an existing user, or set SUPABASE_SERVICE_ROLE_KEY to auto-create. If signup requires email confirmation, the ephemeral user fallback will not work.";
      throw new Error(`Sign-in failed: ${error?.message || "no session"}. ${hint}`);
    }
  }

  const delegationJwt = await issueDelegationToken({
    supabase,
    accessToken: data.session.access_token,
  });

  console.log("Delegation token issued (first 32):", delegationJwt.slice(0, 32) + "...");

  const attempts = 20;
  const delayMs = 150;

  const statuses = [];

  for (let i = 1; i <= attempts; i++) {
    const r = await callMediaUploadAuthorize(delegationJwt);
    statuses.push(r.status);

    console.log(`#${i} status=${r.status}${r.retryAfter ? ` retry-after=${r.retryAfter}` : ""}`);

    if (r.status === 429) {
      const parsed = (() => {
        try {
          return JSON.parse(r.bodyText);
        } catch {
          return null;
        }
      })();

      if (!r.retryAfter) {
        throw new Error(`Got 429 but missing Retry-After header. Body: ${r.bodyText}`);
      }

      if (!parsed || parsed?.action !== "media_upload") {
        throw new Error(`Got 429 but response body is unexpected: ${r.bodyText}`);
      }

      console.log("\n✅ Rate limiting working (429 observed)");
      return;
    }

    await sleep(delayMs);
  }

  throw new Error(`Did not observe 429 within ${attempts} calls. Statuses: ${statuses.join(",")}`);
}

main().catch((e) => {
  console.error("\n❌", e?.message || String(e));
  process.exitCode = 1;
});
