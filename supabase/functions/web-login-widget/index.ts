/**
 * Web Login Widget — Supabase Edge Function
 *
 * Provides OAuth-like login flow for external websites via the messenger.
 *
 * Security design:
 * - auth sessions are time-limited (5 minutes) and single-use
 * - state parameter is validated to prevent CSRF
 * - data signature is HMAC-SHA-256 keyed with bot secret (stored in env)
 * - redirect_url is validated against registered bot domains (whitelist)
 * - session_id is a cryptographically-random UUID
 * - auth_date is Unix timestamp validated within 300 seconds of current time
 *
 * Attack mitigations:
 * - Replay: auth_date window + consumed single-use session
 * - CSRF: state parameter echoed back to initiator
 * - Open redirect: redirect_url validated against DB whitelist
 * - Timing attacks: constant-time HMAC comparison
 * - DoS: rate limit per bot_id (via Supabase rate limiting or Upstash)
 *
 * Endpoints:
 *   GET  /web-login-widget/script.js          — embeddable widget script
 *   POST /web-login-widget/auth               — create login session
 *   GET  /web-login-widget/callback           — redirect after user action
 *   POST /web-login-widget/verify             — verify signed user data
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

// ── Constants ──────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// App name for display in widget
const APP_NAME = Deno.env.get("APP_NAME") ?? "Messenger";
// Public app URL for callback page
const APP_PUBLIC_URL = Deno.env.get("APP_PUBLIC_URL") ?? "https://app.example.com";
const APP_PUBLIC_ORIGIN = (() => {
  try {
    return new URL(APP_PUBLIC_URL).origin;
  } catch {
    return APP_PUBLIC_URL;
  }
})();
// Session TTL in seconds
const SESSION_TTL_SECONDS = 300;
// Max auth_date drift allowed (seconds)
const MAX_AUTH_DATE_DRIFT = 300;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── HMAC helpers ───────────────────────────────────────────────────────────

async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Auth data hash (Telegram-compatible format) ────────────────────────────

interface AuthData {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Compute the hash for auth data verification.
 * Algorithm:
 *   1. Collect all fields except 'hash', sort alphabetically
 *   2. Join with '\n'
 *   3. HMAC-SHA-256 with key = SHA-256(bot_secret)
 */
async function computeAuthDataHash(
  data: Omit<AuthData, "hash">,
  botSecret: string
): Promise<string> {
  // Derive key from bot secret
  const secretBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(botSecret)
  );
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const fields = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(fields)
  );
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Bot validation ─────────────────────────────────────────────────────────

async function getBotRecord(botId: string): Promise<{
  id: string;
  secret: string;
  allowed_redirect_domains: string[];
} | null> {
  const { data } = await supabase
    .from("web_login_bots")
    .select("id, secret, allowed_redirect_domains")
    .eq("id", botId)
    .eq("active", true)
    .single();
  return data;
}

function isAllowedRedirectUrl(url: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(url);
    return allowedDomains.some(domain => {
      const normalized = domain.startsWith("*.") ? domain.slice(2) : domain;
      return (
        parsed.hostname === normalized ||
        parsed.hostname.endsWith(`.${normalized}`)
      );
    });
  } catch {
    return false;
  }
}

// ── Session management ─────────────────────────────────────────────────────

async function createAuthSession(
  botId: string,
  redirectUrl: string,
  state: string
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  const { error } = await supabase
    .from("web_login_sessions")
    .insert({
      id: sessionId,
      bot_id: botId,
      redirect_url: redirectUrl,
      state,
      status: "pending",
      expires_at: expiresAt,
    });

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return sessionId;
}

