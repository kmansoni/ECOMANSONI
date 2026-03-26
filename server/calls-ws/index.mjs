import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { safeParseInt } from "./utils.mjs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import WebSocket, { WebSocketServer } from "ws";
import { createStoreFromEnv } from "./store/index.mjs";
import { createRateLimiter, DEFAULT_RATE_LIMITS } from "./rateLimit.mjs";
import { createJwtGuard } from "./jwtGuard.mjs";

const PORT = Number(process.env.CALLS_WS_PORT ?? "8787");
const NODE_ENV = String(process.env.NODE_ENV ?? "").toLowerCase();
const ENV = String(process.env.ENV ?? "").toLowerCase();
const IS_PROD_LIKE = NODE_ENV === "production" || ENV === "prod" || ENV === "production";
const CALLS_DEV_INSECURE_AUTH = process.env.CALLS_DEV_INSECURE_AUTH === "1";
if (CALLS_DEV_INSECURE_AUTH && IS_PROD_LIKE) {
  throw new Error("CALLS_DEV_INSECURE_AUTH is forbidden in production-like environments");
}
if (CALLS_DEV_INSECURE_AUTH) {
  console.warn("[SECURITY] WARNING: CALLS_DEV_INSECURE_AUTH is enabled — DO NOT USE IN PRODUCTION");
}

const MAX_PAYLOAD_BYTES = safeParseInt(process.env.CALLS_WS_MAX_PAYLOAD_BYTES, 65536);
const JWT_REVALIDATE_SEC = safeParseInt(process.env.CALLS_WS_JWT_REVALIDATE_SEC, 60);
const MAX_CONNECTIONS_PER_IP = safeParseInt(process.env.CALLS_WS_MAX_CONNECTIONS_PER_IP, 10);
const MAX_PARTICIPANTS_PER_ROOM = Math.max(2, safeParseInt(process.env.CALLS_MAX_PARTICIPANTS_PER_ROOM, 50));
const REQUIRE_SFRAME_CAPS = process.env.CALLS_REQUIRE_SFRAME_CAPS !== "0";
const REQUIRE_DOUBLE_RATCHET_CAPS = process.env.CALLS_REQUIRE_DOUBLE_RATCHET_CAPS !== "0";
const REQUIRE_SECURE_TRANSPORT = IS_PROD_LIKE && process.env.CALLS_WS_REQUIRE_SECURE_TRANSPORT !== "0";

// Default RTP codecs used in ROOM_JOIN_OK and GET_ROUTER_RTP_CAPABILITIES responses.
// When a real mediasoup SFU is fronted by this gateway, the SFU should supply these
// via its own ROOM_JOIN_OK. This gateway-level constant ensures the signaling-only
// path also produces parseable capabilities so mediasoup-client Device.load() succeeds.
const GATEWAY_DEFAULT_CODECS = [
  { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2,
    preferredPayloadType: 100,
    rtcpFeedback: [{ type: "transport-cc" }] },
  { kind: "video", mimeType: "video/VP8", clockRate: 90000,
    preferredPayloadType: 96,
    parameters: { "x-google-start-bitrate": 1000 },
    rtcpFeedback: [
      { type: "goog-remb" }, { type: "transport-cc" },
      { type: "ccm", parameter: "fir" }, { type: "nack" }, { type: "nack", parameter: "pli" }
    ] },
  { kind: "video", mimeType: "video/VP9", clockRate: 90000,
    preferredPayloadType: 98,
    parameters: { "profile-id": 2, "x-google-start-bitrate": 1000 },
    rtcpFeedback: [
      { type: "goog-remb" }, { type: "transport-cc" },
      { type: "ccm", parameter: "fir" }, { type: "nack" }, { type: "nack", parameter: "pli" }
    ] },
];

// C-2: Trusted proxy list for x-forwarded-for validation.
// Format: comma-separated exact IP addresses (IPv4 or IPv6, no CIDR needed).
// Empty string (default) = no trusted proxies → always use socket.remoteAddress.
const TRUSTED_PROXIES = new Set(
  (process.env.CALLS_WS_TRUSTED_PROXIES || "").split(",").map((s) => s.trim()).filter(Boolean)
);

let cachedSupabaseEnv = null;

