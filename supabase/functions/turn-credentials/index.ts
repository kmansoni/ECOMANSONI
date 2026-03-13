import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getCorsHeaders, handleCors } from "../_shared/utils.ts";

const DEFAULT_TURN_TTL_SECONDS = 3600;
const MIN_TURN_TTL_SECONDS = 3600;
const MAX_TURN_TTL_SECONDS = 24 * 3600;

const TURN_RATE_MAX_PER_WINDOW = Math.max(1, Number(Deno.env.get("TURN_RATE_MAX_PER_MINUTE") ?? "20"));
const TURN_RATE_HARD_CAP_PER_WINDOW = Math.max(1, Number(Deno.env.get("TURN_RATE_HARD_CAP_PER_MINUTE") ?? "200"));
const TURN_LOCAL_RL_WINDOW_MS = 60_000;

const TURN_REPLAY_WINDOW_MS = Math.max(1_000, Number(Deno.env.get("TURN_REPLAY_WINDOW_MS") ?? "300000"));
const TURN_METRICS_WINDOW_MS = Math.max(60_000, Number(Deno.env.get("TURN_METRICS_WINDOW_MS") ?? "3600000"));

const TURN_NO_STORE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

type LocalRateState = { bucket: number; cnt: number };
const localUserRateBuckets = new Map<string, LocalRateState>();
const localIpRateBuckets = new Map<string, LocalRateState>();
const replayNonceBuckets = new Map<string, number>();

const metrics = {
  startedAt: Date.now(),
  requests: 0,
  success: 0,
  unauthorized: 0,
  replayRejected: 0,
  rateLimited: 0,
  errors: 0,
  sumLatencyMs: 0,
  maxLatencyMs: 0,
};

function nowMs(): number {
  return Date.now();
}

function logEvent(event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({
    service: "turn-credentials",
    event,
    ts: new Date().toISOString(),
    ...payload,
  }));
}

