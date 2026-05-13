/**
 * supabase/functions/post-reminder-notify/index.ts — Post Reminder Notifications
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

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

interface SendResult {
  reminder_id: string;
  user_id: string;
  success: boolean;
  error?: string;
}

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

async function processReminders(
  supabase: ReturnType<typeof createClient>,
): Promise<{ notified_count: number; errors: Array<{ reminder_id: string; error: string }> }> {
  const now = new Date().toISOString();

  // Step 1: Fetch due reminders with post info (no join to profiles)
  const { data: reminders, error: fetchError } = await supabase
    .from("post_reminders")
    .select("post_id, user_id, remind_at")
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

  log("info", "process", `Processing ${reminders.length} reminders`);

  // Step 2: Get post content and author info
  const postIds = reminders.map((r) => r.post_id);
  const { data: postsData } = await supabase
    .from("posts")
    .select("id, content, author_id")
    .in("id", postIds);

  const postsMap = new Map(
    (postsData ?? []).map((p) => [p.id, p])
  );

  // Step 3: Get author usernames
  const authorIds = [...new Set((postsData ?? []).map((p) => p.author_id).filter(Boolean))];
  let usernameMap = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("user_id, username")
      .in("user_id", authorIds);
    usernameMap = new Map(
      (profilesData ?? []).map((p) => [p.user_id, p.username ?? "author"])
    );
  }

  // Step 4: Mark as notified BEFORE sending (idempotent)
  const reminderPostIds = reminders.map((r) => r.post_id);
  await supabase
    .from("post_reminders")
    .update({ notified: true })
    .in("post_id", reminderPostIds)
    .eq("notified", false);

  const notifRouterUrl = Deno.env.get("NOTIFICATION_ROUTER_URL");
  const notifRouterKey = Deno.env.get("NOTIFICATION_ROUTER_KEY");

  const results: SendResult[] = [];
  let notifiedCount = 0;

  // Process in parallel (max 10 concurrent)
  const CONCURRENCY = 10;
  for (let i = 0; i < reminders.length; i += CONCURRENCY) {
    const batch = reminders.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (reminder) => {
        const post = postsMap.get(reminder.post_id);
        const postContent = (post?.content ?? "Новая публикация") as string;
        const authorUsername = post?.author_id ? (usernameMap.get(post.author_id) ?? "author") : "author";

        const shortContent = postContent.length > 50
          ? postContent.slice(0, 47) + "..."
          : postContent;

        const notifTitle = "Напоминание о публикации";
        const notifBody = `@${authorUsername}: "${shortContent}"`;

        if (!notifRouterUrl) {
          log("warn", "send", "NOTIFICATION_ROUTER_URL not configured", { post_id: reminder.post_id });
          return { reminder_id: reminder.post_id, user_id: reminder.user_id, success: false, error: "NO_NOTIF_ROUTER" };
        }

        await sendPushNotification(
          reminder.user_id,
          notifTitle,
          notifBody,
          { type: "post_reminder", post_id: reminder.post_id },
          notifRouterUrl,
          notifRouterKey,
        );

        return { reminder_id: reminder.post_id, user_id: reminder.user_id, success: true };
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        const r = result.value as SendResult;
        results.push(r);
        if (r.success) notifiedCount++;
      } else {
        log("warn", "send", "Send error", { error: String(result.reason) });
        results.push({ reminder_id: "unknown", user_id: "unknown", success: false, error: String(result.reason) });
      }
    }
  }

  const errors = results
    .filter((r) => !r.success)
    .map((r) => ({ reminder_id: r.reminder_id, error: r.error ?? "UNKNOWN" }));

  log("info", "done", "Batch complete", { total: reminders.length, notified: notifiedCount, failed: errors.length });

  return { notified_count: notifiedCount, errors };
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(origin);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const isInternalCall = req.headers.get("X-Internal-Call") === "1";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: "INTERNAL_ERROR" }, 500);
  }

  // Internal calls bypass auth
  if (!isInternalCall) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "UNAUTHORIZED" }, 401);
    }
    const token = authHeader.slice(7);
    if (token !== serviceRoleKey) {
      return json({ success: false, error: "FORBIDDEN" }, 403);
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const result = await processReminders(supabase);
    return json({ success: true, ...result }, 200);
  } catch (err) {
    log("error", "process", "Error", { error: String(err) });
    return json({ success: false, error: "PROCESSING_FAILED", detail: String(err) }, 500);
  }
});