function normalizeEnvValue(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function parseDotEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const text = fs.readFileSync(filePath, "utf8");
    const map = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = normalizeEnvValue(line.slice(eq + 1));
      if (key) map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

function resolveSupabaseAuthEnv() {
  if (cachedSupabaseEnv) return cachedSupabaseEnv;

  const root = process.cwd();
  const envFromFiles = {
    ...parseDotEnvFile(path.join(root, ".env")),
    ...parseDotEnvFile(path.join(root, ".env.local")),
    ...parseDotEnvFile(path.join(root, ".env.production")),
  };

  const read = (...keys) => {
    for (const key of keys) {
      const envValue = normalizeEnvValue(process.env[key]);
      if (envValue) return envValue;
      const fileValue = normalizeEnvValue(envFromFiles[key]);
      if (fileValue) return fileValue;
    }
    return "";
  };

  cachedSupabaseEnv = {
    supabaseUrl: read("SUPABASE_URL", "VITE_SUPABASE_URL"),
    supabaseAnonKey: read(
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_ANON_KEY",
    ),
  };

  if (!cachedSupabaseEnv.supabaseUrl || !cachedSupabaseEnv.supabaseAnonKey) {
    console.error("[calls-ws] Missing Supabase auth env vars; auth validation is fail-closed");
  }

  return cachedSupabaseEnv;
}

/**
 * C-2: Resolve the real client IP from the request.
 * x-forwarded-for is ONLY trusted when the direct socket peer is in TRUSTED_PROXIES.
 * This prevents a malicious client from spoofing their IP to bypass per-IP limits.
 *
 * IPv6-mapped IPv4 addresses (::ffff:x.x.x.x) are normalised to plain IPv4
 * so proxy list entries do not need to list both forms.
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {string}
 */
function getClientIp(req) {
  const remoteAddr = req.socket?.remoteAddress ?? "unknown";
  // Normalise ::ffff:127.0.0.1 → 127.0.0.1
  const normalizedRemote = remoteAddr.replace(/^::ffff:/i, "");
  if (TRUSTED_PROXIES.has(normalizedRemote)) {
    const xff = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return xff || normalizedRemote;
  }
  return normalizedRemote;
}

/**
 * Requires TLS at the gateway boundary in production-like mode.
 * Accepts either direct TLS socket or trusted x-forwarded-proto=https/wss.
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {boolean}
 */
function isSecureTransport(req) {
  if (req.socket?.encrypted === true) return true;

  const remoteAddr = req.socket?.remoteAddress ?? "";
  const normalizedRemote = remoteAddr.replace(/^::ffff:/i, "");
  if (!TRUSTED_PROXIES.has(normalizedRemote)) {
    return false;
  }

  const xfpRaw = req.headers["x-forwarded-proto"];
  if (!xfpRaw) return false;
  const proto = String(Array.isArray(xfpRaw) ? xfpRaw[0] : xfpRaw)
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "https" || proto === "wss";
}
const CALLS_JOIN_TOKEN_TTL_SEC = Math.max(30, Number(process.env.CALLS_JOIN_TOKEN_TTL_SEC ?? "600"));
const KEY_TTL_MS = Math.max(15_000, Number(process.env.CALLS_KEY_TTL_MS ?? "120000"));
const DEDUP_TTL_MS = Math.max(30_000, Number(process.env.CALLS_DEDUP_TTL_SEC ?? "600") * 1000);
const { store, degraded } = await createStoreFromEnv();

const GW_HELLO_PAYLOAD = {
  degraded: !!degraded,
  storage: store.kind,
  features: store.features,
};

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

const DEVICE_ID_PATTERN = "^[A-Za-z0-9._:-]{6,128}$";

const callInvitePayloadValidate = ajv.compile({
  type: "object",
  additionalProperties: true,
  required: ["to", "callId"],
  properties: {
    to: { type: "string", minLength: 1, maxLength: 256 },
    to_device: { type: "string", pattern: DEVICE_ID_PATTERN },
    callId: { type: "string", minLength: 1, maxLength: 256 },
    callType: { type: "string", enum: ["audio", "voice", "video"] },
    conversationId: { type: ["string", "null"], minLength: 1, maxLength: 256 },
    callsV2RoomId: { type: ["string", "null"], minLength: 1, maxLength: 256 },
    callsV2JoinToken: { type: ["string", "null"], minLength: 1, maxLength: 4096 },
  },
});

const callStatePayloadValidate = ajv.compile({
  type: "object",
  additionalProperties: true,
  required: ["to", "callId"],
  properties: {
    to: { type: "string", minLength: 1, maxLength: 256 },
    to_device: { type: "string", pattern: DEVICE_ID_PATTERN },
    callId: { type: "string", minLength: 1, maxLength: 256 },
  },
});

const envelopeValidate = ajv.compile({
  type: "object",
  additionalProperties: true,
  required: ["v", "type", "msgId", "ts", "payload"],
  properties: {
    v: { type: "integer", const: 1 },
    type: { type: "string" },
    msgId: { type: "string", format: "uuid" },
    ts: { type: "integer" },
    seq: { type: "integer" },
    ack: {
      type: "object",
      required: ["ackOfMsgId"],
      properties: {
        ackOfMsgId: { type: "string", format: "uuid" },
        ok: { type: "boolean" },
        error: { type: "object" }
      }
    },
    payload: { type: "object" }
  }
});

function nowMs() {
  return Date.now();
}

function uuid() {
  return crypto.randomUUID();
}

function send(ws, frame) {
  ws.send(JSON.stringify(frame));
}

function ack(ws, ackOfMsgId, ok = true, error) {
  send(ws, {
    v: 1,
    type: "ACK",
    msgId: uuid(),
    ts: nowMs(),
    ack: {
      ackOfMsgId,
      ok,
      error
    },
    payload: {}
  });
}

function wsError(code, message, details, retryable) {
  return { code, message, details, retryable };
}

// In-memory dev state
const rooms = new Map(); // roomId -> { callId, region, nodeId, epoch, memberSetVersion, peers: Map(deviceId -> {userId, role, e2eeReady}), producers: [] }

const deviceSockets = new Map(); // deviceId -> ws
const userDeviceSockets = new Map(); // userId -> Set<deviceIds> (for broadcast when to_device unknown)
const deviceOwners = new Map(); // deviceId -> userId (anti-squatting guard)
let cachedJoinTokenSecret = null;

function normalizeDeviceId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Allow common device-id formats used by web/native clients.
  if (!new RegExp(DEVICE_ID_PATTERN).test(trimmed)) return null;
  return trimmed;
}

function dropUserDevice(userId, deviceId) {
  if (!userId || !deviceId) return;
  const userDevices = userDeviceSockets.get(userId);
  if (!userDevices) return;
  userDevices.delete(deviceId);
  if (userDevices.size === 0) {
    userDeviceSockets.delete(userId);
  }
}

function unbindConnectionDevice(conn, ws) {
  const currentDeviceId = conn.deviceId;
  if (!currentDeviceId) return;

  const isCurrentBinding = deviceSockets.get(currentDeviceId) === ws;
  if (isCurrentBinding) {
    deviceSockets.delete(currentDeviceId);
    deviceOwners.delete(currentDeviceId);
    if (conn.userId) {
      dropUserDevice(conn.userId, currentDeviceId);
    }
  }
}

function bindConnectionDevice(conn, ws, requestedDeviceId) {
  const normalizedRequested = normalizeDeviceId(requestedDeviceId);
  if (requestedDeviceId != null && !normalizedRequested) {
    return { ok: false, reason: "INVALID_DEVICE_ID" };
  }

  const effectiveDeviceId =
    normalizedRequested ??
    normalizeDeviceId(conn.deviceId) ??
    `dev_${uuid().slice(0, 12)}`;

  const existingOwner = deviceOwners.get(effectiveDeviceId);
  const existingWs = deviceSockets.get(effectiveDeviceId);
  if (existingOwner && existingOwner !== conn.userId && existingWs && existingWs !== ws) {
    return { ok: false, reason: "DEVICE_ID_IN_USE" };
  }

  // If the deviceId was previously bound to an older socket of the same user,
  // close the stale socket and replace mapping with the new one.
  if (existingWs && existingWs !== ws) {
    try {
      existingWs.close(4009, "DEVICE_REPLACED");
    } catch {
      // ignore close errors
    }
  }

  if (conn.deviceId && conn.deviceId !== effectiveDeviceId) {
    unbindConnectionDevice(conn, ws);
  }

  conn.deviceId = effectiveDeviceId;
  deviceSockets.set(effectiveDeviceId, ws);
  if (conn.userId) {
    deviceOwners.set(effectiveDeviceId, conn.userId);
    const userDevices = userDeviceSockets.get(conn.userId) ?? new Set();
    userDevices.add(effectiveDeviceId);
    userDeviceSockets.set(conn.userId, userDevices);
  }

  return { ok: true, deviceId: effectiveDeviceId };
}

