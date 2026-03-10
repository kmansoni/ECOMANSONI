/**
 * get-turn-credentials — Edge Function
 *
 * Generates time-limited TURN credentials for coturn `use-auth-secret` mode (RFC 5766 §9.2).
 *
 * Security model:
 *  - Requires valid Supabase JWT (Authorization: Bearer <token>)
 *  - Credentials are HMAC-SHA1 limited to TTL_SECONDS (24 h by default)
 *  - username = "<expiry_unix>:<userId_hash>" — prevents guessing real user IDs
 *  - credential = HMAC-SHA1(TURN_AUTH_SECRET, username)
 *  - Server must have `use-auth-secret` + `static-auth-secret=<TURN_AUTH_SECRET>` in coturn config
 *
 * Attack vectors mitigated:
 *  - Replay: credentials expire after TTL_SECONDS; coturn enforces expiry server-side
 *  - Enumeration: userId is hashed (SHA-256 truncated) before embedding in username
 *  - Credential theft: TURNS (TLS) prevents credential interception on corporate proxies
 *  - DoS: anonymous access blocked unless TURN_ALLOW_ANON_DEV=1 (dev-only flag)
 *  - CORS bypass: enforced via shared CORS utility
 *
 * coturn turnserver.conf must match:
 *   use-auth-secret
 *   static-auth-secret=${TURN_AUTH_SECRET}
 *   realm=mansoni.ru
 */

/// <reference path="../_shared/edge-runtime-types.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, enforceCors } from "../_shared/utils.ts";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** TURN server endpoints for mansoni.ru deployment. */
const TURN_HOST = "turn.mansoni.ru";

/** TTL for credentials — 24 hours. coturn validates timestamp in username. */
const TTL_SECONDS = 86_400;

/** Max clock drift tolerated (5 min). Used to explain latency to callers. */
const CLOCK_DRIFT_SECONDS = 300;

// ──────────────────────────────────────────────────────────────────────────────
// Crypto helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * HMAC-SHA1 per RFC 5766 §9.2 — the wire format coturn expects.
 * Returns Base64-encoded (standard, not URL-safe) — coturn does raw base64 comparison.
 */
async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(secret);
  const msgBytes = new TextEncoder().encode(message);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
  // Convert ArrayBuffer → Base64 without btoa (Deno-safe)
  let binary = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * SHA-256 hex of input — used to derive a short, opaque user hash from UUID.
 * We embed only 12 hex chars (48 bits) to keep the username short while preserving
 * sufficient collision resistance for a non-security-critical label.
 */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ──────────────────────────────────────────────────────────────────────────────
// Environment helpers
// ──────────────────────────────────────────────────────────────────────────────

function isProductionEnv(): boolean {
  const env = (Deno.env.get("SUPABASE_ENV") ?? "").toLowerCase();
  if (env === "prod" || env === "production") return true;
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").toLowerCase();
  if (!supabaseUrl) return true;
  if (supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1")) return false;
  return true;
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",").map((s) => s.trim()).find(Boolean);
  return first || req.headers.get("x-real-ip") || "unknown";
}

// ──────────────────────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validate Supabase JWT and return the user ID.
 * In dev mode with TURN_ALLOW_ANON_DEV=1 the function returns a synthetic user ID
 * so local testing works without an actual Supabase session.
 *
 * SECURITY: TURN_ALLOW_ANON_DEV must NEVER be set in production — if it is,
 * the function returns 500 (enforced below).
 */
