/**
 * Edge Function: send-email-otp
 *
 * Generates a 6-digit OTP, stores in email_otp_codes table, sends via
 * the deployed email-router (/v1/email/send).
 *
 * Accepts either:
 *  - { email }          — send OTP directly to given email
 *  - { phone }          — lookup profile by phone, send OTP to stored email
 *  - { phone, email }   — registration flow: send OTP to given email
 *
 * Required secrets:
 *  - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-set)
 *  - EMAIL_ROUTER_URL            — e.g. http://155.212.245.89:8090
 *  - EMAIL_ROUTER_INGEST_KEY     — preferred x-ingest-key header value for VPS email-router
 *  - EMAIL_ROUTER_API_KEY        — legacy alias supported for compatibility
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

function jsonResp(origin: string | null, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}

// Crypto-safe 6-digit OTP
function generateOTP(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

/** Mask email: "user@example.com" → "u***@example.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${local[1]}${"*".repeat(Math.min(local.length - 2, 6))}@${domain}`;
}

/** Normalize phone to digits only, ensure starts with country code */
function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // Russian numbers: 8xxx → 7xxx
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }
  return digits;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const origin = req.headers.get("origin");

  if (req.method !== "POST") {
    return jsonResp(origin, { error: "Method not allowed" }, 405);
  }

  // Parse body
  let email: string;
  let phone: string | undefined;
  let maskedEmailForResponse: string | undefined;
  try {
    const body = await req.json();
    email = (body.email ?? "").trim().toLowerCase();
    phone = body.phone ? String(body.phone).trim() : undefined;
  } catch {
    return jsonResp(origin, { error: "Invalid JSON" }, 400);
  }

  // Env vars
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const emailRouterUrl = Deno.env.get("EMAIL_ROUTER_URL");
  const preferredEmailRouterKey = Deno.env.get("EMAIL_ROUTER_INGEST_KEY");
  const legacyEmailRouterKey = Deno.env.get("EMAIL_ROUTER_API_KEY");
  const emailRouterIngestKey = preferredEmailRouterKey ?? legacyEmailRouterKey;
  const emailRouterKeySource = preferredEmailRouterKey
    ? "EMAIL_ROUTER_INGEST_KEY"
    : legacyEmailRouterKey
      ? "EMAIL_ROUTER_API_KEY"
      : null;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[send-email-otp] Missing SUPABASE env vars");
    return jsonResp(origin, { error: "Server not configured" }, 500);
  }
  if (!emailRouterUrl) {
    console.error("[send-email-otp] Missing EMAIL_ROUTER_URL");
    return jsonResp(origin, { error: "Email service unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── Phone-based login: look up email from profiles ──────────────────────
  if (phone && !email) {
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      return jsonResp(origin, { error: "Invalid phone number" }, 400);
    }

    // Search profiles by phone (try multiple formats)
    const phoneCandidates = [digits, `+${digits}`, `+7${digits.slice(1)}`];
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, phone")
      .or(phoneCandidates.map((p) => `phone.eq.${p}`).join(","))
      .limit(1)
      .maybeSingle();

    if (!profile?.email) {
      return jsonResp(origin, { error: "not_found", message: "Аккаунт не найден. Пройдите регистрацию." }, 404);
    }

    email = profile.email.trim().toLowerCase();
    maskedEmailForResponse = maskEmail(email);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResp(origin, { error: "Invalid email" }, 400);
  }

  // ── DB-based cooldown: 60 sec between sends per email ───────────────────
  const COOLDOWN_SEC = 60;
  const { data: existing } = await supabase
    .from("email_otp_codes")
    .select("created_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.created_at) {
    const elapsed = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
    if (elapsed < COOLDOWN_SEC) {
      const retryAfter = Math.ceil(COOLDOWN_SEC - elapsed);
      return jsonResp(origin,
        { error: "Too many requests", retryAfter },
        429,
      );
    }
  }

  // ── Delete previous codes for this email ────────────────────────────────
  await supabase.from("email_otp_codes").delete().eq("email", email);

  // ── Generate & store new OTP ────────────────────────────────────────────
  // Keep TTL configurable but bounded to avoid extreme values from env.
  const ttlMinutesRaw = Number(Deno.env.get("EMAIL_OTP_TTL_MIN") ?? "15");
  const otpTtlMinutes = Number.isFinite(ttlMinutesRaw) && ttlMinutesRaw >= 5 && ttlMinutesRaw <= 30
    ? Math.floor(ttlMinutesRaw)
    : 15;

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + otpTtlMinutes * 60 * 1000);

  const { error: insertError } = await supabase.from("email_otp_codes").insert({
    email,
    code,
    expires_at: expiresAt.toISOString(),
    attempts: 0,
  });

  if (insertError) {
    console.error("[send-email-otp] Insert error:", insertError);
    return jsonResp(origin, { error: "Failed to generate code" }, 500);
  }

  // ── Send email via email-router ─────────────────────────────────────────
  //
  // Production VPS currently serves the TypeScript router build and accepts:
  //   POST /v1/email/send
  //
  // Keep the route explicit here so OTP flow matches the deployed router.
  try {
    const sendUrl = `${emailRouterUrl.replace(/\/$/, "")}/v1/email/send`;
    const emailPayload = {
      to: email,
      subject: `Код подтверждения: ${code}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #1a1a1a; margin-bottom: 8px;">Код подтверждения</h2>
          <p style="color: #666; font-size: 15px; margin-bottom: 24px;">Используйте этот код для входа в приложение:</p>
          <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #18181b;">${code}</span>
          </div>
          <p style="color: #999; font-size: 13px;">Код действителен ${otpTtlMinutes} минут. Если вы не запрашивали код — просто проигнорируйте это письмо.</p>
        </div>
      `,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (emailRouterIngestKey) {
      headers["x-ingest-key"] = emailRouterIngestKey;
    }

    console.info("[send-email-otp] Sending OTP email", {
      recipient: maskEmail(email),
      sendUrl,
      hasIngestKey: Boolean(emailRouterIngestKey),
      keySource: emailRouterKeySource,
    });

    const upstream = await fetch(sendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(emailPayload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("[send-email-otp] email-router error:", {
        status: upstream.status,
        sendUrl,
        body: errText,
      });
      // Delivery was not accepted — remove OTP so user can retry immediately.
      await supabase.from("email_otp_codes").delete().eq("email", email);
      return jsonResp(origin, {
        error: "OTP_DELIVERY_FAILED",
        message: "Не удалось отправить код. Попробуйте еще раз.",
      }, 502);
    } else {
      console.info("[send-email-otp] email-router accepted request", {
        status: upstream.status,
        sendUrl,
        recipient: maskEmail(email),
      });
    }
  } catch (err) {
    console.error("[send-email-otp] email-router fetch failed:", err);
    // Delivery was not attempted successfully — remove OTP so user can retry.
    await supabase.from("email_otp_codes").delete().eq("email", email);
    return jsonResp(origin, {
      error: "OTP_DELIVERY_FAILED",
      message: "Сервис отправки недоступен. Попробуйте еще раз.",
    }, 503);
  }

  const resp: Record<string, unknown> = { success: true };
  if (maskedEmailForResponse) {
    resp.maskedEmail = maskedEmailForResponse;
  }
  // Also return the actual email so verify-email-otp can use it
  // (only when phone-based login — the frontend needs it for verify call)
  if (phone && !maskedEmailForResponse) {
    // email was provided directly (registration flow) — don't expose
  } else if (phone) {
    resp.email = email;
  }
  return jsonResp(origin, resp, 200);
});