function parseCallSignalPayload(payload, validator) {
  if (!validator(payload)) {
    return {
      ok: false,
      error: "Invalid call signaling payload",
      details: validator.errors ?? null,
    };
  }

  const toUser = payload.to.trim();
  const callId = payload.callId.trim();
  const toDevice = payload.to_device == null ? null : normalizeDeviceId(payload.to_device);

  if (payload.to_device != null && !toDevice) {
    return {
      ok: false,
      error: "Invalid payload.to_device",
      details: [{ keyword: "pattern", instancePath: "/to_device", message: "must match deviceId pattern" }],
    };
  }

  return { ok: true, toUser, toDevice, callId, details: null };
}

function deliverToUserDevices(toUser, frame) {
  const recipientDevices = userDeviceSockets.get(toUser);
  if (!recipientDevices || recipientDevices.size === 0) return 0;
  let delivered = 0;
  for (const deviceId of recipientDevices) {
    const targetWs = deviceSockets.get(deviceId);
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) continue;
    send(targetWs, { ...frame, ts: nowMs() });
    delivered++;
  }
  return delivered;
}

function getTurnIceServersPublic() {
  const urls = String(process.env.CALLS_TURN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // IMPORTANT: WS is signaling/control-plane only.
  // It must NEVER emit TURN username/credential (those are issued by edge function).
  // WS only advertises TURN URLs (if any).
  return urls.length ? [{ urls }] : [];
}

function getJoinTokenSecret() {
  if (cachedJoinTokenSecret) return cachedJoinTokenSecret;

  const explicit = process.env.CALLS_JOIN_TOKEN_SECRET;
  if (explicit && explicit.length >= 32) {
    cachedJoinTokenSecret = explicit;
    return cachedJoinTokenSecret;
  }

  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (supabaseJwtSecret && supabaseJwtSecret.length >= 32) {
    if (IS_PROD_LIKE) {
      console.warn("[calls-ws] Missing CALLS_JOIN_TOKEN_SECRET, using SUPABASE_JWT_SECRET fallback in production-like environment");
    } else {
      console.warn("[calls-ws] Using SUPABASE_JWT_SECRET fallback for join token signing in non-prod environment");
    }
    cachedJoinTokenSecret = supabaseJwtSecret;
    return cachedJoinTokenSecret;
  }

  if (IS_PROD_LIKE) {
    // Fallback keeps process alive; tokens issued before restart become invalid,
    // but this is safer than crashing the signaling service.
    const emergencySecret = crypto.randomBytes(48).toString("base64url");
    console.error("[calls-ws] CRITICAL: Missing CALLS_JOIN_TOKEN_SECRET and SUPABASE_JWT_SECRET in production-like environment; using ephemeral in-memory join token secret");
    cachedJoinTokenSecret = emergencySecret;
    return cachedJoinTokenSecret;
  }

  console.warn("[calls-ws] Using development-only join token secret (non-prod only)");
  cachedJoinTokenSecret = "dev-only-join-token-secret";
  return cachedJoinTokenSecret;
}

function encodeBase64Url(raw) {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(raw) {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  return Buffer.from(padded, "base64").toString("utf8");
}

function normalizeAllowedUserIds(value, fallbackUserId) {
  const input = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
  }
  if (out.length === 0 && typeof fallbackUserId === "string" && fallbackUserId.trim()) {
    out.push(fallbackUserId.trim());
  }
  return out;
}

function issueJoinToken({ roomId, callId, allowedUserIds }) {
  const payload = {
    roomId,
    callId,
    allowedUserIds: normalizeAllowedUserIds(allowedUserIds),
    jti: uuid(),
    exp: Math.floor(Date.now() / 1000) + CALLS_JOIN_TOKEN_TTL_SEC,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", getJoinTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${sig}`;
}

function verifyJoinToken(joinToken) {
  if (typeof joinToken !== "string") return null;
  const [encodedPayload, sig] = joinToken.split(".");
  if (!encodedPayload || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getJoinTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedSigBuf)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    const expMs = Number(payload?.exp ?? 0) * 1000;
    if (!expMs || expMs <= Date.now()) return null;
    if (typeof payload?.jti !== "string" || payload.jti.length < 8) return null;
    if (typeof payload?.roomId !== "string" || typeof payload?.callId !== "string") {
      return null;
    }
    payload.allowedUserIds = normalizeAllowedUserIds(payload?.allowedUserIds, payload?.userId);
    if (payload.allowedUserIds.length === 0) return null;

    return payload;
  } catch {
    return null;
  }
}

function pruneSeenMsgIds(seenMsgIds) {
  const cutoff = nowMs() - DEDUP_TTL_MS;
  for (const [msgId, ts] of seenMsgIds.entries()) {
    if (ts < cutoff) seenMsgIds.delete(msgId);
  }
}

async function validateSupabaseAccessToken(accessToken) {
  if (CALLS_DEV_INSECURE_AUTH) {
    return { ok: true, userId: `dev_${String(accessToken).slice(0, 8)}` };
  }
  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseAuthEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, userId: null, reason: "missing_supabase_env" };
  }
  try {
    // H-3: AbortSignal.timeout(5000) prevents fetch from hanging indefinitely.
    // #8: AbortSignal.timeout is Node.js 17.3+. Guard for older runtimes — if
    // unavailable, the request may hang, but it won't crash the process.
    const abortSignal = typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(5000)
      : undefined;
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: abortSignal,
    });
    if (!res.ok) {
      return { ok: false, userId: null, reason: `auth_api_status_${res.status}` };
    }
    const data = await res.json().catch(() => null);
    const userId = typeof data?.id === "string" ? data.id : null;
    if (!userId) {
      return { ok: false, userId: null, reason: "auth_api_no_user_id" };
    }
    return { ok: true, userId };
  } catch (error) {
    return { ok: false, userId: null, reason: error instanceof Error ? error.message : "auth_api_error" };
  }
}