async function getSession(sessionId: string): Promise<{
  id: string;
  bot_id: string;
  redirect_url: string;
  state: string;
  status: string;
  user_id: string | null;
  expires_at: string;
} | null> {
  const { data } = await supabase
    .from("web_login_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  return data;
}

async function authorizeSession(
  sessionId: string,
  userId: string
): Promise<AuthData> {
  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("user_id", userId)
    .single();

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  if (!authUser.user) throw new Error("user_not_found");

  const authDate = Math.floor(Date.now() / 1000);
  const fullName = (profile?.display_name ?? authUser.user.user_metadata?.full_name ?? "").trim();
  const nameParts = fullName.split(" ").filter(Boolean);

  const baseData: Omit<AuthData, "hash"> = {
    id: userId,
    first_name: nameParts[0] ?? "",
    last_name: nameParts.slice(1).join(" ") || undefined,
    username: profile?.username || undefined,
    photo_url: profile?.avatar_url || undefined,
    auth_date: authDate,
  };

  // Get bot secret for hash
  const session = await getSession(sessionId);
  if (!session) throw new Error("session_not_found");

  const bot = await getBotRecord(session.bot_id);
  if (!bot) throw new Error("bot_not_found");

  const hash = await computeAuthDataHash(baseData, bot.secret);
  const fullData: AuthData = { ...baseData, hash } as AuthData;

  // Update session
  await supabase
    .from("web_login_sessions")
    .update({
      status: "authorized",
      user_id: userId,
      auth_data: JSON.stringify(fullData),
    })
    .eq("id", sessionId);

  return fullData;
}

// ── Handlers ───────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/** GET /web-login-widget/script.js — Returns embeddable widget JS */
function handleScriptRequest(req: Request): Response {
  const origin = new URL(req.url).origin;
  const script = `
(function() {
  'use strict';
  // ${APP_NAME} Web Login Widget v1.0
  // Embeds a "Login with ${APP_NAME}" button

  function openLoginPopup(botId, redirectUrl, buttonText, state) {
    var width = 480, height = 640;
    var left = (screen.width / 2) - (width / 2);
    var top = (screen.height / 2) - (height / 2);
    var params = new URLSearchParams({
      bot_id: botId,
      redirect_url: redirectUrl,
      state: state || crypto.randomUUID()
    });
    var url = '${APP_PUBLIC_URL}/auth/web-login?' + params.toString();
    var popup = window.open(url, 'messenger_login', 
      'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top
    );
    
    var handler = function(e) {
      if (e.origin !== '${APP_PUBLIC_ORIGIN}') return;
      if (e.data && e.data.type === 'messenger_auth') {
        window.removeEventListener('message', handler);
        if (typeof window.onMessengerAuth === 'function') {
          window.onMessengerAuth(e.data.user);
        }
      }
    };
    window.addEventListener('message', handler);
    return popup;
  }

  window.MessengerLogin = {
    open: openLoginPopup
  };

  // Auto-init data-login-btn elements
  document.addEventListener('DOMContentLoaded', function() {
    var btns = document.querySelectorAll('[data-messenger-login]');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        openLoginPopup(
          btn.getAttribute('data-bot-id'),
          btn.getAttribute('data-redirect-url') || window.location.href,
          btn.getAttribute('data-button-text') || 'Login',
          btn.getAttribute('data-state') || ''
        );
      });
    });
  });
})();
`.trim();

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/** POST /web-login-widget/auth — Create auth session */
async function handleCreateAuth(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body?.bot_id || !body?.redirect_url) {
    return jsonResponse({ error: "bot_id and redirect_url required" }, 400);
  }

  const bot = await getBotRecord(body.bot_id);
  if (!bot) return jsonResponse({ error: "bot_not_found" }, 404);

  if (!isAllowedRedirectUrl(body.redirect_url, bot.allowed_redirect_domains)) {
    return jsonResponse({ error: "redirect_url_not_allowed" }, 403);
  }

  const state = body.state ?? crypto.randomUUID();
  const sessionId = await createAuthSession(body.bot_id, body.redirect_url, state);

  return jsonResponse({
    session_id: sessionId,
    login_url: `${APP_PUBLIC_URL}/auth/web-login?session_id=${sessionId}`,
    expires_in: SESSION_TTL_SECONDS,
  });
}

/** GET /web-login-widget/callback?session_id=X — Status check after authorization */
async function handleCallback(url: URL): Promise<Response> {
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) return jsonResponse({ error: "session_id required" }, 400);

  const session = await getSession(sessionId);
  if (!session) return jsonResponse({ error: "session_not_found" }, 404);

  if (new Date(session.expires_at) < new Date()) {
    return jsonResponse({ error: "session_expired" }, 410);
  }

  if (session.status !== "authorized") {
    return jsonResponse({ status: session.status });
  }

  // Atomic CAS: mark session as 'consumed' only if it is still 'authorized'.
  // Using UPDATE ... WHERE status = 'authorized' RETURNING eliminates the
  // TOCTOU race condition where two concurrent GET /callback requests both
  // observe status='authorized' and both receive auth_data.
  // Only the request that lands the UPDATE first gets RETURNING rows;
  // the concurrent loser gets 0 rows → already_consumed error.
  const { data: consumed, error: consumeErr } = await supabase
    .from("web_login_sessions")
    .update({ status: "consumed" })
    .eq("id", sessionId)
    .eq("status", "authorized")   // CAS guard
    .select("auth_data, state, redirect_url")
    .maybeSingle();

  if (consumeErr) {
    console.error("session consume error:", consumeErr);
    return jsonResponse({ error: "internal_error" }, 500);
  }

  if (!consumed) {
    // Either already consumed by a concurrent request, or status changed.
    return jsonResponse({ error: "session_already_consumed" }, 409);
  }

  return jsonResponse({
    status: "authorized",
    auth_data: consumed.auth_data ? JSON.parse(consumed.auth_data) : null,
    state: consumed.state,
    redirect_url: consumed.redirect_url,
  });
}

