/**
 * supabase/functions/post-reminder-notify/index.ts — Post Reminder Notifications
 *
 * Security model:
 *  - Called by pg_cron every minute (via HTTP with service_role key) OR X-Internal-Call
 *  - Uses service_role for all DB operations
 *  - Idempotent: marks `notified = true` before sending to prevent duplicates on retry
 *  - Batch limit: 100 reminders per invocation to bound execution time
 *
 * Triggered by:
 *  - pg_cron: SELECT net.http_post('https://<project>.supabase.co/functions/v1/post-reminder-notify', ...)
 *
 * Environment variables:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - NOTIFICATION_ROUTER_URL      — URL of notification-router service
 *  - NOTIFICATION_ROUTER_KEY      — API key for notification-router
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
      fn: "post-reminder-notify",
      level,
      action,
      message,
      ...data,
    }),
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReminderRow {
  id: string;
  user_id: string;
  post_id: string;
  remind_at: string;
}

interface SendResult {
  reminder_id: string;
  user_id: string;
  success: boolean;
  error?: string;
}

// ─── Notification dispatch ────────────────────────────────────────────────────

async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
  notifRouterUrl: string,
  notifRouterKey: string | undefined,
): Promise<void> {
  const resp = await fetch(`${notifRouterUrl.replace(/\/$/, "")}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(notifRouterKey ? { "X-API-Key": notifRouterKey } : {}),
    },
    body: JSON.stringify({ user_id: userId, type: "post_reminder", title, body, data }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notification router returned ${resp.status}: ${text}`);
  }
}

// ─── Main processing ──────────────────────────────────────────────────────────

async function processReminders(
  supabase: ReturnType<typeof createClient>,
): Promise<{ notified_count: number; errors: Array<{ reminder_id: string; error: string }> }> {
  const now = new Date().toISOString();

  // Fetch due reminders with post and author info
  const { data: reminders, error: fetchError } = await supabase
    .from("post_reminders")
    .select(`
      id,
      user_id,
      post_id,
      remind_at,
      posts!inner (
        id,
        content,
        author_id,
        profiles!inner (
          username
        )
      )
    `)
    .lte("remind_at", now)
    .eq("notified", false)
    .limit(100)
    .order("remind_at", { ascending: true });

  if (fetchError) {
    log("error", "fetch", "Failed to fetch reminders", { error: fetchError.message });
    throw new Error(`Fetch failed: ${fetchError.message}`);
  }

  if (!reminders || reminders.length === 0) {
    log("info", "process", "No pending reminders", { checked_at: now });
    return { notified_count: 0, errors: [] };
  }

  log("info", "process", `Processing ${reminders.length} reminders`, { count: reminders.length });

  // CRITICAL: Mark as notified BEFORE sending to prevent duplicate sends on retry
  const reminderIds = reminders.map((r: { id: string }) => r.id);
  const { error: markError } = await supabase
    .from("post_reminders")
    .update({ notified: true })
    .in("id", reminderIds);

  if (markError) {
    log("error", "mark", "Failed to mark reminders as notified", { error: markError.message });
    throw new Error(`Mark failed: ${markError.message}`);
  }

  const notifRouterUrl = Deno.env.get("NOTIFICATION_ROUTER_URL");
  const notifRouterKey = Deno.env.get("NOTIFICATION_ROUTER_KEY");

  const results: SendResult[] = [];
  let notifiedCount = 0;

  // Process in parallel with a concurrency limiter (max 10 concurrent)
  const CONCURRENCY = 10;
  for (let i = 0; i < reminders.length; i += CONCURRENCY) {
    const batch = reminders.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (reminder: Record<string, unknown>) => {
        const userId = reminder.user_id as string;
        const reminderId = reminder.id as string;
        const post = reminder.posts as Record<string, unknown> | null;
        const postContent = (post?.content as string | null) ?? "Новая публикация";
        const authorUsername = (post?.profiles as Record<string, unknown> | null)?.username as string | null ?? "author";

        // Truncate content for notification
        const shortContent = postContent.length > 50
          ? postContent.slice(0, 47) + "..."
          : postContent;

        const notifTitle = "Напоминание о публикации";
        const notifBody = postContent
          ? `@${authorUsername}: "${shortContent}"`
          : `@${authorUsername} опубликовал новый контент`;

        if (!notifRouterUrl) {
          log("warn", "send", "NOTIFICATION_ROUTER_URL not configured", { reminder_id: reminderId });
          return { reminder_id: reminderId, user_id: userId, success: false, error: "NO_NOTIF_ROUTER" };
        }

        await sendPushNotification(
          userId,
          notifTitle,
          notifBody,
          {
            type: "post_reminder",
            post_id: reminder.post_id as string,
          },
          notifRouterUrl,
          notifRouterKey,
        );

        return { reminder_id: reminderId, user_id: userId, success: true };
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        const r = result.value as SendResult;
        results.push(r);
        if (r.success) notifiedCount++;
      } else {
        log("warn", "send", "Reminder send threw uncaught error", {
          error: String(result.reason),
        });
        results.push({ reminder_id: "unknown", user_id: "unknown", success: false, error: String(result.reason) });
      }
    }
  }

  const errors = results
    .filter((r) => !r.success)
    .map((r) => ({ reminder_id: r.reminder_id, error: r.error ?? "UNKNOWN" }));

  if (errors.length > 0) {
    try {
      await supabase.from("reminder_send_errors").insert(
        errors.map((e) => ({
          reminder_id: e.reminder_id,
          error: e.error,
          occurred_at: now,
        })),
      );
    } catch {
      log("warn", "audit", "Failed to persist send errors to DB");
    }
  }

  log("info", "done", "Reminder batch complete", {
    total: reminders.length,
    notified: notifiedCount,
    failed: errors.length,
  });

  return { notified_count: notifiedCount, errors };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(origin);

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  const isInternalCall = req.headers.get("X-Internal-Call") === "1";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    log("error", "config", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const result = await processReminders(supabase);
    return json({ success: true, ...result }, 200);
  } catch (err) {
    log("error", "process", "processReminders threw", { error: String(err) });
    return json({ success: false, error: "PROCESSING_FAILED", detail: String(err) }, 500);
  }
});
