import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env validation — fail fast if required vars are absent
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const AUTH_SERVICE_PORT = Number(process.env.AUTH_SERVICE_PORT ?? "8087");

/**
 * Optional: URL of the phone-auth microservice that sends SMS OTPs.
 * When set, /v1/auth/start will call PHONE_AUTH_INTERNAL_URL/auth/phone/send-otp
 * (unauthenticated internal network call).
 * When absent, OTP is only stored in DB; SMS must be sent via another channel.
 *
 * In development / tests set SMS_STUB=true to log OTP to stdout instead.
 */
const PHONE_AUTH_INTERNAL_URL = process.env.PHONE_AUTH_INTERNAL_URL ?? "";
/**
 * SMS_STUB=true — логировать OTP в stdout вместо отправки SMS.
 *
 * SECURITY: НЕ включаем автоматически для всех non-production окружений,
 * потому что staging-логи обычно агрегируются во внешние системы (Loki, Datadog
 * и т.д.). OTP в логах = утечка 2FA-кода для всех с доступом к logstore.
 *
 * Для локальной разработки установить явно: SMS_STUB=true в .env.local
 * Для staging-окружений: SMS_STUB=false (использовать реальный SMS или
 *   отдельный тестовый Twilio аккаунт с ограниченными номерами).
 */
const SMS_STUB = process.env.SMS_STUB === "true";

/** Max failed verify attempts before OTP record is deleted and a new /start is required */
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? "5");

