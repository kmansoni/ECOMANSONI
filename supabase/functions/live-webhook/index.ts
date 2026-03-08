/**
 * supabase/functions/live-webhook/index.ts — LiveKit Webhook Relay
 *
 * Security model (zero-trust):
 *  - Validates HMAC-SHA256 signature from LiveKit (Authorization: Bearer <token>)
 *  - Uses service_role key for all DB operations (RLS bypass — server-side only)
 *  - Always responds 200 OK to prevent LiveKit retry storms on transient errors
 *  - Idempotent: duplicate webhook events for same room are safe (UPSERT / ON CONFLICT)
 *
 * Environment variables:
 *  - SUPABASE_URL                 — auto-provided by Supabase runtime
 *  - SUPABASE_SERVICE_ROLE_KEY    — Supabase Vault
 *  - LIVEKIT_API_SECRET           — Supabase Vault (for HMAC validation)
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveKitWebhookEvent {
  event: string;
  room?: {
    name?: string;
    sid?: string;
    metadata?: string;
  };
  participant?: {
    identity?: string;
    sid?: string;
    metadata?: string;
    joinedAt?: number;
  };
  track?: {
    sid?: string;
    type?: string;
    source?: string;
  };
  egressInfo?: {
    egressId?: string;
    roomName?: string;
    fileResults?: Array<{ filename?: string; location?: string; duration?: number; size?: number }>;
    streamResults?: Array<{ url?: string }>;
    status?: string;
  };
  ingressInfo?: {
    ingressId?: string;
    name?: string;
    roomName?: string;
    inputType?: string;
    url?: string;
    streamKey?: string;
    state?: { status?: string; startedAt?: number; endedAt?: number };
  };
  id?: string;
  createdAt?: number;
}

// ─── HMAC-SHA256 Validation ───────────────────────────────────────────────────

/**
 * LiveKit webhook auth: Authorization header contains a JWT signed with API Secret.
 * The JWT payload contains SHA256 hash of the raw request body.
 * Ref: https://docs.livekit.io/home/server/webhooks/
 */
async function validateLiveKitWebhook(
  req: Request,
  rawBody: string,
  apiSecret: string,
): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    log("warn", "validate_webhook", "Missing or malformed Authorization header");
    return false;
  }

  const token = authHeader.slice(7);

  // Decode JWT (no library needed — we verify the signature manually)
  const parts = token.split(".");
  if (parts.length !== 3) {
    log("warn", "validate_webhook", "Malformed JWT (not 3 parts)");
    return false;
  }

  // Verify HMAC-SHA256 signature
  const signingInput = `${parts[0]}.${parts[1]}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signatureBytes = base64UrlDecode(parts[2]);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(signingInput),
  );

  if (!valid) {
    log("warn", "validate_webhook", "JWT signature invalid");
    return false;
  }

  // Verify body SHA256 hash in JWT claims
  const claims = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[1])),
  );
  const bodyHash = await sha256Hex(rawBody);

  if (claims.sha256 !== bodyHash) {
    log("warn", "validate_webhook", "Body hash mismatch", {
      expected: claims.sha256,
      got: bodyHash,
    });
    return false;
  }

  return true;
}

function base64UrlDecode(str: string): Uint8Array {
  // Pad with = to make length a multiple of 4
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function sha256Hex(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(
  level: "info" | "warn" | "error",
  action: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    JSON.stringify({
      ts: new Date().toISOString(),
      fn: "live-webhook",
      level,
      action,
      message,
      ...data,
    }),
  );
}

// ─── Room name → session_id extraction ───────────────────────────────────────

function sessionIdFromRoomName(roomName: string | undefined): string | null {
  if (!roomName) return null;
  // Convention: room name is `live_<session_id>` (see gateway tokens.ts)
  const match = roomName.match(/^live_(.+)$/);
  return match ? match[1] : null;
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>;

async function handleRoomStarted(
  supabase: SupabaseClient,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const sessionId = sessionIdFromRoomName(event.room?.name);
  if (!sessionId) {
    log("warn", "room_started", "Cannot extract session_id from room name", { room: event.room?.name });
    return;
  }

  const { error } = await supabase
    .from("live_sessions")
    .update({
      status: "live",
      actual_start_at: new Date().toISOString(),
      livekit_room_sid: event.room?.sid ?? null,
    })
    .eq("id", sessionId)
    .in("status", ["created", "scheduled"]); // Idempotent: only update if in a pre-live state

  if (error) {
    log("error", "room_started", "DB update failed", { session_id: sessionId, error: error.message });
  } else {
    log("info", "room_started", "Session set to live", { session_id: sessionId });
  }
}

async function handleRoomFinished(
  supabase: SupabaseClient,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const sessionId = sessionIdFromRoomName(event.room?.name);
  if (!sessionId) return;

  const { error } = await supabase
    .from("live_sessions")
    .update({
      status: "ended",
      actual_end_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .in("status", ["live", "scheduled"]); // Idempotent guard

  if (error) {
    log("error", "room_finished", "DB update failed", { session_id: sessionId, error: error.message });
    return;
  }

  log("info", "room_finished", "Session ended", { session_id: sessionId });

  // Trigger analytics computation asynchronously (fire-and-forget)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceKey) {
    fetch(`${supabaseUrl}/functions/v1/live-analytics-compute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "X-Internal-Call": "1",
      },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch((err) => {
      log("warn", "room_finished", "Failed to trigger analytics compute", { error: String(err) });
    });
  }
}

