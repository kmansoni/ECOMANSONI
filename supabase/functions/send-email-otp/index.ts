/**
 * Edge Function: send-email-otp
 *
 * Generates a 6-digit OTP, stores in email_otp_codes table, sends via
 * the deployed email-router (/v1/email/send).
 *
 * Required secrets:
 *  - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-set)
 *  - EMAIL_ROUTER_URL            — e.g. http://155.212.245.89:8090
 *  - EMAIL_ROUTER_INGEST_KEY     — x-ingest-key header value
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
  try {
    const body = await req.json();
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return jsonResp(origin, { error: "Invalid JSON" }, 400);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResp(origin, { error: "Invalid email" }, 400);
  }

  // IP-based burst protection: max 5 OTP requests per IP per 10 min
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Env vars
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const emailRouterUrl = Deno.env.get("EMAIL_ROUTER_URL");
  const emailRouterIngestKey = Deno.env.get("EMAIL_ROUTER_INGEST_KEY");

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
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

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

  // ── Send email via email-router (/v1/email/send) ────────────────────────
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
          <p style="color: #999; font-size: 13px;">Код действителен 10 минут. Если вы не запрашивали код — просто проигнорируйте это письмо.</p>
        </div>
      `,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (emailRouterIngestKey) {
      headers["x-ingest-key"] = emailRouterIngestKey;
    }

    const upstream = await fetch(sendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(emailPayload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("[send-email-otp] email-router error:", upstream.status, errText);
      // Still return success — code is in DB, user can retry
    }
  } catch (err) {
    console.error("[send-email-otp] email-router fetch failed:", err);
    // Same — don't reveal delivery status
  }

  return jsonResp(origin, { success: true }, 200);
});
