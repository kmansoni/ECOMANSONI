// Deno Edge Function: Recovery Email
// POST { action: "send-code", email: string }
// POST { action: "verify", code: string }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_ROUTER_URL = Deno.env.get("EMAIL_ROUTER_URL") ?? "http://email-router:3100/api/v1/send";

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

    const rawCode = generateSixDigitCode();
    const codeHash = await sha256hex(rawCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

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
      await fetch(EMAIL_ROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: "Mansoni — код подтверждения Recovery Email",
          text: `Ваш код подтверждения: ${rawCode}\n\nКод действителен 15 минут.\nЕсли вы не запрашивали этот код — проигнорируйте письмо.`,
          html: `<p>Ваш код подтверждения: <strong>${rawCode}</strong></p><p>Код действителен 15 минут.<br>Если вы не запрашивали этот код — проигнорируйте письмо.</p>`,
        }),
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
