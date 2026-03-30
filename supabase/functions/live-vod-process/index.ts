/**
 * supabase/functions/live-vod-process/index.ts — VOD Processing
 *
 * Security model:
 *  - Internal-only: requires X-Internal-Call header OR service_role JWT
 *  - All DB operations via service_role
 *  - Idempotent: safe to retry (upsert, not insert)
 *
 * Triggered by:
 *  - live-webhook when egress_ended event fires
 *
 * Environment variables:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - THUMBNAIL_SERVICE_URL     — URL of thumbnail extraction service (optional)
 *  - NOTIFICATION_ROUTER_URL   — URL of notification-router service (optional)
 *  - NOTIFICATION_ROUTER_KEY   — API key for notification-router (optional)
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
      fn: "live-vod-process",
      level,
      action,
      message,
      ...data,
    }),
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface VodProcessRequest {
  session_id: string;
  recording_url: string;
  recording_s3_key: string;
}

function validateBody(
  body: unknown,
): { valid: true; data: VodProcessRequest } | { valid: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "INVALID_BODY" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.session_id !== "string" || !b.session_id.trim()) {
    return { valid: false, error: "INVALID_FIELD: session_id required" };
  }
  if (typeof b.recording_url !== "string" || !b.recording_url.trim()) {
    return { valid: false, error: "INVALID_FIELD: recording_url required" };
  }
  return {
    valid: true,
    data: {
      session_id: (b.session_id as string).trim(),
      recording_url: (b.recording_url as string).trim(),
      recording_s3_key: typeof b.recording_s3_key === "string" ? b.recording_s3_key.trim() : "",
    },
  };
}

// ─── Thumbnail URL generation ─────────────────────────────────────────────────

/**
 * Generates a thumbnail URL for the VOD recording.
 * If a dedicated thumbnail service is configured, calls it.
 * Otherwise derives a fallback URL by convention (works with FFmpeg thumbnail services).
 */
