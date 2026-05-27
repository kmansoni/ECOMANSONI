import http from "node:http";
import crypto from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";
import { IS_PROD_LIKE, readJoinTokenSecretConfig, validateSfuStartupEnv } from "./env.mjs";
import { createMediaPlaneController } from "./mediaPlane.mjs";

const PORT = Number(process.env.SFU_PORT ?? "8888");
const REGION = process.env.SFU_REGION ?? "tr";
const NODE_ID = process.env.SFU_NODE_ID ?? "local-sfu-1";
const E2EE_REQUIRED_DEFAULT = (() => {
  const raw = String(process.env.SFU_E2EE_REQUIRED ?? process.env.E2EE_REQUIRED_DEFAULT ?? "1").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
})();
const HEARTBEAT_SEC = Math.max(5, Number(process.env.SFU_HEARTBEAT_SEC ?? "10"));

// ── TURN credential generation (RFC 5766 §9.2 — same HMAC-SHA1 as turn-credentials Edge Function) ──
const TURN_SHARED_SECRET = process.env.TURN_SHARED_SECRET ?? "";
const TURN_URLS = (process.env.TURN_URLS ?? "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
const TURN_TTL_SECONDS = Math.max(3600, Number(process.env.TURN_TTL_SECONDS ?? "3600"));
const STUN_URLS = (process.env.STUN_URLS ?? "stun:stun.l.google.com:19302").split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

function generateTurnCredentials(userId) {
  if (!TURN_SHARED_SECRET || TURN_URLS.length === 0) return null;
  const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = `${expiry}:${userId.slice(0, 20)}`;
  const credential = crypto.createHmac("sha1", TURN_SHARED_SECRET).update(username).digest("base64");
  return { username, credential, expiry };
}

function buildIceServers(userId) {
  const servers = STUN_URLS.map(u => ({ urls: u }));
  const turn = generateTurnCredentials(userId);
  if (turn) {
    for (const u of TURN_URLS) {
      servers.push({ urls: u, username: turn.username, credential: turn.credential });
    }
  }
  return servers;
}
const CALLS_DEV_INSECURE_AUTH = !IS_PROD_LIKE && process.env.CALLS_DEV_INSECURE_AUTH === "1";
const REQUIRE_MEDIASOUP_IN_PROD = IS_PROD_LIKE && process.env.SFU_REQUIRE_MEDIASOUP !== "0";
const requireSFrame = (() => {
  const raw = String(process.env.SFU_REQUIRE_SFRAME ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return IS_PROD_LIKE;
})();
const requireDoubleRatchet = (() => {
  const raw = String(process.env.SFU_REQUIRE_DOUBLE_RATCHET ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return IS_PROD_LIKE;
})();
const REQUIRE_SECURE_WS = IS_PROD_LIKE && process.env.SFU_REQUIRE_SECURE_WS !== "0";
const TRUSTED_PROXIES = new Set(
  (process.env.SFU_TRUSTED_PROXIES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_AUTH_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
const STARTED_AT = Date.now();
const MAX_PARTICIPANTS_PER_ROOM = (() => {
  const raw = Number(process.env.CALLS_MAX_PARTICIPANTS_PER_ROOM ?? "50");
  return Number.isFinite(raw) && raw >= 2 ? Math.floor(raw) : 50;
})();
const SFU_EXPECT_MULTI_INSTANCE = process.env.SFU_EXPECT_MULTI_INSTANCE === "1";
const SFU_E2EE_RATE_LIMIT_BACKEND = String(process.env.SFU_E2EE_RATE_LIMIT_BACKEND ?? "memory").trim().toLowerCase();

validateSfuStartupEnv();

if (IS_PROD_LIKE && SFU_EXPECT_MULTI_INSTANCE && SFU_E2EE_RATE_LIMIT_BACKEND !== "redis") {
  throw new Error(
    "[sfu] multi-instance mode requires distributed E2EE rate limiter (set SFU_E2EE_RATE_LIMIT_BACKEND=redis)"
  );
}

/**
 * E2EE rate limiting — per-process sliding window.
 *
 * LIMITATION: This rate limiter is process-local (in-memory Map).
 * In multi-instance SFU deployments behind a load balancer, an attacker
 * can bypass the limit by distributing requests across instances.
 *
 * TODO(production): Replace with Redis-backed rate limiter when multiple
 * SFU instances are deployed. See server/calls-ws/index.mjs `isJoinTokenUsed()`
 * for a Redis pattern that can be adapted here.
 */
const e2eeRateLimits = new Map(); // deviceId -> { keyPackages, rekeys, lastReset }
const E2EE_RATE_WINDOW = 60000; // 1 minute
const E2EE_MAX_KEY_PACKAGES = 50;
const E2EE_MAX_REKEYS = 5;
// SECURITY FIX: Cap Map size to prevent OOM under device-ID flooding.
// Without this bound an attacker can open many WebSocket connections with unique
// deviceIds to grow the Map without limit before the 2-minute cleanup fires.
// Past this threshold new (unseen) devices are rate-limited hard — existing entries
// continue operating normally.
const E2EE_RATE_LIMIT_MAX_ENTRIES = 200_000;

function getRemoteAddress(req) {
  return (req?.socket?.remoteAddress ?? "").replace(/^::ffff:/i, "");
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1";
}

function checkE2EERateLimit(deviceId, operation) {
  const now = Date.now();
  let entry = e2eeRateLimits.get(deviceId);
  if (!entry || now - entry.lastReset > E2EE_RATE_WINDOW) {
    if (!entry && e2eeRateLimits.size >= E2EE_RATE_LIMIT_MAX_ENTRIES) {
      // Map is full — reject new device to prevent OOM. Existing devices unaffected.
      console.warn(`[E2EE] e2eeRateLimits at capacity (${E2EE_RATE_LIMIT_MAX_ENTRIES}), rejecting new deviceId`);
      return false;
    }
    entry = { keyPackages: 0, rekeys: 0, lastReset: now };
    e2eeRateLimits.set(deviceId, entry);
  }
  if (operation === "KEY_PACKAGE") {
    entry.keyPackages++;
    return entry.keyPackages <= E2EE_MAX_KEY_PACKAGES;
  }
  if (operation === "REKEY_BEGIN") {
    entry.rekeys++;
    return entry.rekeys <= E2EE_MAX_REKEYS;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of e2eeRateLimits) {
    if (now - v.lastReset > E2EE_RATE_WINDOW * 2) e2eeRateLimits.delete(k);
  }
}, E2EE_RATE_WINDOW * 2).unref?.();

const supabaseAuthClient = SUPABASE_URL && SUPABASE_AUTH_KEY
  ? createClient(SUPABASE_URL, SUPABASE_AUTH_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const authCache = new Map();
const AUTH_CACHE_TTL_MS = 15_000;

async function verifyAccessToken(accessToken, req) {
  if (CALLS_DEV_INSECURE_AUTH) {
    const remoteAddress = getRemoteAddress(req);
    if (!isLoopbackAddress(remoteAddress)) {
      console.warn(`[sfu] CALLS_DEV_INSECURE_AUTH rejected for non-loopback source: ${remoteAddress || "unknown"}`);
      return null;
    }
    return { userId: `dev_${String(accessToken ?? "anon").slice(0, 20)}` };
  }

  if (typeof accessToken !== "string" || accessToken.length < 20) {
    return null;
  }

  const now = Date.now();
  const cached = authCache.get(accessToken);
  if (cached && cached.exp > now) {
    return { userId: cached.userId };
  }

  if (!supabaseAuthClient) {
    return null;
  }

  const { data, error } = await supabaseAuthClient.auth.getUser(accessToken);
  if (error || !data?.user?.id) {
    return null;
  }

  const userId = data.user.id;
  authCache.set(accessToken, { userId, exp: now + AUTH_CACHE_TTL_MS });
  if (authCache.size > 2000) {
    const keys = Array.from(authCache.keys());
    for (let i = 0; i < 500; i++) authCache.delete(keys[i]);
  }

  return { userId };
}

// Периодическая очистка authCache от expired entries (каждые 30 секунд)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authCache) {
    if (v.exp <= now) authCache.delete(k);
  }
}, 30_000).unref();

// ── joinToken verification (shared secret with calls-ws) ──────────────
let cachedJoinTokenSecret = null;
const CALLS_JOIN_TOKEN_SKIP = !IS_PROD_LIKE && process.env.CALLS_JOIN_TOKEN_SKIP === "1";

function getJoinTokenSecret() {
  if (cachedJoinTokenSecret) return cachedJoinTokenSecret;
  const resolved = readJoinTokenSecretConfig();
  if (resolved) {
    if (resolved.source === "SUPABASE_JWT_SECRET") {
      const scope = IS_PROD_LIKE ? "production-like environment" : "non-prod environment";
      console.warn(`[sfu] Missing CALLS_JOIN_TOKEN_SECRET, using SUPABASE_JWT_SECRET fallback in ${scope}`);
    }
    cachedJoinTokenSecret = resolved.secret;
    return cachedJoinTokenSecret;
  }
  if (IS_PROD_LIKE) {
    throw new Error("[sfu] join-token secret unavailable after startup validation");
  }
  cachedJoinTokenSecret = "dev-only-join-token-secret";
  return cachedJoinTokenSecret;
}

function verifyJoinToken(joinToken, expectedRoomId) {
  if (CALLS_JOIN_TOKEN_SKIP) return { skipped: true };
  if (typeof joinToken !== "string") return null;
  const dotIdx = joinToken.indexOf(".");
  if (dotIdx < 1) return null;
  const encodedPayload = joinToken.slice(0, dotIdx);
  const sig = joinToken.slice(dotIdx + 1);
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
    const raw = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (raw.length % 4)) % 4;
    const payload = JSON.parse(Buffer.from(raw + "=".repeat(padLen), "base64").toString("utf8"));
    const expMs = Number(payload?.exp ?? 0) * 1000;
    if (!expMs || expMs <= Date.now()) return null;
    if (typeof payload?.roomId !== "string") return null;
    if (expectedRoomId && payload.roomId !== expectedRoomId) return null;
    return payload;
  } catch {
    return null;
  }
}