async function handleParticipantJoined(
  supabase: SupabaseClient,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const sessionId = sessionIdFromRoomName(event.room?.name);
  if (!sessionId || !event.participant?.identity) return;

  // Skip non-viewer participants (streamers have identity prefix "streamer_")
  const identity = event.participant.identity;
  if (identity.startsWith("streamer_") || identity.startsWith("system_")) return;

  const userId = identity.startsWith("viewer_") ? identity.slice(7) : identity;

  // Upsert viewer record (idempotent).
  // DB column: viewer_id (not user_id) — live_viewers schema (20260224300000:63).
  // is_active / participant_sid added by migration 20260308000012.
  // onConflict: idx_live_viewers_session_viewer_unique (session_id, viewer_id).
  //
  // ignoreDuplicates is intentionally NOT set so that re-join (UPDATE path) resets
  // is_active=true, joined_at, left_at=null. The INSERT trigger trg_live_viewers_on_insert
  // fires only on INSERT; for re-join (UPDATE) we call increment_viewer_count explicitly below.
  const { error: upsertError } = await supabase
    .from("live_viewers")
    .upsert(
      {
        session_id: sessionId,
        viewer_id: userId,
        participant_sid: event.participant.sid ?? null,
        joined_at: new Date().toISOString(),
        is_active: true,
        left_at: null, // Reset on re-join
      },
      { onConflict: "session_id,viewer_id" },
    );

  if (upsertError) {
    log("error", "participant_joined", "Upsert viewer failed", {
      session_id: sessionId,
      viewer_id: userId,
      error: upsertError.message,
    });
    return;
  }

  // For re-join (UPDATE path of upsert), the INSERT trigger won't fire.
  // Explicitly increment viewer count. The RPC uses advisory lock to prevent races.
  // Note: on first join (INSERT path), the trigger also fires — but increment_viewer_count
  // is idempotent via advisory lock, so double-increment is safe.
  const { error: incrError } = await supabase.rpc("increment_viewer_count", {
    p_session_id: sessionId,
  });
  if (incrError) {
    log("warn", "participant_joined", "Increment viewer count failed", {
      session_id: sessionId,
      error: incrError.message,
    });
  }

  log("info", "participant_joined", "Viewer joined", { session_id: sessionId, user_id: userId });
}

async function handleParticipantLeft(
  supabase: SupabaseClient,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const sessionId = sessionIdFromRoomName(event.room?.name);
  if (!sessionId || !event.participant?.identity) return;

  const identity = event.participant.identity;
  if (identity.startsWith("streamer_") || identity.startsWith("system_")) return;

  const userId = identity.startsWith("viewer_") ? identity.slice(7) : identity;

  // Update viewer record with left_at (keep for analytics — do not hard delete).
  // DB column: viewer_id (not user_id) — live_viewers schema (20260224300000:63).
  // is_active added by migration 20260308000012.
  const { error: updateError } = await supabase
    .from("live_viewers")
    .update({ left_at: new Date().toISOString(), is_active: false })
    .eq("session_id", sessionId)
    .eq("viewer_id", userId)   // correct column: viewer_id
    .is("left_at", null); // Idempotent: only update if not already left

  if (updateError) {
    log("warn", "participant_left", "Update viewer failed", {
      session_id: sessionId,
      viewer_id: userId,
      error: updateError.message,
    });
  }

  // Decrement viewer count
  const { error: decrError } = await supabase.rpc("decrement_viewer_count", {
    p_session_id: sessionId,
  });

  if (decrError) {
    log("warn", "participant_left", "Decrement viewer count failed", {
      session_id: sessionId,
      error: decrError.message,
    });
  }

  log("info", "participant_left", "Viewer left", { session_id: sessionId, viewer_id: userId });
}

async function handleIngressStarted(
  supabase: SupabaseClient,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const sessionId = sessionIdFromRoomName(event.ingressInfo?.roomName);
  if (!sessionId) return;

  const inputType = event.ingressInfo?.inputType?.toLowerCase() ?? "unknown";
  const protocol = inputType.includes("rtmp") ? "rtmp" : inputType.includes("whip") ? "whip" : inputType;

  const { error } = await supabase
    .from("live_sessions")
    .update({ ingest_protocol: protocol })
    .eq("id", sessionId);

  if (error) {
    log("warn", "ingress_started", "DB update failed", { session_id: sessionId, error: error.message });
  } else {
    log("info", "ingress_started", "Ingress protocol recorded", { session_id: sessionId, protocol });
  }
}