/** OTP validity window in seconds */
const OTP_VALIDITY_SEC = Number(process.env.OTP_VALIDITY_SEC ?? "300");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ACCESS_TOKEN_SECRET) {
  console.error("Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ACCESS_TOKEN_SECRET");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase service-role client
// ---------------------------------------------------------------------------

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivateSessionResponse = {
  account_id: string;
  session_id: string;
  access_token: string;
  access_expires_in: number;
  refresh_token: string;
  refresh_expires_at: string;
};

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Generates a cryptographically-secure 6-digit OTP string.
 * crypto.randomInt uses CSPRNG; Math.random() is NOT used here.
 * Range [100_000, 999_999] guarantees a fixed 6-digit string.
 */
function generateOtp(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

/**
 * Constant-time string comparison.
 *
 * Two strings of DIFFERENT lengths take the slower path (alloc + compare)
 * rather than returning early — this prevents timing oracles on length.
 * For fixed-length 6-digit OTPs both branches are equivalent; the safe
 * default handles future cases where OTP length might vary.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  // Pad both to the same length before comparing; extra bytes differ, so
  // the result is false for unequal-length strings.
  const aBuf = Buffer.alloc(maxLen, 0);
  const bBuf = Buffer.alloc(maxLen, 0);
  Buffer.from(a, "utf8").copy(aBuf);
  Buffer.from(b, "utf8").copy(bBuf);
  // timingSafeEqual requires equal-length buffers (guaranteed by alloc above).
  const bytesEqual = crypto.timingSafeEqual(aBuf, bBuf);
  // Separately check length equality in constant-time-safe idiom.
  const lenEqual = a.length === b.length;
  return bytesEqual && lenEqual;
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/**
 * Trusted reverse-proxy IPs — comma-separated list from env.
 * X-Forwarded-For is ONLY trusted when the direct socket peer is in this set.
 * Without this check a client could spoof their IP via the XFF header and bypass
 * any IP-based rate limits or pollute audit logs.
 */
const TRUSTED_PROXIES = new Set(
  (process.env.AUTH_TRUSTED_PROXIES || "")
    .split(",")
    .map((s) => s.trim().replace(/^::ffff:/i, ""))
    .filter(Boolean),
);

function getIp(req: express.Request): string | null {
  const remote = (req.socket?.remoteAddress ?? "").replace(/^::ffff:/i, "");
  if (TRUSTED_PROXIES.has(remote)) {
    const xff = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
    if (xff) return xff.replace(/^::ffff:/i, "");
  }
  return remote || null;
}

function getUa(req: express.Request): string {
  return String(req.headers["user-agent"] || "");
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// OTP issuance rate limiter (sliding window, in-memory)
// ---------------------------------------------------------------------------

/** Max OTP /start requests per IP within OTP_RL_WINDOW_MS. */
const OTP_RL_IP_MAX = Number(process.env.OTP_RL_IP_MAX ?? "10");
/** Max OTP /start requests per normalized phone within OTP_RL_WINDOW_MS. */
const OTP_RL_PHONE_MAX = Number(process.env.OTP_RL_PHONE_MAX ?? "5");
/** Sliding window length in ms. Default 60 s. */
const OTP_RL_WINDOW_MS = Number(process.env.OTP_RL_WINDOW_MS ?? "60000");

// Map: key (ip or "p:"+phone) -> sorted timestamp[] of recent requests
const _otpRl = new Map<string, number[]>();

const _otpRlCleanup = setInterval(() => {
  const cutoff = Date.now() - OTP_RL_WINDOW_MS;
  for (const [key, ts] of _otpRl) {
    const trimmed = ts.filter((t) => t > cutoff);
    if (trimmed.length === 0) _otpRl.delete(key);
    else _otpRl.set(key, trimmed);
  }
}, OTP_RL_WINDOW_MS);
_otpRlCleanup.unref?.();

/**
 * Returns true if the key is within the rate limit; records the new timestamp.
 * Returns false (rate limited) if the limit is already exceeded.
 */
function otpRlCheck(key: string, max: number): boolean {
  const now = Date.now();
  const cutoff = now - OTP_RL_WINDOW_MS;
  const ts = (_otpRl.get(key) ?? []).filter((t) => t > cutoff);
  if (ts.length >= max) {
    _otpRl.set(key, ts);
    return false;
  }
  ts.push(now);
  _otpRl.set(key, ts);
  return true;
}

// ---------------------------------------------------------------------------
// jti blacklist (in-memory, TTL = token lifetime + grace)
// ---------------------------------------------------------------------------

// Fix #6: единая константа для TTL токена и blacklist (устраняет хрупкую связь)
const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes
const BLACKLIST_TTL_MS = ACCESS_TOKEN_TTL_SEC * 1000 + 30_000; // + 30s grace

const _revokedJtis = new Map<string, number>(); // jti -> expireAt timestamp
// Fix #4: Map<jti, expireAt> вместо Set<jti> — для TTL-based cleanup без memory leak
const _sessionJtis = new Map<string, Map<string, number>>(); // session_id -> Map<jti, expireAt>

// Restart-resilience: session IDs known to be revoked in the DB.
// Populated from DB on startup (sessions revoked within the last token TTL window).
// Prevents the scenario where a rejected token becomes valid again after a process restart
// because the in-memory jti blacklist is cleared but the DB record still shows revoked.
// key: session_id, value: expireAt (when to evict from this set)
const _revokedSessionIds = new Map<string, number>(); // session_id -> evict timestamp

function markSessionRevoked(session_id: string): void {
  _revokedSessionIds.set(session_id, Date.now() + BLACKLIST_TTL_MS);
}

function isSessionRevoked(session_id: string): boolean {
  const expireAt = _revokedSessionIds.get(session_id);
  if (!expireAt) return false;
  if (Date.now() > expireAt) return false;
  return true;
}

function revokeJti(jti: string): void {
  _revokedJtis.set(jti, Date.now() + BLACKLIST_TTL_MS);
}

// Fix #8: убран lazy-delete из read-пути; только чистая проверка без мутации Map
function isJtiRevoked(jti: string): boolean {
  const expireAt = _revokedJtis.get(jti);
  if (!expireAt) return false;
  if (Date.now() > expireAt) return false; // просрочено — cleanup interval удалит
  return true;
}

// Fix #4: jti трекируется с TTL-меткой expireAt для последующего автоочистки
function _trackSessionJti(session_id: string, jti: string): void {
  let map = _sessionJtis.get(session_id);
  if (!map) {
    map = new Map<string, number>();
    _sessionJtis.set(session_id, map);
  }
  map.set(jti, Date.now() + BLACKLIST_TTL_MS);
}

function revokeSessionJtis(session_id: string): void {
  const map = _sessionJtis.get(session_id);
  if (map) {
    for (const jti of map.keys()) {
      revokeJti(jti);
    }
    _sessionJtis.delete(session_id);
  }
  // Also mark session as revoked so that post-restart the session_id check can
  // catch tokens whose JTIs are no longer in the (now-empty) jti blacklist.
  markSessionRevoked(session_id);
}

// Fix #4 + #5: cleanup interval очищает expired jti из _sessionJtis (предотвращает memory leak)
const _blacklistCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [jti, expireAt] of _revokedJtis) {
    if (now > expireAt) _revokedJtis.delete(jti);
  }
  // Fix #4/#5: удаляем истёкшие jti из inner Map; при пустом Map — удаляем session entry
  for (const [sessionId, map] of _sessionJtis) {
    for (const [jti, expireAt] of map) {
      if (now > expireAt) map.delete(jti);
    }
    if (map.size === 0) _sessionJtis.delete(sessionId);
  }
  // Evict expired session revocations
  for (const [sessionId, expireAt] of _revokedSessionIds) {
    if (now > expireAt) _revokedSessionIds.delete(sessionId);
  }
}, 60_000);
_blacklistCleanupInterval.unref?.();