const CALLS_JOIN_TOKEN_TTL_SEC = Math.max(30, Number(process.env.CALLS_JOIN_TOKEN_TTL_SEC ?? "600"));

function issueJoinToken({ roomId, callId, allowedUserIds = [] }) {
  const normalized = Array.isArray(allowedUserIds)
    ? allowedUserIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())
    : [];
  const payload = {
    roomId,
    callId,
    allowedUserIds: normalized,
    jti: uuid(),
    exp: Math.floor(Date.now() / 1000) + CALLS_JOIN_TOKEN_TTL_SEC,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const sig = crypto
    .createHmac("sha256", getJoinTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${sig}`;
}

function isObject(value) {
  return !!value && typeof value === "object";
}

function hasNonEmptyObject(value) {
  return isObject(value) && Object.keys(value).length > 0;
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isSecureUpgradeRequest(req) {
  if (req?.socket?.encrypted === true) return true;

  const xForwardedProto = req?.headers?.["x-forwarded-proto"];
  if (!xForwardedProto) return false;

  const remoteAddress = getRemoteAddress(req);
  if (TRUSTED_PROXIES.size > 0 && !TRUSTED_PROXIES.has(remoteAddress)) {
    return false;
  }

  const proto = String(Array.isArray(xForwardedProto) ? xForwardedProto[0] : xForwardedProto)
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "https" || proto === "wss";
}

function validateDtlsParameters(dtlsParameters) {
  if (!hasNonEmptyObject(dtlsParameters)) return false;
  if (!hasNonEmptyArray(dtlsParameters.fingerprints)) return false;
  return true;
}

function validateRtpParameters(rtpParameters) {
  if (!hasNonEmptyObject(rtpParameters)) return false;
  const hasCodecs = hasNonEmptyArray(rtpParameters.codecs);
  const hasEncodings = hasNonEmptyArray(rtpParameters.encodings);
  return hasCodecs || hasEncodings;
}

function validateRtpCapabilities(rtpCapabilities) {
  if (!hasNonEmptyObject(rtpCapabilities)) return false;
  return hasNonEmptyArray(rtpCapabilities.codecs);
}

const mediaPlane = await createMediaPlaneController({ requireMediasoup: REQUIRE_MEDIASOUP_IN_PROD });
if (REQUIRE_MEDIASOUP_IN_PROD && mediaPlane.mode !== "mediasoup") {
  throw new Error("[sfu] production fail-closed: mediasoup mode is required");
}

function nowMs() {
  return Date.now();
}

function uuid() {
  return crypto.randomUUID();
}

function wsError(code, message, details = {}, retryable = false) {
  return { code, message, details, retryable };
}

function send(ws, frame) {
  ws.send(JSON.stringify(frame));
}

function ack(ws, ackOfMsgId, ok = true, error, payload = {}) {
  send(ws, {
    v: 1,
    type: "ACK",
    msgId: uuid(),
    ts: nowMs(),
    ack: { ackOfMsgId, ok, error },
    payload,
  });
}

function logOperationError(operation, { roomId = null, deviceId = null, consumerId = null, error } = {}) {
  console.error(
    `[sfu] operation failed: operation=${operation} roomId=${roomId ?? "-"} deviceId=${deviceId ?? "-"} consumerId=${consumerId ?? "-"}`,
    error
  );
}

const rooms = new Map();
const peersByDevice = new Map();

function ensureRoom(roomId, callId, preferredRegion = REGION) {
  let room = rooms.get(roomId);
  if (room) return room;

  room = {
    roomId,
    callId,
    region: preferredRegion,
    nodeId: NODE_ID,
    roomVersion: 0,
    epoch: 0,
    memberSetVersion: 0,
    peers: new Map(),
    producers: new Map(),
    consumers: new Map(),
    routerRtpCapabilities: { codecs: [] },
  };
  rooms.set(roomId, room);
  return room;
}

function bumpRoomVersion(room) {
  room.roomVersion = Number(room.roomVersion ?? 0) + 1;
}

function serializeProducer(p) {
  return {
    producerId: p.producerId,
    peerDeviceId: p.peerDeviceId,
    ownerUserId: p.ownerUserId,
    ownerDeviceId: p.ownerDeviceId,
    kind: p.kind,
    source: p.source,
    generation: p.generation,
    createdAt: p.createdAt,
  };
}

function serializeConsumer(c) {
  return {
    consumerId: c.consumerId,
    producerId: c.producerId,
    consumerDeviceId: c.consumerDeviceId,
    ownerUserId: c.ownerUserId,
    ownerDeviceId: c.ownerDeviceId,
    kind: c.kind,
    source: c.source,
    state: c.state,
    generation: c.generation,
    createdAt: c.createdAt,
    resumedAt: c.resumedAt,
  };
}

function makeSnapshot(room) {
  return {
    roomId: room.roomId,
    callId: room.callId,
    region: room.region,
    nodeId: room.nodeId,
    roomVersion: Number(room.roomVersion ?? 0),
    epoch: room.epoch,
    memberSetVersion: room.memberSetVersion,
    serverTime: nowMs(),
    peers: Array.from(room.peers.values()).map((p) => ({
      peerId: p.userId,
      userId: p.userId,
      deviceId: p.deviceId,
      role: "member",
      state: "joined",
      e2eeReady: !!p.e2eeReady,
    })),
    producers: Array.from(room.producers.values()).map(serializeProducer),
    consumers: Array.from(room.consumers.values()).map(serializeConsumer),
    e2ee: {
      required: E2EE_REQUIRED_DEFAULT,
      epoch: room.epoch,
      leaderDeviceId: Array.from(room.peers.keys())[0] ?? "",
      expectedSenderDevices: Array.from(room.peers.keys()),
      missingSenderKeys: [],
    },
  };
}

function broadcastRoom(room, frame, exceptDeviceId = null) {
  for (const [deviceId, peer] of room.peers.entries()) {
    if (exceptDeviceId && deviceId === exceptDeviceId) continue;
    if (!peer.ws || peer.ws.readyState !== WebSocket.OPEN) continue;
    send(peer.ws, frame);
  }
}

function broadcastLegacyParticipantStream(room, participantId, streamAction, hasVideo, exceptDeviceId = null) {
  if (typeof participantId !== "string" || participantId.trim().length === 0) return;
  broadcastRoom(
    room,
    {
      v: 1,
      type: "participant-stream",
      msgId: uuid(),
      ts: nowMs(),
      payload: {
        roomId: room.roomId,
        participantId,
        streamAction,
        hasVideo,
      },
    },
    exceptDeviceId
  );
}

function broadcastLegacyParticipantSpeaking(room, participantId, speaking, exceptDeviceId = null) {
  if (typeof participantId !== "string" || participantId.trim().length === 0) return;
  broadcastRoom(
    room,
    {
      v: 1,
      type: "participant-speaking",
      msgId: uuid(),
      ts: nowMs(),
      payload: {
        roomId: room.roomId,
        participantId,
        speaking,
      },
    },
    exceptDeviceId
  );
}

function sendToDevice(room, deviceId, frame) {
  const peer = room?.peers?.get(deviceId);
  if (!peer?.ws || peer.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  send(peer.ws, frame);
  return true;
}

function relayCallSignalInRoom(room, sourceDeviceId, frame) {
  const payload = frame.payload ?? {};
  const toUser = typeof payload.to === "string" ? payload.to.trim() : "";
  const toDevice = typeof payload.toDevice === "string" ? payload.toDevice.trim() : "";
  const callId = typeof payload.callId === "string" ? payload.callId.trim() : "";

  if (!toUser || !callId) {
    return { ok: false, error: "to and callId are required" };
  }
  if (room.callId && room.callId !== callId) {
    return { ok: false, error: "callId does not match room" };
  }

  const forwarded = { ...frame, ts: nowMs() };
  let delivered = 0;
  for (const [deviceId, peer] of room.peers.entries()) {
    if (deviceId === sourceDeviceId) continue;
    if (peer.userId !== toUser) continue;
    if (toDevice && deviceId !== toDevice) continue;
    if (!peer.ws || peer.ws.readyState !== WebSocket.OPEN) continue;
    send(peer.ws, forwarded);
    delivered += 1;
  }

  return { ok: true, delivered };
}

function isLikelyBase64(value, minLength = 16) {
  if (typeof value !== "string" || value.length < minLength) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value);
}

async function verifyIdentitySignature(kp, signatureBase64) {
  try {
    const senderIdentity = isObject(kp?.senderIdentity) ? kp.senderIdentity : null;
    const userId = typeof senderIdentity?.userId === "string" ? senderIdentity.userId : "";
    const deviceId = typeof senderIdentity?.deviceId === "string" ? senderIdentity.deviceId : "";
    const sessionId = typeof senderIdentity?.sessionId === "string" ? senderIdentity.sessionId : "";
    const identityPubKeyJwk = isObject(senderIdentity?.identityPubKeyJwk)
      ? senderIdentity.identityPubKeyJwk
      : null;

    if (!identityPubKeyJwk) {
      return false;
    }

    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length < 32) {
      return false;
    }

    const data = Buffer.from(
      `${kp.senderPublicKey}|${kp.ciphertext}|${kp.epoch}|${userId}|${deviceId}|${sessionId}|${kp.salt ?? ""}`,
      "utf8"
    );

    const publicKey = await crypto.webcrypto.subtle.importKey(
      "jwk",
      identityPubKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    return await crypto.webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signature,
      data
    );
  } catch {
    return false;
  }
}

function isPeerE2EEReadyForEpoch(room, peerDeviceId) {
  if (!E2EE_REQUIRED_DEFAULT) return true;
  const peer = room?.peers?.get(peerDeviceId);
  if (!peer) return false;
  return peer.e2eeReady === true && peer.e2eeEpoch === room.epoch;
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/healthz" || req.url === "/ready") {
    const roomCount = rooms.size;
    const peerCount = peersByDevice.size;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        region: REGION,
        nodeId: NODE_ID,
        wsReady: true,
        rooms: roomCount,
        peers: peerCount,
        uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        failoverHints: {
          healthy: true,
          preferredRegion: REGION,
        },
      })
    );
    return;
  }

  if (req.url === "/metrics") {
    const peers = Array.from(rooms.values()).reduce((acc, room) => acc + room.peers.size, 0);
    const producers = Array.from(rooms.values()).reduce((acc, room) => acc + room.producers.size, 0);
    const mediaPlaneMetrics = mediaPlane.metrics();
    const roomsByRegion = Array.from(rooms.values()).reduce((acc, room) => {
      acc[room.region] = (acc[room.region] ?? 0) + 1;
      return acc;
    }, {});
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        nodeId: NODE_ID,
        region: REGION,
        uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        rooms: rooms.size,
        peers,
        producers,
        mediaPlane: mediaPlaneMetrics,
        roomsByRegion,
      })
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  if (REQUIRE_SECURE_WS && !isSecureUpgradeRequest(req)) {
    ws.close(4003, "SECURE_TRANSPORT_REQUIRED");
    return;
  }

  const conn = {
    authenticated: false,
    userId: null,
    deviceId: null,
    roomId: null,
    expectedSeq: 1,
    lastSeq: 0,
    seenMsgIds: new Set(),
    seenMsgIdQueue: [],
    e2eeCaps: null,
  };

  ws.on("message", async (raw) => {
    let frame = null;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!frame || frame.v !== 1 || typeof frame.type !== "string" || typeof frame.msgId !== "string" || typeof frame.ts !== "number") {
      ack(ws, frame?.msgId ?? uuid(), false, wsError("VALIDATION_FAILED", "Invalid envelope"));
      return;
    }

    if (frame.ack) return;

    if (!Number.isInteger(frame.seq) || frame.seq <= 0) {
      ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing or invalid seq", {}, false));
      return;
    }

    if (conn.seenMsgIds.has(frame.msgId)) {
      ack(ws, frame.msgId, true);
      return;
    }

    if (frame.seq <= conn.lastSeq) {
      ack(ws, frame.msgId, false, wsError("REPLAY_DETECTED", "Non-monotonic seq rejected", {}, false));
      return;
    }

    conn.lastSeq = frame.seq;
    conn.seenMsgIds.add(frame.msgId);
    conn.seenMsgIdQueue.push(frame.msgId);
    if (conn.seenMsgIdQueue.length > 4000) {
      const stale = conn.seenMsgIdQueue.shift();
      if (stale) conn.seenMsgIds.delete(stale);
    }

    const ensureAuth = () => {
      if (conn.authenticated) return true;
      ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "AUTH required", {}, true));
      return false;
    };

    try {
      switch (frame.type) {
      case "HELLO": {
        conn.deviceId = frame.payload?.client?.deviceId ?? conn.deviceId ?? `dev_${uuid().slice(0, 8)}`;
        send(ws, {
          v: 1,
          type: "WELCOME",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: {
            serverTime: nowMs(),
            heartbeatSec: HEARTBEAT_SEC,
            resumeToken: uuid(),
            features: {
              wsSeqRequired: true,
              e2eeRequiredDefault: E2EE_REQUIRED_DEFAULT,
              sframeRequired: requireSFrame,
              sfuEnabled: true,
            },
          },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "AUTH": {
        const accessToken = frame.payload?.accessToken;
        const verified = await verifyAccessToken(accessToken, req);
        if (!verified) {
          ack(ws, frame.msgId, false, wsError("UNAUTHENTICATED", "Invalid accessToken", {}, false));
          return;
        }

        conn.authenticated = true;
        conn.userId = verified.userId;
        if (!conn.deviceId) conn.deviceId = `dev_${uuid().slice(0, 8)}`;
        peersByDevice.set(conn.deviceId, ws);

        send(ws, {
          v: 1,
          type: "AUTH_OK",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { userId: conn.userId, deviceId: conn.deviceId },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "E2EE_CAPS": {
        if (!ensureAuth()) return;
        const insertableStreams = frame.payload?.insertableStreams === true;
        const sframe = frame.payload?.sframe === true;
        const doubleRatchet =
          frame.payload?.doubleRatchet === true ||
          (Array.isArray(frame.payload?.supportedCipherSuites) &&
            frame.payload.supportedCipherSuites.some((suite) =>
              suite === "DOUBLE_RATCHET_P256_AES128GCM" || suite === "DR_P256_HKDF_SHA256_AES128GCM"
            ));
        conn.e2eeCaps = { insertableStreams, sframe, doubleRatchet };

        if (E2EE_REQUIRED_DEFAULT && !insertableStreams) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "Insertable Streams capability is required", {}, false));
          return;
        }
        if (requireSFrame && (!insertableStreams || !sframe)) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "SFrame + Insertable Streams capabilities are required", {
            insertableStreams,
            sframe,
          }, false));
          return;
        }
        if (requireDoubleRatchet && !doubleRatchet) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "Double Ratchet capability is required", {
            doubleRatchet,
          }, false));
          return;
        }

        ack(ws, frame.msgId, true);
        return;
      }

      case "ROOM_CREATE": {
        if (!ensureAuth()) return;
        const roomId = frame.payload?.roomId ?? `room_${uuid().slice(0, 8)}`;
        const callId = frame.payload?.callId ?? `call_${uuid().slice(0, 8)}`;
        const preferredRegion = frame.payload?.preferredRegion ?? REGION;
        const allowedUserIds = Array.isArray(frame.payload?.allowedUserIds)
          ? frame.payload.allowedUserIds.filter((id) => typeof id === "string" && id.trim())
          : [];
        if (!allowedUserIds.includes(conn.userId)) {
          allowedUserIds.push(conn.userId);
        }

        const room = ensureRoom(roomId, callId, preferredRegion);
        const created = await mediaPlane.createRoom(roomId);
        room.routerRtpCapabilities = created?.routerRtpCapabilities ?? { codecs: [] };

        const joinToken = issueJoinToken({ roomId, callId, allowedUserIds });

        send(ws, {
          v: 1,
          type: "ROOM_CREATED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId: room.roomId, callId: room.callId, region: room.region, nodeId: room.nodeId, epoch: room.epoch, memberSetVersion: room.memberSetVersion, joinToken },
        });

        send(ws, {
          v: 1,
          type: "ROOM_JOIN_SECRET",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId: room.roomId, joinToken },
        });

        ack(ws, frame.msgId, true);
        return;
      }

      case "ROOM_JOIN": {
        if (!ensureAuth()) return;
        if (E2EE_REQUIRED_DEFAULT && !conn.e2eeCaps?.insertableStreams) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "E2EE_CAPS with insertableStreams=true required before ROOM_JOIN", {}, false));
          return;
        }
        if (requireSFrame && (!conn.e2eeCaps?.insertableStreams || !conn.e2eeCaps?.sframe)) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "SFrame + Insertable Streams capabilities are required before joining the room", {}, false));
          return;
        }
        if (requireDoubleRatchet && !conn.e2eeCaps?.doubleRatchet) {
          ack(ws, frame.msgId, false, wsError("UNSUPPORTED_E2EE", "Double Ratchet capability is required before joining the room", {}, false));
          return;
        }
        const roomId = frame.payload?.roomId;
        if (!roomId) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing roomId", {}, false));
          return;
        }

        // S3/W1: joinToken verification — unified with calls-ws
        const tokenPayload = verifyJoinToken(frame.payload?.joinToken, roomId);
        if (!tokenPayload) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Invalid or missing joinToken", { roomId }, false));
          return;
        }
        // Verify userId is in allowedUserIds (if token contains the list)
        if (Array.isArray(tokenPayload.allowedUserIds) && tokenPayload.allowedUserIds.length > 0) {
          if (!tokenPayload.allowedUserIds.includes(conn.userId)) {
            ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "User not authorized for this call", { roomId }, false));
            return;
          }
        }

        const callId = frame.payload?.callId ?? tokenPayload.callId ?? `call_${uuid().slice(0, 8)}`;
        const room = ensureRoom(roomId, callId, frame.payload?.preferredRegion ?? REGION);
        const ensured = await mediaPlane.createRoom(roomId);
        room.routerRtpCapabilities = ensured?.routerRtpCapabilities ?? room.routerRtpCapabilities;
        if (room.peers.size >= MAX_PARTICIPANTS_PER_ROOM) {
          ack(ws, frame.msgId, false, wsError("ROOM_FULL", `Max participants exceeded (${MAX_PARTICIPANTS_PER_ROOM})`, { roomId }, false));
          return;
        }
        const deviceId = frame.payload?.deviceId ?? conn.deviceId ?? `dev_${uuid().slice(0, 8)}`;
        conn.deviceId = deviceId;
        conn.roomId = roomId;

        room.memberSetVersion += 1;
        bumpRoomVersion(room);
        room.peers.set(deviceId, {
          userId: conn.userId,
          deviceId,
          ws,
          e2eeReady: !E2EE_REQUIRED_DEFAULT,
          e2eeEpoch: E2EE_REQUIRED_DEFAULT ? -1 : room.epoch,
          transports: new Map(),
          producerGenerations: new Map(),
        });
        peersByDevice.set(deviceId, ws);

         send(ws, {
           v: 1,
           type: "ROOM_JOIN_OK",
           msgId: uuid(),
           ts: nowMs(),
           seq: conn.expectedSeq++,
           payload: {
             roomId,
             callId: room.callId,
             region: room.region,
             nodeId: room.nodeId,
             epoch: room.epoch,
             memberSetVersion: room.memberSetVersion,
             roomVersion: room.roomVersion,
             mediasoup: {
               routerRtpCapabilities: room.routerRtpCapabilities,
             },
             e2ee: { required: E2EE_REQUIRED_DEFAULT, epoch: room.epoch },
           },
         });

        send(ws, {
          v: 1,
          type: "E2EE_POLICY",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { required: E2EE_REQUIRED_DEFAULT, epoch: room.epoch, rekeyOnJoin: true },
        });

        send(ws, {
          v: 1,
          type: "ROOM_SNAPSHOT",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: makeSnapshot(room),
        });

        broadcastRoom(
          room,
          {
            v: 1,
             type: "PEER_JOINED",
             msgId: uuid(),
             ts: nowMs(),
             payload: { roomId, userId: conn.userId, deviceId, roomVersion: room.roomVersion },
          },
          deviceId
        );

        ack(ws, frame.msgId, true);
        return;
      }

      case "E2EE_READY": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        const epochRaw = frame.payload?.epoch;
        const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(epoch) || epoch < 0) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing or invalid epoch", {}, false));
          return;
        }
        if (epoch !== room.epoch) {
          ack(ws, frame.msgId, false, wsError("E2EE_EPOCH_MISMATCH", "E2EE readiness epoch mismatch", { expectedEpoch: room.epoch }, true));
          return;
        }

        const peer = room.peers.get(conn.deviceId);
        peer.e2eeReady = true;
        peer.e2eeEpoch = epoch;
        ack(ws, frame.msgId, true);
        return;
      }

      case "TRANSPORT_CREATE": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!isPeerE2EEReadyForEpoch(room, conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("E2EE_NOT_READY", "E2EE readiness required before media operations", { expectedEpoch: room.epoch }, true));
          return;
        }

        const direction = frame.payload?.direction === "recv" ? "recv" : "send";
        const transport = await mediaPlane.createTransport(room.roomId, conn.deviceId, direction);
        const transportId = transport.id;
        room.peers.get(conn.deviceId).transports.set(transportId, { id: transportId, direction, connected: false });

        send(ws, {
          v: 1,
          type: "TRANSPORT_CREATED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: {
            roomId: room.roomId,
            transportId,
            direction,
            iceParameters: transport.iceParameters ?? {},
            iceCandidates: transport.iceCandidates ?? [],
            dtlsParameters: transport.dtlsParameters ?? {},
            iceServers: buildIceServers(conn.userId),
          },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "TRANSPORT_CONNECT": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!isPeerE2EEReadyForEpoch(room, conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("E2EE_NOT_READY", "E2EE readiness required before media operations", { expectedEpoch: room.epoch }, true));
          return;
        }
        const transportId = frame.payload?.transportId;
        const transport = room.peers.get(conn.deviceId).transports.get(transportId);
        if (!transport) {
          ack(ws, frame.msgId, false, wsError("TRANSPORT_NOT_FOUND", "Unknown transport", {}, false));
          return;
        }
        if (mediaPlane.mode === "mediasoup" && !validateDtlsParameters(frame.payload?.dtlsParameters)) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "dtlsParameters must be non-empty with fingerprints", {}, false));
          return;
        }
        // Идемпотентный guard: повторный TRANSPORT_CONNECT — просто ACK
        if (transport.connected) {
          ack(ws, frame.msgId, true);
          return;
        }
        await mediaPlane.connectTransport(room.roomId, transportId, frame.payload?.dtlsParameters ?? {});
        transport.connected = true;
        ack(ws, frame.msgId, true);
        return;
      }

      case "PRODUCE": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!isPeerE2EEReadyForEpoch(room, conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("E2EE_NOT_READY", "E2EE readiness required before media operations", { expectedEpoch: room.epoch }, true));
          return;
        }

        const kind = frame.payload?.kind === "audio" ? "audio" : "video";
        if (mediaPlane.mode === "mediasoup" && !validateRtpParameters(frame.payload?.rtpParameters)) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "rtpParameters must be non-empty", {}, false));
          return;
        }
        const rawAppData = frame.payload?.appData && typeof frame.payload.appData === "object"
          ? frame.payload.appData
          : {};
        const trackId = typeof rawAppData.trackId === "string" ? rawAppData.trackId : undefined;
        const source = rawAppData.source === "screen"
          ? "screen"
          : kind === "audio" ? "microphone" : "camera";
        const produced = await mediaPlane.produce(
          room.roomId,
          conn.deviceId,
          frame.payload?.transportId,
          kind,
          frame.payload?.rtpParameters ?? {},
          { peerDeviceId: conn.deviceId, userId: conn.userId, source, ...(trackId ? { trackId } : {}) }
        );
        const producerId = produced.id;
        const peer = room.peers.get(conn.deviceId);
        const generation = (peer.producerGenerations.get(source) ?? 0) + 1;
        peer.producerGenerations.set(source, generation);
        const producer = {
          producerId,
          peerDeviceId: conn.deviceId,
          userId: conn.userId,
          ownerUserId: conn.userId,
          ownerDeviceId: conn.deviceId,
          kind,
          source,
          paused: false,
          createdAt: nowMs(),
          generation,
        };
        room.producers.set(producerId, producer);
        bumpRoomVersion(room);

        // SFrame header validation for incoming media frames
        // SECURITY FIX: SFrame enforcement — producers sending only tiny frames
        // (< 17 bytes, the minimum SFrame overhead) are blocked as they cannot
        // carry valid encrypted payloads and indicate a bypassed E2EE sender.
        if (requireSFrame) {
          const hasTraceObserver = produced.observer && typeof produced.observer.on === "function";
          const canEnableTrace = typeof produced.enableTraceEvent === "function";

          const closeSuspiciousProducer = async (reason) => {
            const wasClosed = await mediaPlane.closeProducer(room.roomId, producerId).catch((error) => {
              logOperationError("closeProducer", { roomId: room.roomId, deviceId: conn.deviceId, error });
              return false;
            });

            room.producers.delete(producerId);
            for (const [consumerId, consumer] of room.consumers.entries()) {
              if (consumer.producerId === producerId) {
                room.consumers.delete(consumerId);
              }
            }

            if (!wasClosed) {
              console.warn(`[SFrame] closeProducer fallback cleanup for ${producerId}`);
            }

            bumpRoomVersion(room);
            broadcastRoom(room, {
              v: 1,
              type: "PRODUCER_REMOVED",
              msgId: uuid(),
              ts: nowMs(),
              payload: { roomId: room.roomId, roomVersion: room.roomVersion, producerId, peerDeviceId: conn.deviceId, reason },
            }, conn.deviceId);

            broadcastLegacyParticipantStream(room, conn.userId, "remove", false, conn.deviceId);
          };

          if (!hasTraceObserver || !canEnableTrace) {
            await closeSuspiciousProducer("SFRAME_TRACE_UNAVAILABLE");
            ack(ws, frame.msgId, false, wsError("E2EE_ENFORCEMENT_FAILED", "SFrame trace enforcement unavailable", {}, true));
            return;
          }

          await produced.enableTraceEvent(["rtp"]);

          let framesChecked = 0;
          let suspiciousFrames = 0;
          let enforcementDone = false;
          const MAX_CHECK_FRAMES = 5;
          const SFRAME_CHECK_TIMEOUT = 10000;
          const checkTimer = setTimeout(() => {
            if (!enforcementDone && framesChecked === 0) {
              console.warn(`[SFrame] WARN: no RTP trace frames for producer ${producerId} within ${SFRAME_CHECK_TIMEOUT}ms`);
            }
          }, SFRAME_CHECK_TIMEOUT);

          produced.observer.on("trace", (trace) => {
            if (enforcementDone || trace.type !== "rtp" || framesChecked >= MAX_CHECK_FRAMES) {
              return;
            }

            framesChecked += 1;
            if (trace.size !== undefined && trace.size < 17) {
              suspiciousFrames += 1;
              console.log(`[SFrame] WARN: Producer ${producerId} frame ${framesChecked} too small for SFrame (${trace.size} bytes)`);
            }

            if (framesChecked >= MAX_CHECK_FRAMES) {
              enforcementDone = true;
              clearTimeout(checkTimer);

              if (suspiciousFrames >= MAX_CHECK_FRAMES) {
                console.warn(`[SFrame] BLOCKING: Producer ${producerId} — all ${MAX_CHECK_FRAMES} sampled frames too small for SFrame.`);
                void closeSuspiciousProducer("SFRAME_FRAMES_TOO_SMALL");
                return;
              }

              console.log(`[SFrame] OK: Producer ${producerId} passed ${MAX_CHECK_FRAMES} frame checks (${suspiciousFrames} suspicious)`);
            }
          });
        }

        send(ws, {
          v: 1,
          type: "PRODUCED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId: room.roomId, roomVersion: room.roomVersion, producerId, kind: producer.kind, source: producer.source },
        });

        broadcastRoom(
          room,
          {
            v: 1,
            type: "PRODUCER_ADDED",
            msgId: uuid(),
            ts: nowMs(),
            payload: {
              roomId: room.roomId,
              roomVersion: room.roomVersion,
              producer: serializeProducer(producer),
            },
          },
          conn.deviceId
        );

        broadcastLegacyParticipantStream(
          room,
          conn.userId,
          "upsert",
          producer.kind === "video",
          conn.deviceId
        );

        ack(ws, frame.msgId, true);
        return;
      }

      case "CONSUME": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!isPeerE2EEReadyForEpoch(room, conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("E2EE_NOT_READY", "E2EE readiness required before media operations", { expectedEpoch: room.epoch }, true));
          return;
        }

        const producerId = frame.payload?.producerId;
        if (!producerId || !room.producers.has(producerId)) {
          ack(ws, frame.msgId, false, wsError("PRODUCER_NOT_FOUND", "Unknown producer", {}, false));
          return;
        }

        const producer = room.producers.get(producerId);
        if (mediaPlane.mode === "mediasoup" && !validateRtpCapabilities(frame.payload?.rtpCapabilities)) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "rtpCapabilities must be non-empty", {}, false));
          return;
        }
        const producerOwnerDeviceId = producer?.peerDeviceId ?? "";
        const producerOwnerUserId = producer?.userId ?? "";
        const consumed = await mediaPlane.consume(
          room.roomId,
          conn.deviceId,
          producerId,
          frame.payload?.rtpCapabilities ?? null
        );
        const consumerEntry = {
          consumerId: consumed.id,
          peerDeviceId: conn.deviceId,
          consumerDeviceId: conn.deviceId,
          producerId,
          ownerUserId: producerOwnerUserId,
          ownerDeviceId: producerOwnerDeviceId,
          kind: consumed.kind ?? producer.kind,
          source: consumed.source ?? producer.source,
          state: "created",
          createdAt: nowMs(),
          resumedAt: null,
          generation: 1,
        };
        room.consumers.set(consumed.id, consumerEntry);
        send(ws, {
          v: 1,
          type: "CONSUMER_ADDED",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: {
            roomId: room.roomId,
            roomVersion: room.roomVersion,
            consumer: serializeConsumer(consumerEntry),
            rtpParameters: consumed.rtpParameters ?? {},
          },
        });

        ack(ws, frame.msgId, true);
        return;
      }

      case "CONSUMER_RESUME": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        const consumerId = frame.payload?.consumerId;
        const consumer = consumerId ? room.consumers.get(consumerId) : null;
        if (!consumerId || !consumer) {
          ack(ws, frame.msgId, false, wsError("CONSUMER_NOT_FOUND", "Unknown consumer", {}, false));
          return;
        }
        if (consumer.peerDeviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("FORBIDDEN", "Cannot resume consumer owned by another peer", {}, false));
          return;
        }
         // Idempotent: already resumed → just ack
         if (consumer.state === "resumed") {
           ack(ws, frame.msgId, true, null, { state: consumer.state });
           return;
         }
        if (mediaPlane.mode === "mediasoup" && typeof mediaPlane.resumeConsumer === "function") {
          try {
            await mediaPlane.resumeConsumer(room.roomId, consumerId);
          } catch (error) {
            logOperationError("resumeConsumer", { roomId: room.roomId, deviceId: conn.deviceId, consumerId, error });
            ack(ws, frame.msgId, false, wsError("CONSUMER_RESUME_FAILED", "Failed to resume consumer", {
              roomId: room.roomId, deviceId: conn.deviceId, consumerId,
            }, true));
            return;
          }
        }
         consumer.state = "resumed";
         consumer.resumedAt = nowMs();
         bumpRoomVersion(room);
         ack(ws, frame.msgId, true, null, { state: consumer.state, roomVersion: room.roomVersion });
         return;
      }

      case "PRODUCER_CLOSE": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        const producerId = frame.payload?.producerId;
        const producer = producerId ? room.producers.get(producerId) : null;
        if (!producerId || !producer) {
          ack(ws, frame.msgId, false, wsError("PRODUCER_NOT_FOUND", "Unknown producer", {}, false));
          return;
        }
        if (producer.peerDeviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("FORBIDDEN", "Cannot close producer owned by another peer", {}, false));
          return;
        }

        try {
          await mediaPlane.closeProducer(room.roomId, producerId);
        } catch (error) {
          logOperationError("closeProducer", { roomId: room.roomId, deviceId: conn.deviceId, error });
          ack(ws, frame.msgId, false, wsError("PRODUCER_CLOSE_FAILED", "Failed to close producer", { producerId }, true));
          return;
        }

        room.producers.delete(producerId);
        for (const [consumerId, consumer] of room.consumers.entries()) {
          if (consumer.producerId === producerId) {
            room.consumers.delete(consumerId);
          }
        }
        bumpRoomVersion(room);

        broadcastRoom(
          room,
          {
            v: 1,
            type: "PRODUCER_REMOVED",
            msgId: uuid(),
            ts: nowMs(),
            payload: { roomId: room.roomId, roomVersion: room.roomVersion, producerId, peerDeviceId: conn.deviceId, reason: "CLIENT_CLOSE" },
          },
          conn.deviceId
        );

        broadcastLegacyParticipantStream(room, conn.userId, "remove", false, conn.deviceId);

        ack(ws, frame.msgId, true);
        return;
      }

      case "CONSUMER_CLOSE": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        const consumerId = frame.payload?.consumerId;
        const consumer = consumerId ? room.consumers.get(consumerId) : null;
        if (!consumerId || !consumer) {
          ack(ws, frame.msgId, false, wsError("CONSUMER_NOT_FOUND", "Unknown consumer", {}, false));
          return;
        }
        if (consumer.peerDeviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("FORBIDDEN", "Cannot close consumer owned by another peer", {}, false));
          return;
        }

        try {
          await mediaPlane.closeConsumer(room.roomId, consumerId);
        } catch (error) {
          logOperationError("closeConsumer", { roomId: room.roomId, deviceId: conn.deviceId, consumerId, error });
          ack(ws, frame.msgId, false, wsError("CONSUMER_CLOSE_FAILED", "Failed to close consumer", { consumerId }, true));
          return;
        }

        room.consumers.delete(consumerId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "ICE_RESTART": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        const transportId = frame.payload?.transportId;
        if (!transportId) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "Missing transportId", {}, false));
          return;
        }
        try {
          const result = await mediaPlane.restartIce(room.roomId, transportId);
          const iceServers = buildIceServers(conn.userId);
          send(ws, {
            v: 1,
            type: "ICE_RESTART_OK",
            msgId: uuid(),
            ts: nowMs(),
            seq: conn.expectedSeq++,
            payload: {
              roomId: room.roomId,
              transportId,
              iceParameters: result?.iceParameters ?? {},
              iceServers,
            },
          });
          ack(ws, frame.msgId, true);
        } catch (error) {
          ack(ws, frame.msgId, false, wsError("ICE_RESTART_FAILED", error?.message ?? "restartIce failed", {}, true));
        }
        return;
      }

      case "REKEY_BEGIN": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!checkE2EERateLimit(conn.deviceId, "REKEY_BEGIN")) {
          ack(ws, frame.msgId, false, wsError("RATE_LIMITED", "Too many rekey operations", {}, true));
          return;
        }
        broadcastRoom(room, { ...frame, msgId: uuid(), ts: nowMs() }, conn.deviceId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "REKEY_COMMIT": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (Number.isFinite(frame.payload?.epoch)) {
          room.epoch = Number(frame.payload.epoch);
          if (E2EE_REQUIRED_DEFAULT) {
            for (const peer of room.peers.values()) {
              peer.e2eeReady = false;
              peer.e2eeEpoch = -1;
            }
          }
          bumpRoomVersion(room);
        }
        broadcastRoom(room, { ...frame, msgId: uuid(), ts: nowMs() }, conn.deviceId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "KEY_PACKAGE": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        if (!checkE2EERateLimit(conn.deviceId, "KEY_PACKAGE")) {
          ack(ws, frame.msgId, false, wsError("RATE_LIMITED", "Too many key packages", {}, true));
          return;
        }
        // Validate required KEY_PACKAGE fields
        const kp = frame.payload ?? {};
        if (!kp.ciphertext || typeof kp.ciphertext !== "string" || kp.ciphertext.length < 24) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing or invalid ciphertext field", {}, false));
          return;
        }
        if (!kp.targetDeviceId || typeof kp.targetDeviceId !== "string") {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing targetDeviceId", {}, false));
          return;
        }
        if (typeof kp.epoch !== "number" || kp.epoch < 0) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Invalid epoch", {}, false));
          return;
        }

        if (!kp.sig || !isLikelyBase64(kp.sig, 24)) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing or invalid sig", {}, false));
          return;
        }

        if (!kp.senderPublicKey || !isLikelyBase64(kp.senderPublicKey, 24)) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing or invalid senderPublicKey", {}, false));
          return;
        }

        const senderIdentity = isObject(kp.senderIdentity) ? kp.senderIdentity : null;
        if (!senderIdentity) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing senderIdentity", {}, false));
          return;
        }

        if (typeof senderIdentity.sessionId !== "string" || senderIdentity.sessionId.length < 8) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Invalid senderIdentity.sessionId", {}, false));
          return;
        }

        if (senderIdentity.userId !== conn.userId || senderIdentity.deviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "senderIdentity mismatch", {}, false));
          return;
        }

        const isDiscoveryPackage = kp.keyPackageType === "DISCOVERY";
        if (isDiscoveryPackage) {

          const signatureValid = await verifyIdentitySignature(kp, kp.sig);
          if (!signatureValid) {
            ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Invalid senderIdentity signature", {}, false));
            return;
          }
        } else {
          if (!kp.identitySig || !isLikelyBase64(kp.identitySig, 24)) {
            ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Missing or invalid identitySig", {}, false));
            return;
          }

          const signatureValid = await verifyIdentitySignature(kp, kp.identitySig);
          if (!signatureValid) {
            ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_INVALID", "Invalid identitySig", {}, false));
            return;
          }
        }

        if (!room.peers.has(kp.targetDeviceId)) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_TARGET_NOT_FOUND", "Target device not in room", {}, false));
          return;
        }

        const delivered = sendToDevice(room, kp.targetDeviceId, {
          ...frame,
          msgId: uuid(),
          ts: nowMs(),
        });

        if (!delivered) {
          ack(ws, frame.msgId, false, wsError("KEY_PACKAGE_TARGET_OFFLINE", "Target device unavailable", {}, true));
          return;
        }

        ack(ws, frame.msgId, true);
        return;
      }

      case "KEY_ACK": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        const ka = frame.payload ?? {};
        if (typeof ka.epoch !== "number" || ka.epoch < 0) {
          ack(ws, frame.msgId, false, wsError("KEY_ACK_INVALID", "Invalid epoch", {}, false));
          return;
        }
        if (typeof ka.fromDeviceId !== "string" || ka.fromDeviceId !== conn.deviceId) {
          ack(ws, frame.msgId, false, wsError("KEY_ACK_INVALID", "fromDeviceId mismatch", {}, false));
          return;
        }

        broadcastRoom(room, { ...frame, msgId: uuid(), ts: nowMs() }, conn.deviceId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "SPEAKING": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        if (typeof frame.payload?.speaking !== "boolean") {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", "speaking must be boolean", {}, false));
          return;
        }

        broadcastRoom(room, { ...frame, msgId: uuid(), ts: nowMs() }, conn.deviceId);
        broadcastLegacyParticipantSpeaking(room, conn.userId, frame.payload.speaking, conn.deviceId);
        ack(ws, frame.msgId, true);
        return;
      }

      case "PING": {
        ack(ws, frame.msgId, true);
        return;
      }

      case "ROOM_STATE_GET": {
        if (!ensureAuth()) return;
        const roomId = frame.payload?.roomId ?? conn.roomId;
        const room = rooms.get(roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }
        send(ws, {
          v: 1,
          type: "ROOM_STATE",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: makeSnapshot(room),
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "GET_ROUTER_RTP_CAPABILITIES": {
        if (!ensureAuth()) return;
        const roomId = frame.payload?.roomId ?? conn.roomId;
        const room = rooms.get(roomId);
        const caps = room?.routerRtpCapabilities ?? { codecs: [] };
        send(ws, {
          v: 1,
          type: "ROUTER_RTP_CAPABILITIES",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId, routerRtpCapabilities: caps },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      case "call.accept":
      case "call.decline":
      case "call.cancel":
      case "call.hangup":
      case "call.rekey": {
        if (!ensureAuth()) return;
        const room = rooms.get(frame.payload?.roomId ?? conn.roomId);
        if (!room || !conn.deviceId || !room.peers.has(conn.deviceId)) {
          ack(ws, frame.msgId, false, wsError("UNAUTHORIZED", "Not a room member", {}, false));
          return;
        }

        const result = relayCallSignalInRoom(room, conn.deviceId, frame);
        if (!result.ok) {
          ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", result.error, {}, false));
          return;
        }

        ack(ws, frame.msgId, true);
        return;
      }

      case "ROOM_LEAVE": {
        if (!ensureAuth()) return;
        const roomId = frame.payload?.roomId ?? conn.roomId;
        const room = rooms.get(roomId);
        if (room && conn.deviceId && room.peers.has(conn.deviceId)) {
          mediaPlane.removePeer(room.roomId, conn.deviceId).catch((error) => {
            logOperationError("removePeer", {
              roomId: room.roomId,
              deviceId: conn.deviceId,
              error,
            });
          });
          room.peers.delete(conn.deviceId);
          room.memberSetVersion += 1;
          bumpRoomVersion(room);
          const removedProducerIds = new Set();
          const removedParticipantIds = new Set();
          for (const [producerId, producer] of room.producers.entries()) {
            if (producer.peerDeviceId === conn.deviceId) {
              room.producers.delete(producerId);
              removedProducerIds.add(producerId);
              if (typeof producer.userId === "string" && producer.userId.trim()) {
                removedParticipantIds.add(producer.userId);
              }
            }
          }
          for (const [consumerId, consumer] of room.consumers.entries()) {
            if (consumer.peerDeviceId === conn.deviceId || removedProducerIds.has(consumer.producerId)) {
              room.consumers.delete(consumerId);
            }
          }
          broadcastRoom(room, {
            v: 1,
             type: "PEER_LEFT",
             msgId: uuid(),
             ts: nowMs(),
             payload: { roomId: room.roomId, userId: conn.userId, deviceId: conn.deviceId, roomVersion: room.roomVersion },
          });
          for (const participantId of removedParticipantIds) {
            broadcastLegacyParticipantStream(room, participantId, "remove", false);
          }
          if (room.peers.size === 0) {
            mediaPlane.closeRoom(room.roomId).catch((error) => {
              logOperationError("closeRoom", {
                roomId: room.roomId,
                deviceId: conn.deviceId,
                error,
              });
            });
            rooms.delete(roomId);
          }
          conn.roomId = null;
        }
        send(ws, {
          v: 1,
          type: "ROOM_LEFT",
          msgId: uuid(),
          ts: nowMs(),
          seq: conn.expectedSeq++,
          payload: { roomId },
        });
        ack(ws, frame.msgId, true);
        return;
      }

      default: {
        ack(ws, frame.msgId, false, wsError("VALIDATION_FAILED", `Unsupported type: ${frame.type}`, {}, false));
      }
    }
    } catch (error) {
      ack(ws, frame.msgId, false, wsError("INTERNAL_ERROR", error?.message ?? "Unexpected server error", {}, true));
    }
  });

  ws.on("close", () => {
    if (conn.deviceId) peersByDevice.delete(conn.deviceId);

    if (conn.roomId && conn.deviceId) {
      const room = rooms.get(conn.roomId);
      if (room && room.peers.has(conn.deviceId)) {
        mediaPlane.removePeer(room.roomId, conn.deviceId).catch((error) => {
          logOperationError("removePeer", {
            roomId: room.roomId,
            deviceId: conn.deviceId,
            error,
          });
        });
        room.peers.delete(conn.deviceId);
        room.memberSetVersion += 1;
        bumpRoomVersion(room);

        const removedProducerIds = new Set();
        const removedParticipantIds = new Set();
        for (const [producerId, producer] of room.producers.entries()) {
          if (producer.peerDeviceId === conn.deviceId) {
            room.producers.delete(producerId);
            removedProducerIds.add(producerId);
            if (typeof producer.userId === "string" && producer.userId.trim()) {
              removedParticipantIds.add(producer.userId);
            }
          }
        }
        for (const [consumerId, consumer] of room.consumers.entries()) {
          if (consumer.peerDeviceId === conn.deviceId || removedProducerIds.has(consumer.producerId)) {
            room.consumers.delete(consumerId);
          }
        }

        broadcastRoom(room, {
          v: 1,
          type: "PEER_LEFT",
          msgId: uuid(),
          ts: nowMs(),
          payload: { roomId: room.roomId, userId: conn.userId, deviceId: conn.deviceId },
        });

        for (const participantId of removedParticipantIds) {
          broadcastLegacyParticipantStream(room, participantId, "remove", false);
        }

        if (room.peers.size === 0) {
          mediaPlane.closeRoom(room.roomId).catch((error) => {
            logOperationError("closeRoom", {
              roomId: room.roomId,
              deviceId: conn.deviceId,
              error,
            });
          });
          rooms.delete(conn.roomId);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[sfu] listening on https://sfu.mansoni.ru (region=${REGION} nodeId=${NODE_ID})`);
});
