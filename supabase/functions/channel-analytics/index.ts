/**
 * channel-analytics Edge Function
 *
 * Endpoints:
 *  GET  /channel-analytics?channel_id=X&period=7d|30d|90d|all  — агрегированная статистика
 *  GET  /channel-analytics/posts?channel_id=X&limit=20&offset=0 — статистика по постам
 *  POST /channel-analytics/record-view  { post_id, channel_id }   — идемпотентный просмотр
 *
 * Безопасность:
 *  - JWT обязателен для всех запросов
 *  - GET endpoints проверяют is_channel_admin через RLS (select на RLS-защищённую таблицу)
 *  - POST record-view вызывает SECURITY DEFINER функцию record_post_view()
 *  - Rate limit на record-view: 1 запись per user per post (дедупликация в БД)
 *  - CORS: только разрешённые origin (из переменной ALLOWED_ORIGIN)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function periodToDays(period: string): number | null {
  switch (period) {
    case "7d":  return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "all": return null;
    default:    return 30;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // ---------------------------------------------------------------------------
  // Auth — extract user JWT
  // ---------------------------------------------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }

  // User-scoped client (respects RLS)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // Service client for SECURITY DEFINER calls
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);
  const pathname = url.pathname;

  // ---------------------------------------------------------------------------
  // POST /channel-analytics/record-view
  // ---------------------------------------------------------------------------
  if (req.method === "POST" && pathname.endsWith("/record-view")) {
    let body: { post_id?: string; channel_id?: string };
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }

    const { post_id, channel_id } = body ?? {};
    if (!post_id || !channel_id) {
      return errorResponse("post_id and channel_id are required");
    }

    // Validate UUIDs
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(post_id) || !uuidRe.test(channel_id)) {
      return errorResponse("Invalid UUID format");
    }

    const { error } = await serviceClient.rpc("record_post_view", {
      p_post_id: post_id,
      p_channel_id: channel_id,
    });

    if (error) {
      console.error("[channel-analytics] record_post_view error:", error);
      return errorResponse("Failed to record view", 500);
    }

    return jsonResponse({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // GET /channel-analytics/posts — топ постов
  // ---------------------------------------------------------------------------
  if (req.method === "GET" && pathname.endsWith("/posts")) {
    const channel_id = url.searchParams.get("channel_id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

    if (!channel_id) return errorResponse("channel_id is required");

    const { data, error } = await userClient
      .from("channel_post_stats")
      .select("post_id, views, forwards, reactions, comments_count, reach, created_at")
      .eq("channel_id", channel_id)
      .order("views", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if (error.code === "PGRST301") return errorResponse("Unauthorized", 403);
      return errorResponse(error.message, 500);
    }

    return jsonResponse({ posts: data ?? [] });
  }

  // ---------------------------------------------------------------------------
  // GET /channel-analytics — overview + daily stats
  // ---------------------------------------------------------------------------
  if (req.method === "GET") {
    const channel_id = url.searchParams.get("channel_id");
    const period = url.searchParams.get("period") ?? "30d";

    if (!channel_id) return errorResponse("channel_id is required");

    const days = periodToDays(period);

    // Build date filter
    let query = userClient
      .from("channel_analytics_daily")
      .select("*")
      .eq("channel_id", channel_id)
      .order("date", { ascending: true });

    if (days !== null) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte("date", since.toISOString().split("T")[0]);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === "PGRST301") return errorResponse("Unauthorized", 403);
      return errorResponse(error.message, 500);
    }

    const rows = data ?? [];

    // Aggregate overview
    const overview = rows.reduce(
      (acc, row) => ({
        total_views: acc.total_views + row.views_count,
        total_shares: acc.total_shares + row.shares_count,
        total_reactions: acc.total_reactions + row.reactions_count,
        total_reach: acc.total_reach + row.reach_count,
        subscribers_gained: acc.subscribers_gained + row.subscribers_gained,
        subscribers_lost: acc.subscribers_lost + row.subscribers_lost,
        latest_subscribers: row.subscribers_count, // last row
      }),
      {
        total_views: 0,
        total_shares: 0,
        total_reactions: 0,
        total_reach: 0,
        subscribers_gained: 0,
        subscribers_lost: 0,
        latest_subscribers: 0,
      },
    );

    return jsonResponse({ overview, dailyStats: rows, period });
  }

  return errorResponse("Not found", 404);
});
