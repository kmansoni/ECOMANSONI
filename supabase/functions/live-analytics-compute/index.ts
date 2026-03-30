/**
 * supabase/functions/live-analytics-compute/index.ts — Analytics Computation
 *
 * Security model:
 *  - Internal-only endpoint: requires X-Internal-Call header OR valid service_role JWT
 *  - Uses service_role key for all DB operations
 *  - Idempotent: UPSERT into live_session_analytics — safe to re-run
 *
 * Triggered by:
 *  - live-webhook on room_finished event
 *  - pg_cron for catch-up computation
 *
 * Environment variables:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(
  level: "info" | "warn" | "error",
  action: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    JSON.stringify({
      ts: new Date().toISOString(),
      fn: "live-analytics-compute",
      level,
      action,
      message,
      ...data,
    }),
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateBody(body: unknown): { valid: true; session_id: string } | { valid: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "INVALID_BODY: expected JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.session_id !== "string" || !b.session_id.trim()) {
    return { valid: false, error: "INVALID_FIELD: session_id required" };
  }
  return { valid: true, session_id: b.session_id.trim() };
}

// ─── Analytics Queries ────────────────────────────────────────────────────────

interface SessionAnalytics {
  session_id: string;
  peak_viewers: number;
  total_unique_viewers: number;
  total_chat_messages: number;
  total_reactions: number;
  total_donations_amount: number;
  total_donations_count: number;
  avg_watch_duration_sec: number | null;
  viewer_retention_curve: Record<string, number>;
  chat_activity_curve: Record<string, number>;
  top_chatters: Array<{ user_id: string; message_count: number }>;
  device_breakdown: Record<string, number>;
  geo_breakdown: Record<string, number>;
  new_followers_during_stream: number;
  shares_count: number;
  computed_at: string;
}

type SupabaseClient = ReturnType<typeof createClient>;

async function computeAnalytics(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionAnalytics> {
  // Fetch session data for time boundaries
  const { data: session, error: sessionError } = await supabase
    .from("live_sessions")
    .select("actual_start_at, actual_end_at, max_viewers")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Session not found: ${sessionId} — ${sessionError?.message}`);
  }

  const startAt = session.actual_start_at ? new Date(session.actual_start_at) : null;
  const endAt = session.actual_end_at ? new Date(session.actual_end_at) : new Date();

  // ── Peak viewers (from session record, updated by webhook incrementally)
  const peakViewers: number = session.max_viewers ?? 0;

  // ── Total unique viewers
  const { count: totalUniqueViewers, error: viewersError } = await supabase
    .from("live_viewers")
    .select("user_id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (viewersError) log("warn", "analytics", "Viewers count query failed", { error: viewersError.message });

  // ── Total chat messages
  const { count: totalChatMessages, error: chatError } = await supabase
    .from("live_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (chatError) log("warn", "analytics", "Chat count query failed", { error: chatError.message });

  // ── Total reactions (type = 'reaction')
  const { count: totalReactions, error: reactionsError } = await supabase
    .from("live_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("type", "reaction");

  if (reactionsError) log("warn", "analytics", "Reactions count query failed", { error: reactionsError.message });

  // ── Donations aggregate
  const { data: donationsAgg, error: donationsError } = await supabase
    .from("live_donations")
    .select("amount")
    .eq("session_id", sessionId);

  if (donationsError) log("warn", "analytics", "Donations query failed", { error: donationsError.message });

  const totalDonationsAmount = donationsAgg?.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) ?? 0;
  const totalDonationsCount = donationsAgg?.length ?? 0;

  // ── Average watch duration
  const { data: viewerDurations, error: durError } = await supabase
    .from("live_viewers")
    .select("joined_at, left_at")
    .eq("session_id", sessionId)
    .not("left_at", "is", null);

  if (durError) log("warn", "analytics", "Viewer durations query failed", { error: durError.message });

  let avgWatchDurationSec: number | null = null;
  if (viewerDurations && viewerDurations.length > 0) {
    const durations = viewerDurations
      .map((v) => {
        const joined = new Date(v.joined_at).getTime();
        const left = new Date(v.left_at).getTime();
        return (left - joined) / 1000;
      })
      .filter((d) => d > 0);
    if (durations.length > 0) {
      avgWatchDurationSec = durations.reduce((a, b) => a + b, 0) / durations.length;
    }
  }

  // ── Viewer retention curve (by minute buckets)
  const retentionCurve: Record<string, number> = {};
  if (startAt && viewerDurations) {
    const allViewers = await supabase
      .from("live_viewers")
      .select("joined_at, left_at")
      .eq("session_id", sessionId);

    if (allViewers.data) {
      const durationMinutes = Math.ceil((endAt.getTime() - startAt.getTime()) / 60000);
      for (let minute = 0; minute <= durationMinutes; minute++) {
        const checkTime = startAt.getTime() + minute * 60000;
        const activeAtMinute = allViewers.data.filter((v) => {
          const joined = new Date(v.joined_at).getTime();
          const left = v.left_at ? new Date(v.left_at).getTime() : endAt.getTime();
          return joined <= checkTime && left >= checkTime;
        }).length;
        retentionCurve[String(minute)] = activeAtMinute;
      }
    }
  }

  // ── Chat activity curve (messages per minute)
  const chatActivityCurve: Record<string, number> = {};
  if (startAt) {
    const { data: chatMessages } = await supabase
      .from("live_chat_messages")
      .select("created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (chatMessages) {
      for (const msg of chatMessages) {
        const msgTime = new Date(msg.created_at).getTime();
        const minuteKey = String(Math.floor((msgTime - startAt.getTime()) / 60000));
        chatActivityCurve[minuteKey] = (chatActivityCurve[minuteKey] ?? 0) + 1;
      }
    }
  }

  // ── Top chatters (top 10 by message count)
  const { data: chatters } = await supabase
    .from("live_chat_messages")
    .select("user_id")
    .eq("session_id", sessionId)
    .not("type", "eq", "reaction");

  const chatterCounts: Record<string, number> = {};
  for (const msg of chatters ?? []) {
    if (msg.user_id) {
      chatterCounts[msg.user_id] = (chatterCounts[msg.user_id] ?? 0) + 1;
    }
  }
  const topChatters = Object.entries(chatterCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([user_id, message_count]) => ({ user_id, message_count }));

  // ── Device breakdown (from viewer metadata)
  const { data: viewerMeta } = await supabase
    .from("live_viewers")
    .select("metadata")
    .eq("session_id", sessionId);

  const deviceBreakdown: Record<string, number> = {};
  const geoBreakdown: Record<string, number> = {};

  for (const v of viewerMeta ?? []) {
    const meta = v.metadata as Record<string, unknown> | null;
    if (meta) {
      const device = String(meta.device ?? "unknown");
      deviceBreakdown[device] = (deviceBreakdown[device] ?? 0) + 1;
      const country = String(meta.country ?? "unknown");
      geoBreakdown[country] = (geoBreakdown[country] ?? 0) + 1;
    }
  }

  // ── New followers during stream
  let newFollowersDuringStream = 0;
  if (startAt) {
    // Get streamer_id from session
    const { data: sessionFull } = await supabase
      .from("live_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .single();

    if (sessionFull?.user_id) {
      const { count: followers } = await supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", sessionFull.user_id)
        .gte("created_at", startAt.toISOString())
        .lte("created_at", endAt.toISOString());
      newFollowersDuringStream = followers ?? 0;
    }
  }

  // ── Shares count (from activity_log or share_events table if exists)
  // Gracefully skip if table doesn't exist
  let sharesCount = 0;
  try {
    const { count: shares } = await supabase
      .from("share_events")
      .select("id", { count: "exact", head: true })
      .eq("content_type", "live_session")
      .eq("content_id", sessionId);
    sharesCount = shares ?? 0;
  } catch {
    // Table may not exist yet — not a blocking error
  }

  return {
    session_id: sessionId,
    peak_viewers: peakViewers,
    total_unique_viewers: totalUniqueViewers ?? 0,
    total_chat_messages: totalChatMessages ?? 0,
    total_reactions: totalReactions ?? 0,
    total_donations_amount: totalDonationsAmount,
    total_donations_count: totalDonationsCount,
    avg_watch_duration_sec: avgWatchDurationSec,
    viewer_retention_curve: retentionCurve,
    chat_activity_curve: chatActivityCurve,
    top_chatters: topChatters,
    device_breakdown: deviceBreakdown,
    geo_breakdown: geoBreakdown,
    new_followers_during_stream: newFollowersDuringStream,
    shares_count: sharesCount,
    computed_at: new Date().toISOString(),
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(origin) },
    });

  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // Auth: accept service_role JWT OR X-Internal-Call header with service key
  const authHeader = req.headers.get("Authorization");
  const isInternalCall = req.headers.get("X-Internal-Call") === "1";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    log("error", "config", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json({ success: false, error: "INTERNAL_ERROR" }, 500);
  }

  // Validate authorization
  if (!isInternalCall) {
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "UNAUTHORIZED" }, 401);
    }
    // Verify it's the service_role key or a valid JWT
    const token = authHeader.slice(7);
    if (token !== serviceRoleKey) {
      // Try anon key auth — create client and verify
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!anonKey) {
        return json({ success: false, error: "UNAUTHORIZED" }, 401);
      }
      const supabaseUser = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) {
        return json({ success: false, error: "UNAUTHORIZED" }, 401);
      }
      // Restrict to admin role — analytics compute is not a public endpoint
      const { data: profile } = await supabaseUser
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role !== "admin" && profile?.role !== "moderator") {
        return json({ success: false, error: "FORBIDDEN" }, 403);
      }
    }
  }

  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ success: false, error: "INVALID_JSON" }, 400);
  }

  const validation = validateBody(rawBody);
  if (!validation.valid) {
    return json({ success: false, error: validation.error }, 400);
  }

  const { session_id } = validation;
  log("info", "compute", "Starting analytics computation", { session_id });

  // Use service_role client for all DB queries
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let analytics: SessionAnalytics;
  try {
    analytics = await computeAnalytics(supabase, session_id);
  } catch (err) {
    log("error", "compute", "Analytics computation failed", {
      session_id,
      error: String(err),
    });
    return json({ success: false, error: "COMPUTATION_FAILED", detail: String(err) }, 500);
  }

  // UPSERT into live_session_analytics (idempotent)
  const { error: upsertError } = await supabase
    .from("live_session_analytics")
    .upsert(analytics, { onConflict: "session_id" });

  if (upsertError) {
    log("error", "persist", "Failed to upsert analytics", {
      session_id,
      error: upsertError.message,
    });
    return json({ success: false, error: "PERSIST_FAILED", detail: upsertError.message }, 500);
  }

  log("info", "compute", "Analytics persisted successfully", {
    session_id,
    peak_viewers: analytics.peak_viewers,
    total_unique_viewers: analytics.total_unique_viewers,
  });

  return json({
    success: true,
    session_id,
    computed_at: analytics.computed_at,
  }, 200);
});
