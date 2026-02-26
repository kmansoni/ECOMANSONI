import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const AUTH_SERVICE_PORT = Number(process.env.AUTH_SERVICE_PORT ?? "8087");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ACCESS_TOKEN_SECRET) {
  console.error("Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ACCESS_TOKEN_SECRET");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = express();
app.use(express.json({ limit: "32kb" }));

function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function getIp(req: express.Request): string | null {
  const xff = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xff || req.socket.remoteAddress || null;
}

function getUa(req: express.Request): string {
  return String(req.headers["user-agent"] || "");
}

function issueAccessToken(payload: { account_id: string; session_id: string; device_uid: string }): string {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET as string, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "mansoni-auth",
    audience: "mansoni-client",
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "auth", ts: new Date().toISOString() });
});

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

app.post("/v1/auth/start", async (req, res) => {
  const { phone_e164, email } = req.body ?? {};
  if (!phone_e164 && !email) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  const challenge_id = randomToken(16);
  return res.json({ challenge_id });
});

app.post("/v1/auth/verify", async (req, res) => {
  const { challenge_id, otp, phone_e164, email, device_uid, device_secret } = req.body ?? {};

  if (!challenge_id || !otp || (!phone_e164 && !email) || !device_uid || !device_secret) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  if (String(otp).length < 4) {
    return res.status(401).json({ error: "OTP_INVALID" });
  }

  const up = await supa.rpc("auth_upsert_account_v1", {
    p_phone_e164: phone_e164 ?? null,
    p_email: email ?? null,
  });
  if (up.error) return res.status(400).json({ error: up.error.message });

  const account_id = up.data?.[0]?.account_id as string | undefined;
  if (!account_id) return res.status(500).json({ error: "ACCOUNT_UPSERT_FAILED" });

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

  const access = issueAccessToken({ account_id, session_id, device_uid });

  return res.json({
    account_id,
    session_id,
    access_token: access,
    access_expires_in: 900,
    refresh_token: refresh,
    refresh_expires_at,
  });
});

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

  const access = issueAccessToken({ account_id: "unknown", session_id, device_uid });

  return res.json({
    access_token: access,
    access_expires_in: 900,
    refresh_token: new_refresh,
    refresh_expires_at: new_exp,
  });
});

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

app.post("/v1/auth/revoke", async (req, res) => {
  const { session_id, device_uid, device_secret } = req.body ?? {};
  if (!session_id || !device_uid || !device_secret) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  const rv = await supa.rpc("auth_revoke_session_v1", {
    p_session_id: session_id,
    p_device_uid: device_uid,
    p_device_secret: device_secret,
    p_user_agent: getUa(req),
    p_ip: getIp(req),
  });
  if (rv.error) return res.status(400).json({ error: rv.error.message });

  const result = rv.data?.[0] as { ok: boolean; reason: string } | undefined;
  if (!result?.ok) return res.status(400).json({ error: result?.reason ?? "REVOKE_FAILED" });
  return res.json({ ok: true });
});

app.listen(AUTH_SERVICE_PORT, () => {
  console.log(`auth service on :${AUTH_SERVICE_PORT}`);
});
