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

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function isGmailOrIcloudDomain(domain: string): boolean {
  return domain === "gmail.com" || domain === "googlemail.com" || domain === "icloud.com" || domain === "me.com" || domain === "mac.com";
}

function resolveEmailRouterSendUrl(emailRouterUrl: string): string {
  const normalized = emailRouterUrl.replace(/\/+$/, "");
  if (/\/v1\/email\/send$/i.test(normalized)) return normalized;
  if (/\/(api\/)?v1\/send$/i.test(normalized)) {
    return normalized.replace(/\/(api\/)?v1\/send$/i, "/v1/email/send");
  }
  if (/\/v1\/email$/i.test(normalized)) return `${normalized}/send`;
  if (/\/send$/i.test(normalized)) {
    return normalized.replace(/\/send$/i, "/v1/email/send");
  }
  return `${normalized}/v1/email/send`;
}

function buildPremiumOtpHtml(codeSpaced: string, ttlMinutes: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Код подтверждения</title>
</head>
<body style="background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1a 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px;">
  <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 32px; padding: 48px; max-width: 420px; margin: 0 auto; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);">
    <div style="font-size: 26px; font-weight: 700; letter-spacing: 6px; color: #ffffff; text-align: center; margin-bottom: 4px;">MASNONI</div>
    <div style="text-align: center; color: rgba(255, 255, 255, 0.4); font-size: 11px; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 40px;">Подтверждение входа</div>

    <div style="text-align: center; color: rgba(255, 255, 255, 0.9); font-size: 16px; margin-bottom: 8px;">Здравствуйте!</div>
    <div style="text-align: center; color: rgba(255, 255, 255, 0.5); font-size: 14px; margin-bottom: 32px; line-height: 1.5;">Введите код для завершения входа в систему:</div>

    <div style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 28px; text-align: center; margin-bottom: 16px;">
      <div style="font-family: 'SF Mono', 'Fira Code', Consolas, monospace; font-size: 40px; font-weight: 600; letter-spacing: 14px; color: #ffffff; text-shadow: 0 0 40px rgba(255, 255, 255, 0.4); margin-left: 14px;">${codeSpaced}</div>
    </div>

    <div style="text-align: center; color: rgba(255, 255, 255, 0.4); font-size: 12px; margin-bottom: 32px;">Код действителен ${ttlMinutes} минут</div>

    <div style="background: rgba(255, 183, 77, 0.06); border: 1px solid rgba(255, 183, 77, 0.15); border-radius: 16px; padding: 24px; margin-bottom: 32px;">
      <div style="color: #FFB74D; font-size: 12px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px;">Важно</div>
      <div style="color: rgba(255, 255, 255, 0.7); font-size: 14px; line-height: 1.7; margin-bottom: 12px;">Этот код - <strong style="color: rgba(255, 255, 255, 0.9);">конфиденциальная информация</strong>.</div>
      <div style="color: rgba(255, 255, 255, 0.7); font-size: 14px; line-height: 1.7; margin-bottom: 12px;"><strong style="color: rgba(255, 255, 255, 0.9);">Не сообщайте его третьим лицам.</strong></div>
      <div style="height: 1px; background: rgba(255, 255, 255, 0.1); margin: 16px 0;"></div>
      <div style="color: rgba(255, 255, 255, 0.7); font-size: 14px; line-height: 1.7; margin-bottom: 12px;">Использование чужого кода без согласия владельца - <strong style="color: rgba(255, 255, 255, 0.9);">нарушение закона</strong> (ст. 272 УК РФ).</div>
      <div style="height: 1px; background: rgba(255, 255, 255, 0.1); margin: 16px 0;"></div>
      <div style="color: rgba(255, 255, 255, 0.7); font-size: 14px; line-height: 1.7;">Получили код случайно? <strong style="color: rgba(255, 255, 255, 0.9);">Проигнорируйте</strong> это письмо и сообщите нам: <a href="mailto:support@masnoni.ru" style="color: rgba(255, 183, 77, 0.9); text-decoration: none;">support@masnoni.ru</a></div>
    </div>

    <div style="text-align: center; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.06);">
      <div style="color: rgba(255, 255, 255, 0.6); font-size: 14px; margin-bottom: 8px;">С уважением, команда Masnoni</div>
      <div style="color: rgba(255, 255, 255, 0.4); font-size: 12px;">Ваша технологическая экосистема</div>
      <div style="color: rgba(255, 255, 255, 0.3); font-size: 11px; margin-top: 4px;">masnoni.ru</div>
    </div>
  </div>
