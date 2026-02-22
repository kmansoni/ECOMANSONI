// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import {
  handleCors,
  getCorsHeaders,
  checkRateLimit,
  getClientId,
  rateLimitResponse,
  errorResponse,
} from "../_shared/utils.ts";

const DEFAULT_OWNER_USER_ID = "c8e6756f-a17c-48b0-abf1-77d8f942bfc8";
const DEFAULT_ASSISTANT_EMAIL = "ai.assistant@mansoni.bot";
const DEFAULT_ASSISTANT_NAME = "AI";

// NOTE: This function is safe to expose to any authenticated user because it only
// provisions (or returns) the single shared AI assistant user.

function randomPassword(): string {
  // Enough for admin-created user; they won't log in interactively.
  return `ai_${crypto.randomUUID()}_${Date.now()}`;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const clientId = getClientId(req);
    const rateLimit = checkRateLimit(clientId);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.resetIn, origin);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return errorResponse("Server not configured", 500, origin);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return errorResponse("Missing Authorization header", 401, origin);
    }

    const assistantEmail = Deno.env.get("AI_ASSISTANT_EMAIL") || DEFAULT_ASSISTANT_EMAIL;
    const assistantName = Deno.env.get("AI_ASSISTANT_NAME") || DEFAULT_ASSISTANT_NAME;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return errorResponse(userErr?.message || "Invalid token", 401, origin);
    }

    // Any authenticated user may call.

    // 1) If explicitly configured, just return.
    const configuredAssistantId = Deno.env.get("AI_ASSISTANT_USER_ID");
    if (configuredAssistantId) {
      return new Response(JSON.stringify({ ok: true, ai_user_id: configuredAssistantId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Try to find existing user by email.
    let aiUserId: string | null = null;
    try {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = (list?.users || []).find((u) => (u.email || "").toLowerCase() === assistantEmail.toLowerCase());
      if (existing?.id) aiUserId = existing.id;
    } catch {
      // ignore; will attempt create
    }

    // 3) Create if missing.
    if (!aiUserId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: assistantEmail,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: {
          display_name: assistantName,
          is_ai_assistant: true,
        },
      });

      if (createErr || !created?.user?.id) {
        return errorResponse(createErr?.message || "Failed to create assistant user", 500, origin);
      }

      aiUserId = created.user.id;
    }

    // Best-effort profile upsert (columns differ across migrations; keep minimal)
    await admin
      .from("profiles")
      .upsert(
        {
          user_id: aiUserId,
          display_name: assistantName,
        },
        { onConflict: "user_id" },
      );

    return new Response(JSON.stringify({ ok: true, ai_user_id: aiUserId }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (e) {
    console.error("ensure-ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