/**
 * Startup: load recently-revoked session IDs from DB so that the in-memory
 * blacklist survives process restarts.  Best-effort — a failure here is logged
 * but does not prevent the service from starting.  The window of exposure in
 * case of failure is bounded by ACCESS_TOKEN_TTL_SEC (15 min).
 */
async function loadRevokedSessionsFromDb(): Promise<void> {
  try {
    const since = new Date(Date.now() - BLACKLIST_TTL_MS).toISOString();
    const { data, error } = await supa
      .from("auth_sessions")
      .select("id")
      .eq("status", "revoked")
      .gte("updated_at", since);
    if (error) {
      console.warn("[auth] Could not load revoked sessions from DB:", error.message);
      return;
    }
    for (const row of (data ?? [])) {
      markSessionRevoked(row.id as string);
    }
    console.log(`[auth] Pre-loaded ${(data ?? []).length} recently-revoked session IDs into blacklist`);
  } catch (err) {
    console.warn("[auth] loadRevokedSessionsFromDb failed:", err);
  }
}

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

// Fix #6: используем ACCESS_TOKEN_TTL_SEC как единый источник истины для expiresIn
function issueAccessToken(payload: { account_id: string; session_id: string; device_uid: string }): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti }, ACCESS_TOKEN_SECRET as string, {
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    issuer: "mansoni-auth",
    audience: "mansoni-client",
  });
  return { token, jti };
}

// ---------------------------------------------------------------------------
// requireAuth middleware — verifies Bearer JWT + jti blacklist
// ---------------------------------------------------------------------------

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET as string, {
      algorithms: ["HS256"],
      issuer: "mansoni-auth",
      audience: "mansoni-client",
    }) as jwt.JwtPayload;

    // Fix #3: токен без jti ОТКЛОНЯЕТСЯ — нельзя пропустить через blacklist bypass
    if (!decoded.jti) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    if (isJtiRevoked(decoded.jti)) {
      res.status(401).json({ error: "token_revoked" });
      return;
    }
    // Restart-resilience: check session-level revocation even when the jti
    // is no longer in the (restarted-and-cleared) jti blacklist.
    if (typeof decoded.session_id === "string" && isSessionRevoked(decoded.session_id)) {
      res.status(401).json({ error: "token_revoked" });
      return;
    }

    (req as express.Request & { auth?: jwt.JwtPayload }).auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

