/**
 * Login Notification Edge Function — Deno runtime.
 *
 * POST /login-notify
 * Called immediately after a successful login from the client.
 *
 * Request body:
 *   { fingerprint: string, userAgent?: string }
 *
 * The server reads the real IP from the CF-Connecting-IP / X-Forwarded-For
 * header (Supabase edge runs behind Cloudflare).
 *
 * Security model:
 * - Runs server-side; the fingerprint is a client-supplied signal,
 *   not a security primitive. We treat it as advisory ("probably the same
 *   device") rather than as a cryptographic identity.
 * - new-device check is done via the `check_new_device` DB function so the
 *   edge function never issues its own trust decision based on client data alone.
 * - GeoIP lookup uses the ip-api.com free JSON API (no key, rate-limited to
 *   45 req/min) — swap for MaxMind in production.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200, req?: Request) {
  const origin = req?.headers.get("origin") ?? null;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400, req?: Request) {
  return json({ error: msg }, status, req);
}

function getServiceClient() {
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
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function extractIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ??
    req.headers.get("X-Forwarded-For")?.split(",")[0].trim() ??
    "0.0.0.0"
  );
}

interface GeoResult {
  city: string;
  country: string;
}

async function geoLookup(ip: string): Promise<GeoResult> {
  // skip private/loopback
  if (ip === "0.0.0.0" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return { city: "Local", country: "Local" };
  }
  try {
    // Use HTTPS to prevent MITM substitution of geo data displayed in security emails.
    // ip-api.com HTTPS requires a paid plan; ipapi.co provides a free HTTPS endpoint.
    // For production at scale, replace with a local MaxMind GeoLite2 DB to eliminate
    // external network dependency and rate-limit exposure.
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { city: "Unknown", country: "Unknown" };
    const data = await res.json();
    // ipapi.co returns { error: true } on failure; no status field
    if (data.error || !data.city) return { city: "Unknown", country: "Unknown" };
    return { city: data.city ?? "Unknown", country: data.country_name ?? "Unknown" };
  } catch {
    return { city: "Unknown", country: "Unknown" };
  }
}

function parseUserAgent(ua: string): { browser: string; os: string } {
  // Minimal UA parser — avoids external dependencies.
  let browser = "Unknown browser";
  let os = "Unknown OS";

  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  else if (/OPR\/|Opera\//.test(ua)) browser = "Opera";

  if (/Windows NT 10/.test(ua)) os = "Windows 10";
  else if (/Windows NT 6\.3/.test(ua)) os = "Windows 8.1";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/iPhone OS/.test(ua)) os = "iOS";
  else if (/iPad/.test(ua)) os = "iPadOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return { browser, os };
}

async function sendNewDeviceNotification(payload: {
  userId: string;
  browser: string;
  os: string;
  city: string;
  country: string;
}): Promise<void> {
  // Use the existing email-send edge function if available
  const emailSendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-send`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const db = getServiceClient();
  // Fetch user email from auth.users
  const { data: user } = await db.auth.admin.getUserById(payload.userId);
  if (!user?.user?.email) return; // no email to notify

  const body = {
    to: user.user.email,
    subject: "Вход с нового устройства",
    html: `
      <p>Вы вошли в аккаунт с нового устройства:</p>
      <ul>
        <li><b>Браузер / ОС:</b> ${payload.browser} на ${payload.os}</li>
        <li><b>Местоположение:</b> ${payload.city}, ${payload.country}</li>
        <li><b>Время:</b> ${new Date().toLocaleString("ru-RU", { timeZone: "UTC" })} UTC</li>
      </ul>
      <p>Если это не вы — немедленно смените пароль в настройках безопасности.</p>
    `,
  };

  try {
    await fetch(emailSendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // notification is best-effort; do not fail the login flow
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") return err("Method not allowed", 405, req);

  const userId = await getUserIdFromJWT(req);
  if (!userId) return err("Unauthorized", 401, req);

  let body: { fingerprint?: string; userAgent?: string } = {};
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", 400, req);
  }

  const fingerprint = body.fingerprint ?? "";
  const rawUa = body.userAgent ?? req.headers.get("User-Agent") ?? "";
  const ip = extractIp(req);
  const { browser, os } = parseUserAgent(rawUa);

  const db = getServiceClient();

  // 1. Check if device is new (server-side check via DB function)
  const { data: isNew, error: checkErr } = await db.rpc("check_new_device", {
    p_user_id: userId,
    p_fingerprint: fingerprint,
  });
  if (checkErr) console.error("check_new_device error:", checkErr);

  const deviceIsNew = isNew === true;

  // 2. Geo lookup (async, best-effort)
  const geo = await geoLookup(ip);

  // 3. Insert login event
  const { error: insertErr } = await db.from("login_events").insert({
    user_id: userId,
    ip_address: ip,
    user_agent: rawUa,
    device_fingerprint: fingerprint || null,
    location_city: geo.city,
    location_country: geo.country,
    is_new_device: deviceIsNew,
  });
  if (insertErr) console.error("login_events insert error:", insertErr);

  // 4. If new device, register it and notify
  if (deviceIsNew && fingerprint) {
    const deviceName = `${browser} на ${os}`;
    await db.from("known_devices").upsert(
      {
        user_id: userId,
        device_fingerprint: fingerprint,
        device_name: deviceName,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_fingerprint" },
    );

    // Fire-and-forget notification
    sendNewDeviceNotification({
      userId,
      browser,
      os,
      city: geo.city,
      country: geo.country,
    }).catch(() => {/* swallow */});
  } else if (!deviceIsNew && fingerprint) {
    // Update last_seen_at for known device
    await db
      .from("known_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("device_fingerprint", fingerprint);
  }

  return json({ isNewDevice: deviceIsNew, city: geo.city, country: geo.country }, 200, req);
});
