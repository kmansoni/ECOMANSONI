/**
 * TOTP 2FA Edge Function — Deno runtime, no npm packages.
 *
 * Routes (all require a valid Supabase JWT in Authorization header):
 *   POST /totp-setup    — generate secret + QR URL + backup codes
 *   POST /totp-verify   — verify code and activate 2FA
 *   POST /totp-validate — validate code at login (gate check)
 *   POST /totp-disable  — disable 2FA (requires current TOTP code)
 *   POST /totp-backup   — consume a backup code
 *
 * Security model:
 * - The raw TOTP secret never leaves the server after setup; the client
 *   receives it only once during the setup step.
 * - The secret is stored AES-256-GCM encrypted at rest using a server
 *   key held in TOTP_ENCRYPTION_KEY env var (hex-encoded 32 bytes).
 * - TOTP validation allows a ±1 step window (30s) to handle clock skew.
 * - Backup codes are single-use SHA-256-hashed tokens stored as text[].
 *   Each consumed code is replaced with "used:<iso-timestamp>" so the
 *   array index is preserved and partial usage is visible.
 * - Rate limiting: the calling API gateway / Supabase edge rate-limit
 *   should enforce ≤5 failed attempts per minute per user_id.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Base-32 encode (RFC 4648 alphabet, no padding). */
function base32Encode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

/** Base-32 decode (RFC 4648 alphabet, case-insensitive, ignores spaces/hyphens). */
function base32Decode(str: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = str.toUpperCase().replace(/[\s-]/g, "");
  const output: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

/** RFC 6238 TOTP — HMAC-SHA1, 6 digits, 30s step. */
async function totpGenerate(secretBytes: Uint8Array, counter: bigint): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  // counter as 8-byte big-endian
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = sig[19] & 0xf;
  const code =
    (((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

/**
 * Low-level TOTP check (no DB). Returns the matching step counter or null.
 * Used internally so callers can persist the step for replay prevention.
 */
async function totpCheckStep(
  secretBytes: Uint8Array,
  token: string,
): Promise<bigint | null> {
  const step = BigInt(Math.floor(Date.now() / 1000 / 30));
  for (const offset of [-1n, 0n, 1n]) {
    const expected = await totpGenerate(secretBytes, step + offset);
    if (timingSafeEqual(expected, token)) return step + offset;
  }
  return null;
}

/**
 * Validate a TOTP token AND enforce replay protection by atomically updating
 * last_used_counter in the DB.  Returns false if:
 *   - the code is wrong
 *   - the step was already used (replay attack within the 90-second window)
 */
async function totpValidateWithReplayGuard(
  db: ReturnType<typeof getSupabaseServiceClient>,
  userId: string,
  secretBytes: Uint8Array,
  token: string,
): Promise<boolean> {
  const matchedStep = await totpCheckStep(secretBytes, token);
  if (matchedStep === null) return false;

  // Atomic CAS: only update if last_used_counter < matchedStep
  // The DB column is bigint; we store it as a number (safe for 64-bit counters
  // within the current epoch — actual counter ≈ 1.7e9, well below 2^53).
  const { data, error } = await db.rpc("totp_consume_step", {
    p_user_id: userId,
    p_step: Number(matchedStep),
  });
  if (error) {
    console.error("totp_consume_step error:", error);
    return false;
  }
  // Function returns true if the step was freshly consumed, false if already used
  return data === true;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── AES-256-GCM encrypt / decrypt ───────────────────────────────────────────

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get("TOTP_ENCRYPTION_KEY");
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("TOTP_ENCRYPTION_KEY must be 32 hex-encoded bytes (64 hex chars)");
  }
  return crypto.subtle.importKey("raw", hexToBytes(keyHex), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptSecret(secret: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(secret)),
  );
  // Format: "aes256gcm:<iv_hex>:<ciphertext+tag_hex>"
  return `aes256gcm:${bytesToHex(iv)}:${bytesToHex(ct)}`;
}

async function decryptSecret(stored: string): Promise<string> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "aes256gcm") throw new Error("Invalid stored secret format");
  const key = await getEncryptionKey();
  const iv = hexToBytes(parts[1]);
  const ct = hexToBytes(parts[2]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

// ─── Backup codes ─────────────────────────────────────────────────────────────

async function generateBackupCodes(): Promise<{ codes: string[]; hashed: string[] }> {
  const codes: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < 10; i++) {
    const raw = crypto.getRandomValues(new Uint8Array(6));
    // Format: XXXXXX-XXXXXX (readable)
    const code = Array.from(raw)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
      .slice(0, 12);
    const formatted = `${code.slice(0, 6)}-${code.slice(6, 12)}`;
    codes.push(formatted);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(formatted)),
    );
    hashed.push(`sha256:${bytesToHex(digest)}`);
  }
  return { codes, hashed };
}

