/**
 * aria-memory: ARIA Long-Term Memory API
 *
 * Handles memory persistence for ARIA AI assistant:
 *  - save   → extract facts from conversation, embed, store
 *  - search → semantic similarity search over user memories
 *  - forget → delete all memories for authenticated user
 *
 * Requires: pgvector extension + aria_memories table (migration 20260330200000)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCors,
  getCorsHeaders,
  checkRateLimit,
  getClientId,
  rateLimitResponse,
  errorResponse,
} from "../_shared/utils.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SaveRequest {
  action: "save";
  conversation_id: string;
  user_message: string;
  assistant_message: string;
  intent?: string;
  model?: string;
}

interface SearchRequest {
  action: "search";
  query: string;
  limit?: number;
  threshold?: number;
}

interface ForgetRequest {
  action: "forget";
}

type RequestBody = SaveRequest | SearchRequest | ForgetRequest;

interface MemoryRow {
  id: string;
  content: string;
  topic: string | null;
  importance: number;
  similarity: number;
}

// ─── Env ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
const AI_API_URL = Deno.env.get("AI_API_URL") ?? "https://api.mansoni.ru/v1/chat/completions";
const EMBED_URL = AI_API_URL.replace(/\/chat\/completions$/, "/embeddings");

// ─── Memory extraction prompt ─────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a memory extractor for an AI assistant.
Given a conversation exchange, extract 1-5 key facts about the USER ONLY.
Extract ONLY: skills, preferences, projects, goals, expertise level, tech stack, explicit statements.
Do NOT extract: assistant facts, general knowledge, opinions that aren't user preferences.
Format: one fact per line. Start each line with "User ".
Examples:
User prefers TypeScript over JavaScript for new projects.
User is building an e-commerce platform with Supabase.
User has 5 years of Python experience.
If no useful facts can be extracted, reply with exactly: NONE`;

// ─── Embedding generation ─────────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!AI_API_KEY) return null;
  try {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 2000),
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ─── Fact extraction via LLM ──────────────────────────────────────────────────

async function extractFacts(userMsg: string, assistantMsg: string): Promise<string[]> {
  if (!AI_API_KEY) return [];
  try {
    const res = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          {
            role: "user",
            content: `User said: "${userMsg.slice(0, 800)}"\n\nAssistant replied: "${assistantMsg.slice(0, 400)}"`,
          },
        ],
        max_tokens: 300,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];
    const json = await res.json();
    const text: string = json.choices?.[0]?.message?.content ?? "";

    if (text.trim() === "NONE") return [];

    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("User ") && l.length > 10 && l.length < 300)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ─── Topic classifier ─────────────────────────────────────────────────────────

function inferTopic(content: string): string {
  const lower = content.toLowerCase();
  if (/\b(code|python|typescript|javascript|react|sql|docker|git|api|function|class)\b/.test(lower)) return "code";
  if (/\b(security|vulnerability|xss|injection|auth|jwt|encryption|owasp)\b/.test(lower)) return "security";
  if (/\b(data|pandas|numpy|ml|machine learning|model|statistics|analysis)\b/.test(lower)) return "data";
  if (/\b(write|document|email|article|translate|text|spec|prd)\b/.test(lower)) return "writing";
  if (/\b(prefer|like|use|always|usually|my project|i work)\b/.test(lower)) return "preference";
  return "general";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Rate limit: 20 req/min per client (memory operations are heavier)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 20);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn, origin);

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  // Auth: extract user from JWT
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return errorResponse("Unauthorized", 401, origin);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user) return errorResponse("Unauthorized", 401, origin);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400, origin);
  }

  // ── Action: save ─────────────────────────────────────────────────────────────
  if (body.action === "save") {
    const { user_message, assistant_message, intent } = body;

    if (!user_message?.trim() || !assistant_message?.trim()) {
      return new Response(JSON.stringify({ ok: true, saved: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract facts and generate embeddings in parallel
    const [facts, queryEmbedding] = await Promise.all([
      extractFacts(user_message, assistant_message),
      generateEmbedding(user_message),
    ]);

    if (facts.length === 0) {
      return new Response(JSON.stringify({ ok: true, saved: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embeddings for each fact
    const insertRows = await Promise.all(
      facts.map(async (fact) => {
        const embedding = await generateEmbedding(fact);
        return {
          user_id: user.id,
          content: fact,
          embedding: embedding ? JSON.stringify(embedding) : null,
          topic: intent ?? inferTopic(fact),
          importance: 0.5,
          metadata: { source_intent: intent ?? null },
        };
      })
    );

    const { error: insertErr } = await supabase
      .from("aria_memories")
      .insert(insertRows);

    if (insertErr) {
      console.error("[aria-memory] insert error:", insertErr);
    }

    // Save messages to ai_chat_messages (if not already saved by caller)
    const convId = body.conversation_id;
    if (convId) {
      const msgs = [
        {
          user_id: user.id,
          role: "user",
          content: user_message,
          tokens_used: 0,
          model: body.model ?? "aria",
          intent: intent ?? null,
          conversation_id_v2: convId,
        },
        {
          user_id: user.id,
          role: "assistant",
          content: assistant_message,
          tokens_used: 0,
          model: body.model ?? "aria",
          intent: intent ?? null,
          conversation_id_v2: convId,
        },
      ];
      // Fire-and-forget — don't block the response
      supabase.from("ai_chat_messages").insert(msgs).then(({ error }) => {
        if (error) console.warn("[aria-memory] message save error:", error);
      });
    }

    return new Response(
      JSON.stringify({ ok: true, saved: insertRows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Action: search ────────────────────────────────────────────────────────────
  if (body.action === "search") {
    const { query, limit = 5, threshold = 0.65 } = body;

    if (!query?.trim()) {
      return new Response(JSON.stringify({ ok: true, memories: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const embedding = await generateEmbedding(query);
    if (!embedding) {
      // Fallback: return most recent memories without vector search
      const { data } = await supabase
        .from("aria_memories")
        .select("id, content, topic, importance")
        .eq("user_id", user.id)
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      const memories = (data ?? []).map((m) => ({
        id: m.id,
        content: m.content,
        topic: m.topic,
        importance: m.importance,
        similarity: 0,
      }));

      return new Response(JSON.stringify({ ok: true, memories }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.rpc("search_aria_memories", {
      p_user_id: user.id,
      p_embedding: JSON.stringify(embedding),
      p_limit: Math.min(limit, 10),
      p_threshold: Math.max(0.5, Math.min(0.95, threshold)),
    });

    if (error) {
      console.error("[aria-memory] search error:", error);
      return new Response(JSON.stringify({ ok: true, memories: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const memories: MemoryRow[] = (data ?? []).map((row: MemoryRow) => ({
      id: row.id,
      content: row.content,
      topic: row.topic,
      importance: row.importance,
      similarity: row.similarity,
    }));

    return new Response(JSON.stringify({ ok: true, memories }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Action: forget ────────────────────────────────────────────────────────────
  if (body.action === "forget") {
    const { error } = await supabase
      .from("aria_memories")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.error("[aria-memory] forget error:", error);
      return errorResponse("Failed to delete memories", 500, origin);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return errorResponse("Unknown action", 400, origin);
});
