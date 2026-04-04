// Deno Edge Function: AI Assistant
// POST { message: string, conversationId?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const FREE_DAILY_LIMIT = 20;
const SYSTEM_PROMPT =
  "Ты — AI-ассистент платформы Mansoni. Помогай пользователям с вопросами, переводами, написанием текстов. Отвечай кратко и по делу.";

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");

  // 1. Verify JWT
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

  // 2. Parse body
  let body: { message: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { message, conversationId } = body;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // 3. Check and update usage limits (upsert with atomic increment)
  const now = new Date();

  // Get or create usage record
  const { data: usageRow } = await supabase
    .from("ai_usage_limits")
    .select("*")
    .eq("user_id", userId)
    .single();

  let dailyUsed = 0;
  let isPremium = false;
  let dailyResetAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  if (usageRow) {
    isPremium = usageRow.is_premium ?? false;
    // Check if reset is needed
    if (new Date(usageRow.daily_reset_at) <= now) {
      // Reset counter
      await supabase
        .from("ai_usage_limits")
        .update({
          daily_messages_used: 0,
          daily_reset_at: dailyResetAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("user_id", userId);
      dailyUsed = 0;
    } else {
      dailyUsed = usageRow.daily_messages_used ?? 0;
      dailyResetAt = new Date(usageRow.daily_reset_at);
    }
  }

  const dailyLimit = isPremium ? Infinity : FREE_DAILY_LIMIT;

  if (!isPremium && dailyUsed >= FREE_DAILY_LIMIT) {
    return new Response(
      JSON.stringify({
        error: "Daily limit reached",
        remainingMessages: 0,
        dailyLimit: FREE_DAILY_LIMIT,
      }),
      {
        status: 429,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      }
    );
  }

  // 4. Load last 10 context messages
  const contextQuery = supabase
    .from("ai_chat_messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (conversationId) {
    contextQuery.eq("conversation_id", conversationId);
  } else {
    contextQuery.is("conversation_id", null);
  }

  const { data: historyRows } = await contextQuery;
  const history = (historyRows ?? []).reverse();

  // 5. Build OpenAI messages
  const openaiMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h: { role: string; content: string }) => ({
      role: h.role as "user" | "assistant" | "system",
      content: h.content,
    })),
    { role: "user", content: message.trim() },
  ];

  // 6. Call OpenAI
  let aiReply = "";
  let tokensUsed = 0;

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error("OpenAI error:", errText);
    return new Response(JSON.stringify({ error: "AI service error" }), {
      status: 502,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const openaiData = await openaiRes.json();
  aiReply = openaiData.choices?.[0]?.message?.content ?? "";
  tokensUsed = openaiData.usage?.total_tokens ?? 0;

  // 7. Save user message
  await supabase.from("ai_chat_messages").insert({
    user_id: userId,
    conversation_id: conversationId ?? null,
    role: "user",
    content: message.trim(),
    tokens_used: 0,
    model: "gpt-4o-mini",
  });

  // 8. Save assistant response
  await supabase.from("ai_chat_messages").insert({
    user_id: userId,
    conversation_id: conversationId ?? null,
    role: "assistant",
    content: aiReply,
    tokens_used: tokensUsed,
    model: "gpt-4o-mini",
  });

  // 9. Update usage limits
  const newDailyUsed = dailyUsed + 1;
  if (usageRow) {
    await supabase
      .from("ai_usage_limits")
      .update({
        daily_messages_used: newDailyUsed,
        total_tokens_used: (usageRow.total_tokens_used ?? 0) + tokensUsed,
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);
  } else {
    await supabase.from("ai_usage_limits").insert({
      user_id: userId,
      daily_messages_used: 1,
      daily_reset_at: dailyResetAt.toISOString(),
      total_tokens_used: tokensUsed,
      is_premium: false,
      updated_at: now.toISOString(),
    });
  }

  const remainingMessages = isPremium ? null : Math.max(0, FREE_DAILY_LIMIT - newDailyUsed);

  return new Response(
    JSON.stringify({ reply: aiReply, tokensUsed, remainingMessages }),
    { headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" } }
  );
});
