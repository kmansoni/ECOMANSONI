// @ts-nocheck — Deno runtime; browser TypeScript doesn't know Deno APIs
/**
 * supabase/functions/email-smtp-settings/index.ts
 *
 * CRUD API for per-user SMTP/IMAP configuration.
 * Also exposes POST /test to verify SMTP credentials before saving.
 *
 * Security model:
 *  - All endpoints require valid Supabase JWT (authenticated user only).
 *  - SMTP password is encrypted server-side with SMTP_ENCRYPTION_KEY (Vault).
 *    The raw password NEVER leaves this Edge Function — the client sends it
 *    once for save/test, then it's encrypted at rest.
 *  - On GET, smtp_password_enc is stripped — the client only sees that a
 *    password exists (has_password: true), never the value.
 *  - Rate limit: 20 req/user/10min.
 *
 * Routes (all require Auth):
 *   GET    /                   → get current SMTP settings (no password)
 *   PUT    /                   → upsert SMTP settings (encrypts password)
 *   DELETE /                   → delete SMTP settings
 *   POST   /test               → test SMTP connection (does not save)
 *   GET    /imap               → get IMAP settings
 *   PUT    /imap               → upsert IMAP settings
 *
 * Environment (Supabase Vault):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  — needed to bypass RLS for encryption ops
 *   SMTP_ENCRYPTION_KEY        — 32-byte hex key for AES-256-GCM encryption
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, enforceCors } from "../_shared/utils.ts";

// ─── Rate limiting (distributed, DB-backed) ───────────────────────────────────
//
// Uses a single UPSERT + atomic counter in the `edge_rate_limits` table:
//
//   CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
//     key       TEXT PRIMARY KEY,
//     count     INT  NOT NULL DEFAULT 1,
//     window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
//
// On each request we UPSERT the row identified by `key`:
//   - If window_start is older than WINDOW_SECONDS, reset count to 1.
//   - Otherwise, increment count atomically.
//   - Return the resulting count.
//
// The function returns { allowed: boolean; remaining: number }.
// A DB error causes fail-open (allow) — chosen intentionally because:
//   - This is an auth-gated endpoint; the attacker must first authenticate.
//   - Failing closed here would block legitimate users during any DB hiccup.
//   - The SMTP /test sends one real TCP connection per request; even if the
//     rate limit fails open briefly, the blast radius is limited.

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60; // 10 minutes

async function checkRateDb(
  adminClient: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  uid: string,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    // Atomic UPSERT:
    //   - Insert new row (count=1) if key doesn't exist.
    //   - If window has expired (> WINDOW_SECONDS ago), reset to count=1.
    //   - Otherwise, increment count.
    // Returns the CURRENT count after the increment.
    const { data, error } = await adminClient.rpc("edge_rate_limit_check", {
      p_key: `smtp-settings:${uid}`,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      p_max: RATE_LIMIT_MAX,
    });

    if (error) {
      // Fail-open: DB error → allow the request, log the failure.
      console.error("[email-smtp-settings] rate_limit_check RPC error:", error.message);
      return { allowed: true, remaining: RATE_LIMIT_MAX };
    }

    // RPC returns { allowed: boolean, remaining: number }
    const result = data as { allowed: boolean; remaining: number } | null;
    if (!result) return { allowed: true, remaining: RATE_LIMIT_MAX };
    return result;
  } catch (err) {
    console.error("[email-smtp-settings] rate_limit_check exception:", err);
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }
}

// ─── Encryption helpers ────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM via Web Crypto API.
 * Returns base64url(iv + ciphertext + authTag).
 * GCM provides both confidentiality and integrity — superior to CBC.
 */
