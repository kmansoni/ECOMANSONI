/**
 * get-feed-v2 — Server-side ranked feed Edge Function.
 *
 * Architecture:
 *   - All ranking happens in PostgreSQL via a single RPC call.
 *   - The function is stateless; cursor-based pagination prevents offset drift.
 *   - Auth is enforced via Supabase JWT; anonymous requests are rejected.
 *   - Rate-limited at the API Gateway level (not here).
 *
 * Ranking formula (server-side, computed in SQL):
 *   score = (engagement_rate * 0.35)
 *         + (recency_decay    * 0.30)
 *         + (affinity_score   * 0.20)
 *         + (content_relevance * 0.10)
 *         + (diversity_bonus  * 0.05)
 *
 * Modes:
 *   smart        — ML-style weighted score, full corpus
 *   following    — chronological, only followed authors
 *   chronological — pure created_at DESC, full corpus
 *
 * Cursor:
 *   { created_at: ISO8601, id: UUID } — stable across concurrent inserts
 *   because we use (created_at, id) composite index.
 *
 * Security:
 *   - JWT required; user_id extracted from auth.uid()
 *   - RLS on posts table enforced by Postgres
 *   - No user-controlled SQL injection surface (all params are typed)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeedMode = "smart" | "following" | "chronological";

interface FeedRequest {
  mode: FeedMode;
  cursor_created_at?: string;
  cursor_id?: string;
  page_size?: number;
}

interface FeedPost {
  id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  views_count: number;
  score: number;
  is_liked: boolean;
  is_saved: boolean;
  author: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
  media: Array<{
    id: string;
    media_url: string;
    media_type: string;
    sort_order: number;
  }>;
}

interface FeedResponse {
  posts: FeedPost[];
  has_more: boolean;
  next_cursor: { created_at: string; id: string } | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PAGE_SIZE = 30;
const DEFAULT_PAGE_SIZE = 20;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://mansoni.ru",
  "https://www.mansoni.ru",
  "https://app.mansoni.ru",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, req);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: "Server misconfiguration" }, 500, req);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // Verify JWT and extract user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401, req);
  }

  // Parse and validate request body
  let body: FeedRequest;
  try {
    body = await req.json() as FeedRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400, req);
  }

  const mode: FeedMode = (["smart", "following", "chronological"] as const).includes(body.mode as FeedMode)
    ? body.mode
    : "smart";

  const pageSize = Math.min(
    Math.max(1, Number(body.page_size) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  // Validate cursor fields if provided
  const cursorCreatedAt = body.cursor_created_at ?? null;
  const cursorId = body.cursor_id ?? null;

  if ((cursorCreatedAt === null) !== (cursorId === null)) {
    return json({ error: "cursor_created_at and cursor_id must both be present or both absent" }, 400, req);
  }

  // Delegate all ranking to PostgreSQL — single round-trip
  const { data, error } = await supabase.rpc("get_ranked_feed_v2", {
    p_user_id: user.id,
    p_mode: mode,
    p_page_size: pageSize,
    p_cursor_created_at: cursorCreatedAt,
    p_cursor_id: cursorId,
  });

  if (error) {
    // Log full error server-side; expose only a generic message to the client
    // to prevent PostgreSQL internals (table names, query structure) from leaking.
    console.error("[get-feed-v2] RPC error:", error.message, error.details, error.hint);
    return json({ error: "Feed unavailable" }, 503, req);
  }

  const posts: FeedPost[] = (data as FeedPost[]) ?? [];
  const hasMore = posts.length === pageSize;
  const lastPost = posts[posts.length - 1] ?? null;

  const response: FeedResponse = {
    posts,
    has_more: hasMore,
    next_cursor: lastPost
      ? { created_at: lastPost.created_at, id: lastPost.id }
      : null,
  };

  return json(response, 200, req);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