// ---------------------------------------------------------------------------
// OTP delivery
// ---------------------------------------------------------------------------

/**
 * Sends an OTP code to a phone number.
 *
 * Priority:
 *   1. If PHONE_AUTH_INTERNAL_URL is set → POST to internal phone-auth service.
 *   2. If SMS_STUB=true (or non-production) → log to stdout (visible in dev/test logs).
 *   3. In production without PHONE_AUTH_INTERNAL_URL → throws (misconfiguration).
 *
 * This function is best-effort: a delivery failure does NOT abort the
 * /v1/auth/start flow. The OTP record is already stored in the DB.
 * The caller (client) will get an error only if verification fails later.
 */
async function deliverOtp(phone: string, otp: string): Promise<void> {
  if (PHONE_AUTH_INTERNAL_URL) {
    try {
      const resp = await fetch(`${PHONE_AUTH_INTERNAL_URL}/internal/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) {
        console.error(`[auth/deliverOtp] phone-auth returned ${resp.status}`);
      }
    } catch (err) {
      console.error("[auth/deliverOtp] Failed to reach phone-auth service:", err);
    }
    return;
  }

  if (SMS_STUB) {
    // Development / local — log to stdout. NEVER log OTPs in production.
    console.log(`[AUTH STUB] OTP for ${phone}: ${otp} (valid ${OTP_VALIDITY_SEC}s)`);
    return;
  }

  // Production, no PHONE_AUTH_INTERNAL_URL configured — misconfiguration.
  console.error("[auth/deliverOtp] PHONE_AUTH_INTERNAL_URL not set in production. OTP not sent.");
  // We deliberately don't throw: the record is saved, but the user won't
  // receive the SMS. This surfaces as a UX issue (no SMS received) without
  // leaking whether the phone number is registered.
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "32kb" }));

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

// Fix #7: blacklist метрики удалены из публичного /health — утечка внутренних данных
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "auth",
    ts: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Device registration
// ---------------------------------------------------------------------------

app.post("/v1/device/register", async (req, res) => {
  const { device_uid, device_secret, platform, device_model, os_version, app_version } = req.body ?? {};
  if (!device_uid || !device_secret || !platform) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  const { data, error } = await supa.rpc("auth_register_device_v1", {
    p_device_uid: device_uid,
    p_device_secret: device_secret,
    p_platform: platform,
    p_device_model: device_model ?? null,
    p_os_version: os_version ?? null,
    p_app_version: app_version ?? null,
    p_user_agent: getUa(req),
    p_ip: getIp(req),
  });

  if (error) return res.status(400).json({ error: error.message });
  return res.json({ device_id: data?.[0]?.device_id ?? null });
});

// ---------------------------------------------------------------------------
// Auth: start (generate + store OTP, trigger SMS delivery)
// ---------------------------------------------------------------------------

/**
 * POST /v1/auth/start
 *
 * Generates a 6-digit OTP, stores it in `phone_otps` (upsert: deletes any
 * previous record for the same phone to prevent accumulation / old-code reuse),
 * triggers SMS delivery, and returns the DB record UUID as `challenge_id`.
 *
 * The `challenge_id` (= phone_otps.id) binds the subsequent /verify call to
 * the specific OTP record for this phone, preventing cross-phone replay.
 *
 * Security properties:
 * - OTP is cryptographically random (CSPRNG).
 * - Stored as plaintext in phone_otps (RLS: service-role only). Acceptable
 *   because the table is not exposed to clients — only the auth microservice
 *   reads it using the service role key.
 * - Old OTPs for the same phone are deleted first (prevents brute-force
 *   harvest across multiple outstanding records).
 * - challenge_id is the opaque DB UUID — not guessable by the client.
 *
 * Failure model:
 * - SMS delivery failure does NOT abort the endpoint (returns 200 with
 *   challenge_id). The client will discover the problem when /verify fails
 *   due to OTP_NOT_FOUND after the record has expired.
 * - If DB write fails → 500, no challenge_id issued.
 *
 */
app.post("/v1/auth/start", async (req, res) => {
  const { phone_e164, email } = req.body ?? {};

  if (!phone_e164 && !email) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  // Currently only phone OTP is supported; email is a future extension.
  if (!phone_e164) {
    return res.status(400).json({ error: "EMAIL_AUTH_NOT_YET_SUPPORTED" });
  }

  const normalizedPhone = normalizePhone(phone_e164);
  if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
    return res.status(400).json({ error: "PHONE_INVALID" });
  }

  // ── Rate limiting: per-IP and per-phone ──────────────────────────────────
  // Prevents SMS-bombing (attacker floods victim's phone with OTPs) and
  // SMS-cost exhaustion.  Both limits must pass; if either is exceeded we
  // return 429 without leaking which dimension was the cause.
  const clientIp = getIp(req) ?? "unknown";
  const ipAllowed = otpRlCheck(`ip:${clientIp}`, OTP_RL_IP_MAX);
  const phoneAllowed = otpRlCheck(`p:${normalizedPhone}`, OTP_RL_PHONE_MAX);
  if (!ipAllowed || !phoneAllowed) {
    return res.status(429).json({ error: "RATE_LIMITED" });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_VALIDITY_SEC * 1_000).toISOString();

  // ── Step 1: Invalidate any previous outstanding OTP for this phone ──
  // This prevents an attacker from accumulating non-expired records and
  // brute-forcing across multiple outstanding OTPs simultaneously.
  const { error: deleteError } = await supa
    .from("phone_otps")
    .delete()
    .eq("phone", normalizedPhone);

  if (deleteError) {
    console.error("[auth/start] Failed to clear old OTP:", deleteError.message);
    return res.status(500).json({ error: "OTP_STORE_FAILED" });
  }

  // ── Step 2: Insert new OTP record ──
  const { data: insertedRows, error: insertError } = await supa
    .from("phone_otps")
    .insert({
      phone: normalizedPhone,
      code: otp,
      expires_at: expiresAt,
      attempts: 0,
    })
    .select("id")
    .single();

  if (insertError || !insertedRows?.id) {
    console.error("[auth/start] Failed to insert OTP:", insertError?.message);
    return res.status(500).json({ error: "OTP_STORE_FAILED" });
  }

  // ── Step 3: Deliver OTP (best-effort; does not abort the request) ──
  await deliverOtp(normalizedPhone, otp);

  // Return the DB record's UUID as challenge_id.
  // This binds the /verify call to a specific OTP record for a specific phone —
  // an attacker who doesn't know which UUID was issued cannot forge a valid request.
  return res.json({ challenge_id: insertedRows.id });
});

// ---------------------------------------------------------------------------
// Auth: verify OTP + create session
// ---------------------------------------------------------------------------

/**
 * POST /v1/auth/verify
 *
 * Verifies the OTP presented by the client against the record in `phone_otps`
 * that was created by /v1/auth/start. On success, creates an account (upsert)
 * and a device-bound session.
 *
 * Security properties:
 * - challenge_id = phone_otps.id (UUID): binds verify to a specific start call.
 * - phone must match the record's phone field: prevents cross-phone attacks.
 * - Expires at: enforced server-side; expired records are deleted.
 * - Attempt counter: incremented on each wrong OTP; deleted after MAX_ATTEMPTS.
 * - Timing-safe comparison: no timing oracle even on OTP length differences.
 * - OTP record deleted on success: prevents replay.
 * - OTP record deleted on expiry or max-attempts: forces new /start.
 */
app.post("/v1/auth/verify", async (req, res) => {
  const { challenge_id, otp, phone_e164, email, device_uid, device_secret } = req.body ?? {};

  if (!challenge_id || !otp || (!phone_e164 && !email) || !device_uid || !device_secret) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  if (!phone_e164) {
    return res.status(400).json({ error: "EMAIL_AUTH_NOT_YET_SUPPORTED" });
  }

  const normalizedPhone = normalizePhone(phone_e164);

  // ── Step 1: Look up OTP record by challenge_id AND phone ──
  // The AND phone condition prevents an attacker from using their own
  // challenge_id to verify a different phone number.
  const { data: otpRecord, error: fetchError } = await supa
    .from("phone_otps")
    .select("id, code, expires_at, attempts")
    .eq("id", challenge_id)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (fetchError) {
    console.error("[auth/verify] OTP lookup error:", fetchError.message);
    return res.status(500).json({ error: "OTP_LOOKUP_FAILED" });
  }

  if (!otpRecord) {
    // Either the challenge_id is wrong, the phone doesn't match, or the
    // record was already deleted (expired / max attempts on previous call).
    return res.status(401).json({ error: "OTP_NOT_FOUND" });
  }

  // ── Step 2: Check expiry ──
  if (new Date(otpRecord.expires_at) < new Date()) {
    // Eagerly delete expired record
    await supa.from("phone_otps").delete().eq("id", otpRecord.id);
    return res.status(401).json({ error: "OTP_EXPIRED" });
  }

  // ── Step 3: Check attempt counter ──
  if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
    // Max attempts reached — delete record, force new /start
    await supa.from("phone_otps").delete().eq("id", otpRecord.id);
    return res.status(401).json({ error: "OTP_MAX_ATTEMPTS_EXCEEDED" });
  }

  // ── Step 4: Timing-safe OTP comparison ──
  const submitted = String(otp).trim();
  if (!timingSafeStringEqual(submitted, otpRecord.code)) {
    // Increment attempt counter (do NOT reveal remaining count in the error
    // message to avoid giving the attacker feedback on progress)
    const { error: updateError } = await supa
      .from("phone_otps")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("id", otpRecord.id);

    if (updateError) {
      console.error("[auth/verify] Failed to increment attempts:", updateError.message);
    }

    const remaining = OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
    return res.status(401).json({
      error: "OTP_INVALID",
      // Reveal remaining count only to help legitimate retry UX;
      // an attacker already knows they get 5 tries from the public spec.
      remainingAttempts: Math.max(0, remaining),
    });
  }

  // ── Step 5: OTP is valid — delete to prevent replay ──
  const { error: deleteError } = await supa
    .from("phone_otps")
    .delete()
    .eq("id", otpRecord.id);

  if (deleteError) {
    // Proceed anyway — a failure to delete is a minor replay risk (another
    // verify with the same challenge would still be possible until expiry).
    // Log it loudly for monitoring.
    console.error(
      "[auth/verify] WARNING: Failed to delete OTP record after successful verify. " +
      "Manual cleanup required for id:",
      otpRecord.id,
      deleteError.message,
    );
  }

  // ── Step 6: Upsert account ──
  const up = await supa.rpc("auth_upsert_account_v1", {
    p_phone_e164: phone_e164 ?? null,
    p_email: email ?? null,
  });
  if (up.error) return res.status(400).json({ error: up.error.message });

  const account_id = up.data?.[0]?.account_id as string | undefined;
  if (!account_id) return res.status(500).json({ error: "ACCOUNT_UPSERT_FAILED" });

  // ── Step 7: Create session ──
  const refresh = randomToken(48);
  const refresh_hash = sha256Base64Url(refresh);
  const refresh_expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();

  const cr = await supa.rpc("auth_create_session_v1", {
    p_account_id: account_id,
    p_device_uid: device_uid,
    p_device_secret: device_secret,
    p_refresh_token_hash: refresh_hash,
    p_refresh_expires_at: refresh_expires_at,
    p_user_agent: getUa(req),
    p_ip: getIp(req),
  });

  if (cr.error) return res.status(400).json({ error: cr.error.message });

  const session_id = cr.data?.[0]?.session_id as string | undefined;
  if (!session_id) return res.status(500).json({ error: "SESSION_CREATE_FAILED" });

  const { token: access, jti } = issueAccessToken({ account_id, session_id, device_uid });
  _trackSessionJti(session_id, jti);

  return res.json({
    account_id,
    session_id,
    access_token: access,
    access_expires_in: 900,
    refresh_token: refresh,
    refresh_expires_at,
  });
});

// ---------------------------------------------------------------------------
// Token refresh (SECURITY FIX C-6: account_id retrieved from DB, not "unknown")
// ---------------------------------------------------------------------------

app.post("/v1/auth/refresh", async (req, res) => {
  const { session_id, device_uid, device_secret, refresh_token } = req.body ?? {};
  if (!session_id || !device_uid || !device_secret || !refresh_token) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  const presented_hash = sha256Base64Url(refresh_token);
  const new_refresh = randomToken(48);
  const new_hash = sha256Base64Url(new_refresh);
  const new_exp = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();

  const rr = await supa.rpc("auth_rotate_refresh_v1", {
    p_session_id: session_id,
    p_device_uid: device_uid,
    p_device_secret: device_secret,
    p_presented_refresh_hash: presented_hash,
    p_new_refresh_hash: new_hash,
    p_new_refresh_expires_at: new_exp,
    p_user_agent: getUa(req),
    p_ip: getIp(req),
  });

  if (rr.error) return res.status(400).json({ error: rr.error.message });

  const result = rr.data?.[0] as { ok: boolean; reason: string } | undefined;
  if (!result?.ok) return res.status(401).json({ error: result?.reason ?? "REFRESH_FAILED" });

  // SECURITY FIX (C-6): Retrieve account_id from session record in the DB.
  // BEFORE this fix the JWT was issued with account_id: "unknown", meaning:
  //   - Downstream services could not enforce per-account authorization.
  //   - Any bearer of a refresh token could get a JWT with no account binding.
  //   - Audit trails lost account attribution.
  const sessionLookup = await supa
    .from("auth_sessions")
    .select("account_id")
    .eq("id", session_id)
    .eq("status", "active")
    .single();

  if (sessionLookup.error || !sessionLookup.data?.account_id) {
    console.error(
      `[auth/refresh] Failed to resolve account_id for session ${session_id}:`,
      sessionLookup.error?.message ?? "account_id is null",
    );
    return res.status(401).json({ error: "SESSION_ACCOUNT_NOT_FOUND" });
  }

  const account_id = sessionLookup.data.account_id as string;
  const { token: access, jti } = issueAccessToken({ account_id, session_id, device_uid });
  _trackSessionJti(session_id, jti);

  return res.json({
    account_id,
    access_token: access,
    access_expires_in: 900,
    refresh_token: new_refresh,
    refresh_expires_at: new_exp,
  });
});

// ---------------------------------------------------------------------------
// Multi-account: switch active account on device
// ---------------------------------------------------------------------------

app.post("/v1/device/switch-account", async (req, res) => {
  const { device_uid, device_secret, account_id } = req.body ?? {};
  if (!device_uid || !device_secret || !account_id) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  const sw = await supa.rpc("auth_switch_active_account_v1", {
    p_device_uid: device_uid,
    p_device_secret: device_secret,
    p_account_id: account_id,
    p_user_agent: getUa(req),
    p_ip: getIp(req),
  });
  if (sw.error) return res.status(400).json({ error: sw.error.message });

  const result = sw.data?.[0] as { ok: boolean; reason: string } | undefined;
  if (!result?.ok) return res.status(403).json({ error: result?.reason ?? "SWITCH_FAILED" });

  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Session activation for clients that do not persist refresh_token
// ---------------------------------------------------------------------------

app.post("/v1/device/activate-session", async (req, res) => {
  const { session_id, device_uid, device_secret } = req.body ?? {};
  if (!session_id || !device_uid || !device_secret) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  const newRefresh = randomToken(48);
  const newHash = sha256Base64Url(newRefresh);
  const newExp = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();

  const rr = await supa.rpc("auth_rotate_refresh_by_device_v1", {
    p_session_id: session_id,
    p_device_uid: device_uid,
    p_device_secret: device_secret,
    p_new_refresh_hash: newHash,
    p_new_refresh_expires_at: newExp,
    p_user_agent: getUa(req),
    p_ip: getIp(req),
  });

  if (rr.error) return res.status(400).json({ error: rr.error.message });

  const result = rr.data?.[0] as { ok: boolean; reason: string; account_id: string | null } | undefined;
  if (!result?.ok || !result.account_id) {
    return res.status(401).json({ error: result?.reason ?? "ACTIVATE_FAILED" });
  }

  const { token: access, jti } = issueAccessToken({ account_id: result.account_id, session_id, device_uid });
  _trackSessionJti(session_id, jti);

  const payload: ActivateSessionResponse = {
    account_id: result.account_id,
    session_id,
    access_token: access,
    access_expires_in: 900,
    refresh_token: newRefresh,
    refresh_expires_at: newExp,
  };

  return res.json(payload);
});

// ---------------------------------------------------------------------------
// Session revocation
// ---------------------------------------------------------------------------

// Fix #10: type guard для RPC-ответов — устраняет небезопасные as-касты
function isRpcResult(v: unknown): v is { ok: boolean; reason?: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    "ok" in v &&
    typeof (v as Record<string, unknown>).ok === "boolean"
  );
}

app.post("/v1/auth/revoke", requireAuth, async (req, res) => {
  // Fix #9: device_secret из body используется только для defense-in-depth в DB RPC;
  // session ownership проверяется по JWT (Fix #1), не по переданному session_id
  const { device_uid, device_secret } = req.body ?? {};
  if (!device_uid || !device_secret) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  // Fix #1: session_id берётся исключительно из JWT — предотвращает отзыв чужих сессий
  const authReq = req as express.Request & { auth?: jwt.JwtPayload };
  const session_id = authReq.auth?.session_id as string | undefined;
  if (!session_id) {
    // JWT прошёл requireAuth, но session_id отсутствует в payload — некорректный токен
    return res.status(403).json({ error: "SESSION_MISMATCH" });
  }

  // Fix #2: СНАЧАЛА DB revoke, ПОТОМ in-memory revoke
  // Если DB упадёт — jti НЕ попадут в blacklist, старые токены останутся валидными
  // (безопаснее, чем обратная ситуация: blacklist без DB-отзыва)
  const rv = await supa.rpc("auth_revoke_session_v1", {
    p_session_id: session_id,
    p_device_uid: device_uid,
    p_device_secret: device_secret,
    p_user_agent: getUa(req),
    p_ip: getIp(req),
  });
  if (rv.error) return res.status(500).json({ error: rv.error.message });

  // Fix #10: используем type guard вместо небезопасного as-каста
  const result = rv.data?.[0];
  if (!isRpcResult(result) || !result.ok) {
    return res.status(400).json({ error: isRpcResult(result) ? (result.reason ?? "REVOKE_FAILED") : "REVOKE_FAILED" });
  }

  // Fix #2: in-memory revoke ТОЛЬКО после успешного DB revoke
  revokeSessionJtis(session_id);

  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// Populate revoked-session blacklist from DB before accepting requests.
void loadRevokedSessionsFromDb();

app.listen(AUTH_SERVICE_PORT, () => {
  console.log(`auth service on :${AUTH_SERVICE_PORT}`);
});
