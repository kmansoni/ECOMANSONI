// Deno Edge Function: Recovery Email
// POST { action: "send-code", email: string }
// POST { action: "verify", code: string }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_ROUTER_URL = Deno.env.get("EMAIL_ROUTER_URL") ?? "http://email-router:3100/api/v1/send";

function resolveEmailRouterSendUrl(emailRouterUrl: string): string {
  const normalized = emailRouterUrl.replace(/\/+$/, "");
  if (/\/send$/i.test(normalized)) return normalized;
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

async function sha256hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSixDigitCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const code = (arr[0] % 900000) + 100000; // 100000–999999
  return code.toString();
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("Origin");
  const preferredEmailRouterKey = Deno.env.get("EMAIL_ROUTER_INGEST_KEY");
  const legacyEmailRouterKey = Deno.env.get("EMAIL_ROUTER_API_KEY");
  const emailRouterIngestKey = preferredEmailRouterKey ?? legacyEmailRouterKey;
  const otpFromEmail = Deno.env.get("EMAIL_OTP_FROM_EMAIL") ?? "auth@mansoni.ru";
  const otpReplyTo = Deno.env.get("EMAIL_OTP_REPLY_TO") ?? "support@masnoni.ru";
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const userId = user.id;

  let body: { action: string; email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { action } = body;

  // ── SEND CODE ──────────────────────────────────────────────────────────────
  if (action === "send-code") {
    const { email } = body;
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpFromEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpReplyTo)) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const rawCode = generateSixDigitCode();
    const shortCode = rawCode.slice(0, 3) + " " + rawCode.slice(3);
    const codeHash = await sha256hex(rawCode);
    const otpTtlMinutes = 15;
    const expiresAt = new Date(Date.now() + otpTtlMinutes * 60 * 1000).toISOString();

    // Upsert recovery_emails record (service_role bypasses RLS)
    const { error: upsertError } = await supabase
      .from("recovery_emails")
      .upsert(
        {
          user_id: userId,
          email: email.toLowerCase().trim(),
          verified: false,
          verification_code: codeHash,
          code_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Send email via email-router
    try {
      const sendUrl = resolveEmailRouterSendUrl(EMAIL_ROUTER_URL);
      const timeoutRaw = Number(Deno.env.get("EMAIL_ROUTER_TIMEOUT_MS") ?? "8000");
      const emailRouterTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 3000 && timeoutRaw <= 12000
        ? Math.floor(timeoutRaw)
        : 8000;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (emailRouterIngestKey) {
        headers["x-ingest-key"] = emailRouterIngestKey;
        headers["X-API-Key"] = emailRouterIngestKey;
      }

      await fetch(sendUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: email,
          from: otpFromEmail,
          subject: `Masnoni - код подтверждения Recovery Email: ${shortCode}`,
          text: buildPremiumOtpText(shortCode, otpTtlMinutes),
          html: buildPremiumOtpHtml(shortCode, otpTtlMinutes),
          headers: {
            "X-Transactional-Email": "true",
            "Reply-To": otpReplyTo,
          },
        }),
        signal: AbortSignal.timeout(emailRouterTimeoutMs),
      });
    } catch (emailError) {
      console.error("Email send failed:", emailError);
      // Do NOT expose email delivery error to client (timing oracle)
    }

    return new Response(JSON.stringify({ success: true, expiresAt }), {
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ── VERIFY CODE ────────────────────────────────────────────────────────────
  if (action === "verify") {
    const { code } = body;
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return new Response(JSON.stringify({ error: "6-digit code required" }), {
        status: 400,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const { data: record, error: fetchError } = await supabase
      .from("recovery_emails")
      .select("verification_code, code_expires_at, verified")
      .eq("user_id", userId)
      .single();

    if (fetchError || !record) {
      return new Response(JSON.stringify({ error: "No pending verification found" }), {
        status: 404,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    if (record.verified) {
      return new Response(JSON.stringify({ error: "Already verified" }), {
        status: 409,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    if (!record.code_expires_at || new Date(record.code_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Code expired" }), {
        status: 410,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const inputHash = await sha256hex(code);
    // Constant-time comparison not possible in pure JS, use hash equality (SHA-256 output length is fixed)
    if (inputHash !== record.verification_code) {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 400,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Mark verified, remove code
    const { error: updateError } = await supabase
      .from("recovery_emails")
      .update({
        verified: true,
        verification_code: null,
        code_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, verified: true }), {
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown action. Use send-code or verify" }), {
    status: 400,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
});