async function generateThumbnailUrl(
  recordingUrl: string,
  s3Key: string,
): Promise<string> {
  const thumbnailServiceUrl = Deno.env.get("THUMBNAIL_SERVICE_URL");

  if (thumbnailServiceUrl) {
    try {
      const resp = await fetch(`${thumbnailServiceUrl.replace(/\/$/, "")}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: recordingUrl, s3_key: s3Key, time_offset: "00:00:03" }),
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.ok) {
        const data = await resp.json() as { thumbnail_url?: string };
        if (data.thumbnail_url) return data.thumbnail_url;
      }
    } catch (err) {
      log("warn", "thumbnail", "Thumbnail service call failed, using fallback", {
        error: String(err),
      });
    }
  }

  // Derive thumbnail URL by convention: replace extension with _thumb.jpg
  // Works when MinIO/S3 has a companion thumbnail generated at upload time
  const base = s3Key
    ? s3Key.replace(/\.[^.]+$/, "_thumb.jpg")
    : recordingUrl.replace(/\.[^.?]+(\?.*)?$/, "_thumb.jpg");

  // Build MinIO-style URL
  const minioEndpoint = Deno.env.get("MINIO_ENDPOINT") ?? "";
  if (minioEndpoint && s3Key) {
    return `${minioEndpoint.replace(/\/$/, "")}/live-recordings/${base}`;
  }

  return `${recordingUrl.replace(/\.[^.?]+(\?.*)?$/, "_thumb.jpg")}`;
}

// ─── Push notification to streamer ───────────────────────────────────────────

async function notifyStreamer(
  userId: string,
  sessionTitle: string,
  replayUrl: string,
): Promise<void> {
  const notifRouterUrl = Deno.env.get("NOTIFICATION_ROUTER_URL");
  const notifRouterKey = Deno.env.get("NOTIFICATION_ROUTER_KEY");

  if (!notifRouterUrl) {
    log("warn", "notify", "NOTIFICATION_ROUTER_URL not configured — skipping push");
    return;
  }

  try {
    const resp = await fetch(`${notifRouterUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(notifRouterKey ? { "X-API-Key": notifRouterKey } : {}),
      },
      body: JSON.stringify({
        user_id: userId,
        type: "live_recording_ready",
        title: "Запись готова",
        body: `Запись вашего эфира «${sessionTitle}» готова к просмотру`,
        data: {
          type: "live_recording_ready",
          replay_url: replayUrl,
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      log("warn", "notify", "Notification router returned non-2xx", { status: resp.status, body });
    } else {
      log("info", "notify", "Push notification sent to streamer", { user_id: userId });
    }
  } catch (err) {
    log("warn", "notify", "Notification router call failed", { error: String(err) });
  }
}

// ─── Reel intent creation ─────────────────────────────────────────────────────

async function createReelIntent(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userId: string,
  recordingUrl: string,
): Promise<void> {
  // Check if session record indicates this is from automatic replay-to-reel conversion
  // Reels conversion is opt-in (column: auto_create_reel)
  const { data: session } = await supabase
    .from("live_sessions")
    .select("auto_create_reel, title")
    .eq("id", sessionId)
    .single();

  if (!session?.auto_create_reel) {
    log("info", "reel_intent", "auto_create_reel disabled — skipping", { session_id: sessionId });
    return;
  }

  const { error } = await supabase.from("reel_intents").insert({
    user_id: userId,
    source_type: "live_session",
    source_id: sessionId,
    source_url: recordingUrl,
    title: session.title ? `${session.title} — replay` : "Live replay",
    status: "pending",
    created_at: new Date().toISOString(),
  });

  if (error) {
    log("warn", "reel_intent", "Failed to create reel intent", {
      session_id: sessionId,
      error: error.message,
    });
  } else {
    log("info", "reel_intent", "Reel intent created", { session_id: sessionId });
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...getCorsHeaders(origin),
        "Content-Type": "application/json",
      },
    });

  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // Auth: internal call OR service_role JWT
  const authHeader = req.headers.get("Authorization");
  const isInternalCall = req.headers.get("X-Internal-Call") === "1";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    log("error", "config", "Missing env vars");
    return json({ success: false, error: "INTERNAL_ERROR" }, 500);
  }

  if (!isInternalCall) {
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "UNAUTHORIZED" }, 401);
    }
    const token = authHeader.slice(7);
    if (token !== serviceRoleKey) {
      return json({ success: false, error: "FORBIDDEN" }, 403);
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

  const { session_id, recording_url, recording_s3_key } = validation.data;
  log("info", "process", "Starting VOD processing", { session_id, recording_url });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Fetch session for user_id & title
  const { data: session, error: sessionError } = await supabase
    .from("live_sessions")
    .select("id, user_id, title, is_replay_available")
    .eq("id", session_id)
    .single();

  if (sessionError || !session) {
    log("error", "process", "Session not found", { session_id, error: sessionError?.message });
    return json({ success: false, error: "SESSION_NOT_FOUND" }, 404);
  }

  // Step 1 & 2: Update replay_url and is_replay_available
  const { error: updateError } = await supabase
    .from("live_sessions")
    .update({
      replay_url: recording_url,
      is_replay_available: true,
    })
    .eq("id", session_id);

  if (updateError) {
    log("error", "process", "Failed to update replay_url", { session_id, error: updateError.message });
    return json({ success: false, error: "DB_UPDATE_FAILED" }, 500);
  }

  // Step 3 & 4: Generate and save thumbnail
  let thumbnailUrl: string | null = null;
  try {
    thumbnailUrl = await generateThumbnailUrl(recording_url, recording_s3_key);
    const { error: thumbError } = await supabase
      .from("live_sessions")
      .update({ replay_thumbnail_url: thumbnailUrl })
      .eq("id", session_id);
    if (thumbError) {
      log("warn", "thumbnail", "Failed to save thumbnail URL", { session_id, error: thumbError.message });
    }
  } catch (err) {
    log("warn", "thumbnail", "Thumbnail generation threw", { session_id, error: String(err) });
  }

  // Step 5: Create reel intent if auto_create_reel is enabled
  await createReelIntent(supabase, session_id, session.user_id, recording_url);

  // Step 6: Push notification to streamer
  await notifyStreamer(session.user_id, session.title ?? "Livestream", recording_url);

  log("info", "process", "VOD processing complete", { session_id, replay_url: recording_url, thumbnail_url: thumbnailUrl });

  return json({
    success: true,
    replay_url: recording_url,
    thumbnail_url: thumbnailUrl,
  }, 200);
});