function sendGwHello(ws, seq) {
  send(ws, {
    v: 1,
    type: "GW_HELLO",
    msgId: uuid(),
    ts: nowMs(),
    seq,
    payload: GW_HELLO_PAYLOAD,
  });
}

async function makeSnapshot(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const roomVersion = await store.getRoomVersion(room.callId);

  return {
    roomId,
    callId: room.callId,
    region: room.region,
    nodeId: room.nodeId,
    roomVersion,
    epoch: room.epoch,
    memberSetVersion: room.memberSetVersion,
    serverTime: nowMs(),
    peers: Array.from(room.peers.values()).map((p) => ({
      userId: p.userId,
      deviceId: p.deviceId,
      role: p.role,
      state: "joined",
      e2eeReady: p.e2eeReady,
    })),
    producers: room.producers,
    e2ee: {
      required: true,
      epoch: room.epoch,
      leaderDeviceId: Array.from(room.peers.keys())[0] ?? "",
      expectedSenderDevices: Array.from(room.peers.keys()),
      protocolVersion: 1,
      missingSenderKeys: []
    }
  };
}

const server = http.createServer();
server.on("request", (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...GW_HELLO_PAYLOAD }));
    return;
  }
});
const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD_BYTES });

// Per-IP connection counter — prevents single source exhausting file descriptors
const ipConnectionCounts = new Map(); // ip -> number

const jwtGuard = createJwtGuard({
  revalidateIntervalMs: JWT_REVALIDATE_SEC * 1000,
  validateFn: validateSupabaseAccessToken,
});