/**
 * Hash a backup code for DB comparison or lookup.
 * Returns "sha256:<hex>" — the format stored in backup_codes[].
 */
async function hashBackupCode(token: string): Promise<string> {
  const normalized = token.toUpperCase().replace(/\s/g, "");
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized)),
  );
  return `sha256:${bytesToHex(digest)}`;
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

let _corsHeaders: Record<string, string> = {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ..._corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

function getSupabaseServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function getUserIdFromJWT(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  // Validate token against Supabase Auth; use anon client
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /totp-setup
 * Generate a new TOTP secret, store it (unverified), return QR URL + backup codes.
 * Idempotent: if an unverified record exists, regenerate it.
 */
async function handleSetup(userId: string): Promise<Response> {
  const db = getSupabaseServiceClient();

  // Guard: refuse to overwrite ACTIVE 2FA.
  // An attacker with a stolen session (but without the TOTP app) must not be
  // able to call /totp-setup to reset the secret and obtain fresh backup codes.
  const { data: existing, error: checkErr } = await db
    .from("user_totp_secrets")
    .select("is_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (checkErr) return err("DB error checking 2FA state", 500);
  if (existing?.is_enabled) {
    return err("2FA is already enabled. Disable it before re-enrolling.", 409);
  }

  // Generate 20-byte secret (RFC 4226 recommendation)
  const secretBytes = crypto.getRandomValues(new Uint8Array(20));
  const secretBase32 = base32Encode(secretBytes);
  const encryptedSecret = await encryptSecret(secretBase32);
  const { codes, hashed } = await generateBackupCodes();

  // Upsert — safe: only reached when is_enabled is false or no row exists
  const { error } = await db.from("user_totp_secrets").upsert(
    {
      user_id: userId,
      encrypted_secret: encryptedSecret,
      backup_codes: hashed,
      is_enabled: false,
      verified_at: null,
      last_used_counter: null,
    },
    { onConflict: "user_id" },
  );
  if (error) return err("DB error during setup", 500);

  // Build otpauth:// URI
  // The issuer and account name do not leak security-sensitive data.
  const issuer = encodeURIComponent(Deno.env.get("TOTP_ISSUER") ?? "YourAICompanion");
  const account = encodeURIComponent(userId);
  const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

  return json({ otpauthUrl, secret: secretBase32, backupCodes: codes });
}

/**
 * POST /totp-verify  { token: "123456" }
 * Verify code against the pending secret and mark 2FA as enabled.
 */
async function handleVerify(userId: string, body: { token?: string }): Promise<Response> {
  if (!body.token || !/^\d{6}$/.test(body.token)) return err("token must be 6 digits");

  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("user_totp_secrets")
    .select("encrypted_secret, is_enabled")
    .eq("user_id", userId)
    .single();
  if (error || !data) return err("No pending TOTP setup found", 404);
  if (data.is_enabled) return err("2FA is already enabled");

  const secret = await decryptSecret(data.encrypted_secret);
  // Replay guard: initial verify also consumes the step so the code can't be reused.
  const valid = await totpValidateWithReplayGuard(db, userId, base32Decode(secret), body.token);
  if (!valid) return err("Invalid TOTP code", 401);

  await db
    .from("user_totp_secrets")
    .update({ is_enabled: true, verified_at: new Date().toISOString() })
    .eq("user_id", userId);

  return json({ success: true });
}

/**
 * POST /totp-validate  { token: "123456" }
 * Gate check at login — returns { valid: true } or 401.
 */
async function handleValidate(userId: string, body: { token?: string }): Promise<Response> {
  if (!body.token) return err("token required");
  const isBackup = /^[0-9A-Fa-f]{6}-[0-9A-Fa-f]{6}$/.test(body.token);

  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("user_totp_secrets")
    .select("encrypted_secret, backup_codes, is_enabled")
    .eq("user_id", userId)
    .single();
  if (error || !data || !data.is_enabled) return err("2FA not enabled", 404);

  if (isBackup) {
    // Backup code path — atomic consume via PL/pgSQL (SELECT FOR UPDATE prevents race condition)
    const codeHash = await hashBackupCode(body.token);
    const { data: consumed, error: rpcErr } = await db.rpc("consume_backup_code", {
      p_user_id: userId,
      p_code_hash: codeHash,
    });
    if (rpcErr) {
      console.error("consume_backup_code rpc error:", rpcErr);
      return err("Internal error", 500);
    }
    if (!consumed) return err("Invalid or already-used backup code", 401);
    return json({ valid: true, backupCodeUsed: true });
  }

  if (!/^\d{6}$/.test(body.token)) return err("token must be 6 digits or valid backup code");
  const secret = await decryptSecret(data.encrypted_secret);
  const valid = await totpValidateWithReplayGuard(db, userId, base32Decode(secret), body.token);
  if (!valid) return err("Invalid TOTP code", 401);
  return json({ valid: true });
}

/**
 * POST /totp-disable  { token: "123456" }
 * Requires current TOTP code to disable.
 */
async function handleDisable(userId: string, body: { token?: string }): Promise<Response> {
  if (!body.token || !/^\d{6}$/.test(body.token)) return err("token must be 6 digits");

  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("user_totp_secrets")
    .select("encrypted_secret, is_enabled")
    .eq("user_id", userId)
    .single();
  if (error || !data || !data.is_enabled) return err("2FA not enabled", 404);

  const secret = await decryptSecret(data.encrypted_secret);
  // Replay guard required even for disable: prevents reuse of an intercepted code.
  const valid = await totpValidateWithReplayGuard(db, userId, base32Decode(secret), body.token);
  if (!valid) return err("Invalid TOTP code", 401);

  await db.from("user_totp_secrets").delete().eq("user_id", userId);
  return json({ success: true });
}

/**
 * POST /totp-backup  { code: "ABCDEF-123456" }
 * Validate and consume a backup code.
 */
async function handleBackup(userId: string, body: { code?: string }): Promise<Response> {
  if (!body.code) return err("code required");
  const db = getSupabaseServiceClient();

  // Verify 2FA is enabled before attempting consume (avoids leaking is_enabled via timing)
  const { data, error } = await db
    .from("user_totp_secrets")
    .select("is_enabled")
    .eq("user_id", userId)
    .single();
  if (error || !data || !data.is_enabled) return err("2FA not enabled", 404);

  // Atomic consume — SELECT FOR UPDATE inside PL/pgSQL prevents double-use race condition
  const codeHash = await hashBackupCode(body.code);
  const { data: consumed, error: rpcErr } = await db.rpc("consume_backup_code", {
    p_user_id: userId,
    p_code_hash: codeHash,
  });
  if (rpcErr) {
    console.error("consume_backup_code rpc error:", rpcErr);
    return err("Internal error", 500);
  }
  if (!consumed) return err("Invalid or already-used backup code", 401);
  return json({ success: true });
}

// ─── Main router ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  _corsHeaders = getCorsHeaders(origin);

  const url = new URL(req.url);
  const route = url.pathname.split("/").pop(); // last segment

  const userId = await getUserIdFromJWT(req);
  if (!userId) return err("Unauthorized", 401);

  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  switch (route) {
    case "totp-setup":
      return handleSetup(userId);
    case "totp-verify":
      return handleVerify(userId, body as { token?: string });
    case "totp-validate":
      return handleValidate(userId, body as { token?: string });
    case "totp-disable":
      return handleDisable(userId, body as { token?: string });
    case "totp-backup":
      return handleBackup(userId, body as { code?: string });
    default:
      return err("Not found", 404);
  }
});