async function encryptPassword(plaintext: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex.slice(0, 64)); // 32 bytes
  const key = await crypto.subtle.importKey(
    "raw", keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded as ArrayBuffer);
  // Prepend IV to ciphertext
  const result = new Uint8Array(iv.length + cipherBuf.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(cipherBuf), iv.length);
  let binary = "";
  for (let i = 0; i < result.length; i++) binary += String.fromCharCode(result[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Decrypt base64url(iv + ciphertext + authTag) back to plaintext.
 */
async function decryptPassword(encoded: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex.slice(0, 64));
  const key = await crypto.subtle.importKey(
    "raw", keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  // Restore standard base64 and re-add padding stripped during encryptPassword.
  // Standard formula: number of "=" chars needed = (4 - len % 4) % 4.
  // Previous expression `"==".slice((b64.length + 3) & ~3 - b64.length & 3)`
  // was incorrect due to JS operator precedence: `-` binds tighter than `&`,
  // so `~3 - b64.length & 3` parsed as `(~3 - b64.length) & 3`, not as
  // intended. For inputs where len % 4 === 2 (needs 2 padding chars), the
  // expression returned 0 chars, causing atob() to throw InvalidCharacterError.
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padNeeded = (4 - b64.length % 4) % 4;
  const padded = b64 + "=".repeat(padNeeded);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const cipherBuf = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuf);
  return new TextDecoder().decode(plain);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ─── SSRF protection for SMTP host ────────────────────────────────────────────

/**
 * Validates that a hostname is safe to connect to — blocking SSRF vectors.
 *
 * SMTP is a user-configurable field, so a malicious authenticated user could
 * supply "127.0.0.1", "169.254.169.254", or an internal hostname to probe
 * internal services via the Edge Function's network position.
 *
 * Rules:
 *   - Must not be empty or longer than 253 chars (RFC 1035).
 *   - Must not be a raw IPv4 or IPv6 literal (they bypass DNS resolution and
 *     directly target infrastructure). Legitimate SMTP servers use hostnames.
 *   - Must not be localhost, *.local, or single-label names.
 *   - Port must be one of the known SMTP/IMAP ports to prevent port-scanning
 *     internal services on arbitrary ports.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KNOWN LIMITATION — DNS-rebinding SSRF not fully mitigated:
 *   A hostname like "evil.attacker.com" could resolve to 127.0.0.1 or an
 *   internal RFC-1918 address (10.x.x.x, 192.168.x.x, 172.16-31.x.x).
 *   This function only blocks *literal* IP strings; it performs no DNS
 *   resolution. Full mitigation requires an async DNS lookup followed by a
 *   post-resolution IP-range check before opening any socket — a
 *   significantly more complex change requiring Deno DNS APIs.
 *   Deno Deploy's sandboxed networking limits the practical blast radius, but
 *   the DNS-rebinding vector remains open and should be addressed if the
 *   function gains broader network access in future.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Throws with a descriptive string (not passed to the client, just logged).
 */
function assertSafeSmtpEndpoint(host: string, port: number, context: "smtp" | "imap"): void {
  const normalized = host.trim().replace(/\.+$/g, "").toLowerCase();

    if (!normalized || normalized.length > 253) {
    throw new Error("invalid_host");
  }

  // Block raw IP literals — both IPv4 and IPv6
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(normalized);
  const isIPv6 = normalized.includes(":") || normalized.startsWith("[");
  if (isIPv4 || isIPv6) {
    throw new Error("ip_literals_not_allowed");
  }

  // Block localhost and local-only names
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    !normalized.includes(".")
  ) {
    throw new Error("host_not_allowed");
  }

    // Port validation — blacklist approach:
    //   • Always allow well-known SMTP/IMAP ports (including common alt ports
    //     used by real providers: 2525, 10025, 8025).
    //   • For ports ≥ 1024: allow unless on the dangerous-service blacklist.
    //   • Refuse ports < 1024 that are not in the well-known set (blocks
    //     scanning privileged services like SSH on :22).
    // Previous whitelist was too narrow — it broke legitimate providers using
    // 10025 or 8025, and the right control is blocking known-dangerous ports
    // rather than only permitting a small known-good set.
    const SMTP_WELL_KNOWN = new Set([25, 465, 587, 2525, 10025, 8025]);
    const IMAP_WELL_KNOWN = new Set([143, 220, 993]);
    const wellKnown = context === "smtp" ? SMTP_WELL_KNOWN : IMAP_WELL_KNOWN;

    // Infrastructure service ports that must never be SMTP/IMAP targets.
    const BLOCKED_PORTS = new Set([
      22,    // SSH
      23,    // Telnet
      3306,  // MySQL
      5432,  // PostgreSQL
      6379,  // Redis
      27017, // MongoDB
      9200,  // Elasticsearch
      8086,  // InfluxDB
      11211, // Memcached
      9092,  // Kafka
      2181,  // ZooKeeper
      5672,  // RabbitMQ AMQP
    ]);

    const isWellKnown = wellKnown.has(port);
    const isHighPortAndSafe = port >= 1024 && !BLOCKED_PORTS.has(port);
    if (!isWellKnown && !isHighPortAndSafe) {
      throw new Error(`port_not_allowed:${port}`);
    }
}

// ─── SMTP test via raw TCP ─────────────────────────────────────────────────────

/**
 * Test SMTP connection by attempting a TCP handshake + EHLO + AUTH.
 * Deno has native TCP support via Deno.connect.
 *
 * Returns { ok: true } or { ok: false, error: string }.
 */
async function testSmtpConnection(params: {
  host: string;
  port: number;
  user: string;
  password: string;
  tls_mode: string;
  from_email: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Use fetch to Supabase's internal SMTP test capability is not available
  // in Deno Edge Functions. We test by opening a TCP connection with Deno.connect.
  try {
    // SSRF protection: validate host and port before any network I/O.
    // Placed inside try so that validation errors are returned as
    // { ok: false, error: "..." } instead of propagating as unhandled exceptions.
    assertSafeSmtpEndpoint(params.host, params.port, "smtp");
    let conn: Deno.TcpConn;
    const connectOpts = { hostname: params.host, port: params.port };

    if (params.tls_mode === "ssl") {
      // @ts-ignore — Deno.connectTls is available
      conn = await Deno.connectTls({ ...connectOpts, hostname: params.host });
    } else {
      conn = await Deno.connect(connectOpts);
    }

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    async function read(c: Deno.TcpConn): Promise<string> {
      const buf = new Uint8Array(4096);
      const n = await Promise.race([
        c.read(buf),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
      ]);
      if (n === null) return "";
      return dec.decode(buf.slice(0, n as number));
    }

    async function write(c: Deno.TcpConn, data: string): Promise<void> {
      await c.write(enc.encode(data));
    }

    // Read greeting
    const greeting = await read(conn);
    if (!greeting.startsWith("220")) {
      conn.close();
      return { ok: false, error: `Unexpected greeting: ${greeting.slice(0, 100)}` };
    }

    // EHLO
    await write(conn, `EHLO test.mansoni.app\r\n`);
    let ehloResp = "";
    let chunk = "";
    while (!(ehloResp.includes("\r\n") && !chunk.includes("-"))) {
      chunk = await read(conn);
      ehloResp += chunk;
      if (!chunk) break;
    }

    // STARTTLS upgrade if needed
    if (params.tls_mode === "starttls") {
      await write(conn, `STARTTLS\r\n`);
      const tlsResp = await read(conn);
      if (!tlsResp.startsWith("220")) {
        conn.close();
        return { ok: false, error: `STARTTLS rejected: ${tlsResp.slice(0, 100)}` };
      }
      // Upgrade connection to TLS
      // @ts-ignore
      conn = await Deno.startTls(conn, { hostname: params.host });
      // Re-send EHLO after TLS upgrade
      await write(conn, `EHLO test.mansoni.app\r\n`);
      let c2 = "";
      while (!c2.includes("\r\n")) { c2 += await read(conn); if (!c2) break; }
    }

    // AUTH LOGIN
    await write(conn, `AUTH LOGIN\r\n`);
    const authPrompt = await read(conn);
    if (!authPrompt.startsWith("334")) {
      conn.close();
      return { ok: false, error: `AUTH LOGIN not supported: ${authPrompt.slice(0, 100)}` };
    }

    await write(conn, btoa(params.user) + "\r\n");
    const passPrompt = await read(conn);
    if (!passPrompt.startsWith("334")) {
      conn.close();
      return { ok: false, error: `Auth username rejected: ${passPrompt.slice(0, 100)}` };
    }

    await write(conn, btoa(params.password) + "\r\n");
    const authResult = await read(conn);

    conn.close();

    if (authResult.startsWith("235")) {
      return { ok: true };
    }
    return { ok: false, error: `Auth failed: ${authResult.slice(0, 100)}` };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // ── Auth ──────────────────────────────────────────────────────────────────

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const encryptionKey = Deno.env.get("SMTP_ENCRYPTION_KEY") ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[email-smtp-settings] Missing Supabase env vars");
    return json({ error: "INTERNAL_ERROR" }, 500);
  }

  if (!encryptionKey || encryptionKey.length < 64) {
    console.error("[email-smtp-settings] SMTP_ENCRYPTION_KEY not set or too short");
    return json({ error: "ENCRYPTION_KEY_NOT_CONFIGURED" }, 503);
  }

  // Verify JWT via user client
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  // Service role client for DB operations (bypasses RLS — read intent enforced by JWT)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Distributed rate limit via DB — works across all serverless instances
  const rateResult = await checkRateDb(adminClient, user.id);
  if (!rateResult.allowed) {
    return json({ error: "RATE_LIMITED", remaining: 0 }, 429);
  }

  const url = new URL(req.url);
  const isImap = url.pathname.endsWith("/imap");
  const isTest = url.pathname.endsWith("/test");
  const method = req.method;

  // ── SMTP Test ─────────────────────────────────────────────────────────────

  if (isTest && method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }

    const { smtp_host, smtp_port, smtp_user, smtp_password, tls_mode, from_email } = body;
    if (!smtp_host || !smtp_user || !smtp_password) {
      return json({ error: "MISSING_REQUIRED_FIELDS" }, 400);
    }

    const result = await testSmtpConnection({
      host: smtp_host,
      port: parseInt(smtp_port ?? "587"),
      user: smtp_user,
      password: smtp_password,
      tls_mode: tls_mode ?? "starttls",
      from_email: from_email ?? smtp_user,
    });

    if (result.ok) {
      // If test passes and user has existing settings, update verified_at
      await adminClient
        .from("email_smtp_settings")
        .update({ verified_at: new Date().toISOString(), last_error: null })
        .eq("user_id", user.id);
    } else {
      await adminClient
        .from("email_smtp_settings")
        .update({ verified_at: null, last_error: result.error ?? null })
        .eq("user_id", user.id);
    }

    return json(result);
  }

  // ── IMAP routes ──────────────────────────────────────────────────────────

  if (isImap) {
    if (method === "GET") {
      const { data, error } = await adminClient
        .from("email_imap_settings")
        .select("id, imap_host, imap_port, imap_user, tls_mode, sync_folders, poll_interval_s, verified_at, last_error, last_synced_at, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, data: data ?? null });
    }

    if (method === "PUT") {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }

      const { imap_host, imap_port, imap_user, imap_password, tls_mode, sync_folders, poll_interval_s } = body;
      if (!imap_host || !imap_user || !imap_password) {
        return json({ error: "MISSING_REQUIRED_FIELDS" }, 400);
      }

      // SSRF protection: validate imap_host before persisting.
      // Although this route doesn't connect immediately, the stored host will be
      // used by the IMAP sync worker. Validate at write time to prevent storing
      // SSRF-vector hosts in the database.
      try {
        assertSafeSmtpEndpoint(imap_host, parseInt(imap_port ?? "993"), "imap");
      } catch (e) {
        return json({ error: "INVALID_HOST", details: (e as Error).message }, 400);
      }

      const passwordEnc = await encryptPassword(imap_password, encryptionKey);

      const { data, error } = await adminClient
        .from("email_imap_settings")
        .upsert({
          user_id: user.id,
          imap_host: imap_host.trim(),
          imap_port: parseInt(imap_port ?? "993"),
          imap_user: imap_user.trim(),
          imap_password_enc: passwordEnc,
          tls_mode: tls_mode ?? "ssl",
          sync_folders: sync_folders ?? ["INBOX", "Sent", "Drafts", "Spam", "Trash"],
          poll_interval_s: parseInt(poll_interval_s ?? "60"),
        }, { onConflict: "user_id" })
        .select("id, imap_host, imap_port, imap_user, tls_mode, sync_folders, poll_interval_s, created_at, updated_at")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, data });
    }

    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // ── SMTP routes ──────────────────────────────────────────────────────────

  if (method === "GET") {
    const { data, error } = await adminClient
      .from("email_smtp_settings")
      .select("id, smtp_host, smtp_port, smtp_user, tls_mode, from_name, from_email, reply_to, message_id_domain, verified_at, last_error, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);

    // Augment with has_password
    const result = data ? { ...data, has_password: true } : null;
    return json({ ok: true, data: result });
  }

  if (method === "PUT") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }

    const {
      smtp_host, smtp_port, smtp_user, smtp_password,
      tls_mode, from_name, from_email, reply_to, message_id_domain
    } = body;

    if (!smtp_host || !smtp_user || !smtp_password || !from_email) {
      return json({ error: "MISSING_REQUIRED_FIELDS" }, 400);
    }

    // Validate from_email is a valid email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from_email.trim())) {
      return json({ error: "INVALID_FROM_EMAIL" }, 400);
    }

    // SSRF protection: validate smtp_host before persisting.
    try {
      assertSafeSmtpEndpoint(smtp_host, parseInt(smtp_port ?? "587"), "smtp");
    } catch (e) {
      return json({ error: "INVALID_HOST", details: (e as Error).message }, 400);
    }

    const passwordEnc = await encryptPassword(smtp_password, encryptionKey);

    const { data, error } = await adminClient
      .from("email_smtp_settings")
      .upsert({
        user_id: user.id,
        smtp_host: smtp_host.trim(),
        smtp_port: parseInt(smtp_port ?? "587"),
        smtp_user: smtp_user.trim(),
        smtp_password_enc: passwordEnc,
        tls_mode: tls_mode ?? "starttls",
        from_name: from_name?.trim() || null,
        from_email: from_email.trim(),
        reply_to: reply_to?.trim() || null,
        message_id_domain: message_id_domain?.trim() || null,
        // Reset verification on credential change
        verified_at: null,
        last_error: null,
      }, { onConflict: "user_id" })
      .select("id, smtp_host, smtp_port, smtp_user, tls_mode, from_name, from_email, reply_to, message_id_domain, created_at, updated_at")
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, data: { ...data, has_password: true } });
  }

  if (method === "DELETE") {
    const { error } = await adminClient
      .from("email_smtp_settings")
      .delete()
      .eq("user_id", user.id);

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "METHOD_NOT_ALLOWED" }, 405);
});