wss.on("connection", (ws, req) => {
  if (REQUIRE_SECURE_TRANSPORT && !isSecureTransport(req)) {
    ws.close(4003, "SECURE_TRANSPORT_REQUIRED");
    return;
  }

  // --- Per-IP connection limit ---
  // C-2: Use getClientIp() which enforces trusted-proxy validation.
  const clientIp = getClientIp(req);

  const ipCount = (ipConnectionCounts.get(clientIp) ?? 0) + 1;
  ipConnectionCounts.set(clientIp, ipCount);

  if (ipCount > MAX_CONNECTIONS_PER_IP) {
    ipConnectionCounts.set(clientIp, ipCount - 1); // rollback pre-increment
    ws.close(4029, "TOO_MANY_CONNECTIONS");
    return;
  }

  const conn = {
    authenticated: false,
    userId: null,
    deviceId: null,
    expectedSeq: 1,
    nextOutboundSeq: 1,
    seenMsgIds: new Map(),
    resumeToken: uuid(),
    // Rate limiter — per-connection sliding window
    rateLimiter: createRateLimiter(DEFAULT_RATE_LIMITS),
    // JWT guard state
    accessToken: null,
    authVerifiedAt: null,
    jwtCheckInterval: null,
    // #4: Explicitly initialise jwtGuard internal fields to avoid implicit undefined checks
    // in needsRevalidation() and revalidate(). Prevents subtle bugs with strict linters.
    _revalidating: false,
    _consecutiveAuthFailures: 0,
    // For IP cleanup
    _clientIp: clientIp,
  };

  ws.on("message", async (data) => {
    // S-03: wrap entire handler so a Redis/store crash cannot propagate as an
    // unhandled promise rejection and kill the process (Node ≥ 15 aborts on it).
    try {
    // --- Global rate limit (before JSON.parse to avoid CPU waste) ---
    const globalCheck = conn.rateLimiter.checkGlobal();
    if (!globalCheck.allowed) {
      if (globalCheck.reason === "RATE_EXCEEDED_DISCONNECT") {
        ws.close(4029, "RATE_LIMITED");
      } else {
        // M-5: Best-effort error frame so the client knows the message was dropped.
        // We deliberately do NOT parse the frame here — that would defeat the purpose
        // of rejecting before JSON.parse under flood conditions. msgId is null.
        try {
          ws.send(JSON.stringify({
            v: 1,
            type: "error",
            msgId: null,
            ts: Date.now(),
            payload: { code: "RATE_LIMITED", message: "Global rate limit exceeded" },
          }));
        } catch (_) {
          // Ignore send errors during flood; socket may already be closing.
        }
      }
      return;
    }

    let frame;
    try {
      frame = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!envelopeValidate(frame)) {
      ack(ws, frame?.msgId ?? uuid(), false, wsError("VALIDATION_FAILED", "Invalid envelope", { errors: envelopeValidate.errors }, false));
      return;
    }

    // Duplicate msgId (in-memory TTL)
    if (conn.seenMsgIds.size > 1024) {
      pruneSeenMsgIds(conn.seenMsgIds);
    }
    if (conn.seenMsgIds.has(frame.msgId)) {
      ack(ws, frame.msgId, true);
      return;
    }
    conn.seenMsgIds.set(frame.msgId, nowMs());

    // seq enforcement for non-ACK frames (strict): seq is mandatory and must be monotonic.
    if (!frame.ack) {
      if (!Number.isInteger(frame.seq) || frame.seq <= 0) {
        ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing or invalid seq", {}, false));
        return;
      }
      if (frame.seq !== conn.expectedSeq) {
        ack(ws, frame.msgId, false, wsError("SEQ_OUT_OF_ORDER", `Expected seq=${conn.expectedSeq} got ${frame.seq}`, {}, true));
        return;
      }
      conn.expectedSeq++;
    }

    // --- Per-type rate limit ---
    const typeCheck = conn.rateLimiter.check(frame.type);
    if (!typeCheck.allowed) {
      if (typeCheck.reason === "RATE_EXCEEDED_DISCONNECT") {
        ws.close(4029, "RATE_LIMITED");
        return;
      }
      ack(ws, frame.msgId, false, wsError("RATE_LIMITED", `Rate limit exceeded for ${frame.type}`, {}, true));
      return;
    }

    // --- JWT revalidation (authenticated connections only) ---
    if (conn.authenticated && jwtGuard.needsRevalidation(conn)) {
      const valid = await jwtGuard.revalidate(conn, ws, send);
      if (!valid) return; // connection closed by jwtGuard
    }

    // Handle types
    switch (frame.type) {
      case "HELLO": {
        // S-02: store the claimed deviceId but do NOT register in deviceSockets yet.
        // An unauthenticated connection must not be able to shadow an already-authed
        // device and intercept its signaling frames. Registration happens in AUTH.
        conn.deviceId = frame.payload?.client?.deviceId ?? conn.deviceId;
        send(ws, {
          v: 1,
          type: "WELCOME",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: {
            serverTime: nowMs(),
            heartbeatSec: 10,
            resumeToken: conn.resumeToken,
            features: { wsSeqRequired: true, e2eeRequiredDefault: true }
          }
        });
        return ack(ws, frame.msgId, true);
      }

      case "AUTH": {
        const accessToken = frame.payload?.accessToken;
        if (typeof accessToken !== "string" || accessToken.length < 20) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "Missing accessToken", {}, false));
          return;
        }
        const authResult = await validateSupabaseAccessToken(accessToken);
        if (!authResult.ok || !authResult.userId) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "Invalid accessToken", { reason: authResult.reason ?? "invalid" }, false));
          return;
        }
        conn.authenticated = true;
        conn.userId = authResult.userId;
        conn.accessToken = accessToken;
        conn.authVerifiedAt = Date.now();
        // #6: Reset consecutive failure counter on fresh AUTH — new token starts clean.
        conn._consecutiveAuthFailures = 0;

        const bindResult = bindConnectionDevice(
          conn,
          ws,
          frame.payload?.client?.deviceId ?? frame.payload?.deviceId ?? conn.deviceId
        );
        if (!bindResult.ok) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", bindResult.reason, {}, false));
          return;
        }

        send(ws, {
          v: 1,
          type: "AUTH_OK",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: { userId: conn.userId, deviceId: bindResult.deviceId }
        });

        // Advertise gateway mode/features immediately after auth
        sendGwHello(ws, conn.nextOutboundSeq++);
        // #5: Stop existing interval before starting a new one — prevents interval
        // leak when client sends a second AUTH frame (e.g. token refresh).
        if (conn.jwtCheckInterval != null) {
          jwtGuard.stopPeriodicCheck(conn.jwtCheckInterval);
          conn.jwtCheckInterval = null;
        }
        // Start periodic JWT revalidation for idle connections
        conn.jwtCheckInterval = jwtGuard.startPeriodicCheck(conn, ws, send);
        return ack(ws, frame.msgId, true);
      }

      case "SYNC_MAILBOX": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const deviceId = frame.payload?.deviceId;
        if (!deviceId || deviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "deviceId mismatch", {}, false));
          return;
        }
        if (!store.features.offlineMailbox) {
          send(ws, {
            v: 1,
            type: "MAILBOX_BATCH",
            msgId: uuid(),
            ts: nowMs(),
            seq: conn.nextOutboundSeq++,
            payload: { deviceId, nextStreamId: frame.payload?.lastStreamId ?? "0-0", messages: [] },
          });
          ack(ws, frame.msgId, true);
          return;
        }

        const lastStreamId = frame.payload?.lastStreamId ?? "0-0";
        const limit = Math.max(1, Math.min(200, Number(frame.payload?.limit ?? 50)));
        const { cursorTo, items } = await store.sync(deviceId, lastStreamId, limit);

        const messages = items.map((it) => ({ streamId: it.streamId, frame: it.msg }));
        const nextStreamId = cursorTo;

        send(ws, {
          v: 1,
          type: "MAILBOX_BATCH",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: { deviceId, nextStreamId, messages },
        });

        ack(ws, frame.msgId, true);
        return;
      }

      case "MAILBOX_ACK": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, true);
          return;
        }
        const deviceId = frame.payload?.deviceId;
        if (!deviceId || deviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "deviceId mismatch", {}, false));
          return;
        }
        const upToStreamId = frame.payload?.upToStreamId;
        if (!upToStreamId) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing upToStreamId", {}, false));
          return;
        }
        await store.ack(deviceId, upToStreamId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "E2EE_CAPS": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const insertableStreams = frame.payload?.insertableStreams === true;
        const sframe = frame.payload?.sframe === true;
        const doubleRatchet =
          frame.payload?.doubleRatchet === true ||
          (Array.isArray(frame.payload?.supportedCipherSuites) &&
            frame.payload.supportedCipherSuites.some((suite) =>
              suite === "DOUBLE_RATCHET_P256_AES128GCM" || suite === "DR_P256_HKDF_SHA256_AES128GCM"
            ));
        if (REQUIRE_SFRAME_CAPS && (!insertableStreams || !sframe)) {
          ack(ws, frame.msgId, false, wsError("E2EE_POLICY_VIOLATION", "SFrame + Insertable Streams required", {
            insertableStreams,
            sframe,
          }, false));
          return;
        }
        if (REQUIRE_DOUBLE_RATCHET_CAPS && !doubleRatchet) {
          ack(ws, frame.msgId, false, wsError("E2EE_POLICY_VIOLATION", "Double Ratchet capability required", {
            doubleRatchet,
          }, false));
          return;
        }
        return ack(ws, frame.msgId, true);
      }

      case "ROOM_CREATE": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const roomId = `room_${uuid().slice(0, 8)}`;
        const callId = `call_${uuid().slice(0, 8)}`;
        const region = frame.payload?.preferredRegion ?? "tr";
        const nodeId = "local-sfu-1";

        rooms.set(roomId, {
          callId,
          region,
          nodeId,
          ownerUserId: conn.userId,
          allowedUserIds: normalizeAllowedUserIds(frame.payload?.allowedUserIds, conn.userId),
          joinToken: issueJoinToken({
            roomId,
            callId,
            allowedUserIds: normalizeAllowedUserIds(frame.payload?.allowedUserIds, conn.userId),
          }),
          epoch: 0,
          memberSetVersion: 0,
          peers: new Map(),
          producers: []
        });

        // initialize room version
        await store.bumpRoomVersion(callId);

        send(ws, {
          v: 1,
          type: "ROOM_CREATED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: { roomId, callId, region, nodeId, epoch: 0, memberSetVersion: 0 }
        });

        send(ws, {
          v: 1,
          type: "ROOM_JOIN_SECRET",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: { roomId, joinToken: rooms.get(roomId).joinToken }
        });

        return ack(ws, frame.msgId, true);
      }

      case "ROOM_JOIN": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const roomId = frame.payload?.roomId;
        if (!roomId || !rooms.has(roomId)) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", { roomId }, false));
          return;
        }

        const room = rooms.get(roomId);
        const providedJoinToken = frame.payload?.joinToken;
        const joinPayload = verifyJoinToken(providedJoinToken);
        if (!joinPayload) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Invalid join token", { roomId }, false));
          return;
        }
        const allowedUserIds = normalizeAllowedUserIds(joinPayload.allowedUserIds, joinPayload.userId);
        if (
          joinPayload.roomId !== roomId ||
          joinPayload.callId !== room.callId ||
          !allowedUserIds.includes(conn.userId)
        ) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Invalid join token", { roomId }, false));
          return;
        }
        const joinTokenExpMs = Number(joinPayload?.exp ?? 0) * 1000;
        const marked = typeof store.markJoinTokenUsed === "function"
          ? await store.markJoinTokenUsed(joinPayload.jti, joinTokenExpMs)
          : true;
        if (!marked) {
          ack(ws, frame.msgId, false, wsError("REPLAY_DETECTED", "Join token replay detected", { roomId }, false));
          return;
        }
        if (room.peers.size >= MAX_PARTICIPANTS_PER_ROOM) {
          ack(ws, frame.msgId, false, wsError("ROOM_FULL", `Max participants exceeded (${MAX_PARTICIPANTS_PER_ROOM})`, { roomId }, false));
          return;
        }
        const bindResult = bindConnectionDevice(conn, ws, frame.payload?.deviceId ?? conn.deviceId);
        if (!bindResult.ok) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", bindResult.reason, {}, false));
          return;
        }
        const deviceId = bindResult.deviceId;

        room.memberSetVersion++;
        await store.addMember(room.callId, deviceId);
        await store.bumpRoomVersion(room.callId);
        room.peers.set(deviceId, {
          userId: conn.userId,
          deviceId,
          role: "member",
          e2eeReady: false
        });

        const iceServers = getTurnIceServersPublic();
        const turnUrls = iceServers.length ? iceServers[0].urls : [];
        const turnAvailable = Array.isArray(turnUrls) && turnUrls.some((u) => typeof u === "string" && /^turns?:/i.test(u));

        send(ws, {
          v: 1,
          type: "ROOM_JOIN_OK",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: {
            roomId,
            callId: room.callId,
            region: room.region,
            nodeId: room.nodeId,
            epoch: room.epoch,
            memberSetVersion: room.memberSetVersion,
            mediasoup: {
              // Provide real codecs so mediasoup-client Device.load() succeeds.
              // In production the SFU populates this; the gateway uses the static
              // default so signaling + key-exchange still bootstrap correctly.
              routerRtpCapabilities: { codecs: GATEWAY_DEFAULT_CODECS },
              sendTransportOptions: {},
              recvTransportOptions: {}
            },
            turn: {
              turnAvailable,
              turnUrls,
              iceServers, // urls only; never includes username/credential
              credsVia: "edge_function",
              forceRelayAfterMs: turnAvailable ? 4000 : 0,
            }
          }
        });

        // Send snapshot right away
        const snapshot = await makeSnapshot(roomId);
        if (snapshot) {
          send(ws, {
            v: 1,
            type: "ROOM_SNAPSHOT",
            msgId: uuid(),
            ts: nowMs(),
            seq: conn.nextOutboundSeq++,
            payload: snapshot
          });
        }

        // Offline mailbox is handled via SYNC_MAILBOX.

        return ack(ws, frame.msgId, true);
      }

      // Call signaling layer (dev routing). These are independent from rooms.
      case "call.invite": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const parsed = parseCallSignalPayload(frame.payload, callInvitePayloadValidate);
        if (!parsed.ok) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", parsed.error, { errors: parsed.details }, false));
          return;
        }

        const { toUser, toDevice, callId } = parsed;
        let delivered = 0;

        if (toDevice) {
          const targetWs = deviceSockets.get(toDevice);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            send(targetWs, { ...frame, ts: nowMs() });
            delivered = 1;
            console.log(`[calls-ws] call.invite routed to specific device: callId=${callId}, toDevice=${toDevice}`);
          } else {
            delivered = deliverToUserDevices(toUser, frame);
            console.log(`[calls-ws] call.invite stale to_device fallback: callId=${callId}, toUser=${toUser.slice(0, 8)}, delivered=${delivered}`);
          }
        } else {
          delivered = deliverToUserDevices(toUser, frame);
          console.log(`[calls-ws] call.invite broadcast: callId=${callId}, toUser=${toUser.slice(0, 8)}, delivered=${delivered}`);
        }

        if (delivered === 0) {
          console.log(`[calls-ws] call.invite: no online devices for user ${toUser.slice(0, 8)}`);
        }

        // Return ACK regardless of delivery success (best effort — peer might be offline)
        return ack(ws, frame.msgId, true);
      }

      case "call.accept":
      case "call.decline":
      case "call.cancel":
      case "call.hangup":
      case "call.rekey": {
        // Deliver signal to the target device. If to_device unknown, broadcast to ALL online devices of recipient.
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const parsed = parseCallSignalPayload(frame.payload, callStatePayloadValidate);
        if (!parsed.ok) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", parsed.error, { errors: parsed.details }, false));
          return;
        }

        const { toUser, toDevice, callId } = parsed;
        const sigType = frame.type;
        let delivered = 0;

        if (toDevice) {
          const targetWs = deviceSockets.get(toDevice);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            send(targetWs, { ...frame, ts: nowMs() });
            delivered = 1;
            console.log(`[calls-ws] ${sigType} routed to specific device: callId=${callId}, toDevice=${toDevice}`);
          } else {
            delivered = deliverToUserDevices(toUser, frame);
            console.log(`[calls-ws] ${sigType} stale to_device fallback: callId=${callId}, toUser=${toUser.slice(0, 8)}, delivered=${delivered}`);
          }
        } else {
          delivered = deliverToUserDevices(toUser, frame);
          console.log(`[calls-ws] ${sigType} broadcast: callId=${callId}, toUser=${toUser.slice(0, 8)}, delivered=${delivered}`);
        }

        if (delivered === 0) {
          console.log(`[calls-ws] ${sigType}: no online devices for user ${toUser.slice(0, 8)}`);
        }

        return ack(ws, frame.msgId, true);
      }

      case "KEY_PACKAGE": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const p = frame.payload ?? {};
        // Validate required KEY_PACKAGE fields
        if (!p.targetDeviceId && !p.toDeviceId) {
          ack(ws, frame.msgId, false, wsError("INVALID_KEY_PACKAGE", "Missing required field: targetDeviceId", {}, false));
          return;
        }
        if (!p.ciphertext || typeof p.ciphertext !== "string" || p.ciphertext.length < 24) {
          ack(ws, frame.msgId, false, wsError("INVALID_KEY_PACKAGE", "Missing or invalid ciphertext field", {}, false));
          return;
        }
        if (p.ciphertext.length > 65536) {
          ack(ws, frame.msgId, false, wsError("INVALID_KEY_PACKAGE", "ciphertext must be a string under 64KB", {}, false));
          return;
        }
        const room = rooms.get(p.roomId);
        if (!room) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", { roomId: p.roomId }, false));
          return;
        }
        if (!(await store.assertMember(room.callId, conn.deviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a call member", {}, false));
          return;
        }

        if (p.toDeviceId && !(await store.assertMember(room.callId, p.toDeviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Recipient is not a call member", {}, false));
          return;
        }
        const record = {
          roomId: p.roomId,
          epoch: p.epoch,
          fromDeviceId: p.fromDeviceId,
          toDeviceId: p.toDeviceId,
          senderKeyId: p.senderKeyId,
          keyPackageType: p.keyPackageType ?? "SENDER_KEY",
          ciphertext: p.ciphertext,
          sig: p.sig,
          protocolVersion: p.protocolVersion ?? 1,
          createdAt: nowMs(),
          expiresAt: nowMs() + KEY_TTL_MS,
          deliveredAt: null,
          ackedAt: null,
          attempts: 0,
        };
        // save route for ACK routing
        await store.saveRoute(frame.msgId, record.fromDeviceId);

        const recipientFrame = {
          ...frame,
          ts: nowMs(),
        };
        if (store.features.offlineMailbox) {
          await store.deliver(record.toDeviceId, {
            ver: 1,
            id: recipientFrame.msgId,
            type: "KEY_PACKAGE",
            ts: recipientFrame.ts,
            callId: room.callId,
            fromDevice: record.fromDeviceId,
            epoch: record.epoch,
            payload: record.ciphertext,
            refId: record.senderKeyId,
            sig: record.sig,
          });
        }

        // immediate push if online
        const recipientWs = deviceSockets.get(record.toDeviceId);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          send(recipientWs, recipientFrame);
        }
        return ack(ws, frame.msgId, true);
      }

      case "KEY_ACK": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const p = frame.payload ?? {};

        const room = rooms.get(p.roomId);
        if (!room) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", { roomId: p.roomId }, false));
          return;
        }
        if (!(await store.assertMember(room.callId, conn.deviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a call member", {}, false));
          return;
        }

        // Track rekey ACK only if this ACK refers to the begin message for this epoch
        const beginId = await store.getRekeyBeginId(room.callId, p.epoch);
        if (beginId && frame.payload?.refId === beginId) {
          await store.markAck(room.callId, p.epoch, p.fromDeviceId);
        }

        // Route ACK back to initiator using route(refId)
        const refId = frame.payload?.refId;
        if (refId) {
          const initiator = await store.getRoute(refId);
          if (initiator) {
            const ackFrame = { ...frame, ts: nowMs() };
            if (store.features.offlineMailbox) {
              await store.deliver(initiator, {
                ver: 1,
                id: ackFrame.msgId,
                type: "KEY_ACK",
                ts: ackFrame.ts,
                callId: room.callId,
                fromDevice: p.fromDeviceId,
                epoch: p.epoch,
                payload: "",
                refId,
                sig: "",
              });
            }
            const wsi = deviceSockets.get(initiator);
            if (wsi && wsi.readyState === WebSocket.OPEN) send(wsi, ackFrame);
          }
        }

        return ack(ws, frame.msgId, true);
      }

      case "REKEY_BEGIN": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const p = frame.payload ?? {};
        const room = rooms.get(p.roomId);
        if (!room) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", {}, false));
          return;
        }
        if (!(await store.assertMember(room.callId, conn.deviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a call member", {}, false));
          return;
        }

        // save begin id and need-set
        const toDevices = room ? Array.from(room.peers.keys()) : [];
        const epoch = p.newEpoch ?? p.epoch ?? 0;
        await store.setRekeyBeginId(room.callId, epoch, frame.msgId);
        await store.setNeed(room.callId, epoch, toDevices);
        await store.saveRoute(frame.msgId, conn.deviceId);

        // fan-out begin as opaque payload
        for (const to of toDevices) {
          const beginFrame = { ...frame, ts: nowMs() };
          if (store.features.offlineMailbox) {
            await store.deliver(to, {
              ver: 1,
              id: beginFrame.msgId,
              type: "REKEY_BEGIN",
              ts: beginFrame.ts,
              callId: room.callId,
              fromDevice: conn.deviceId,
              epoch,
              payload: "",
              refId: "",
              sig: "",
            });
          }
          const wst = deviceSockets.get(to);
          if (wst && wst.readyState === WebSocket.OPEN) send(wst, beginFrame);
        }
        return ack(ws, frame.msgId, true);
      }

      case "REKEY_COMMIT": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const p = frame.payload ?? {};
        const room = rooms.get(p.roomId);
        if (!room) {
          ack(ws, frame.msgId, false, wsError("ROOM_NOT_FOUND", "Unknown room", {}, false));
          return;
        }
        if (!(await store.assertMember(room.callId, conn.deviceId))) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a call member", {}, false));
          return;
        }

        if (!store.features.rekeyCommit) {
          ack(ws, frame.msgId, false, wsError("E2EE_KEY_SYNC_FAILED", "DEGRADED_NO_COMMIT", {}, false));
          return;
        }

        const epoch = p.epoch;
        const gate = await store.tryCommit(room.callId, epoch);
        if (!gate.ok) {
          ack(ws, frame.msgId, false, wsError("E2EE_KEY_SYNC_FAILED", gate.reason, { ack: gate.ack, need: gate.need }, true));
          return;
        }

        // Apply epoch and bump version
        room.epoch = epoch;
        await store.bumpRoomVersion(room.callId);

        const toDevices = Array.from(room.peers.keys());
        for (const to of toDevices) {
          const commitFrame = { ...frame, ts: nowMs() };
          if (store.features.offlineMailbox) {
            await store.deliver(to, {
              ver: 1,
              id: commitFrame.msgId,
              type: "REKEY_COMMIT",
              ts: commitFrame.ts,
              callId: room.callId,
              fromDevice: conn.deviceId,
              epoch,
              payload: "",
              refId: "",
              sig: "",
            });
          }
          const wst = deviceSockets.get(to);
          if (wst && wst.readyState === WebSocket.OPEN) send(wst, commitFrame);
        }

        // Also send a fresh snapshot
        const snapshot = await makeSnapshot(p.roomId);
        if (snapshot) {
          for (const to of toDevices) {
            const wst = deviceSockets.get(to);
            if (!wst || wst.readyState !== WebSocket.OPEN) continue;
            send(wst, {
              v: 1,
              type: "ROOM_SNAPSHOT",
              msgId: uuid(),
              ts: nowMs(),
              seq: undefined,
              payload: snapshot,
            });
          }
        }

        return ack(ws, frame.msgId, true);
      }

      case "GET_ROUTER_RTP_CAPABILITIES": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const roomId = frame.payload?.roomId;
        send(ws, {
          v: 1,
          type: "ROUTER_RTP_CAPABILITIES",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: { roomId, routerRtpCapabilities: { codecs: GATEWAY_DEFAULT_CODECS } },
        });
        return ack(ws, frame.msgId, true);
      }

      // ── SFU media transport stubs ──────────────────────────────────────────────
      // calls-ws is a signaling gateway. When a client connects here directly
      // (e.g. dev environment without a separate SFU), these stubs allow the
      // bootstrap flow to complete without hanging on VALIDATION_FAILED.
      // In production the client should point VITE_CALLS_V2_WS_URL to the
      // mediasoup SFU endpoint (server/sfu/index.mjs) where real transport is done.
      case "TRANSPORT_CREATE": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const tcRoomId = frame.payload?.roomId;
        const direction = frame.payload?.direction === "recv" ? "recv" : "send";
        const transportId = `${direction}_${crypto.randomUUID().slice(0, 8)}`;
        send(ws, {
          v: 1,
          type: "TRANSPORT_CREATED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: {
            roomId: tcRoomId,
            transportId,
            direction,
            iceParameters: {
              usernameFragment: crypto.randomBytes(4).toString("hex"),
              password: crypto.randomBytes(16).toString("base64url"),
              iceLite: false,
            },
            iceCandidates: [],
            dtlsParameters: {
              role: "auto",
              fingerprints: [{ algorithm: "sha-256", value: Array.from({ length: 32 }, () => "00").join(":") }],
            },
          },
        });
        return ack(ws, frame.msgId, true);
      }

      case "TRANSPORT_CONNECT": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        return ack(ws, frame.msgId, true);
      }

      case "PRODUCE": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const pRoomId = frame.payload?.roomId;
        const producerId = `pr_${crypto.randomUUID().slice(0, 8)}`;
        const kind = frame.payload?.kind === "audio" ? "audio" : "video";
        send(ws, {
          v: 1,
          type: "PRODUCED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: { roomId: pRoomId, producerId, kind },
        });
        return ack(ws, frame.msgId, true);
      }

      case "CONSUME": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        return ack(ws, frame.msgId, true);
      }

      case "CONSUMER_RESUME": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        return ack(ws, frame.msgId, true);
      }

      case "ROOM_LEAVE": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        const leaveRoomId = frame.payload?.roomId;
        const room = leaveRoomId ? rooms.get(leaveRoomId) : null;
        if (room && conn.deviceId && room.peers.has(conn.deviceId)) {
          room.peers.delete(conn.deviceId);
          room.memberSetVersion++;
          // Notify remaining peers
          for (const [pid, peer] of room.peers.entries()) {
            const pws = deviceSockets.get(pid);
            if (pws && pws.readyState === WebSocket.OPEN) {
              send(pws, {
                v: 1, type: "PEER_LEFT", msgId: uuid(), ts: nowMs(),
                payload: { roomId: leaveRoomId, deviceId: conn.deviceId, userId: conn.userId },
              });
            }
          }
          if (room.peers.size === 0) rooms.delete(leaveRoomId);
        }
        send(ws, {
          v: 1, type: "ROOM_LEFT", msgId: uuid(), ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: { roomId: leaveRoomId },
        });
        return ack(ws, frame.msgId, true);
      }

      case "E2EE_READY": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        return ack(ws, frame.msgId, true);
      }

      case "ICE_RESTART": {
        if (!conn.authenticated) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
          return;
        }
        send(ws, {
          v: 1, type: "ICE_RESTART_OK", msgId: uuid(), ts: nowMs(),
          seq: conn.nextOutboundSeq++,
          payload: { roomId: frame.payload?.roomId, policy: "relay" },
        });
        return ack(ws, frame.msgId, true);
      }

      case "PING": {
        return ack(ws, frame.msgId, true);
      }

      default:
        // Unknown or not implemented
        ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", `Unsupported type: ${frame.type}`, {}, false));
    }
    } catch (err) {
      // S-03: isolate store/Redis errors — do not let them surface as unhandled
      // promise rejections and crash the gateway process.
      console.error("[calls-ws] Unhandled error in message handler:", err);
    }
  });

  ws.on("close", () => {
    // Clean up per-IP counter
    const prevCount = ipConnectionCounts.get(conn._clientIp) ?? 0;
    if (prevCount <= 1) {
      ipConnectionCounts.delete(conn._clientIp);
    } else {
      ipConnectionCounts.set(conn._clientIp, prevCount - 1);
    }

    // Stop JWT revalidation interval
    if (conn.jwtCheckInterval) jwtGuard.stopPeriodicCheck(conn.jwtCheckInterval);

    if (conn.deviceId) {
      unbindConnectionDevice(conn, ws);
    }

    if (!conn.deviceId) return;

    for (const room of rooms.values()) {
      if (!room.peers.has(conn.deviceId)) continue;

      room.peers.delete(conn.deviceId);
      room.memberSetVersion++;
      void store.removeMember?.(room.callId, conn.deviceId);
      void store.bumpRoomVersion(room.callId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[calls-ws] listening on ws://localhost:${PORT}`);
});