function parseUrls(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSecrets(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseApiKeys(): string[] {
  const keys = [
    ...parseSecrets(Deno.env.get("TURN_API_KEYS")),
    ...parseSecrets(Deno.env.get("TURN_CREDENTIALS_API_KEY")),
  ];
  return [...new Set(keys)];
}

function parseBool(raw: string | undefined | null, defaultValue: boolean): boolean {
  if (!raw) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return defaultValue;
}

function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['\"]+|['\"]+$/g, "");
}

function isProductionEnv(): boolean {
  const env = (
    Deno.env.get("ENV") ??
    Deno.env.get("DENO_ENV") ??
    Deno.env.get("NODE_ENV") ??
    ""
  ).toLowerCase();
  if (env === "prod" || env === "production") return true;

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").toLowerCase();
  if (!supabaseUrl) return true;
  if (supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1")) return false;
  return true;
}

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function toBase64Url(raw: string): string {
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
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
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64FromArrayBuffer(sig);
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",").map((s) => s.trim()).find(Boolean);
  const ip = first || req.headers.get("x-real-ip") || "unknown";
  return ip.replace(/^::ffff:/i, "");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function shouldFailHardOnRateLimitMisconfig(): boolean {
  const raw = (Deno.env.get("TURN_REQUIRE_RATE_LIMIT") ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function shouldFailHardOnReplayMisconfig(): boolean {
  const raw = (Deno.env.get("TURN_REQUIRE_DURABLE_REPLAY") ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return isProductionEnv();
}

function parseRequestedTtlSeconds(body: unknown): number {
  const record = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const requested = Number(record.ttlSeconds ?? Deno.env.get("TURN_TTL_SECONDS") ?? `${DEFAULT_TURN_TTL_SECONDS}`);
  const ttl = Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_TURN_TTL_SECONDS;
  return Math.max(MIN_TURN_TTL_SECONDS, Math.min(MAX_TURN_TTL_SECONDS, ttl));
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function parseRequestBody(req: Request): Promise<Record<string, unknown>> {
  const method = req.method.toUpperCase();
  if (method !== "POST") return {};

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return {};

  const text = await req.text();
  if (!text) return {};
  return (safeJsonParse(text) as Record<string, unknown>) || {};
}

function makeJsonResponse(
  corsHeaders: Record<string, string>,
  status: number,
  payload: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, ...TURN_NO_STORE_HEADERS },
  });
}

function cleanupWindowedMaps(): void {
  const now = nowMs();
  const minMetricWindow = now - TURN_METRICS_WINDOW_MS;

  for (const [k, v] of localUserRateBuckets.entries()) {
    if (v.bucket * TURN_LOCAL_RL_WINDOW_MS < minMetricWindow) localUserRateBuckets.delete(k);
  }
  for (const [k, v] of localIpRateBuckets.entries()) {
    if (v.bucket * TURN_LOCAL_RL_WINDOW_MS < minMetricWindow) localIpRateBuckets.delete(k);
  }
  for (const [k, expiresAt] of replayNonceBuckets.entries()) {
    if (expiresAt <= now) replayNonceBuckets.delete(k);
  }
}

function extractNonce(req: Request, body: Record<string, unknown>): string {
  const headerNonce = normalizeEnv(req.headers.get("x-turn-nonce") ?? req.headers.get("x-request-id") ?? "");
  if (headerNonce) return headerNonce.slice(0, 120);
  const bodyNonce = normalizeEnv(String(body.nonce ?? body.requestId ?? ""));
  return bodyNonce.slice(0, 120);
}

async function enforceReplayProtection(
  userKey: string,
  nonce: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const requireNonce = parseBool(Deno.env.get("TURN_REQUIRE_NONCE"), isProductionEnv());

  if (!nonce) {
    if (!requireNonce) return null;
    return makeJsonResponse(corsHeaders, 400, { error: "invalid_request" });
  }

  const replayKey = `${userKey}:${nonce}`;
  const now = nowMs();
  const seenUntil = replayNonceBuckets.get(replayKey);
  if (seenUntil && seenUntil > now) {
    metrics.replayRejected += 1;
    return makeJsonResponse(corsHeaders, 409, { error: "replay_detected" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    if (shouldFailHardOnReplayMisconfig()) {
      return makeJsonResponse(corsHeaders, 500, { error: "misconfigured" });
    }
    replayNonceBuckets.set(replayKey, now + TURN_REPLAY_WINDOW_MS);
    logEvent("turn.replay.local_fallback", {});
    return null;
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const userScope = await hashRateScope(`replay:${userKey}`);
    const nonceHashSecret = Deno.env.get("TURN_REPLAY_NONCE_HASH_SECRET") ??
      Deno.env.get("TURN_RL_SCOPE_HASH_SECRET") ??
      Deno.env.get("TURN_SHARED_SECRET") ??
      "turn-replay";
    const nonceHash = toBase64Url(await hmacSha256Base64(nonceHashSecret, nonce)).slice(0, 48);

    const { data, error } = await (admin as any).rpc("turn_replay_guard_hit_v1", {
      p_user_scope: userScope,
      p_nonce_hash: nonceHash,
      p_window_ms: TURN_REPLAY_WINDOW_MS,
    });

    if (error) {
      logEvent("turn.replay.rpc_error", { code: error.code ?? null, message: error.message ?? null });
      if (shouldFailHardOnReplayMisconfig()) {
        return makeJsonResponse(corsHeaders, 500, { error: "misconfigured" });
      }
      replayNonceBuckets.set(replayKey, now + TURN_REPLAY_WINDOW_MS);
      logEvent("turn.replay.local_fallback", { reason: "rpc_error" });
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      metrics.replayRejected += 1;
      replayNonceBuckets.set(replayKey, now + TURN_REPLAY_WINDOW_MS);
      return makeJsonResponse(corsHeaders, 409, { error: "replay_detected" });
    }
  } catch {
    if (shouldFailHardOnReplayMisconfig()) {
      return makeJsonResponse(corsHeaders, 500, { error: "misconfigured" });
    }
    replayNonceBuckets.set(replayKey, now + TURN_REPLAY_WINDOW_MS);
    logEvent("turn.replay.local_fallback", { reason: "exception" });
    return null;
  }

  replayNonceBuckets.set(replayKey, now + TURN_REPLAY_WINDOW_MS);
  return null;
}

async function hashRateScope(scope: string): Promise<string> {
  const secret = Deno.env.get("TURN_RL_SCOPE_HASH_SECRET") ?? Deno.env.get("TURN_USER_HASH_SECRET") ?? Deno.env.get("TURN_SHARED_SECRET") ?? "turn-rl";
  const digest = await hmacSha256Base64(secret, scope);
  return toBase64Url(digest).slice(0, 32);
}

async function enforceTurnIssueRateLimit(
  userId: string,
  ip: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const localBucket = Math.floor(nowMs() / TURN_LOCAL_RL_WINDOW_MS);
  const effectiveLocalMax = Math.min(TURN_RATE_MAX_PER_WINDOW, TURN_RATE_HARD_CAP_PER_WINDOW);

  const userState = localUserRateBuckets.get(userId);
  const userCount = userState && userState.bucket === localBucket ? userState.cnt + 1 : 1;
  localUserRateBuckets.set(userId, { bucket: localBucket, cnt: userCount });

  const ipState = localIpRateBuckets.get(ip);
  const ipCount = ipState && ipState.bucket === localBucket ? ipState.cnt + 1 : 1;
  localIpRateBuckets.set(ip, { bucket: localBucket, cnt: ipCount });

  if (userCount > effectiveLocalMax || ipCount > TURN_RATE_HARD_CAP_PER_WINDOW) {
    metrics.rateLimited += 1;
    return makeJsonResponse(corsHeaders, 429, { error: "rate_limited" });
  }

  if (!isUuid(userId)) {
    if (isProductionEnv()) {
      return makeJsonResponse(corsHeaders, 500, { error: "misconfigured" });
    }
    logEvent("turn.rl.skipped.non_uuid", {});
    return null;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    if (isProductionEnv() && shouldFailHardOnRateLimitMisconfig()) {
      return makeJsonResponse(corsHeaders, 500, { error: "misconfigured" });
    }
    logEvent("turn.rl.skipped.no_service_key", {});
    return null;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const ipScope = await hashRateScope(ip);

  const { data, error } = await (admin as any).rpc("turn_issuance_rl_hit_v1", {
    p_user_id: userId,
    p_ip: ipScope,
    p_max: effectiveLocalMax,
  });

  if (error) {
    logEvent("turn.rl.rpc_error", { code: error.code ?? null, message: error.message ?? null });
    if (isProductionEnv() && shouldFailHardOnRateLimitMisconfig()) {
      return makeJsonResponse(corsHeaders, 500, { error: "misconfigured" });
    }
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    metrics.rateLimited += 1;
    return makeJsonResponse(corsHeaders, 429, { error: "rate_limited" });
  }

  return null;
}

type AuthResult = { userId: string; authType: "jwt" | "api_key" };

async function authenticateRequest(req: Request): Promise<AuthResult | null> {
  const apiKeys = parseApiKeys();
  const presentedApiKey = normalizeEnv(
    req.headers.get("x-turn-api-key") ??
    req.headers.get("x-api-key") ??
    req.headers.get("apikey") ??
    "",
  );

  if (presentedApiKey && apiKeys.includes(presentedApiKey)) {
    const keyHash = toBase64Url(await hmacSha256Base64("turn-api-key", presentedApiKey)).slice(0, 24);
    return { userId: `apikey:${keyHash}`, authType: "api_key" };
  }

  const allowAnon = Deno.env.get("TURN_ALLOW_ANON_DEV") === "1";
  if (allowAnon && !isProductionEnv()) {
    return { userId: "dev-anon", authType: "jwt" };
  }

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const authKeys = [
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
  ].map((v) => v.trim()).filter((v, i, arr) => !!v && arr.indexOf(v) === i);

  if (!supabaseUrl || authKeys.length === 0) return null;

  for (const key of authKeys) {
    try {
      const supabase = createClient(supabaseUrl, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user?.id) return { userId: data.user.id, authType: "jwt" };
    } catch {
      // try next key
    }
  }

  return null;
}

async function buildTurnCredentials(userId: string, ttlSeconds: number): Promise<{ username: string; credential: string; expiresAt: string }> {
  const secret = normalizeEnv(Deno.env.get("TURN_SHARED_SECRET") ?? "");
  if (!secret) {
    throw new Error("turn_shared_secret_missing");
  }

  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const userHashSecret = Deno.env.get("TURN_USER_HASH_SECRET") ?? secret;
  const userHash = toBase64Url(await hmacSha256Base64(userHashSecret, userId)).slice(0, 20);
  const username = `${expiry}:u_${userHash}`;
  const credential = await hmacSha1Base64(secret, username);

  return {
    username,
    credential,
    expiresAt: new Date(expiry * 1000).toISOString(),
  };
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

function getTurnUrls(): string[] {
  const v4 = parseUrls(Deno.env.get("TURN_URLS"));
  const v6 = parseUrls(Deno.env.get("TURN_URLS_V6"));
  return [...new Set([...v4, ...v6])];
}

function getStunUrls(): string[] {
  const envStun = parseUrls(Deno.env.get("STUN_URLS"));
  if (envStun.length > 0) return envStun;
  return [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
  ];
}

async function writeAuditLog(payload: Record<string, unknown>): Promise<void> {
  if (!parseBool(Deno.env.get("TURN_AUDIT_LOG_ENABLED"), true)) return;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return;

  try {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    await admin.from("turn_issuance_audit").insert(payload as never);
  } catch {
    // best effort only
  }
}

function maybeHandleMetrics(req: Request, corsHeaders: Record<string, string>): Response | null {
  const url = new URL(req.url);
  if (req.method.toUpperCase() !== "GET" || url.pathname !== "/metrics") return null;

  const metricsKey = normalizeEnv(Deno.env.get("TURN_METRICS_KEY") ?? "");
  if (!metricsKey) return makeJsonResponse(corsHeaders, 404, { error: "not_found" });

  const provided = normalizeEnv(req.headers.get("x-turn-metrics-key") ?? "");
  if (!provided || provided !== metricsKey) return makeJsonResponse(corsHeaders, 403, { error: "forbidden" });

  const avgLatency = metrics.success + metrics.errors + metrics.rateLimited + metrics.unauthorized + metrics.replayRejected > 0
    ? Math.round(metrics.sumLatencyMs / Math.max(1, metrics.requests))
    : 0;

  return makeJsonResponse(corsHeaders, 200, {
    service: "turn-credentials",
    uptimeMs: nowMs() - metrics.startedAt,
    requests: metrics.requests,
    success: metrics.success,
    unauthorized: metrics.unauthorized,
    replayRejected: metrics.replayRejected,
    rateLimited: metrics.rateLimited,
    errors: metrics.errors,
    avgLatencyMs: avgLatency,
    maxLatencyMs: metrics.maxLatencyMs,
    localReplayCacheSize: replayNonceBuckets.size,
    localUserRlCacheSize: localUserRateBuckets.size,
    localIpRlCacheSize: localIpRateBuckets.size,
  });
}

serve(async (req) => {
  cleanupWindowedMaps();

  const cors = handleCors(req);
  if (cors) return cors;

  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const metricsResponse = maybeHandleMetrics(req, corsHeaders);
  if (metricsResponse) return metricsResponse;

  const requestId = normalizeEnv(req.headers.get("x-request-id") ?? crypto.randomUUID());
  const startedAt = nowMs();
  metrics.requests += 1;

  if (req.method.toUpperCase() !== "POST") {
    return makeJsonResponse(corsHeaders, 405, { error: "method_not_allowed" });
  }

  const body = await parseRequestBody(req);
  const ttlSeconds = parseRequestedTtlSeconds(body);

  const auth = await authenticateRequest(req);
  if (!auth) {
    metrics.unauthorized += 1;
    return makeJsonResponse(corsHeaders, 401, { error: "unauthorized", requestId });
  }

  const clientIp = getClientIp(req);
  const nonce = extractNonce(req, body);
  const replay = await enforceReplayProtection(auth.userId, nonce, corsHeaders);
  if (replay) {
    const latencyMs = Math.max(1, nowMs() - startedAt);
    metrics.sumLatencyMs += latencyMs;
    metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, latencyMs);
    return replay;
  }

  const rl = await enforceTurnIssueRateLimit(auth.userId, clientIp, corsHeaders);
  if (rl) {
    const latencyMs = Math.max(1, nowMs() - startedAt);
    metrics.sumLatencyMs += latencyMs;
    metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, latencyMs);
    return rl;
  }

  try {
    const turnUrls = getTurnUrls();
    const stunUrls = getStunUrls();

    if (turnUrls.length === 0) {
      logEvent("turn.issue.no_turn_urls", { requestId });
      const latencyMs = Math.max(1, nowMs() - startedAt);
      metrics.success += 1;
      metrics.sumLatencyMs += latencyMs;
      metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, latencyMs);

      await writeAuditLog({
        request_id: requestId,
        auth_type: auth.authType,
        user_hash: toBase64Url(await hmacSha256Base64("turn-audit-user", auth.userId)).slice(0, 32),
        ip_hash: await hashRateScope(clientIp),
        outcome: "stun_only",
        status_code: 200,
        latency_ms: latencyMs,
        ttl_seconds: ttlSeconds,
        error_code: "turn_not_configured",
        region_hint: normalizeEnv(Deno.env.get("TURN_REGION") ?? "global"),
      });

      return makeJsonResponse(corsHeaders, 200, {
        requestId,
        ttlSeconds,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        error: "turn_not_configured",
        iceServers: stunUrls.map((u) => ({ urls: u })),
      });
    }

    const creds = await buildTurnCredentials(auth.userId, ttlSeconds);
    const iceServers = [
      ...stunUrls.map((u) => ({ urls: u })),
      ...splitIceServersByUrl({ urls: turnUrls, username: creds.username, credential: creds.credential }),
    ];

    const latencyMs = Math.max(1, nowMs() - startedAt);
    metrics.success += 1;
    metrics.sumLatencyMs += latencyMs;
    metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, latencyMs);

    await writeAuditLog({
      request_id: requestId,
      auth_type: auth.authType,
      user_hash: toBase64Url(await hmacSha256Base64("turn-audit-user", auth.userId)).slice(0, 32),
      ip_hash: await hashRateScope(clientIp),
      outcome: "ok",
      status_code: 200,
      latency_ms: latencyMs,
      ttl_seconds: ttlSeconds,
      error_code: null,
      region_hint: normalizeEnv(Deno.env.get("TURN_REGION") ?? "global"),
    });

    logEvent("turn.issue.ok", {
      requestId,
      authType: auth.authType,
      ttlSeconds,
      latencyMs,
      turnCount: turnUrls.length,
    });

    return makeJsonResponse(corsHeaders, 200, {
      requestId,
      ttlSeconds,
      expiresAt: creds.expiresAt,
      username: creds.username,
      credentialType: "hmac-sha1",
      iceServers,
      region: normalizeEnv(Deno.env.get("TURN_REGION") ?? "global"),
    });
  } catch (error) {
    const latencyMs = Math.max(1, nowMs() - startedAt);
    metrics.errors += 1;
    metrics.sumLatencyMs += latencyMs;
    metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, latencyMs);

    const stunUrls = getStunUrls();

    await writeAuditLog({
      request_id: requestId,
      auth_type: auth.authType,
      user_hash: toBase64Url(await hmacSha256Base64("turn-audit-user", auth.userId)).slice(0, 32),
      ip_hash: await hashRateScope(clientIp),
      outcome: "error_fallback_stun",
      status_code: 200,
      latency_ms: latencyMs,
      ttl_seconds: ttlSeconds,
      error_code: "turn_credentials_unavailable",
      region_hint: normalizeEnv(Deno.env.get("TURN_REGION") ?? "global"),
    });

    logEvent("turn.issue.error", {
      requestId,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    });

    return makeJsonResponse(corsHeaders, 200, {
      requestId,
      ttlSeconds,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      error: "turn_credentials_unavailable",
      iceServers: stunUrls.map((u) => ({ urls: u })),
    });
  }
});
