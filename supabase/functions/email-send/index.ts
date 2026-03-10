/**
 * supabase/functions/email-send/index.ts — Серверный прокси для email-router.
 *
 * Security model (zero-trust):
 *  - Все запросы ОБЯЗАНЫ иметь валидный Supabase JWT (Authorization: Bearer <token>).
 *  - EMAIL_ROUTER_API_KEY хранится только в Supabase Vault — никогда не покидает
 *    серверную среду и не попадает в бандл браузера.
 *  - Rate limiting: 10 email/user/10min per Edge Function instance.
 *    NOTE: in-memory rate limiting resets on cold starts — provides best-effort
 *    protection for long-lived instances. All callers must be authenticated via JWT.
 *  - Per-user SMTP override: if user has configured custom SMTP credentials in
 *    email_smtp_settings table, those credentials are decrypted here (AES-256-GCM)
 *    and passed to email-router as smtp_override. This enables real delivery from
 *    Gmail/Yandex/Outlook/custom SMTP without exposing the password to the client.
 *  - From address is enforced server-side: must match the user's configured
 *    from_email in smtp settings (prevents header injection / spoofing).
 *
 * Environment variables (Supabase Vault):
 *  - SUPABASE_URL          — автоматически предоставляется Supabase runtime
 *  - SUPABASE_ANON_KEY     — автоматически предоставляется Supabase runtime
 *  - SUPABASE_SERVICE_ROLE_KEY — для чтения SMTP настроек (bypass RLS)
 *  - EMAIL_ROUTER_URL      — URL email-router, доступный из Edge Function
 *  - EMAIL_ROUTER_API_KEY  — секретный API-ключ email-router
 *  - SMTP_ENCRYPTION_KEY   — 64-hex-char ключ для расшифровки паролей (AES-256-GCM)
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enforceCors,
  getCorsHeaders,
  handleCors,
} from "../_shared/utils.ts";
import { validatePayload } from "./validation.ts";

// ─── Rate limiting ────────────────────────────────────────────────────────────

const EMAIL_RATE_LIMIT_MAX = 10;
const EMAIL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min

const rateLimits = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(uid);
  }
}, EMAIL_RATE_LIMIT_WINDOW_MS);

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + EMAIL_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= EMAIL_RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ─── AES-256-GCM decryption ────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function decryptSmtpPassword(encoded: string, keyHex: string): Promise<string | null> {
  try {
    const keyBytes = hexToBytes(keyHex.slice(0, 64));
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes.buffer as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "==".slice(0, (4 - b64.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const cipherBuf = bytes.slice(12);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherBuf.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(plain);
  } catch (err) {
    console.error("[email-send] Password decryption failed:", String(err));
    return null;
  }
}

// ─── Fetch user's SMTP settings ───────────────────────────────────────────────

interface SmtpOverride {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  from: string;
  fromName: string | null;
  replyTo: string | null;
  domain: string | null;
}

async function getUserSmtpOverride(
  supabaseUrl: string,
  serviceRoleKey: string,
  encryptionKey: string,
  userId: string
): Promise<SmtpOverride | null> {
  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await adminClient
      .from("email_smtp_settings")
      .select("smtp_host, smtp_port, smtp_user, smtp_password_enc, tls_mode, from_email, from_name, reply_to, message_id_domain, verified_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;

    // Only use SMTP override if it's been verified (tested)
    // Unverified settings could cause delivery failures; fall back to default SMTP
    // NOTE: Remove the verified_at check if you want to allow unverified settings
    // For safety in production, we require verification first
    if (!data.verified_at) {
      console.warn("[email-send] User SMTP settings not verified, using default SMTP", { userId });
      return null;
    }

    const password = await decryptSmtpPassword(data.smtp_password_enc, encryptionKey);
    if (!password) return null;

    return {
      host: data.smtp_host,
      port: data.smtp_port,
      user: data.smtp_user,
      pass: password,
      secure: data.tls_mode === "ssl",
      from: data.from_email,
      fromName: data.from_name ?? null,
      replyTo: data.reply_to ?? null,
      domain: data.message_id_domain ?? null,
    };
  } catch (err) {
    console.error("[email-send] Failed to fetch SMTP override:", String(err));
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // 1. CORS preflight
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // 2. Method gate
  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // 3. Auth — Supabase JWT verification
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const encryptionKey = Deno.env.get("SMTP_ENCRYPTION_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[email-send] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return json({ success: false, error: "INTERNAL_ERROR" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  // 4. Health probe short-circuit
  if (req.headers.get("X-Health-Probe") === "1") {
    return json({ success: true, probe: true }, 200);
  }

  // 5. Rate limiting (per authenticated user)
  if (!checkRateLimit(user.id)) {
    return json({ success: false, error: "RATE_LIMITED", retryable: true }, 429);
  }

  // 6. Parse and validate request body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ success: false, error: "INVALID_JSON" }, 400);
  }

  const validation = validatePayload(rawBody);
  if (!validation.valid) {
    return json({ success: false, error: validation.error }, 400);
  }

  // 7. Read upstream config from Vault
  const emailRouterUrl = Deno.env.get("EMAIL_ROUTER_URL");
  const emailRouterApiKey = Deno.env.get("EMAIL_ROUTER_INGEST_KEY") ?? Deno.env.get("EMAIL_ROUTER_API_KEY");

  if (!emailRouterUrl || !emailRouterApiKey) {
    console.error("[email-send] Missing EMAIL_ROUTER_URL or EMAIL_ROUTER_INGEST_KEY in Vault");
    return json({ success: false, error: "EMAIL_SERVICE_UNAVAILABLE" }, 503);
  }

  // 8. Fetch user's custom SMTP settings (if configured + verified)
  //    This enables real delivery from user's own Gmail/Yandex/Outlook/SMTP
  let smtpOverride: SmtpOverride | null = null;
  if (serviceRoleKey && encryptionKey.length >= 64) {
    smtpOverride = await getUserSmtpOverride(supabaseUrl, serviceRoleKey, encryptionKey, user.id);
  }

  // 9. Build the upstream payload
  //    If using user's SMTP override, enforce from_email = user's configured from_email
  //    (prevents From-header spoofing when user tries to set from to someone else)
  const upstreamPayload: Record<string, unknown> = { ...validation.payload };

  if (smtpOverride) {
    // Enforce from address — user's SMTP must match their configured from_email
    upstreamPayload["from"] = smtpOverride.from;
    if (smtpOverride.fromName) upstreamPayload["fromName"] = smtpOverride.fromName;
    if (smtpOverride.replyTo) upstreamPayload["replyTo"] = smtpOverride.replyTo;
    // Inject SMTP override (server-only, never visible to client)
    upstreamPayload["smtp_override"] = {
      host: smtpOverride.host,
      port: smtpOverride.port,
      user: smtpOverride.user,
      pass: smtpOverride.pass,
      secure: smtpOverride.secure,
      domain: smtpOverride.domain,
    };
  }

  // 10. Proxy to email-router
  let upstreamResponse: Response;
  try {
    const upstreamUrl = `${emailRouterUrl.replace(/\/$/, "")}/v1/email/send`;
    upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-key": emailRouterApiKey,
        "X-Forwarded-User": user.id, // audit trail
      },
      body: JSON.stringify(upstreamPayload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    console.error("[email-send] Upstream fetch failed:", isTimeout ? "timeout" : String(err));
    return json({
      success: false,
      error: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
      retryable: true,
    }, 502);
  }

  // 11. Parse upstream response
  let upstreamData: unknown;
  try {
    upstreamData = await upstreamResponse.json();
  } catch {
    upstreamData = { success: false, error: "UPSTREAM_INVALID_RESPONSE" };
  }

  // 5xx from upstream → 502 to client (don't leak SMTP details)
  if (upstreamResponse.status >= 500) {
    console.error("[email-send] Upstream returned", upstreamResponse.status, "for user", user.id);
    return json({ success: false, error: "UPSTREAM_ERROR", retryable: true }, 502);
  }

  return json(upstreamData, upstreamResponse.status);
});
