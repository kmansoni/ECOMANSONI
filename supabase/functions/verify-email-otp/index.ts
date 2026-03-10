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
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

function jsonResp(origin: string | null, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}

// Timing-safe comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
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
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const origin = req.headers.get("origin");

  if (req.method !== "POST") {
    return jsonResp(origin, { error: "Method not allowed" }, 405);
  }

  let email: string, code: string;
  try {
    const body = await req.json();
    email = (body.email ?? "").trim().toLowerCase();
    code = (body.code ?? "").trim();
  } catch {
    return jsonResp(origin, { error: "Invalid JSON" }, 400);
  }

  if (!email || !code) {
    return jsonResp(origin, { error: "email and code required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const emailAuthSecret = Deno.env.get("EMAIL_AUTH_SECRET");

  if (!emailAuthSecret) {
    console.error("[verify-email-otp] Missing EMAIL_AUTH_SECRET");
    return jsonResp(origin, { error: "Server not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── Fetch OTP record ────────────────────────────────────────────────────
  const { data: otp, error: fetchError } = await supabase
    .from("email_otp_codes")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !otp) {
    return jsonResp(origin, { error: "No verification code found. Please request a new one." }, 404);
  }

  // Expired?
  if (new Date(otp.expires_at) < new Date()) {
    await supabase.from("email_otp_codes").delete().eq("id", otp.id);
    return jsonResp(origin, { error: "Code expired. Please request a new one." }, 410);
  }

  // Max attempts reached?
  const MAX_ATTEMPTS = 5;
  if (otp.attempts >= MAX_ATTEMPTS) {
    await supabase.from("email_otp_codes").delete().eq("id", otp.id);
    return jsonResp(origin, { error: "Too many attempts. Please request a new code." }, 429);
  }

  // Increment attempts
  await supabase
    .from("email_otp_codes")
    .update({ attempts: otp.attempts + 1 })
    .eq("id", otp.id);

  // Timing-safe comparison
  if (!timingSafeEqual(code, otp.code)) {
    const remaining = MAX_ATTEMPTS - (otp.attempts + 1);
    return jsonResp(origin, { error: `Invalid code. ${remaining} attempt(s) remaining.` }, 401);
  }

  // ── Code valid — delete it ──────────────────────────────────────────────
  await supabase.from("email_otp_codes").delete().eq("id", otp.id);

  // ── Create or sign-in user ──────────────────────────────────────────────
  const password = await derivePassword(email, emailAuthSecret);
  let isNewUser = false;

  // Try to find user by email via admin API
  const { data: userLookup } = await supabase.auth.admin.listUsers();
  const existingUser = userLookup?.users?.find(
    (u) => u.email?.toLowerCase() === email,
  );

  if (!existingUser) {
    // Create new user
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      console.error("[verify-email-otp] createUser error:", createErr);
      return jsonResp(origin, { error: "Failed to create account" }, 500);
    }
    isNewUser = true;
  } else {
    // Update password to current derived value (in case secret rotated)
    await supabase.auth.admin.updateUser(existingUser.id, { password });
  }

  // Sign in to get tokens
  const { data: session, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !session?.session) {
    console.error("[verify-email-otp] signIn error:", signInErr);
    return jsonResp(origin, { error: "Authentication failed" }, 500);
  }

  return jsonResp(origin, {
    ok: true,
    userId: session.session.user.id,
    isNewUser,
    accessToken: session.session.access_token,
    refreshToken: session.session.refresh_token,
  });
});