async function resolveUserId(req: Request): Promise<string | null> {
  const allowAnon = Deno.env.get("TURN_ALLOW_ANON_DEV") === "1";

  if (allowAnon) {
    // Fail hard if someone accidentally sets this in production
    if (isProductionEnv()) return null;
    return "dev-anon";
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl) return null;

  const authKeys = [anonKey ?? "", publishableKey ?? ""]
    .map((v) => v.trim())
    .filter((v, i, arr) => !!v && arr.indexOf(v) === i);

  if (authKeys.length === 0) {
    console.error("[get-turn-credentials] Missing SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY");
    return null;
  }

  for (const key of authKeys) {
    try {
      const supabase = createClient(supabaseUrl, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user?.id) return data.user.id;
    } catch (err) {
      console.warn("[get-turn-credentials] JWT validation error", err);
    }
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Rate limiting (best-effort, no hard dependency)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Call the `turn_issuance_rl_hit_v1` RPC to enforce per-user rate limiting.
 * Falls back to allow on any error to avoid blocking calls when DB is degraded.
 *
 * Rate limit policy: 60 credential issuances per user per hour (configurable via DB).
 */
async function enforceRateLimit(userId: string, clientIp: string): Promise<Response | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Validate UUID to avoid injecting arbitrary strings into RPC
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!isUuid.test(userId)) {
    // dev-anon or non-UUID — skip rate limit
    return null;
  }

  if (!supabaseUrl || !serviceKey) {
    console.warn("[get-turn-credentials] Rate limit skipped — missing service credentials");
    return null;
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // The workspace Supabase TS client types don't include this custom function.
    // We use a local interface to retain as much safety as the untyped binding allows:
    // p_user_id and p_client_ip are always passed as UUID/text respectively, and the
    // return value shape is documented here rather than via the generated Database type.
    interface RlResult { allowed: boolean; remaining: number }
    const rpcAdmin = admin as unknown as {
      rpc: (fn: string, args: Record<string, string>) => Promise<{ data: RlResult | null; error: { message: string } | null }>
    };
    const { data, error } = await rpcAdmin.rpc(
      "turn_issuance_rl_hit_v1",
      { p_user_id: userId, p_client_ip: clientIp },
    );

    if (error) {
      console.warn("[get-turn-credentials] Rate limit RPC error (fail-open):", error.message);
      return null;
    }

    if (data && data.allowed === false) {
      return new Response(
        JSON.stringify({ error: "rate_limited", retryAfterSeconds: 60 }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
      );
    }
  } catch (err) {
    console.warn("[get-turn-credentials] Rate limit check exception (fail-open):", err);
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Credential generation
// ──────────────────────────────────────────────────────────────────────────────

interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

interface TurnCredentialsResponse {
  iceServers: IceServer[];
  ttl: number;
  /** Unix timestamp after which credentials expire. Clients should refresh before this. */
  expiresAt: number;
}

/**
 * Generate time-limited TURN credentials per RFC 5766 §9.2 (coturn REST-auth format).
 *
 * Username format:  "<expiry_unix>:<opaque_user_tag>"
 * Credential:       HMAC-SHA1(TURN_AUTH_SECRET, username)
 *
 * coturn validates:
 *   1. Current time < expiry embedded in username
 *   2. HMAC-SHA1(static-auth-secret, username) == credential
 *
 * The opaque_user_tag is SHA-256(userId)[0:12] so:
 *   - userId is never exposed in credentials
 *   - Per-user audit trail possible on TURN server via tag lookup
 */
async function generateCredentials(userId: string, authSecret: string): Promise<{
  username: string;
  credential: string;
  expiry: number;
}> {
  const expiry = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  // Embed opaque tag to avoid exposing real userId in network credentials
  const userHash = (await sha256Hex(userId)).slice(0, 12);
  const username = `${expiry}:${userHash}`;
  const credential = await hmacSha1Base64(authSecret, username);
  return { username, credential, expiry };
}

function buildIceServers(username: string, credential: string): IceServer[] {
  return [
    // STUN-only (no credentials required)
    { urls: `stun:${TURN_HOST}:3478` },
    // TURN over UDP/TCP port 3478
    { urls: `turn:${TURN_HOST}:3478`, username, credential },
    // TURNS (TURN over TLS) port 5349 — required for corporate networks that block UDP
    { urls: `turns:${TURN_HOST}:5349`, username, credential },
    // TURN over TCP port 3478 (explicit transport — some clients need this)
    { urls: `turn:${TURN_HOST}:3478?transport=tcp`, username, credential },
  ];
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  // 1. CORS preflight — must be first (before auth) per W3C spec
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const origin = req.headers.get("origin") ?? null;

  // Compute dynamic CORS headers for the actual response
  function json(status: number, body: unknown): Response {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (origin) {
      // enforceCors already validated the origin; mirror it here
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Vary"] = "Origin";
    }
    return new Response(JSON.stringify(body), { status, headers });
  }

  // 2. Only POST allowed
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // 3. Guard: dev-only anon flag must not exist in production
  if (Deno.env.get("TURN_ALLOW_ANON_DEV") === "1" && isProductionEnv()) {
    console.error("[get-turn-credentials] TURN_ALLOW_ANON_DEV=1 in production — rejecting all requests");
    return json(500, { error: "misconfigured" });
  }

  // 4. Resolve authenticated user
  const userId = await resolveUserId(req);
  if (!userId) {
    return json(401, { error: "unauthorized" });
  }

  // 5. Rate limiting (best-effort)
  const clientIp = getClientIp(req);
  const rlResponse = await enforceRateLimit(userId, clientIp);
  if (rlResponse) return rlResponse;

  // 6. Validate TURN_AUTH_SECRET
  const authSecret = Deno.env.get("TURN_AUTH_SECRET") ?? "";
  if (!authSecret || authSecret.length < 16) {
    console.error("[get-turn-credentials] TURN_AUTH_SECRET missing or too short (<16 chars)");
    if (isProductionEnv()) {
      return json(500, { error: "turn_not_configured" });
    }
    // Dev fallback — return STUN-only so calls can still connect via direct ICE
    console.warn("[get-turn-credentials] Dev mode: returning STUN-only ICE servers");
    const fallback: TurnCredentialsResponse = {
      iceServers: [{ urls: `stun:${TURN_HOST}:3478` }],
      ttl: TTL_SECONDS,
      expiresAt: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    };
    return json(200, fallback);
  }

  // 7. Generate credentials
  let username: string;
  let credential: string;
  let expiry: number;

  try {
    ({ username, credential, expiry } = await generateCredentials(userId, authSecret));
  } catch (err) {
    console.error("[get-turn-credentials] Credential generation failed:", err);
    return json(500, { error: "turn_credentials_unavailable" });
  }

  // 8. Build response
  const responseBody: TurnCredentialsResponse = {
    iceServers: buildIceServers(username, credential),
    ttl: TTL_SECONDS,
    expiresAt: expiry,
  };

  console.info("[get-turn-credentials] Credentials issued", {
    userId: userId.slice(0, 8) + "…",
    expiresAt: expiry,
    clockDriftWindow: CLOCK_DRIFT_SECONDS,
    serversCount: responseBody.iceServers.length,
  });

  return json(200, responseBody);
});
