/**
 * supabase/functions/email-send/index.ts — Серверный прокси для email-router.
 *
 * Security model (zero-trust):
 *  - Все запросы ОБЯЗАНЫ иметь валидный Supabase JWT (Authorization: Bearer <token>).
 *  - EMAIL_ROUTER_API_KEY хранится только в Supabase Vault — никогда не покидает
 *    серверную среду и не попадает в бандл браузера.
 *  - Rate limiting: 10 email/user/10min (in-memory, per Edge Function instance).
 *  - Входящий body проходит schema-валидацию перед проксированием.
 *  - Upstream 5xx логируются и возвращаются клиенту как 502 (без деталей SMTP).
 *
 * Environment variables (Supabase Vault):
 *  - SUPABASE_URL          — автоматически предоставляется Supabase runtime
 *  - SUPABASE_ANON_KEY     — автоматически предоставляется Supabase runtime
 *  - EMAIL_ROUTER_URL      — URL email-router, доступный из Edge Function
 *  - EMAIL_ROUTER_API_KEY  — секретный API-ключ email-router
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enforceCors,
  getCorsHeaders,
  handleCors,
} from "../_shared/utils.ts";

// ─── Rate limiting ────────────────────────────────────────────────────────────

const EMAIL_RATE_LIMIT_MAX = 10;
const EMAIL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min

const rateLimits = new Map<string, { count: number; resetAt: number }>();

// Proactive cleanup: remove expired entries every window to prevent unbounded Map growth.
// Edge Function instances are long-lived; without this, every unique user ID accumulates forever.
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(uid);
  }
}, EMAIL_RATE_LIMIT_WINDOW_MS);

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + EMAIL_RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= EMAIL_RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  from?: string;
  replyTo?: string;
}

function validatePayload(body: unknown): { valid: true; payload: EmailPayload } | { valid: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "INVALID_BODY: expected JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.to !== "string" || !b.to.includes("@")) {
    return { valid: false, error: "INVALID_FIELD: 'to' must be a valid email address" };
  }

  // Must have at least one of: subject+html/text, or template
  const hasContent = b.html || b.text || b.subject;
  const hasTemplate = typeof b.template === "string" && b.template.length > 0;

  if (!hasContent && !hasTemplate) {
    return { valid: false, error: "INVALID_BODY: must provide either 'template' or 'subject'+'html'/'text'" };
  }

  return {
    valid: true,
    payload: {
      to: b.to as string,
      subject: typeof b.subject === "string" ? b.subject : undefined,
      html: typeof b.html === "string" ? b.html : undefined,
      text: typeof b.text === "string" ? b.text : undefined,
      template: typeof b.template === "string" ? b.template : undefined,
      templateData: b.templateData && typeof b.templateData === "object" && !Array.isArray(b.templateData)
        ? b.templateData as Record<string, unknown>
        : undefined,
      from: typeof b.from === "string" ? b.from : undefined,
      replyTo: typeof b.replyTo === "string" ? b.replyTo : undefined,
    },
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // 1. CORS preflight
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // 2. Method gate
  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // 3. Auth — Supabase JWT verification
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[email-send] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return json({ success: false, error: "INTERNAL_ERROR" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  // 4. Health probe short-circuit — authenticated but skip rate limit and email send.
  // X-Health-Probe: 1 is sent by checkEmailHealth() to confirm the service is reachable
  // without consuming the user's send quota.
  if (req.headers.get("X-Health-Probe") === "1") {
    return json({ success: true, probe: true }, 200);
  }

  // 5. Rate limiting (per authenticated user)
  if (!checkRateLimit(user.id)) {
    return json({ success: false, error: "RATE_LIMITED", retryable: true }, 429);
  }

  // 6. Parse and validate request body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ success: false, error: "INVALID_JSON" }, 400);
  }

  const validation = validatePayload(rawBody);
  if (!validation.valid) {
    return json({ success: false, error: validation.error }, 400);
  }

  // 7. Read upstream config from Vault
  const emailRouterUrl = Deno.env.get("EMAIL_ROUTER_URL");
  const emailRouterApiKey = Deno.env.get("EMAIL_ROUTER_API_KEY");

  if (!emailRouterUrl || !emailRouterApiKey) {
    console.error("[email-send] Missing EMAIL_ROUTER_URL or EMAIL_ROUTER_API_KEY in Vault");
    return json({ success: false, error: "EMAIL_SERVICE_UNAVAILABLE" }, 503);
  }

  // 8. Proxy to email-router with upstream API key (never exposed to client)
  let upstreamResponse: Response;
  try {
    const upstreamUrl = `${emailRouterUrl.replace(/\/$/, "")}/send`;
    upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": emailRouterApiKey,
        "X-Forwarded-User": user.id, // audit trail
      },
      body: JSON.stringify(validation.payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    console.error("[email-send] Upstream fetch failed:", isTimeout ? "timeout" : String(err));
    return json({
      success: false,
      error: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
      retryable: true,
    }, 502);
  }

  // 9. Parse upstream response
  let upstreamData: unknown;
  try {
    upstreamData = await upstreamResponse.json();
  } catch {
    upstreamData = { success: false, error: "UPSTREAM_INVALID_RESPONSE" };
  }

  // 5xx from upstream → 502 to client (don't leak SMTP details)
  if (upstreamResponse.status >= 500) {
    console.error("[email-send] Upstream returned", upstreamResponse.status, "for user", user.id);
    return json({ success: false, error: "UPSTREAM_ERROR", retryable: true }, 502);
  }

  return json(upstreamData, upstreamResponse.status);
});
