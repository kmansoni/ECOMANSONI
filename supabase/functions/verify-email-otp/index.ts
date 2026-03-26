/**
 * Edge Function: verify-email-otp
 *
 * Verifies OTP from email_otp_codes, creates (or finds) the Supabase Auth
 * user via HMAC-derived password, returns JWT tokens.
 *
 * Required secrets:
 *  - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-set)
 *  - EMAIL_AUTH_SECRET  — HMAC key for deterministic password derivation
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, checkRateLimit } from "../_shared/utils.ts";

type AdminLookupClient = {
  auth: {
    admin: {
      listUsers(params: { page: number; perPage: number }): Promise<{
        data?: { users?: Array<{ id: string; email?: string | null }> };
        error?: { message?: string; status?: number } | null;
      }>;
    };
  };
};

async function findAuthUserByEmail(adminClient: AdminLookupClient, email: string) {
  const normalizedEmail = email.toLowerCase();
  const perPage = 200;
  let page = 1;

  // Scan pages deterministically to avoid missing existing users when total > perPage.
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null, error };

    const users = data?.users ?? [];
    const found = users.find((entry) => String(entry.email ?? "").toLowerCase() === normalizedEmail) ?? null;
    if (found) {
      return { user: found, error: null };
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return { user: null, error: null };
}

function jsonResp(origin: string | null, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json",
      // Prevent caching of sensitive auth tokens.
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

function isAlreadyRegisteredError(err: unknown): boolean {
  const e = err as { message?: unknown; status?: unknown };
  const message = String(e?.message ?? "").toLowerCase();
  // Primary: message check — "User already registered".
  const byMessage = message.includes("already") && message.includes("registered");
  // Fallback: status 422 AND message still references "registered" — survives minor Supabase
  // phrasing changes while NOT matching unrelated 422s like "Invalid email format" or "Weak password".
  const byStatus422 = Number(e?.status) === 422 && message.includes("registered");
  return byMessage || byStatus422;
}

function isExpectedInvalidCredentialsError(err: unknown): boolean {
  const e = err as { message?: unknown; status?: unknown };
  const message = String(e?.message ?? "").toLowerCase();
  const status = Number(e?.status);
  const byMessage = message.includes("invalid") && (
    message.includes("credential") ||
    message.includes("login") ||
    message.includes("email") ||
    message.includes("password")
  );
  // Supabase commonly returns 400; some proxies/middlewares may surface 401.
  const byStatus = status === 400 || status === 401;
  return byMessage || (byStatus && message.includes("invalid"));
}

// Timing-safe comparison: always runs in O(max(a,b)) — no early exit on length mismatch.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  const len = Math.max(bufA.length, bufB.length);
  // Pad both buffers to the same length so every byte position is always compared.
  const padA = new Uint8Array(len);
  const padB = new Uint8Array(len);
  padA.set(bufA);
  padB.set(bufB);
  let diff = 0;
  for (let i = 0; i < len; i++) {
    diff |= padA[i] ^ padB[i];
  }
  // Unequal lengths: padded zeros vs real bytes already produce non-zero diff in the loop above.
  return diff === 0;
}

// HMAC-SHA256 based deterministic password from email + secret
async function derivePassword(email: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(email));
  const arr = new Uint8Array(sig);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  try {
    const corsResp = handleCors(req);
    if (corsResp) return corsResp;

    if (req.method !== "POST") {
      return jsonResp(origin, { error: "Method not allowed" }, 405);
    }

    // Rate limit by client IP to prevent brute-force and DoS attacks.
    // x-forwarded-for is set by Supabase; fallback to a generic key if absent.
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const { allowed, resetIn } = checkRateLimit(clientIp);
    if (!allowed) {
      const retryAfterSecs = Math.ceil(resetIn / 1000);
      const resp = jsonResp(origin, {
        error: `Too many requests. Try again in ${retryAfterSecs}s.`,
        retryAfter: retryAfterSecs,
      }, 429);
      // RFC 6585 §4: include Retry-After header so HTTP clients know when to back off.
      resp.headers.set("Retry-After", String(retryAfterSecs));
      return resp;
    }

    // Reject oversized request bodies early to prevent DoS via memory exhaustion
    // before JSON.parse. Limit: 8KB is more than enough for {email, code}.
    const contentLength = req.headers.get("content-length");
    if (contentLength !== null) {
      const bodySize = Number(contentLength);
      // Guard against non-numeric Content-Length (NaN > 8192 = false, so parseInt silently bypasses).
      if (!Number.isFinite(bodySize) || bodySize > 8192) {
        return jsonResp(origin, { error: "Request too large." }, 413);
      }
    }
    let email: string, code: string;
    try {
      const body = await req.json();
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return jsonResp(origin, { error: "Request body must be a JSON object." }, 400);
      }
      email = String(body.email ?? "").trim().toLowerCase();
      // Normalize email to NFC form (canonical decomposition followed by recomposition)
      // so "café" and "cafe\u0301" (combining accent) both map to the same normalized string.
      // This prevents attackers from creating duplicate accounts via Unicode variants.
      email = email.normalize("NFC");
      code = String(body.code ?? "").trim();
    } catch {
      return jsonResp(origin, { error: "Invalid JSON" }, 400);
    }

    if (!email || !code) {
      return jsonResp(origin, { error: "email and code required" }, 400);
    }

    // Reject malformed emails early to avoid unnecessary DB/Auth load and
    // to return a deterministic client error instead of downstream 5xx.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResp(origin, { error: "Invalid email format." }, 400);
    }

    // Enforce max email length (RFC 5321: 254 chars) to prevent DoS via huge strings
    // in HMAC, DB queries, and Auth API calls.
    if (email.length > 254) {
      return jsonResp(origin, { error: "Invalid email format." }, 400);
    }

    // Second rate-limit gate keyed on the (validated, normalised) email address.
    // IP can be spoofed via X-Forwarded-For; email cannot — it is already format-validated.
    // Stricter than IP limit: 10 req/min per email.
    const emailRateKey = `email:${email}`;
    const emailRate = checkRateLimit(emailRateKey, 10);
    if (!emailRate.allowed) {
      const retryAfterSecs = Math.ceil(emailRate.resetIn / 1000);
      const resp = jsonResp(origin, {
        error: `Too many requests. Try again in ${retryAfterSecs}s.`,
        retryAfter: retryAfterSecs,
      }, 429);
      resp.headers.set("Retry-After", String(retryAfterSecs));
      return resp;
    }

    // Validate code format early — before any DB work — to block DoS via huge strings.
    // A valid OTP is exactly 6 ASCII digits; anything else is rejected immediately.
    if (!/^\d{6}$/.test(code)) {
      return jsonResp(origin, { error: "Invalid code format." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const emailAuthSecret = Deno.env.get("EMAIL_AUTH_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !emailAuthSecret) {
      console.error("[verify-email-otp] Missing required environment variables", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
        hasEmailAuthSecret: Boolean(emailAuthSecret),
      });
      return jsonResp(origin, { error: "Server not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // ── Fetch OTP record ────────────────────────────────────────────────────
    const { data: otp, error: fetchError } = await supabase
      .from("email_otp_codes")
      .select("id, email, code, expires_at, attempts")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      const errorSafe = { message: String(fetchError.message ?? ""), code: fetchError.code };
      console.error("[verify-email-otp] DB error fetching OTP record:", errorSafe);
      return jsonResp(origin, { error: "Verification temporarily unavailable. Try again." }, 500);
    }

    if (!otp) {
      // Use 400 rather than 404 to avoid confirming whether an email has a pending OTP.
      // A 404 would let attackers enumerate which addresses have active codes.
      return jsonResp(origin, { error: "Invalid or expired verification code." }, 400);
    }

    const expiresAtMs = new Date(String(otp.expires_at ?? "")).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      console.error("[verify-email-otp] OTP record has invalid expires_at", { otpId: otp.id });
      const { error: invalidExpiryDeleteErr } = await supabase.from("email_otp_codes").delete().eq("id", otp.id);
      if (invalidExpiryDeleteErr) {
        console.error("[verify-email-otp] Failed to delete OTP with invalid expires_at:", { message: String(invalidExpiryDeleteErr.message ?? ""), code: invalidExpiryDeleteErr.code });
      }
      return jsonResp(origin, { error: "Verification code is corrupted. Request a new one." }, 500);
    }

    // Expired?
    if (expiresAtMs < Date.now()) {
      const { error: expiredDeleteErr } = await supabase.from("email_otp_codes").delete().eq("id", otp.id);
      if (expiredDeleteErr) console.error("[verify-email-otp] Failed to delete expired OTP:", { message: String(expiredDeleteErr.message ?? ""), code: expiredDeleteErr.code });
      return jsonResp(origin, { error: "Code expired. Please request a new one." }, 410);
    }

    const attempts = Number(otp.attempts);
    if (!Number.isInteger(attempts) || attempts < 0) {
      console.error("[verify-email-otp] OTP record has invalid attempts", { otpId: otp.id, attempts: otp.attempts });
      const { error: invalidAttemptsDeleteErr } = await supabase.from("email_otp_codes").delete().eq("id", otp.id);
      if (invalidAttemptsDeleteErr) {
        console.error("[verify-email-otp] Failed to delete OTP with invalid attempts:", { message: String(invalidAttemptsDeleteErr.message ?? ""), code: invalidAttemptsDeleteErr.code });
      }
      return jsonResp(origin, { error: "Verification code is corrupted. Request a new one." }, 500);
    }

    // Max attempts reached?
    const MAX_ATTEMPTS = 5;
    if (attempts >= MAX_ATTEMPTS) {
      const { error: maxAttemptsDeleteErr } = await supabase.from("email_otp_codes").delete().eq("id", otp.id);
      if (maxAttemptsDeleteErr) console.error("[verify-email-otp] Failed to delete exhausted OTP:", { message: String(maxAttemptsDeleteErr.message ?? ""), code: maxAttemptsDeleteErr.code });
      return jsonResp(origin, { error: "Too many attempts. Please request a new code." }, 429);
    }

    // Validate stored code BEFORE incrementing attempts — avoid wasting a slot on a corrupted record.
    const storedCode = String(otp.code ?? "").trim();
    if (!/^\d{6}$/.test(storedCode)) {
      console.error("[verify-email-otp] OTP record has invalid code format", { otpId: otp.id });
      const { error: invalidCodeDeleteErr } = await supabase.from("email_otp_codes").delete().eq("id", otp.id);
      if (invalidCodeDeleteErr) {
        console.error("[verify-email-otp] Failed to delete OTP with invalid code format:", { message: String(invalidCodeDeleteErr.message ?? ""), code: invalidCodeDeleteErr.code });
      }
      return jsonResp(origin, { error: "Verification code is corrupted. Request a new one." }, 500);
    }

    // Increment attempts with optimistic concurrency control.
    // Matching the previously read attempts value prevents lost updates when
    // multiple verification requests race on the same OTP row.
    const { data: incrementedOtp, error: incrError } = await supabase
      .from("email_otp_codes")
      .update({ attempts: attempts + 1 })
      .eq("id", otp.id)
      .eq("attempts", attempts)
      .select("attempts")
      .maybeSingle();

    if (incrError) {
      const errorSafe = { message: String(incrError.message ?? ""), code: incrError.code };
      console.error("[verify-email-otp] Failed to increment attempts counter:", errorSafe);
      return jsonResp(origin, { error: "Verification temporarily unavailable. Try again." }, 500);
    }

    if (!incrementedOtp) {
      return jsonResp(origin, { error: "Verification state changed. Try again." }, 409);
    }

    // Timing-safe comparison
    if (!timingSafeEqual(code, storedCode)) {
      const remaining = MAX_ATTEMPTS - (attempts + 1);
      // Do NOT log email — PII; log only internal system state.
      console.warn("[verify-email-otp] Wrong code attempt", { remaining });
      return jsonResp(origin, { error: "Invalid code." }, 401);
    }

    // ── Code valid — consume it atomically ─────────────────────────────────
    // Using .select() so PostgREST returns the affected rows.
    // If deletedRows is empty → another concurrent request already consumed this
    // code (TOCTOU race); reject to prevent replay.
    const { data: deletedRows, error: deleteError } = await supabase
      .from("email_otp_codes")
      .delete()
      .eq("id", otp.id)
      .select("id");

    if (deleteError) {
      const errorSafe = { message: String(deleteError.message ?? ""), code: deleteError.code };
      console.error("[verify-email-otp] Failed to delete OTP record:", errorSafe);
      return jsonResp(origin, { error: "Verification failed. Try again." }, 500);
    }

    if (!deletedRows || deletedRows.length === 0) {
      // Race: another concurrent request already consumed this code.
      return jsonResp(origin, { error: "Code already used. Please request a new one." }, 409);
    }

    // ── Create or sign-in user ──────────────────────────────────────────────
    const password = await derivePassword(email, emailAuthSecret);
    let isNewUser = false;

    // Fast path for existing users with deterministic password.
    const firstSignIn = await supabase.auth.signInWithPassword({ email, password });
    if (!firstSignIn.error && firstSignIn.data?.session) {
      const fastSession = firstSignIn.data.session;
      if (
        !fastSession.user?.id ||
        typeof fastSession.user.id !== "string" ||
        fastSession.user.id.trim() === "" ||
        !fastSession.access_token ||
        typeof fastSession.access_token !== "string" ||
        fastSession.access_token.trim() === "" ||
        !fastSession.refresh_token ||
        typeof fastSession.refresh_token !== "string" ||
        fastSession.refresh_token.trim() === ""
      ) {
        console.error("[verify-email-otp] first signIn missing required session fields", {
          hasUserId: !!fastSession.user?.id,
          hasAccessToken: !!fastSession.access_token,
          hasRefreshToken: !!fastSession.refresh_token,
        });
        return jsonResp(origin, { error: "Authentication failed" }, 500);
      }
      return jsonResp(origin, {
        ok: true,
        userId: fastSession.user.id,
        isNewUser,
        accessToken: fastSession.access_token,
        refreshToken: fastSession.refresh_token,
      });
    }

    if (firstSignIn.error && !isExpectedInvalidCredentialsError(firstSignIn.error)) {
      const errorSafe = { message: String(firstSignIn.error.message ?? ""), status: firstSignIn.error.status };
      console.error("[verify-email-otp] Unexpected first signIn error:", errorSafe);
      return jsonResp(origin, { error: "Authentication temporarily unavailable. Try again." }, 500);
    }

    if (!firstSignIn.error && !firstSignIn.data?.session) {
      console.error("[verify-email-otp] first signIn returned no error and no session");
      return jsonResp(origin, { error: "Authentication temporarily unavailable. Try again." }, 500);
    }

    // User may not exist yet, or secret might have rotated.
    const createRes = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createRes.error) {
      if (!isAlreadyRegisteredError(createRes.error)) {
        const errorSafe = { message: String(createRes.error.message ?? ""), status: createRes.error.status };
        console.error("[verify-email-otp] createUser error:", errorSafe);
        return jsonResp(origin, { error: "Failed to create account" }, 500);
      }

      // Existing account but sign-in failed with current derived password (e.g. secret rotation).
      // Recover by finding the user id and forcing password sync.
      const { user: existingUser, error: listErr } = await findAuthUserByEmail(supabase, email);
      if (listErr || !existingUser) {
        const errorSafe = listErr ? { message: String(listErr.message ?? ""), status: listErr.status } : null;
        console.error("[verify-email-otp] findAuthUserByEmail error:", errorSafe);
        return jsonResp(origin, { error: "Account exists but cannot be recovered now. Try again." }, 500);
      }

      if (
        !existingUser.id ||
        typeof existingUser.id !== "string" ||
        existingUser.id.trim() === ""
      ) {
        console.error("[verify-email-otp] Existing user has invalid id", { email });
        return jsonResp(origin, { error: "Account exists but cannot be recovered now. Try again." }, 500);
      }

      const { error: updateErr } = await supabase.auth.admin.updateUserById(existingUser.id, { password });
      if (updateErr) {
        const errorSafe = { message: String(updateErr.message ?? ""), status: updateErr.status };
        console.error("[verify-email-otp] updateUserById error:", errorSafe);
        return jsonResp(origin, { error: "Account recovery failed. Try again." }, 500);
      }
    } else {
      // createUser succeeded with no error
      if (!createRes.data?.user?.id) {
        console.error("[verify-email-otp] createUser returned success but no user data");
        return jsonResp(origin, { error: "Failed to create account" }, 500);
      }
      isNewUser = true;
    }

    const finalSignIn = await supabase.auth.signInWithPassword({ email, password });
    if (finalSignIn.error || !finalSignIn.data?.session) {
      const errorSafe = finalSignIn.error
        ? { message: String(finalSignIn.error.message ?? ""), status: finalSignIn.error.status }
        : null;
      console.error("[verify-email-otp] final signIn error:", errorSafe);
      return jsonResp(origin, { error: "Authentication failed" }, 500);
    }

    const session = finalSignIn.data.session;
    if (
      !session.user?.id ||
      typeof session.user.id !== "string" ||
      session.user.id.trim() === "" ||
      !session.access_token ||
      typeof session.access_token !== "string" ||
      session.access_token.trim() === "" ||
      !session.refresh_token ||
      typeof session.refresh_token !== "string" ||
      session.refresh_token.trim() === ""
    ) {
      console.error("[verify-email-otp] final signIn missing required session fields", {
        hasUserId: !!session.user?.id,
        hasAccessToken: !!session.access_token,
        hasRefreshToken: !!session.refresh_token,
      });
      return jsonResp(origin, { error: "Authentication failed" }, 500);
    }

    return jsonResp(origin, {
      ok: true,
      userId: session.user.id,
      isNewUser,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    });
  } catch (error) {
    const errorSafe = error instanceof Error ? { message: error.message, name: error.name } : { value: String(error) };
    console.error("[verify-email-otp] Unhandled error:", errorSafe);
    return jsonResp(origin, { error: "Internal server error" }, 500);
  }
});