</body>
</html>`;
}

function buildPremiumOtpText(codeSpaced: string, ttlMinutes: number): string {
  return [
    "MASNONI - код подтверждения входа",
    "",
    "Здравствуйте!",
    "Введите код для завершения входа в систему:",
    "",
    `Код: ${codeSpaced}`,
    `Код действителен ${ttlMinutes} минут.`,
    "",
    "Важно:",
    "Этот код - конфиденциальная информация.",
    "Не сообщайте его третьим лицам.",
    "Использование чужого кода без согласия владельца - нарушение закона (ст. 272 УК РФ).",
    "Если получили код случайно - проигнорируйте письмо и напишите нам: support@masnoni.ru",
  ].join("\n");
}

async function cleanupOtpCode(
  supabase: ReturnType<typeof createClient>,
  email: string,
  code: string,
): Promise<void> {
  const { error } = await supabase
    .from("email_otp_codes")
    .delete()
    .eq("email", email)
    .eq("code", code);

  if (error) {
    console.error("[send-email-otp] Failed to cleanup OTP after delivery error:", error);
  }
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
  const otpFromEmail = Deno.env.get("EMAIL_OTP_FROM_EMAIL") ?? "auth@mansoni.ru";
  const otpReplyTo = Deno.env.get("EMAIL_OTP_REPLY_TO") ?? "support@masnoni.ru";
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpFromEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpReplyTo)) {
    return jsonResp(origin, { error: "Server not configured" }, 500);
  }

  // ── DB-based cooldown between sends per email (configurable) ────────────
  const cooldownSecRaw = Number(Deno.env.get("EMAIL_OTP_COOLDOWN_SEC") ?? "30");
  const COOLDOWN_SEC = Number.isFinite(cooldownSecRaw) && cooldownSecRaw >= 10 && cooldownSecRaw <= 300
    ? Math.floor(cooldownSecRaw)
    : 30;
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
    const primarySendUrl = resolveEmailRouterSendUrl(emailRouterUrl);
    const sendUrlCandidates = Array.from(new Set([
      primarySendUrl,
      primarySendUrl.replace(/\/v1\/email\/send$/i, "/send"),
    ]));
    const recipientDomain = emailDomain(email);
    const isPriorityMailbox = isGmailOrIcloudDomain(recipientDomain);
    const maxAttemptsRaw = Number(Deno.env.get("EMAIL_OTP_MAX_ATTEMPTS") ?? "8");
    const otpMaxAttemptsBase = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw >= 3 && maxAttemptsRaw <= 20
      ? Math.floor(maxAttemptsRaw)
      : 8;
    const otpMaxAttempts = isPriorityMailbox ? Math.min(20, Math.max(otpMaxAttemptsBase, 10)) : otpMaxAttemptsBase;

    const shortCode = code.slice(0, 3) + " " + code.slice(3);
    const timeoutRaw = Number(Deno.env.get("EMAIL_ROUTER_TIMEOUT_MS") ?? "8000");
    const emailRouterTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 3000 && timeoutRaw <= 12000
      ? Math.floor(timeoutRaw)
      : 8000;

    const emailPayload = {
      to: email,
      from: otpFromEmail,
      subject: `Masnoni - код подтверждения: ${shortCode}`,
      maxAttempts: otpMaxAttempts,
      priority: 1,
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
        "X-Transactional-Email": "true",
        "X-Priority": "1 (Highest)",
        "Importance": "high",
        "Precedence": "bulk",
        "X-MSMail-Priority": "High",
        "X-Mailer": "Masnoni-OTP/1.0",
        "Reply-To": otpReplyTo,
      },
      html: buildPremiumOtpHtml(shortCode, otpTtlMinutes),
      text: buildPremiumOtpText(shortCode, otpTtlMinutes),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (emailRouterIngestKey) {
      headers["x-ingest-key"] = emailRouterIngestKey;
      headers["X-API-Key"] = emailRouterIngestKey;
    }

    console.info("[send-email-otp] Sending OTP email", {
      recipient: maskEmail(email),
      recipientDomain,
      isPriorityMailbox,
      otpMaxAttempts,
      emailRouterTimeoutMs,
      sendUrlCandidates,
      hasIngestKey: Boolean(emailRouterIngestKey),
      keySource: emailRouterKeySource,
      otpFromEmail,
      otpReplyTo,
    });

    let delivered = false;
    let lastFailure: { status: number; sendUrl: string; body: string } | null = null;

    for (const sendUrl of sendUrlCandidates) {
      const upstream = await fetch(sendUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(emailPayload),
        signal: AbortSignal.timeout(emailRouterTimeoutMs),
      });

      if (upstream.ok) {
        console.info("[send-email-otp] email-router accepted request", {
          status: upstream.status,
          sendUrl,
          recipient: maskEmail(email),
        });
        delivered = true;
        break;
      }

      const errText = await upstream.text().catch(() => "");
      lastFailure = { status: upstream.status, sendUrl, body: errText };

      // Compatibility fallback for legacy routers exposing /send only.
      if (upstream.status === 404 || upstream.status === 405) {
        console.warn("[send-email-otp] email-router endpoint rejected, trying next candidate", {
          status: upstream.status,
          sendUrl,
        });
        continue;
      }

      break;
    }

    if (!delivered) {
      console.error("[send-email-otp] email-router error:", lastFailure ?? {
        status: "unknown",
        sendUrl: sendUrlCandidates[0],
        body: "",
      });
      await cleanupOtpCode(supabase, email, code);
      return jsonResp(origin, {
        error: "Email service unavailable",
        message: "Сервис отправки писем временно недоступен. Повторите попытку позже.",
      }, 503);
    }
  } catch (err) {
    console.error("[send-email-otp] email-router fetch failed:", err);
    await cleanupOtpCode(supabase, email, code);
    return jsonResp(origin, {
      error: "Email service unavailable",
      message: "Сервис отправки писем временно недоступен. Повторите попытку позже.",
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