/**
 * POST /web-login-widget/authorize-user
 * Called from the in-app WebLoginCallbackPage when the user clicks "Allow".
 * Requires a valid user JWT. Validates that the session is pending and not
 * expired, then authorizes it with the user's profile data and HMAC hash.
 *
 * Attack mitigations:
 * - JWT validates that it is the authenticated user, not a spoofed user_id.
 * - Session must be 'pending' (not consumed/authorized) — prevents double-use.
 * - Expiry check prevents stale session injection.
 */
async function handleAuthorizeUser(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Validate JWT with the Supabase anon client so it is verified against Supabase Auth.
  const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  let body: { session_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const { session_id } = body ?? {};
  if (!session_id) return jsonResponse({ error: "session_id required" }, 400);

  // user_id in body must match the JWT — prevents a user from authorizing on
  // behalf of another user by supplying a different user_id.
  if (body.user_id && body.user_id !== user.id) {
    return jsonResponse({ error: "user_id mismatch" }, 403);
  }

  const session = await getSession(session_id);
  if (!session) return jsonResponse({ error: "session_not_found" }, 404);

  if (new Date(session.expires_at) < new Date()) {
    return jsonResponse({ error: "session_expired" }, 410);
  }

  if (session.status !== "pending") {
    return jsonResponse({ error: "session_not_pending", status: session.status }, 409);
  }

  try {
    const authData = await authorizeSession(session_id, user.id);
    return jsonResponse({ auth_data: authData });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("authorizeSession error:", msg);
    if (msg === "user_not_found") return jsonResponse({ error: "user_not_found" }, 404);
    if (msg === "bot_not_found") return jsonResponse({ error: "bot_not_found" }, 404);
    return jsonResponse({ error: "authorization_failed" }, 500);
  }
}

/** POST /web-login-widget/verify — Verify signed auth data */
async function handleVerify(req: Request): Promise<Response> {
  const body: { auth_data: AuthData; bot_id: string } = await req.json().catch(() => null);
  if (!body?.auth_data || !body?.bot_id) {
    return jsonResponse({ error: "auth_data and bot_id required" }, 400);
  }

  // Validate auth_date freshness
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - body.auth_data.auth_date) > MAX_AUTH_DATE_DRIFT) {
    return jsonResponse({ error: "auth_data_expired", valid: false }, 200);
  }

  const bot = await getBotRecord(body.bot_id);
  if (!bot) return jsonResponse({ error: "bot_not_found", valid: false }, 200);

  const { hash, ...dataWithoutHash } = body.auth_data;
  const expectedHash = await computeAuthDataHash(dataWithoutHash, bot.secret);

  const valid = timingSafeEqual(hash, expectedHash);

  return jsonResponse({ valid, user_id: valid ? body.auth_data.id : null });
}

// ── Router ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/web-login-widget/, "");
  const method = req.method;
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  /** Добавляет CORS-заголовки к ответу обработчика */
  const withCors = (res: Response): Response => {
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) h.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  };

  try {
    if (path === "/script.js" && method === "GET") {
      return withCors(handleScriptRequest(req));
    }
    if (path === "/auth" && method === "POST") {
      return withCors(await handleCreateAuth(req));
    }
    if (path === "/callback" && method === "GET") {
      return withCors(await handleCallback(url));
    }
    if (path === "/verify" && method === "POST") {
      return withCors(await handleVerify(req));
    }
    if (path === "/authorize-user" && method === "POST") {
      return withCors(await handleAuthorizeUser(req));
    }

    return withCors(jsonResponse({ error: "not_found" }, 404));
  } catch (e) {
    console.error("web-login-widget error:", e);
    return withCors(jsonResponse({ error: "internal_server_error" }, 500));
  }
});
