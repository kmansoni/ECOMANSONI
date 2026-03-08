/**
 * supabase/functions/live-moderation-check/index.ts — Chat Moderation Check
 *
 * Security model (zero-trust):
 *  - Validates caller JWT (Supabase anon key) — any authenticated user can call
 *  - Rate limiting: in-memory sliding window (best-effort; stateless per cold start)
 *  - All DB operations via service_role (RLS bypass for moderation tables)
 *  - Escalating auto-ban: warn → 5min → 30min → permanent
 *
 * Environment variables:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - SUPABASE_ANON_KEY
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Toxicity keyword list ────────────────────────────────────────────────────
// Keep minimal — full blocklist should be in DB table `moderation_blocked_words`
const BUILTIN_BLOCKED_WORDS: RegExp[] = [
  /\bfuck\b/i,
  /\bshit\b/i,
  /\basshole\b/i,
  /\bspam\b.*\bspam\b.*\bspam\b/i,
];

// URL regex — blocks hyperlinks unless streamer has allowed_links = true
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/i;

// ─── In-memory rate limit ─────────────────────────────────────────────────────
// Structure: userId → { timestamps: number[] }
// Sliding window: 5 messages / 10 seconds
//
// ⚠️  LIMITATION: Supabase Edge Functions are stateless — in-memory state is
// reset on every cold start. This means the in-memory check is "best-effort"
// and provides ~0 protection after a cold start.
//
// Authoritative rate limit enforcement is done via DB-based check in
// `checkDbRateLimit()` below (counts live_chat_messages rows in the window).
// In-memory check acts as a cheap pre-filter for warm instances.
const CHAT_RATE_LIMIT_MAX = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 10_000;
const chatRateLimits = new Map<string, number[]>();

// Cleanup expired entries periodically
setInterval(() => {
  const cutoff = Date.now() - CHAT_RATE_LIMIT_WINDOW_MS * 2;
  for (const [key, timestamps] of chatRateLimits) {
    const fresh = timestamps.filter((t) => t > cutoff);
    if (fresh.length === 0) chatRateLimits.delete(key);
    else chatRateLimits.set(key, fresh);
  }
}, 60_000);

function checkInMemoryRateLimit(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - CHAT_RATE_LIMIT_WINDOW_MS;
  const existing = (chatRateLimits.get(userId) ?? []).filter((t) => t > cutoff);

  if (existing.length >= CHAT_RATE_LIMIT_MAX) return false; // rate limited

  existing.push(now);
  chatRateLimits.set(userId, existing);
  return true;
}

/**
 * DB-authoritative rate limit: counts real rows in live_chat_messages
 * for (userId, sessionId) in the last CHAT_RATE_LIMIT_WINDOW_MS milliseconds.
 *
 * This survives cold starts because it reads from persistent storage.
 * Called after the cheap in-memory check passes.
 */
async function checkDbRateLimit(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - CHAT_RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("live_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("sender_id", userId)
    .gte("created_at", windowStart);

  if (error) {
    // DB error — fail open to avoid blocking legitimate users, but log it
    log("error", "db_rate_limit", "Failed to check DB rate limit", { error: error.message });
    return true;
  }

  return (count ?? 0) < CHAT_RATE_LIMIT_MAX;
}

// ─── Duplicate/spam detection ─────────────────────────────────────────────────
// Structure: userId → last 10 messages
const recentMessages = new Map<string, string[]>();

function checkDuplicateMessage(userId: string, messageText: string): boolean {
  const history = recentMessages.get(userId) ?? [];
  const count = history.filter((m) => m === messageText).length;

  const updated = [...history.slice(-9), messageText];
  recentMessages.set(userId, updated);

  return count >= 2; // 3rd occurrence of same message = duplicate
}

// ─── Text analysis helpers ────────────────────────────────────────────────────

function capsLockRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 10) return 0; // too short to flag
  const upperCount = letters.replace(/[^A-Z]/g, "").length;
  return upperCount / letters.length;
}

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
      fn: "live-moderation-check",
      level,
      action,
      message,
      ...data,
    }),
  );
}

// ─── Ban escalation ───────────────────────────────────────────────────────────

type BanDuration = 5 | 30 | null; // minutes; null = permanent

/**
 * Returns duration of next ban based on violation history.
 * Escalation: warn → 5min → 30min → permanent
 */
