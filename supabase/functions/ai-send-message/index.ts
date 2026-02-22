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

// Authorization model:
// - Caller must be authenticated
// - Caller must be a participant of the conversation
// - AI must be a participant of the conversation

async function resolveAssistantUserId(admin: ReturnType<typeof createClient>): Promise<string> {
  const configured = Deno.env.get("AI_ASSISTANT_USER_ID");
  if (configured) return configured;

  const assistantEmail = Deno.env.get("AI_ASSISTANT_EMAIL") || DEFAULT_ASSISTANT_EMAIL;
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = (data?.users || []).find((u) => (u.email || "").toLowerCase() === assistantEmail.toLowerCase());
  if (!existing?.id) {
    throw new Error("AI assistant user is not provisioned. Call ensure-ai-assistant first.");
  }
  return existing.id;
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

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const conversationId = String((body as any)?.conversation_id ?? "").trim();
    const content = String((body as any)?.content ?? "").trim();
    if (!conversationId) return errorResponse("conversation_id is required", 400, origin);
    if (!content) return errorResponse("content is required", 400, origin);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return errorResponse(userErr?.message || "Invalid token", 401, origin);
    }

    // Caller must be a participant.
    const { data: partRow, error: partErr } = await admin
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (partErr) return errorResponse(partErr.message, 500, origin);
    if (!partRow?.id) return errorResponse("Forbidden", 403, origin);

    const assistantUserId = await resolveAssistantUserId(admin);

    // Assistant must also be in the conversation.
    const { data: aiPart, error: aiPartErr } = await admin
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", assistantUserId)
      .maybeSingle();

    if (aiPartErr) return errorResponse(aiPartErr.message, 500, origin);
    if (!aiPart?.id) return errorResponse("AI is not a participant", 400, origin);

    const { data: inserted, error: insErr } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: assistantUserId,
        content,
        is_read: false,
      })
      .select("id")
      .single();

    if (insErr) return errorResponse(insErr.message, 500, origin);

    return new Response(JSON.stringify({ ok: true, message_id: inserted?.id }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (e) {
    console.error("ai-send-message error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
