import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_TURN_TTL_SECONDS = 3600;
const MIN_TURN_TTL_SECONDS = 60;
const MAX_TURN_TTL_SECONDS = 3600;
const TURN_RATE_MAX_PER_WINDOW = Math.max(1, Number(Deno.env.get("TURN_RATE_MAX_PER_MINUTE") ?? "10"));
const TURN_NO_STORE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

function parseUrls(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64FromArrayBuffer(sig);
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64FromArrayBuffer(sig);
}

function toBase64Url(raw: string): string {
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isProductionEnv(): boolean {
  const env = (
    Deno.env.get("ENV") ??
    Deno.env.get("DENO_ENV") ??
    Deno.env.get("NODE_ENV") ??
    ""
  ).toLowerCase();
  if (env === "prod" || env === "production") return true;

  // Safety heuristic: if Supabase URL is non-local, treat as production-like.
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").toLowerCase();
  if (!supabaseUrl) return true;
  if (supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1")) return false;
  return true;
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",").map((s) => s.trim()).find(Boolean);
  return first || req.headers.get("x-real-ip") || "unknown";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function enforceTurnIssueRateLimit(userId: string, ip: string): Promise<Response | null> {
  if (!isUuid(userId)) {
    // Dev-only anonymous mode returns a non-UUID (e.g. "dev-anon").
    // In production, this must never happen.
    if (isProductionEnv()) {
      return new Response(
        JSON.stringify({ error: "misconfigured" }),
        { status: 500, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } },
      );
    }
    console.warn("[TURN] Rate limit skipped (non-UUID userId)");
    return null;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    if (isProductionEnv()) {
      return new Response(
        JSON.stringify({ error: "misconfigured" }),
        { status: 500, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } },
      );
    }
    console.warn("[TURN] Rate limit skipped (missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)");
    return null;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await (admin as any).rpc("turn_issuance_rl_hit_v1", {
    p_user_id: userId,
    p_ip: ip,
    p_max: TURN_RATE_MAX_PER_WINDOW,
  });

  if (error) {
    console.error("[TURN] Rate limit RPC failed:", error);
    if (isProductionEnv()) {
      return new Response(
        JSON.stringify({ error: "misconfigured" }),
        { status: 500, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } },
      );
    }
    return null;
  }

  if (data && data.allowed === false) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } },
    );
  }

  return null;
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const allowAnon = Deno.env.get("TURN_ALLOW_ANON_DEV") === "1";
  if (allowAnon && isProductionEnv()) return null;
  if (allowAnon) return "dev-anon";

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

function splitIceServersByUrl(server: { urls: string | string[]; username?: string; credential?: string }) {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  const out: Array<{ urls: string; username?: string; credential?: string }> = [];
  for (const u of urls) {
    if (typeof u !== "string" || !u) continue;
    if (u.startsWith("stun:")) out.push({ urls: u });
    else out.push({ urls: u, username: server.username, credential: server.credential });
  }
  return out;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (Deno.env.get("TURN_ALLOW_ANON_DEV") === "1" && isProductionEnv()) {
    return new Response(
      JSON.stringify({ error: "misconfigured" }),
      { status: 500, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } },
    );
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } },
    );
  }
  const clientIp = getClientIp(req);
  const rl = await enforceTurnIssueRateLimit(userId, clientIp);
  if (rl) return rl;

  const ttlSeconds = Math.max(
    MIN_TURN_TTL_SECONDS,
    Math.min(
      MAX_TURN_TTL_SECONDS,
      Number(Deno.env.get("TURN_TTL_SECONDS") ?? `${DEFAULT_TURN_TTL_SECONDS}`),
    ),
  );

  try {
    // Provider priority:
    // 1) Self-host / any TURN provider via TURN_URLS + (TURN_SHARED_SECRET or TURN_USERNAME+TURN_CREDENTIAL)
    // 2) STUN-only fallback

    const turnUrls = parseUrls(Deno.env.get("TURN_URLS"));
    const turnSharedSecret = Deno.env.get("TURN_SHARED_SECRET");
    const turnUsername = Deno.env.get("TURN_USERNAME");
    const turnCredential = Deno.env.get("TURN_CREDENTIAL");

    if (turnUrls.length > 0) {
      console.log("[TURN] Using TURN_URLS from secrets (provider-agnostic)");

      if (turnSharedSecret) {
        // coturn REST auth: username is expiry timestamp
        const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
        const userHashSecret = Deno.env.get("TURN_USER_HASH_SECRET") ?? turnSharedSecret;
        const userHash = toBase64Url(await hmacSha256Base64(userHashSecret, userId)).slice(0, 12);
        const authUser = `${expiry}:u_${userHash}`;
        const authPass = await hmacSha1Base64(turnSharedSecret, authUser);

        const iceServers = [
          { urls: "stun:stun.l.google.com:19302" },
          ...splitIceServersByUrl({ urls: turnUrls, username: authUser, credential: authPass }),
        ];

        return new Response(JSON.stringify({ iceServers, ttlSeconds }), {
          status: 200,
          headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS },
        });
      }

      if (turnUsername && turnCredential) {
        const iceServers = [
          { urls: "stun:stun.l.google.com:19302" },
          ...splitIceServersByUrl({ urls: turnUrls, username: turnUsername, credential: turnCredential }),
        ];

        return new Response(JSON.stringify({ iceServers, ttlSeconds }), {
          status: 200,
          headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS },
        });
      }

      console.warn("[TURN] TURN_URLS set but missing TURN_SHARED_SECRET or TURN_USERNAME/TURN_CREDENTIAL");
      return new Response(
        JSON.stringify({
          error: "turn_config_incomplete",
          ttlSeconds,
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        }),
        { status: 200, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } }
      );
    }

    console.error(
      "[TURN] Missing TURN config. Set TURN_URLS + TURN_SHARED_SECRET (or TURN_USERNAME/TURN_CREDENTIAL)."
    );
    return new Response(
      JSON.stringify({
        error: "turn_not_configured",
        ttlSeconds,
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      }),
      { status: 200, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } }
    );
  } catch (error: unknown) {
    console.error("[TURN] Exception:", error);

    // Return fallback on exception
    return new Response(
      JSON.stringify({ 
        error: "turn_credentials_unavailable",
        ttlSeconds,
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ]
      }),
      { status: 200, headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS } }
    );
  }
});