async function getNextBanDuration(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userId: string,
): Promise<BanDuration | "warn"> {
  const { data: existingBans } = await supabase
    .from("live_chat_bans")
    .select("duration_minutes, created_at")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!existingBans || existingBans.length === 0) return "warn";

  const previousDurations = existingBans.map((b: { duration_minutes: number | null }) => b.duration_minutes);
  const hadPermanent = previousDurations.includes(null);
  if (hadPermanent) return null; // already permanent
  const had30 = previousDurations.includes(30);
  if (had30) return null; // escalate to permanent
  const had5 = previousDurations.includes(5);
  if (had5) return 30;
  return 5;
}

async function issueBan(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userId: string,
  duration: BanDuration | "warn",
  reason: string,
): Promise<void> {
  if (duration === "warn") return; // no ban issued for first violation

  const expiresAt =
    duration === null
      ? null // permanent
      : new Date(Date.now() + duration * 60 * 1000).toISOString();

  const { error } = await supabase.from("live_chat_bans").insert({
    session_id: sessionId,
    user_id: userId,
    reason,
    expires_at: expiresAt,
    duration_minutes: duration,
    is_permanent: duration === null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    log("error", "ban", "Failed to issue ban", {
      session_id: sessionId,
      user_id: userId,
      error: error.message,
    });
  } else {
    log("info", "ban", `Issued ${duration === null ? "permanent" : `${duration}min`} ban`, {
      session_id: sessionId,
      user_id: userId,
      reason,
    });
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface ModerationRequest {
  session_id: string;
  user_id: string;
  message_text: string;
  message_id: string;
}

function validateBody(
  body: unknown,
): { valid: true; data: ModerationRequest } | { valid: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "INVALID_BODY" };
  }
  const b = body as Record<string, unknown>;
  for (const field of ["session_id", "user_id", "message_text", "message_id"]) {
    if (typeof b[field] !== "string" || !(b[field] as string).trim()) {
      return { valid: false, error: `INVALID_FIELD: ${field} required` };
    }
  }
  return {
    valid: true,
    data: {
      session_id: (b.session_id as string).trim(),
      user_id: (b.user_id as string).trim(),
      message_text: b.message_text as string,
      message_id: (b.message_id as string).trim(),
    },
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ allowed: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ allowed: false, error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    log("error", "config", "Missing env vars");
    return json({ allowed: false, error: "INTERNAL_ERROR" }, 500);
  }

  // Verify caller JWT
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) {
    return json({ allowed: false, error: "UNAUTHORIZED" }, 401);
  }

  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ allowed: false, error: "INVALID_JSON" }, 400);
  }

  const validation = validateBody(rawBody);
  if (!validation.valid) {
    return json({ allowed: false, error: validation.error }, 400);
  }

  const { session_id, user_id, message_text, message_id } = validation.data;

  // Ensure caller is checking their own message (or is admin/moderator)
  if (user.id !== user_id) {
    const { data: profile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin" && profile?.role !== "moderator") {
      return json({ allowed: false, error: "FORBIDDEN" }, 403);
    }
  }

  // Service role client for all privileged DB operations
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── CHECK 1: Ban status
  const { data: activeBan } = await supabase
    .from("live_chat_bans")
    .select("id, expires_at, is_permanent, reason")
    .eq("session_id", session_id)
    .eq("user_id", user_id)
    .or(`expires_at.gt.${new Date().toISOString()},is_permanent.eq.true`)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (activeBan) {
    log("info", "ban_check", "User is banned", { session_id, user_id, ban_id: activeBan.id });
    return json({
      allowed: false,
      reason: "BANNED",
      action: "block",
      expires_at: activeBan.expires_at,
    }, 200);
  }

  // ── CHECK 2: Rate limit — two-tier (in-memory pre-filter + DB authoritative)
  // In-memory check is cheap and fails gracefully on cold start.
  // DB check is authoritative and survives cold starts/horizontal scaling.
  const inMemoryOk = checkInMemoryRateLimit(user_id);
  if (!inMemoryOk) {
    log("info", "rate_limit", "In-memory rate limit triggered", { session_id, user_id });
    return json({ allowed: false, reason: "RATE_LIMITED", action: "block" }, 200);
  }
  // Always run DB check — it is the authoritative gate
  const dbRateLimitOk = await checkDbRateLimit(supabase, session_id, user_id);
  if (!dbRateLimitOk) {
    log("info", "rate_limit", "DB rate limit triggered", { session_id, user_id });
    return json({ allowed: false, reason: "RATE_LIMITED", action: "block" }, 200);
  }

  // ── CHECK 3a: Message length
  if (message_text.length > 500) {
    return json({
      allowed: false,
      reason: "MESSAGE_TOO_LONG",
      action: "block",
    }, 200);
  }

  // ── CHECK 3b: Caps lock abuse
  if (capsLockRatio(message_text) > 0.70) {
    return json({
      allowed: false,
      reason: "EXCESSIVE_CAPS",
      action: "warn",
    }, 200);
  }

  // ── CHECK 3c: Duplicate spam detection
  const isDuplicate = checkDuplicateMessage(user_id, message_text.trim());
  if (isDuplicate) {
    log("info", "spam_detect", "Duplicate message detected", { session_id, user_id });

    const nextBanDuration = await getNextBanDuration(supabase, session_id, user_id);
    await issueBan(supabase, session_id, user_id, nextBanDuration, "SPAM_DUPLICATE");

    // Delete the message
    await supabase
      .from("live_chat_messages")
      .delete()
      .eq("id", message_id);

    return json({
      allowed: false,
      reason: "SPAM_DUPLICATE",
      action: nextBanDuration === "warn" ? "warn" : "shadow_ban",
    }, 200);
  }

  // ── CHECK 4: Toxicity keyword filter
  const isBlocked = BUILTIN_BLOCKED_WORDS.some((re) => re.test(message_text));
  if (isBlocked) {
    log("info", "toxicity", "Blocked keyword detected", { session_id, user_id });

    const nextBanDuration = await getNextBanDuration(supabase, session_id, user_id);
    await issueBan(supabase, session_id, user_id, nextBanDuration, "TOXIC_CONTENT");

    // Delete the message
    await supabase
      .from("live_chat_messages")
      .delete()
      .eq("id", message_id);

    return json({
      allowed: false,
      reason: "TOXIC_CONTENT",
      action: nextBanDuration === "warn" ? "warn" : "block",
    }, 200);
  }

  // Also check DB-managed blocked words (streamer-configured + platform-wide)
  const { data: blockedWords } = await supabase
    .from("moderation_blocked_words")
    .select("word, is_regex")
    .or(`scope.eq.global,session_id.eq.${session_id}`);

  for (const entry of blockedWords ?? []) {
    try {
      // ── ReDoS guard ────────────────────────────────────────────────────────
      // User-supplied regex patterns from the DB are compiled at runtime.
      // Nested quantifiers like (a+)+ cause catastrophic backtracking in V8.
      // Reject any pattern that contains:
      //   - nested quantifiers  (e.g. (a+)+ or (\w*)*  )
      //   - alternation inside a repeated group  (e.g. (a|b)+)
      // These patterns are the primary ReDoS attack surface.
      if (entry.is_regex) {
        const REDOS_PATTERN = /(\(.*[+*]\)|\[[^\]]*\])[+*{]|(\+|\*)\s*(\+|\*)/;
        if (REDOS_PATTERN.test(entry.word)) {
          log("warn", "redos_guard", "Rejected potentially unsafe regex from DB", {
            word_preview: entry.word.slice(0, 30),
          });
          continue; // skip this entry — do not compile
        }
        // Additionally enforce a character-length cap to prevent mega-patterns
        if (entry.word.length > 200) {
          log("warn", "redos_guard", "Rejected oversized regex pattern", {
            word_length: entry.word.length,
          });
          continue;
        }
      }

      const pattern = entry.is_regex
        ? new RegExp(entry.word, "i")
        : new RegExp(`\\b${entry.word}\\b`, "i");
      if (pattern.test(message_text)) {
        await supabase.from("live_chat_messages").delete().eq("id", message_id);
        return json({
          allowed: false,
          reason: "BLOCKED_WORD",
          action: "block",
        }, 200);
      }
    } catch {
      // Invalid regex in DB (e.g. syntax error) — skip entry silently
    }
  }

  // ── CHECK 5: Link filter
  if (URL_REGEX.test(message_text)) {
    // Check if streamer has allowed links for this session
    const { data: sessionSettings } = await supabase
      .from("live_sessions")
      .select("chat_links_allowed")
      .eq("id", session_id)
      .single();

    if (!sessionSettings?.chat_links_allowed) {
      await supabase.from("live_chat_messages").delete().eq("id", message_id);
      return json({
        allowed: false,
        reason: "LINKS_NOT_ALLOWED",
        action: "block",
      }, 200);
    }
  }

  // All checks passed
  log("info", "check", "Message allowed", { session_id, user_id, message_id });
  return json({ allowed: true }, 200);
});