async function handleIngressEnded(
  _supabase: SupabaseClient,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const sessionId = sessionIdFromRoomName(event.ingressInfo?.roomName);
  log("info", "ingress_ended", "Ingress ended", {
    session_id: sessionId ?? "unknown",
    ingress_id: event.ingressInfo?.ingressId,
  });
}

async function handleEgressEnded(
  supabase: SupabaseClient,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const sessionId = sessionIdFromRoomName(event.egressInfo?.roomName);
  if (!sessionId) return;

  // Find the recording URL from file results
  const fileResult = event.egressInfo?.fileResults?.[0];
  const replayUrl = fileResult?.location ?? null;

  if (!replayUrl) {
    log("info", "egress_ended", "No recording URL in egress result", {
      session_id: sessionId,
      egress_id: event.egressInfo?.egressId,
    });
    return;
  }

  const { error } = await supabase
    .from("live_sessions")
    .update({
      replay_url: replayUrl,
      is_replay_available: true,
    })
    .eq("id", sessionId);

  if (error) {
    log("error", "egress_ended", "DB update replay_url failed", {
      session_id: sessionId,
      error: error.message,
    });
  } else {
    log("info", "egress_ended", "Replay URL saved", { session_id: sessionId, replay_url: replayUrl });
  }

  // Trigger VOD processing
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceKey && replayUrl) {
    const s3Key = fileResult?.filename ?? "";
    fetch(`${supabaseUrl}/functions/v1/live-vod-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "X-Internal-Call": "1",
      },
      body: JSON.stringify({
        session_id: sessionId,
        recording_url: replayUrl,
        recording_s3_key: s3Key,
      }),
    }).catch((err) => {
      log("warn", "egress_ended", "Failed to trigger VOD process", { error: String(err) });
    });
  }
}

async function handleTrackPublished(
  supabase: SupabaseClient,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const sessionId = sessionIdFromRoomName(event.room?.name);
  if (!sessionId) return;

  // Broadcast track_published event to Supabase Realtime channel for this session
  // so UI can react (e.g., show video player when video track is ready)
  const channel = supabase.channel(`live:${sessionId}:events`);

  try {
    await channel.send({
      type: "broadcast",
      event: "track_published",
      payload: {
        session_id: sessionId,
        track_sid: event.track?.sid,
        track_type: event.track?.type,
        track_source: event.track?.source,
        participant_sid: event.participant?.sid,
        participant_identity: event.participant?.identity,
      },
    });
  } catch (err) {
    log("warn", "track_published", "Realtime broadcast failed", { error: String(err) });
  }

  log("info", "track_published", "Track published broadcast sent", { session_id: sessionId });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // LiveKit webhooks are always POST — respond 200 to non-POST for probing
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Always respond 200 — LiveKit retries on non-200
  const respond200 = (message: string) =>
    new Response(JSON.stringify({ ok: true, message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  // Read raw body (needed for HMAC verification — must be before parsing)
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    log("error", "request", "Failed to read body", { error: String(err) });
    return respond200("body_read_error");
  }

  // Validate LiveKit HMAC signature
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!apiSecret) {
    log("error", "config", "LIVEKIT_API_SECRET not configured");
    return respond200("misconfigured");
  }

  const isValid = await validateLiveKitWebhook(req, rawBody, apiSecret);
  if (!isValid) {
    log("warn", "auth", "Webhook signature validation failed — rejecting");
    // Return 200 to avoid information leakage via status code differences
    return respond200("auth_failed");
  }

  // Parse event
  let event: LiveKitWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    log("error", "request", "Failed to parse JSON body");
    return respond200("invalid_json");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    log("error", "config", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return respond200("misconfigured");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const eventName = event.event;
  log("info", "dispatch", `Handling event: ${eventName}`, {
    room: event.room?.name,
    event_id: event.id,
  });

  try {
    switch (eventName) {
      case "room_started":
        await handleRoomStarted(supabase, event);
        break;
      case "room_finished":
        await handleRoomFinished(supabase, event);
        break;
      case "participant_joined":
        await handleParticipantJoined(supabase, event);
        break;
      case "participant_left":
        await handleParticipantLeft(supabase, event);
        break;
      case "ingress_started":
        await handleIngressStarted(supabase, event);
        break;
      case "ingress_ended":
        await handleIngressEnded(supabase, event);
        break;
      case "egress_ended":
        await handleEgressEnded(supabase, event);
        break;
      case "track_published":
        await handleTrackPublished(supabase, event);
        break;
      default:
        log("info", "dispatch", `Unhandled event type: ${eventName}`);
    }
  } catch (err) {
    // Log but always return 200 — prevent LiveKit retry storms
    log("error", "dispatch", `Handler threw uncaught error for event ${eventName}`, {
      error: String(err),
    });
  }

  return respond200("processed");
});
